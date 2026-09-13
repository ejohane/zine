import Foundation
import Observation

struct NativeCommand: Codable {
    var version = 1
    var requestID = UUID().uuidString
    var name: String
    var bookmarkID: String?
    var fraction: Double?
    var tags: [String]?
}

struct NativeEvent: Codable {
    let revision: Int
    let requestID: String
    let name: String
    let status: String
}

struct NativeCommandResult: Codable {
    let version: Int
    let requestID: String
    let revision: Int
    let status: String
    let state: NativeCommandState
    let events: [NativeEvent]
    let error: String?
}

struct NativeCommandState: Codable {
    let endpoint: String
    let route: String
    let bookmarkID: String?
    let libraryIDs: [String]
    let readerReady: Bool
    let isFinished: Bool?
    let tags: [String]
    let progressFraction: Double?
    let pendingMutations: Int
    let pendingProgress: Double?
}

/// Composition shared by the desktop harness and visible app. UI adapters register
/// their existing stores/actions here; remote commands never create shadow views.
@MainActor
@Observable
final class NativeCommandSession {
    let client: APIClient
    var library: LibraryStore?
    var reader: ArticleReaderStore?
    var route = "root"
    var bookmarkID: String?
    var navigate: ((String, String?) async throws -> Void)?
    var openLibrary: (() -> Void)?
    var openReader: (() -> Void)?
    var progressSaved: ((BookmarkProgress) -> Void)?
    var tagsSaved: (([BookmarkTag]) -> Void)?
    var reconciled: ((Bookmark) -> Void)?
    var complete: (() async -> Bool)?
    private(set) var revision = 0
    private(set) var events: [NativeEvent] = []
    private var busy = false

    init(client: APIClient) { self.client = client }

    func execute(_ command: NativeCommand) async -> NativeCommandResult {
        guard !busy else { return await result(command, status: "failed", error: "busy") }
        guard command.version == 1 else {
            return await result(command, status: "failed", error: "unsupported_version")
        }
        busy = true
        defer { busy = false }
        record(command, status: "accepted")
        do {
            var status = "completed"
            switch command.name {
            case "state.get", "events.get": break
            case "library.open", "bookmark.open", "reader.open":
                guard let navigate else { throw CommandError("navigation_unavailable") }
                try await navigate(command.name, command.bookmarkID)
            case "reader.progress.record":
                let store = try activeReader(command)
                guard let fraction = command.fraction, fraction.isFinite, (0...1).contains(fraction) else {
                    throw CommandError("fraction_must_be_between_zero_and_one")
                }
                if let saved = await store.persistProgress(fraction) { progressSaved?(saved) }
                status = store.lastProgressDelivery?.rawValue ?? "failed"
            case "reader.tags.set":
                let store = try activeReader(command)
                guard let names = command.tags else { throw CommandError("tags_required") }
                let tags = try await store.setTags(names)
                tagsSaved?(tags)
                status = store.lastTagDelivery?.rawValue ?? "failed"
            case "reader.complete":
                let store = try activeReader(command)
                guard !store.isFinished else { throw CommandError("already_finished") }
                guard let complete, await complete() else { throw CommandError("completion_failed") }
                status = store.lastFinishedDelivery?.rawValue ?? "failed"
            case "sync.flush":
                await client.flushPendingArticleProgress()
                let failures = await client.flushPendingBookmarkMutations()
                if let library { await library.reload(query: LibraryQuery()) }
                if let reader, let bookmark = try? await client.getBookmark(id: reader.metadata.bookmarkID) {
                    reader.reconcile(bookmark)
                    reconciled?(bookmark)
                }
                status = failures.isEmpty ? "completed" : "failed"
                if !failures.isEmpty {
                    throw CommandError("permanent_rejection:" + failures.joined(separator: ","))
                }
                let pendingProgress = await client.pendingProgressCount()
                if await client.pendingBookmarkMutationCount() > 0 || pendingProgress > 0 {
                    status = "local_pending"
                }
            default: throw CommandError("unknown_command")
            }
            record(command, status: status)
            return await result(command, status: status)
        } catch {
            record(command, status: "failed")
            return await result(
                command, status: "failed", error: (error as? CommandError)?.description ?? "operation_failed")
        }
    }

    private func activeReader(_ command: NativeCommand) throws -> ArticleReaderStore {
        guard route == "reader", let reader, reader.readyDocument != nil,
            command.bookmarkID == nil || command.bookmarkID == reader.metadata.bookmarkID
        else { throw CommandError("active_ready_reader_required") }
        return reader
    }

    func recordUIChange(_ name: String) {
        record(NativeCommand(requestID: "ui", name: name), status: "observed")
    }

    private func record(_ command: NativeCommand, status: String) {
        revision += 1
        events.append(
            NativeEvent(revision: revision, requestID: command.requestID, name: command.name, status: status))
        if events.count > 128 { events.removeFirst(events.count - 128) }
    }

    private func result(_ command: NativeCommand, status: String, error: String? = nil) async
        -> NativeCommandResult
    {
        NativeCommandResult(
            version: 1, requestID: command.requestID, revision: revision, status: status,
            state: NativeCommandState(
                endpoint: client.baseURL.absoluteString, route: route,
                bookmarkID: bookmarkID, libraryIDs: library?.items.map(\.id) ?? [],
                readerReady: reader?.readyDocument != nil, isFinished: reader?.isFinished,
                tags: reader?.tags.map(\.name) ?? [], progressFraction: reader?.progressFraction,
                pendingMutations: await client.pendingBookmarkMutationCount(),
                pendingProgress: await client.pendingArticleProgress(id: bookmarkID ?? "")),
            events: events, error: error)
    }
}

struct CommandError: Error, CustomStringConvertible {
    let description: String
    init(_ description: String) { self.description = description }
}
