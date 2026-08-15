import Foundation

private struct CachedArticleBody: Codable {
    let response: ArticleContentResponse
    let savedAt: Date
}

actor ArticleBodyCache {
    private static let maximumDocuments = 50

    private let fileURL: URL
    private var documents: [String: CachedArticleBody]?

    init(userID: String, baseDirectory: URL? = nil) {
        let root = baseDirectory ?? FileManager.default.urls(
            for: .applicationSupportDirectory,
            in: .userDomainMask
        )[0]
        let safeUserID = userID.addingPercentEncoding(withAllowedCharacters: .alphanumerics)
            ?? "unknown-user"
        fileURL = root
            .appending(path: "ZineNative/Articles", directoryHint: .isDirectory)
            .appending(path: "\(safeUserID).json")
    }

    func load(bookmarkID: String) -> ArticleContentResponse? {
        loadDocumentsIfNeeded()
        return documents?[bookmarkID]?.response
    }

    func save(_ response: ArticleContentResponse, bookmarkID: String) {
        guard response.readableContent != nil else { return }
        loadDocumentsIfNeeded()
        documents?[bookmarkID] = CachedArticleBody(response: response, savedAt: Date())
        pruneDocuments()
        persistDocuments()
    }

    private func loadDocumentsIfNeeded() {
        guard documents == nil else { return }
        guard let data = try? Data(contentsOf: fileURL),
              let decoded = try? JSONDecoder().decode([String: CachedArticleBody].self, from: data)
        else {
            documents = [:]
            return
        }
        documents = decoded
    }

    private func pruneDocuments() {
        guard let documents, documents.count > Self.maximumDocuments else { return }
        let retainedKeys = documents
            .sorted { $0.value.savedAt > $1.value.savedAt }
            .prefix(Self.maximumDocuments)
            .map(\.key)
        self.documents = documents.filter { retainedKeys.contains($0.key) }
    }

    private func persistDocuments() {
        guard let documents,
              let data = try? JSONEncoder().encode(documents)
        else { return }

        do {
            try FileManager.default.createDirectory(
                at: fileURL.deletingLastPathComponent(),
                withIntermediateDirectories: true
            )
            try data.write(to: fileURL, options: [.atomic, .completeFileProtection])
        } catch {
            // The cache is an optimization; the authenticated API remains the source of truth.
        }
    }
}

actor ArticleContentRequestCoordinator {
    enum Purpose {
        case warmup
        case reader
    }

    private struct InFlightRequest {
        let id: UUID
        let task: Task<ArticleContentResponse, Error>
        var waiterIDs: Set<UUID>
        let startedByWarmup: Bool
        var hasReader: Bool
    }

    private struct WarmedResponse {
        let response: ArticleContentResponse
        let storedAt: Date
    }

    private static let maximumWarmedResponses = 8

    private var inFlightRequests: [String: InFlightRequest] = [:]
    private var warmedResponses: [String: WarmedResponse] = [:]

    func response(
        bookmarkID: String,
        purpose: Purpose,
        fetch: @escaping () async throws -> ArticleContentResponse
    ) async throws -> ArticleContentResponse {
        if purpose == .reader,
           let warmed = warmedResponses.removeValue(forKey: bookmarkID)
        {
            return warmed.response
        }

        let waiterID = UUID()
        let requestID: UUID
        let task: Task<ArticleContentResponse, Error>

        if var inFlight = inFlightRequests[bookmarkID] {
            inFlight.waiterIDs.insert(waiterID)
            if purpose == .reader {
                inFlight.hasReader = true
            }
            inFlightRequests[bookmarkID] = inFlight
            requestID = inFlight.id
            task = inFlight.task
        } else {
            requestID = UUID()
            task = Task {
                try await fetch()
            }
            inFlightRequests[bookmarkID] = InFlightRequest(
                id: requestID,
                task: task,
                waiterIDs: [waiterID],
                startedByWarmup: purpose == .warmup,
                hasReader: purpose == .reader
            )
        }

        return try await withTaskCancellationHandler {
            do {
                let response = try await task.value
                try Task.checkCancellation()
                completeWaiter(
                    waiterID,
                    requestID: requestID,
                    bookmarkID: bookmarkID,
                    response: response
                )
                return response
            } catch {
                completeWaiter(
                    waiterID,
                    requestID: requestID,
                    bookmarkID: bookmarkID,
                    response: nil
                )
                throw error
            }
        } onCancel: {
            Task {
                await self.cancelWaiter(
                    waiterID,
                    requestID: requestID,
                    bookmarkID: bookmarkID
                )
            }
        }
    }

    private func completeWaiter(
        _ waiterID: UUID,
        requestID: UUID,
        bookmarkID: String,
        response: ArticleContentResponse?
    ) {
        guard var inFlight = inFlightRequests[bookmarkID],
              inFlight.id == requestID,
              inFlight.waiterIDs.remove(waiterID) != nil
        else { return }

        if let response,
           response.readableContent != nil,
           inFlight.startedByWarmup,
           !inFlight.hasReader
        {
            warmedResponses[bookmarkID] = WarmedResponse(
                response: response,
                storedAt: Date()
            )
            pruneWarmedResponses()
        }

        if inFlight.waiterIDs.isEmpty {
            inFlightRequests.removeValue(forKey: bookmarkID)
        } else {
            inFlightRequests[bookmarkID] = inFlight
        }
    }

    private func cancelWaiter(
        _ waiterID: UUID,
        requestID: UUID,
        bookmarkID: String
    ) {
        guard var inFlight = inFlightRequests[bookmarkID],
              inFlight.id == requestID,
              inFlight.waiterIDs.remove(waiterID) != nil
        else { return }

        if inFlight.waiterIDs.isEmpty {
            inFlight.task.cancel()
            inFlightRequests.removeValue(forKey: bookmarkID)
        } else {
            inFlightRequests[bookmarkID] = inFlight
        }
    }

    private func pruneWarmedResponses() {
        guard warmedResponses.count > Self.maximumWarmedResponses else { return }
        let retainedKeys = warmedResponses
            .sorted { $0.value.storedAt > $1.value.storedAt }
            .prefix(Self.maximumWarmedResponses)
            .map(\.key)
        warmedResponses = warmedResponses.filter { retainedKeys.contains($0.key) }
    }
}
