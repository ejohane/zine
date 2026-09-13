import Foundation
import Observation

struct NativeCommand: Codable {
    var version = 1
    var requestID = UUID().uuidString
    var name: String
    var bookmarkID: String?
    var fraction: Double?
    var tags: [String]?
    var query: LibraryQuery?
    var isFinished: Bool?
    var url: String?
    var jobID: String?
    var timeout: Double?
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
    let syncJob: NativeSyncStatus?
    let syncJobID: String?
    let syncExisting: Bool
    let savedBookmarkID: String?
    let saveStatus: String?
    let articleBody: ArticleBodyStatus?
    let detail: Bookmark?
    let endpoint: String
    let route: String
    let bookmarkID: String?
    let librarySource: String?
    let libraryQuery: LibraryQuery?
    let libraryLoading: Bool
    let libraryNextCursor: String?
    let libraryError: String?
    let libraryItems: [Bookmark]
    let libraryIDs: [String]
    let readerPhase: String?
    let readerContentSource: String?
    let readerError: String?
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
    let sync: SyncJobStore
    var library: LibraryStore?
    var reader: ArticleReaderStore?
    var route = "root"
    var bookmarkID: String?
    var navigate: ((String, String?) async throws -> Void)?
    var queryLibrary: ((LibraryQuery) async throws -> Void)?
    var applyLibraryQuery: ((LibraryQuery) async -> Void)?
    var openReader: (() -> Void)?
    var detailBookmark: (() -> Bookmark?)?
    var setDetailTags: (([String]) async throws -> NativeMutationReceipt<[BookmarkTag]>)?
    var setDetailBookmarked: ((Bool) async throws -> NativeMutationDelivery)?
    var refreshDetail: (() async throws -> Void)?
    private(set) var savedBookmarkID: String?
    private(set) var saveStatus: String?
    private(set) var articleBody: ArticleBodyStatus?
    var progressSaved: ((BookmarkProgress) -> Void)?
    var tagsSaved: (([BookmarkTag]) -> Void)?
    var reconciled: ((Bookmark) -> Void)?
    var complete: (() async -> Bool)?
    private(set) var revision = 0
    private(set) var events: [NativeEvent] = []
    private var busy = false

    init(client: APIClient) {
        self.client = client
        sync = SyncJobStore(client: client)
    }

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
                articleBody = nil
                try await navigate(command.name, command.bookmarkID)
            case "bookmark.save":
                guard let raw = command.url, let url = URL(string: raw),
                    ["https", "http"].contains(url.scheme?.lowercased() ?? ""), url.host != nil,
                    url.user == nil, url.password == nil
                else { throw CommandError("valid_http_url_required") }
                savedBookmarkID = nil
                saveStatus = nil
                let saved = try await client.saveBookmark(url: url)
                savedBookmarkID = saved.bookmark.userItemId
                saveStatus = saved.bookmark.status
                status = "server_committed"
            case "bookmark.get", "bookmark.content.status", "bookmark.tags.set", "bookmark.archive",
                "bookmark.restore":
                guard route == "bookmark", let bookmark = detailBookmark?(),
                    command.bookmarkID == nil || command.bookmarkID == bookmark.id
                else {
                    throw CommandError("active_bookmark_required")
                }
                if command.name == "bookmark.content.status" {
                    articleBody = nil
                    articleBody = try await client.getArticleContent(id: bookmark.id).articleBody
                } else if command.name == "bookmark.get" {
                    guard let refreshDetail else { throw CommandError("detail_refresh_unavailable") }
                    try await refreshDetail()
                } else if command.name == "bookmark.tags.set" {
                    guard let tags = command.tags, let setDetailTags else {
                        throw CommandError("tags_required")
                    }
                    status = try await setDetailTags(tags).delivery.rawValue
                } else {
                    guard let setDetailBookmarked else { throw CommandError("bookmark_action_unavailable") }
                    status = try await setDetailBookmarked(command.name == "bookmark.restore").rawValue
                }
            case "library.query":
                guard let query = command.query, let queryLibrary else {
                    throw CommandError("library_query_required")
                }
                try await queryLibrary(query)
                if library?.errorMessage != nil {
                    guard library?.dataSource == "cache" else { throw CommandError("library_load_failed") }
                    status = "local_pending"
                }
            case "library.next":
                guard route == "library" || route == "search", let library else {
                    throw CommandError("active_library_required")
                }
                let deadline = ContinuousClock.now.advanced(by: .seconds(40))
                while library.isReloading || library.isLoadingMore {
                    guard ContinuousClock.now < deadline else { throw CommandError("library_busy_timed_out") }
                    try await Task.sleep(for: .milliseconds(20))
                }
                if let item = library.items.last { await library.loadMoreIfNeeded(current: item) }
                if library.errorMessage != nil { throw CommandError("library_load_failed") }
            case "library.finished.set":
                guard route == "library" || route == "search", let library,
                    let bookmark = library.items.first(where: { $0.id == command.bookmarkID }),
                    let value = command.isFinished
                else { throw CommandError("visible_bookmark_and_finished_required") }
                status = try await library.setFinished(bookmark, value: value).rawValue
            case "reader.retry":
                guard route == "reader", let reader,
                    command.bookmarkID == nil || command.bookmarkID == reader.metadata.bookmarkID
                else { throw CommandError("active_reader_required") }
                await reader.load()
                guard reader.readyDocument != nil else { throw CommandError("reader_" + reader.phaseName) }
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
            case "sync.start":
                try await sync.start()
                status = sync.status?.status == "completed" ? "completed" : "accepted"
                if sync.status?.hasFailures == true { throw CommandError("sync_completed_with_errors") }
            case "sync.active":
                try await sync.active()
            case "sync.status", "sync.wait":
                if command.name == "sync.wait" {
                    try await sync.wait(id: command.jobID, timeout: command.timeout ?? 40) {
                        self.record(command, status: "observed")
                    }
                } else {
                    try await sync.refresh(id: command.jobID)
                }
                if sync.status?.status == "completed" {
                    if let library { await library.reload(query: library.activeQuery) }
                    if sync.status?.hasFailures == true { throw CommandError("sync_completed_with_errors") }
                } else {
                    status = "accepted"
                }
            case "sync.flush":
                await client.flushPendingArticleProgress()
                let failures = await client.flushPendingBookmarkMutations()
                if let library { await library.reload(query: library.activeQuery) }
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
                syncJob: sync.status, syncJobID: sync.jobID, syncExisting: sync.existing,
                savedBookmarkID: savedBookmarkID, saveStatus: saveStatus,
                articleBody: articleBody, detail: route == "bookmark" ? detailBookmark?() : nil,
                endpoint: client.baseURL.absoluteString, route: route,
                bookmarkID: bookmarkID, librarySource: library?.dataSource,
                libraryQuery: library?.activeQuery,
                libraryLoading: (library?.isReloading == true || library?.isLoadingMore == true),
                libraryNextCursor: library?.nextCursor, libraryError: library?.errorMessage,
                libraryItems: library?.items ?? [], libraryIDs: library?.items.map(\.id) ?? [],
                readerPhase: reader?.phaseName, readerContentSource: reader?.contentSource,
                readerError: reader?.loadError, readerReady: reader?.readyDocument != nil,
                isFinished: reader?.isFinished,
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
