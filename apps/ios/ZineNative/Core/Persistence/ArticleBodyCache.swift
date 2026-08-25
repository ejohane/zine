import Foundation

private struct CachedArticleBody: Codable {
    let response: ArticleContentResponse
    let savedAt: Date
}

private struct ArticleBodyCacheEntry: Codable {
    var savedAt: Date?
    var lastCheckedAt: Date
}

private struct ArticleBodyCacheManifest: Codable {
    var entries: [String: ArticleBodyCacheEntry]
}

actor ArticleBodyCache {
    private static let maximumDocuments = 250
    private static let maximumChecks = 500

    private let directoryURL: URL
    private let legacyFileURL: URL
    private let manifestURL: URL
    private let progressURL: URL
    private var manifest: ArticleBodyCacheManifest?
    private var pendingProgressValues: [String: Double]?

    init(userID: String, baseDirectory: URL? = nil) {
        let root = baseDirectory ?? FileManager.default.urls(
            for: .applicationSupportDirectory,
            in: .userDomainMask
        )[0]
        let safeUserID = userID.addingPercentEncoding(withAllowedCharacters: .alphanumerics)
            ?? "unknown-user"
        let articlesRoot = root.appending(path: "ZineNative/Articles", directoryHint: .isDirectory)
        directoryURL = articlesRoot.appending(path: safeUserID, directoryHint: .isDirectory)
        legacyFileURL = articlesRoot.appending(path: "\(safeUserID).json")
        manifestURL = directoryURL.appending(path: "manifest.json")
        progressURL = directoryURL.appending(path: "pending-progress.json")
    }

    func load(bookmarkID: String) -> ArticleContentResponse? {
        loadManifestIfNeeded()
        guard manifest?.entries[bookmarkID]?.savedAt != nil else { return nil }
        let url = documentURL(bookmarkID: bookmarkID)
        guard let data = try? Data(contentsOf: url),
              let document = try? JSONDecoder().decode(CachedArticleBody.self, from: data)
        else {
            manifest?.entries[bookmarkID] = ArticleBodyCacheEntry(
                savedAt: nil,
                lastCheckedAt: .distantPast
            )
            persistManifest()
            return nil
        }
        return document.response
    }

    func save(_ response: ArticleContentResponse, bookmarkID: String) {
        guard response.readableContent != nil else { return }
        loadManifestIfNeeded()
        let now = Date()
        guard persist(
            CachedArticleBody(response: response, savedAt: now),
            to: documentURL(bookmarkID: bookmarkID)
        ) else { return }
        manifest?.entries[bookmarkID] = ArticleBodyCacheEntry(
            savedAt: now,
            lastCheckedAt: now
        )
        pruneManifest()
        persistManifest()
    }

    func recordOfflineCheck(_ response: ArticleContentResponse, bookmarkID: String) {
        if response.readableContent != nil {
            save(response, bookmarkID: bookmarkID)
            return
        }
        loadManifestIfNeeded()
        let savedAt = manifest?.entries[bookmarkID]?.savedAt
        manifest?.entries[bookmarkID] = ArticleBodyCacheEntry(
            savedAt: savedAt,
            lastCheckedAt: Date()
        )
        pruneManifest()
        persistManifest()
    }

    func needsOfflineRefresh(
        bookmarkID: String,
        maximumAge: TimeInterval,
        now: Date = Date()
    ) -> Bool {
        loadManifestIfNeeded()
        guard let checkedAt = manifest?.entries[bookmarkID]?.lastCheckedAt else { return true }
        return now.timeIntervalSince(checkedAt) >= maximumAge
    }

    func stageProgress(_ fraction: Double, bookmarkID: String) {
        loadPendingProgressIfNeeded()
        pendingProgressValues?[bookmarkID] = min(max(fraction, 0), 1)
        persistPendingProgress()
    }

    func pendingProgress(bookmarkID: String) -> Double? {
        loadPendingProgressIfNeeded()
        return pendingProgressValues?[bookmarkID]
    }

    func allPendingProgress() -> [String: Double] {
        loadPendingProgressIfNeeded()
        return pendingProgressValues ?? [:]
    }

    func markProgressSynced(bookmarkID: String, fraction: Double) {
        loadPendingProgressIfNeeded()
        guard pendingProgressValues?[bookmarkID] == fraction else { return }
        pendingProgressValues?.removeValue(forKey: bookmarkID)
        persistPendingProgress()
    }

    func remove(bookmarkID: String) {
        loadManifestIfNeeded()
        loadPendingProgressIfNeeded()
        manifest?.entries.removeValue(forKey: bookmarkID)
        pendingProgressValues?.removeValue(forKey: bookmarkID)
        try? FileManager.default.removeItem(at: documentURL(bookmarkID: bookmarkID))
        persistManifest()
        persistPendingProgress()
    }

    func removeAll() {
        manifest = ArticleBodyCacheManifest(entries: [:])
        pendingProgressValues = [:]
        try? FileManager.default.removeItem(at: directoryURL)
        try? FileManager.default.removeItem(at: legacyFileURL)
    }

    private func loadManifestIfNeeded() {
        guard manifest == nil else { return }
        if let data = try? Data(contentsOf: manifestURL),
           let decoded = try? JSONDecoder().decode(ArticleBodyCacheManifest.self, from: data)
        {
            manifest = decoded
            return
        }

        manifest = ArticleBodyCacheManifest(entries: [:])
        guard let legacyData = try? Data(contentsOf: legacyFileURL),
              let legacyDocuments = try? JSONDecoder().decode(
                  [String: CachedArticleBody].self,
                  from: legacyData
              )
        else {
            return
        }

        for (bookmarkID, document) in legacyDocuments where document.response.readableContent != nil {
            guard persist(document, to: documentURL(bookmarkID: bookmarkID)) else { continue }
            manifest?.entries[bookmarkID] = ArticleBodyCacheEntry(
                savedAt: document.savedAt,
                lastCheckedAt: document.savedAt
            )
        }
        pruneManifest()
        if persistManifest() {
            try? FileManager.default.removeItem(at: legacyFileURL)
        }
    }

    private func loadPendingProgressIfNeeded() {
        guard pendingProgressValues == nil else { return }
        guard let data = try? Data(contentsOf: progressURL),
              let decoded = try? JSONDecoder().decode([String: Double].self, from: data)
        else {
            pendingProgressValues = [:]
            return
        }
        pendingProgressValues = decoded
    }

    private func pruneManifest() {
        guard var manifest else { return }
        let documents = manifest.entries.filter { $0.value.savedAt != nil }
        if documents.count > Self.maximumDocuments {
            let removedKeys = documents
                .sorted { ($0.value.savedAt ?? .distantPast) > ($1.value.savedAt ?? .distantPast) }
                .dropFirst(Self.maximumDocuments)
                .map(\.key)
            for key in removedKeys {
                try? FileManager.default.removeItem(at: documentURL(bookmarkID: key))
                manifest.entries[key]?.savedAt = nil
            }
        }

        let checkOnlyEntries = manifest.entries.filter { $0.value.savedAt == nil }
        if checkOnlyEntries.count > Self.maximumChecks {
            let removedKeys = checkOnlyEntries
                .sorted { $0.value.lastCheckedAt > $1.value.lastCheckedAt }
                .dropFirst(Self.maximumChecks)
                .map(\.key)
            for key in removedKeys {
                manifest.entries.removeValue(forKey: key)
            }
        }
        self.manifest = manifest
    }

    @discardableResult
    private func persistManifest() -> Bool {
        guard let manifest else { return false }
        return persist(manifest, to: manifestURL)
    }

    private func persistPendingProgress() {
        guard let pendingProgressValues else { return }
        _ = persist(pendingProgressValues, to: progressURL)
    }

    private func persist<Value: Encodable>(_ value: Value, to url: URL) -> Bool {
        guard let data = try? JSONEncoder().encode(value) else { return false }
        do {
            try FileManager.default.createDirectory(
                at: directoryURL,
                withIntermediateDirectories: true
            )
            try data.write(to: url, options: [.atomic, .completeFileProtection])
            var resourceValues = URLResourceValues()
            resourceValues.isExcludedFromBackup = true
            var storedFileURL = url
            try? storedFileURL.setResourceValues(resourceValues)
            return true
        } catch {
            return false
        }
    }

    private func documentURL(bookmarkID: String) -> URL {
        let safeBookmarkID = bookmarkID.addingPercentEncoding(withAllowedCharacters: .alphanumerics)
            ?? UUID().uuidString
        return directoryURL.appending(path: "\(safeBookmarkID).json")
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
