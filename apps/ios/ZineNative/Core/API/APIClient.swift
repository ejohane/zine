import Foundation

struct LibraryQuery: Hashable {
    var search = ""
    var isFinished = false
    var provider: Provider?
    var contentType: ContentType?

    var cacheKey: String {
        [
            search.trimmingCharacters(in: .whitespacesAndNewlines),
            String(isFinished),
            provider?.rawValue ?? "all",
            contentType?.rawValue ?? "all",
        ].joined(separator: "|")
    }
}

struct InboxQuery: Hashable {
    var provider: Provider?
    var contentType: ContentType?

    var cacheKey: String {
        [
            provider?.rawValue ?? "all",
            contentType?.rawValue ?? "all",
        ].joined(separator: "|")
    }
}

struct APIClient {
    typealias TokenProvider = () async throws -> String

    let baseURL: URL
    let tokenProvider: TokenProvider
    var session: URLSession
    private let articleBodyCache: ArticleBodyCache?
    private let bookmarkMutationOutbox: OfflineBookmarkMutationOutbox?
    private let articleContentRequests: ArticleContentRequestCoordinator

    init(
        baseURL: URL,
        tokenProvider: @escaping TokenProvider,
        session: URLSession = .shared,
        articleBodyCache: ArticleBodyCache? = nil,
        bookmarkMutationOutbox: OfflineBookmarkMutationOutbox? = nil
    ) {
        self.baseURL = baseURL
        self.tokenProvider = tokenProvider
        self.session = session
        self.articleBodyCache = articleBodyCache
        self.bookmarkMutationOutbox = bookmarkMutationOutbox
        articleContentRequests = ArticleContentRequestCoordinator()
    }

    func getHome() async throws -> HomeResponse {
        let response: HomeResponse = try await request(url: baseURL.appending(path: "/api/v1/home"))
        return await overlayHome(response)
    }

    func overlayHome(_ response: HomeResponse) async -> HomeResponse {
        guard let bookmarkMutationOutbox else { return response }
        let hiddenIDs = await bookmarkMutationOutbox.hiddenHomeItemIDs()
        guard !hiddenIDs.isEmpty else { return response }
        return Self.filterHome(response, hiding: hiddenIDs)
    }

    func getEditorialToday() async throws -> EditorialTodayResponse {
        try await request(url: baseURL.appending(path: "/api/v1/editorial/today"))
    }

    func getPeopleDailyToday() async throws -> PeopleDailyOverviewResponse {
        try await request(url: baseURL.appending(path: "/api/v1/today"))
    }

    func getPeopleDailySection(id: String) async throws -> PeopleDailySectionResponse {
        try await request(
            url: baseURL.appending(path: "/api/v1/today/sections/\(id)")
        )
    }

    func getDailyFeed(date: String? = nil) async throws -> DailyFeedResponse {
        var components = URLComponents(
            url: baseURL.appending(path: "/api/v1/today/feed"),
            resolvingAgainstBaseURL: false
        )!
        if let date {
            components.queryItems = [URLQueryItem(name: "date", value: date)]
        }
        return try await request(url: components.url!)
    }

    func getDailyAuthorActivity(
        authorKey: String,
        date: String,
        range: DailyAuthorRange
    ) async throws -> DailyAuthorActivityResponse {
        var components = URLComponents(
            url: baseURL.appending(path: "/api/v1/today/authors/\(authorKey)"),
            resolvingAgainstBaseURL: false
        )!
        components.queryItems = [
            URLQueryItem(name: "date", value: date),
            URLQueryItem(name: "range", value: range.rawValue),
        ]
        return try await request(url: components.url!)
    }

    func listEditorialExperiments(limit: Int = 20) async throws -> EditorialExperimentListResponse {
        var components = URLComponents(
            url: baseURL.appending(path: "/api/v1/editorial/experiments"),
            resolvingAgainstBaseURL: false
        )!
        components.queryItems = [URLQueryItem(name: "limit", value: String(limit))]
        return try await request(url: components.url!)
    }

    func getEditorialExperimentPreview(
        experimentID: String,
        variantID: String
    ) async throws -> EditorialExperimentPreviewResponse {
        try await request(
            url: baseURL.appending(
                path: "/api/v1/editorial/experiments/\(experimentID)/variants/\(variantID)"
            )
        )
    }

    func submitEditorialExperimentDecision(
        experimentID: String,
        preference: EditorialExperimentPreference,
        notes: String,
        clientEventID: String
    ) async throws -> EditorialExperimentDecisionResponse {
        var request = URLRequest(
            url: baseURL.appending(path: "/api/v1/editorial/experiments/\(experimentID)/decision")
        )
        request.httpMethod = "POST"
        request.httpBody = try JSONEncoder().encode(
            EditorialExperimentDecisionRequest(
                clientEventId: clientEventID,
                preference: preference,
                notes: notes
            )
        )
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        return try await send(request)
    }

    func sendEditorialFeedback(
        _ feedback: EditorialFeedbackRequest
    ) async throws -> EditorialFeedbackResponse {
        var request = URLRequest(url: baseURL.appending(path: "/api/v1/editorial/feedback"))
        request.httpMethod = "POST"
        request.httpBody = try JSONEncoder().encode(feedback)
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        return try await send(request)
    }

    func saveBookmark(url: URL) async throws -> EditorialBookmarkSaveResult {
        var request = URLRequest(url: baseURL.appending(path: "/api/v1/bookmarks"))
        request.httpMethod = "POST"
        request.httpBody = try JSONEncoder().encode(
            SaveEditorialBookmarkRequest(url: url.absoluteString, tags: [])
        )
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        return try await send(request)
    }

    func listBookmarks(
        query: LibraryQuery,
        cursor: String? = nil,
        limit: Int = 30
    ) async throws -> PaginatedBookmarksResponse {
        var components = URLComponents(
            url: baseURL.appending(path: "/api/v1/bookmarks"),
            resolvingAgainstBaseURL: false
        )!
        var items = [
            URLQueryItem(name: "limit", value: String(limit)),
            URLQueryItem(name: "isFinished", value: String(query.isFinished)),
        ]
        if !query.search.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            items.append(URLQueryItem(name: "search", value: query.search))
        }
        if let provider = query.provider {
            items.append(URLQueryItem(name: "provider", value: provider.rawValue))
        }
        if let contentType = query.contentType {
            items.append(URLQueryItem(name: "contentType", value: contentType.rawValue))
        }
        if let cursor {
            items.append(URLQueryItem(name: "cursor", value: cursor))
        }
        components.queryItems = items
        let response: PaginatedBookmarksResponse = try await request(url: components.url!)
        guard let bookmarkMutationOutbox else { return response }
        return PaginatedBookmarksResponse(
            items: await bookmarkMutationOutbox.overlay(response.items, matching: query),
            nextCursor: response.nextCursor
        )
    }

    func listOpenedBookmarks(
        contentType: ContentType? = nil,
        cursor: String? = nil,
        limit: Int = 30
    ) async throws -> PaginatedBookmarksResponse {
        var components = URLComponents(
            url: baseURL.appending(path: "/api/v1/bookmarks/opened"),
            resolvingAgainstBaseURL: false
        )!
        var items = [URLQueryItem(name: "limit", value: String(limit))]
        if let contentType {
            items.append(URLQueryItem(name: "contentType", value: contentType.rawValue))
        }
        if let cursor {
            items.append(URLQueryItem(name: "cursor", value: cursor))
        }
        components.queryItems = items
        let response: PaginatedBookmarksResponse = try await request(url: components.url!)
        return await overlayUnfinishedBookmarks(response, contentType: contentType)
    }

    func listQuickWinBookmarks(
        contentType: ContentType? = nil,
        cursor: String? = nil,
        limit: Int = 30
    ) async throws -> PaginatedBookmarksResponse {
        var components = URLComponents(
            url: baseURL.appending(path: "/api/v1/bookmarks/quick-wins"),
            resolvingAgainstBaseURL: false
        )!
        var items = [URLQueryItem(name: "limit", value: String(limit))]
        if let contentType {
            items.append(URLQueryItem(name: "contentType", value: contentType.rawValue))
        }
        if let cursor {
            items.append(URLQueryItem(name: "cursor", value: cursor))
        }
        components.queryItems = items
        let response: PaginatedBookmarksResponse = try await request(url: components.url!)
        return await overlayUnfinishedBookmarks(response, contentType: contentType)
    }

    func listCollectionItems(
        id: String,
        contentType: ContentType? = nil,
        cursor: String? = nil,
        limit: Int = 30
    ) async throws -> PaginatedBookmarksResponse {
        var components = URLComponents(
            url: baseURL.appending(path: "/api/v1/collections/\(id)/items"),
            resolvingAgainstBaseURL: false
        )!
        var items = [URLQueryItem(name: "limit", value: String(limit))]
        if let contentType {
            items.append(URLQueryItem(name: "contentType", value: contentType.rawValue))
        }
        if let cursor {
            items.append(URLQueryItem(name: "cursor", value: cursor))
        }
        components.queryItems = items
        let response: PaginatedBookmarksResponse = try await request(url: components.url!)
        return await overlayUnfinishedBookmarks(response, contentType: contentType)
    }

    func listInbox(
        query: InboxQuery,
        cursor: String? = nil,
        limit: Int = 30
    ) async throws -> PaginatedBookmarksResponse {
        var components = URLComponents(
            url: baseURL.appending(path: "/api/v1/inbox"),
            resolvingAgainstBaseURL: false
        )!
        var items = [URLQueryItem(name: "limit", value: String(limit))]
        if let provider = query.provider {
            items.append(URLQueryItem(name: "provider", value: provider.rawValue))
        }
        if let contentType = query.contentType {
            items.append(URLQueryItem(name: "contentType", value: contentType.rawValue))
        }
        if let cursor {
            items.append(URLQueryItem(name: "cursor", value: cursor))
        }
        components.queryItems = items
        return try await request(url: components.url!)
    }

    func getBookmark(id: String) async throws -> Bookmark {
        let response: BookmarkResponse = try await request(
            url: baseURL.appending(path: "/api/v1/bookmarks/\(id)")
        )
        guard let bookmarkMutationOutbox else { return response.item }
        guard let overlaid = await bookmarkMutationOutbox.overlay(response.item) else {
            throw APIError.server(
                status: 404,
                message: "This bookmark was removed on this device.",
                code: nil
            )
        }
        return overlaid
    }

    func getBookmarkSubscriptionSettings(id: String) async throws -> BookmarkSubscriptionSettings? {
        let response: BookmarkSubscriptionSettingsResponse = try await request(
            url: baseURL.appending(path: "/api/v1/bookmarks/\(id)/subscription-settings")
        )
        return response.subscription
    }

    func setBookmarkSubscriptionAutoBookmark(
        _ settings: BookmarkSubscriptionSettings,
        enabled: Bool
    ) async throws {
        switch settings.provider {
        case .youtube, .spotify:
            guard let source = SubscriptionSource(rawValue: settings.provider.rawValue) else {
                throw APIError.invalidResponse
            }
            try await setProviderSubscriptionAutoBookmark(
                id: settings.sourceId,
                provider: source,
                enabled: enabled
            )
        case .gmail:
            try await updateNewsletter(
                id: settings.sourceId,
                action: enabled ? "auto_bookmark_on" : "auto_bookmark_off"
            )
        case .rss:
            try await updateRssFeed(
                id: settings.sourceId,
                action: enabled ? "auto_bookmark_on" : "auto_bookmark_off"
            )
        case .substack, .web, .x:
            throw APIError.invalidResponse
        }
    }

    func getCreator(id: String) async throws -> CreatorResponse {
        try await request(url: baseURL.appending(path: "/api/v1/creators/\(id)"))
    }

    func listCreatorBookmarks(
        creatorId: String,
        cursor: String? = nil,
        isFinished: Bool? = nil,
        limit: Int = 30
    ) async throws -> PaginatedBookmarksResponse {
        var components = URLComponents(
            url: baseURL.appending(path: "/api/v1/creators/\(creatorId)/bookmarks"),
            resolvingAgainstBaseURL: false
        )!
        var items = [URLQueryItem(name: "limit", value: String(limit))]
        if let cursor {
            items.append(URLQueryItem(name: "cursor", value: cursor))
        }
        if let isFinished {
            items.append(URLQueryItem(name: "isFinished", value: String(isFinished)))
        }
        components.queryItems = items
        return try await request(url: components.url!)
    }

    func getCreatorLatestContent(id: String) async throws -> CreatorLatestContentResponse {
        try await request(
            url: baseURL.appending(path: "/api/v1/creators/\(id)/latest-content")
        )
    }

    func setFinished(
        id: String,
        isFinished: Bool,
        bookmark: Bookmark? = nil
    ) async throws -> FinishedStateResponse.FinishedBookmark {
        guard let bookmarkMutationOutbox else {
            return try await sendFinished(id: id, isFinished: isFinished)
        }
        let mutation = await bookmarkMutationOutbox.stageFinished(
            bookmarkID: id,
            isFinished: isFinished,
            bookmark: bookmark
        )

        do {
            let response = try await sendFinished(id: id, isFinished: isFinished)
            await bookmarkMutationOutbox.remove(mutation)
            return response
        } catch where error.isRetryableOfflineMutationFailure {
            return FinishedStateResponse.FinishedBookmark(
                id: id,
                itemId: bookmark?.itemId ?? id,
                isFinished: isFinished,
                finishedAt: isFinished ? mutation.createdAt : nil
            )
        } catch {
            await bookmarkMutationOutbox.remove(mutation)
            throw error
        }
    }

    private func sendFinished(
        id: String,
        isFinished: Bool
    ) async throws -> FinishedStateResponse.FinishedBookmark {
        var request = URLRequest(url: baseURL.appending(path: "/api/v1/bookmarks/\(id)"))
        request.httpMethod = "PATCH"
        request.httpBody = try JSONEncoder().encode(["isFinished": isFinished])
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        let response: FinishedStateResponse = try await send(request)
        return response.bookmark
    }

    func listTags() async throws -> [BookmarkTag] {
        do {
            let response: BookmarkTagsResponse = try await request(
                url: baseURL.appending(path: "/api/v1/tags")
            )
            await bookmarkMutationOutbox?.cacheKnownTags(response.tags)
            return response.tags
        } catch where error.isRetryableOfflineMutationFailure {
            guard let bookmarkMutationOutbox else { throw error }
            let tags = await bookmarkMutationOutbox.knownTags()
            guard !tags.isEmpty else { throw error }
            return tags
        }
    }

    func setTags(
        id: String,
        tags: [String],
        bookmark: Bookmark? = nil
    ) async throws -> [BookmarkTag] {
        guard let bookmarkMutationOutbox else {
            return try await sendTags(id: id, tags: tags)
        }
        let mutation = await bookmarkMutationOutbox.stageTags(
            bookmarkID: id,
            tags: tags,
            bookmark: bookmark
        )

        do {
            let response = try await sendTags(id: id, tags: tags)
            await bookmarkMutationOutbox.cacheKnownTags(response)
            await bookmarkMutationOutbox.remove(mutation)
            return response
        } catch where error.isRetryableOfflineMutationFailure {
            return OfflineBookmarkMutationOutbox.localTags(for: tags)
        } catch {
            await bookmarkMutationOutbox.remove(mutation)
            throw error
        }
    }

    private func sendTags(id: String, tags: [String]) async throws -> [BookmarkTag] {
        var request = URLRequest(url: baseURL.appending(path: "/api/v1/bookmarks/\(id)/tags"))
        request.httpMethod = "PUT"
        request.httpBody = try JSONEncoder().encode(["tags": tags])
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        let response: BookmarkTagsResponse = try await send(request)
        return response.tags
    }

    func archiveBookmark(id: String, bookmark: Bookmark? = nil) async throws {
        guard let bookmarkMutationOutbox else {
            try await sendArchiveBookmark(id: id)
            return
        }
        let mutation = await bookmarkMutationOutbox.stageArchive(
            bookmarkID: id,
            bookmark: bookmark
        )

        do {
            try await sendArchiveBookmark(id: id)
            await bookmarkMutationOutbox.remove(mutation)
            await articleBodyCache?.remove(bookmarkID: id)
        } catch where error.isRetryableOfflineMutationFailure {
            await articleBodyCache?.remove(bookmarkID: id)
        } catch {
            await bookmarkMutationOutbox.remove(mutation)
            throw error
        }
    }

    private func sendArchiveBookmark(id: String) async throws {
        var request = URLRequest(url: baseURL.appending(path: "/api/v1/bookmarks/\(id)"))
        request.httpMethod = "DELETE"
        let _: EmptyResponse = try await send(request)
    }

    func bookmarkItem(id: String) async throws {
        var request = URLRequest(url: baseURL.appending(path: "/api/v1/inbox/\(id)/bookmark"))
        request.httpMethod = "POST"
        let _: EmptyResponse = try await send(request)
    }

    func archiveInboxItem(id: String) async throws {
        var request = URLRequest(url: baseURL.appending(path: "/api/v1/inbox/\(id)/archive"))
        request.httpMethod = "POST"
        let _: EmptyResponse = try await send(request)
    }

    func markOpened(id: String) async throws {
        var request = URLRequest(url: baseURL.appending(path: "/api/v1/bookmarks/\(id)/opened"))
        request.httpMethod = "POST"
        let _: EmptyResponse = try await send(request)
    }

    func getArticleContent(id: String) async throws -> ArticleContentResponse {
        let url = baseURL.appending(path: "/api/v1/bookmarks/\(id)/article-content")
        return try await articleContentRequests.response(
            bookmarkID: id,
            purpose: .reader
        ) {
            try await request(url: url)
        }
    }

    func warmArticleContent(id: String) async throws {
        if let cached = await cachedArticleContent(id: id),
           cached.readableContent != nil
        {
            return
        }

        let url = baseURL.appending(path: "/api/v1/bookmarks/\(id)/article-content")
        let response = try await articleContentRequests.response(
            bookmarkID: id,
            purpose: .warmup
        ) {
            try await request(url: url)
        }
        try Task.checkCancellation()
        await cacheArticleContent(response, id: id)
    }

    func cacheArticleContentForOffline(
        id: String,
        maximumAge: TimeInterval = 24 * 60 * 60
    ) async throws {
        guard let articleBodyCache else { return }
        guard await articleBodyCache.needsOfflineRefresh(
            bookmarkID: id,
            maximumAge: maximumAge
        ) else { return }

        let url = baseURL.appending(path: "/api/v1/bookmarks/\(id)/article-content")
        let response = try await articleContentRequests.response(
            bookmarkID: id,
            purpose: .warmup
        ) {
            try await request(url: url)
        }
        try Task.checkCancellation()
        await articleBodyCache.recordOfflineCheck(response, bookmarkID: id)
    }

    func requestArticleContent(id: String) async throws -> ArticleContentResponse {
        var request = URLRequest(
            url: baseURL.appending(path: "/api/v1/bookmarks/\(id)/article-content")
        )
        request.httpMethod = "POST"
        return try await send(request)
    }

    func updateProgress(id: String, fraction: Double) async throws {
        let clamped = min(max(fraction, 0), 1)
        var request = URLRequest(url: baseURL.appending(path: "/api/v1/bookmarks/\(id)/progress"))
        request.httpMethod = "PUT"
        request.httpBody = try JSONEncoder().encode(
            ReadingProgressRequest(position: clamped, duration: 1)
        )
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        let _: EmptyResponse = try await send(request)
    }

    func cachedArticleContent(id: String) async -> ArticleContentResponse? {
        await articleBodyCache?.load(bookmarkID: id)
    }

    func cacheArticleContent(_ response: ArticleContentResponse, id: String) async {
        await articleBodyCache?.save(response, bookmarkID: id)
    }

    func pendingArticleProgress(id: String) async -> Double? {
        await articleBodyCache?.pendingProgress(bookmarkID: id)
    }

    func stageArticleProgress(id: String, fraction: Double) async {
        await articleBodyCache?.stageProgress(fraction, bookmarkID: id)
    }

    func markArticleProgressSynced(id: String, fraction: Double) async {
        await articleBodyCache?.markProgressSynced(bookmarkID: id, fraction: fraction)
    }

    func flushPendingArticleProgress() async {
        guard let pending = await articleBodyCache?.allPendingProgress() else { return }
        for (bookmarkID, fraction) in pending.sorted(by: { $0.key < $1.key }) {
            guard !Task.isCancelled else { return }
            do {
                try await updateProgress(id: bookmarkID, fraction: fraction)
                await markArticleProgressSynced(id: bookmarkID, fraction: fraction)
            } catch {
                // Keep the newest local value for the next foreground synchronization.
            }
        }
    }

    func flushPendingBookmarkMutations() async {
        guard let bookmarkMutationOutbox else { return }
        for mutation in await bookmarkMutationOutbox.pendingMutations() {
            guard !Task.isCancelled else { return }
            do {
                switch mutation.kind {
                case .finished:
                    guard let isFinished = mutation.isFinished else {
                        await bookmarkMutationOutbox.remove(mutation)
                        continue
                    }
                    _ = try await sendFinished(id: mutation.bookmarkID, isFinished: isFinished)
                case .tags:
                    let tags = try await sendTags(
                        id: mutation.bookmarkID,
                        tags: mutation.tags ?? []
                    )
                    await bookmarkMutationOutbox.cacheKnownTags(tags)
                case .archive:
                    do {
                        try await sendArchiveBookmark(id: mutation.bookmarkID)
                    } catch let APIError.server(status, _, _) where status == 404 || status == 410 {
                        // The desired terminal state is already present.
                    }
                    await articleBodyCache?.remove(bookmarkID: mutation.bookmarkID)
                }
                await bookmarkMutationOutbox.remove(mutation)
            } catch where error.isRetryableOfflineMutationFailure {
                return
            } catch {
                // A permanent rejection must not poison the rest of the outbox.
                await bookmarkMutationOutbox.remove(mutation)
            }
        }
    }

    func overlayLibraryBookmarks(_ bookmarks: [Bookmark], query: LibraryQuery) async -> [Bookmark] {
        guard let bookmarkMutationOutbox else { return bookmarks }
        return await bookmarkMutationOutbox.overlay(bookmarks, matching: query)
    }

    func pendingBookmarkMutationCount() async -> Int {
        guard let bookmarkMutationOutbox else { return 0 }
        return await bookmarkMutationOutbox.pendingMutations().count
    }

    func cacheTagsForOffline() async {
        _ = try? await listTags()
    }

    func removeOfflineArticleData() async {
        await articleBodyCache?.removeAll()
        await bookmarkMutationOutbox?.removeAll()
    }

    func listSubscriptionSources() async throws -> SubscriptionsHubResponse {
        try await request(url: baseURL.appending(path: "/api/v1/subscriptions"))
    }

    func listProviderSubscriptions(_ provider: SubscriptionSource) async throws -> ProviderSubscriptionsResponse {
        try await request(
            url: baseURL.appending(path: "/api/v1/subscriptions/\(provider.pathComponent)")
        )
    }

    func registerOAuthState(_ state: String, provider: SubscriptionSource) async throws {
        var request = URLRequest(
            url: baseURL.appending(
                path: "/api/v1/subscriptions/\(provider.pathComponent)/connection/state"
            )
        )
        request.httpMethod = "POST"
        request.httpBody = try JSONEncoder().encode(RegisterOAuthStateRequest(state: state))
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        let _: EmptyResponse = try await send(request)
    }

    func completeOAuth(
        provider: SubscriptionSource,
        code: String,
        state: String,
        codeVerifier: String,
        redirectUri: String
    ) async throws {
        var request = URLRequest(
            url: baseURL.appending(
                path: "/api/v1/subscriptions/\(provider.pathComponent)/connection/callback"
            )
        )
        request.httpMethod = "POST"
        request.httpBody = try JSONEncoder().encode(
            CompleteOAuthRequest(
                code: code,
                state: state,
                codeVerifier: codeVerifier,
                redirectUri: redirectUri
            )
        )
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        let _: EmptyResponse = try await send(request)
    }

    func disconnectProvider(_ provider: SubscriptionSource) async throws {
        var request = URLRequest(
            url: baseURL.appending(
                path: "/api/v1/subscriptions/\(provider.pathComponent)/connection"
            )
        )
        request.httpMethod = "DELETE"
        let _: EmptyResponse = try await send(request)
    }

    func addProviderSubscription(
        _ item: ProviderSubscriptionItem,
        provider: SubscriptionSource
    ) async throws {
        var request = URLRequest(
            url: baseURL.appending(path: "/api/v1/subscriptions/\(provider.pathComponent)")
        )
        request.httpMethod = "POST"
        request.httpBody = try JSONEncoder().encode(
            AddProviderSubscriptionRequest(
                channelId: item.channelId,
                name: item.name,
                imageUrl: item.imageUrl?.absoluteString
            )
        )
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        let _: EmptyResponse = try await send(request)
    }

    func removeProviderSubscription(id: String, provider: SubscriptionSource) async throws {
        var request = URLRequest(
            url: baseURL.appending(
                path: "/api/v1/subscriptions/\(provider.pathComponent)/\(id)"
            )
        )
        request.httpMethod = "DELETE"
        let _: EmptyResponse = try await send(request)
    }

    func setProviderSubscriptionPaused(
        id: String,
        provider: SubscriptionSource,
        isPaused: Bool
    ) async throws {
        var request = URLRequest(
            url: baseURL.appending(
                path: "/api/v1/subscriptions/\(provider.pathComponent)/\(id)"
            )
        )
        request.httpMethod = "PATCH"
        request.httpBody = try JSONEncoder().encode(
            UpdateProviderSubscriptionRequest(action: isPaused ? "pause" : "resume")
        )
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        let _: EmptyResponse = try await send(request)
    }

    func setProviderSubscriptionAutoBookmark(
        id: String,
        provider: SubscriptionSource,
        enabled: Bool
    ) async throws {
        var request = URLRequest(
            url: baseURL.appending(
                path: "/api/v1/subscriptions/\(provider.pathComponent)/\(id)"
            )
        )
        request.httpMethod = "PATCH"
        request.httpBody = try JSONEncoder().encode(
            UpdateProviderSubscriptionRequest(
                action: enabled ? "auto_bookmark_on" : "auto_bookmark_off"
            )
        )
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        let _: EmptyResponse = try await send(request)
    }

    func syncProviderSubscription(
        id: String,
        provider: SubscriptionSource
    ) async throws -> SubscriptionSyncResponse {
        var request = URLRequest(
            url: baseURL.appending(
                path: "/api/v1/subscriptions/\(provider.pathComponent)/\(id)/sync"
            )
        )
        request.httpMethod = "POST"
        return try await send(request)
    }

    func listNewsletters() async throws -> NewsletterSubscriptionsResponse {
        try await request(url: baseURL.appending(path: "/api/v1/subscriptions/gmail"))
    }

    func updateNewsletter(id: String, action: String) async throws {
        var request = URLRequest(
            url: baseURL.appending(path: "/api/v1/subscriptions/gmail/\(id)")
        )
        request.httpMethod = "PATCH"
        request.httpBody = try JSONEncoder().encode(ActionRequest(action: action))
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        let _: EmptyResponse = try await send(request)
    }

    func unsubscribeNewsletter(id: String) async throws {
        var request = URLRequest(
            url: baseURL.appending(path: "/api/v1/subscriptions/gmail/\(id)")
        )
        request.httpMethod = "DELETE"
        let _: EmptyResponse = try await send(request)
    }

    func syncNewsletters() async throws {
        var request = URLRequest(url: baseURL.appending(path: "/api/v1/subscriptions/gmail/sync"))
        request.httpMethod = "POST"
        let _: EmptyResponse = try await send(request)
    }

    func listRssFeeds() async throws -> RssSubscriptionsResponse {
        try await request(url: baseURL.appending(path: "/api/v1/subscriptions/rss"))
    }

    func addRssFeed(url: String) async throws {
        var request = URLRequest(url: baseURL.appending(path: "/api/v1/subscriptions/rss"))
        request.httpMethod = "POST"
        request.httpBody = try JSONEncoder().encode(AddRssFeedRequest(feedUrl: url, seedMode: "latest"))
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        let _: EmptyResponse = try await send(request)
    }

    func updateRssFeed(id: String, action: String) async throws {
        var request = URLRequest(url: baseURL.appending(path: "/api/v1/subscriptions/rss/\(id)"))
        request.httpMethod = "PATCH"
        request.httpBody = try JSONEncoder().encode(ActionRequest(action: action))
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        let _: EmptyResponse = try await send(request)
    }

    func removeRssFeed(id: String) async throws {
        var request = URLRequest(url: baseURL.appending(path: "/api/v1/subscriptions/rss/\(id)"))
        request.httpMethod = "DELETE"
        let _: EmptyResponse = try await send(request)
    }

    func syncRssFeed(id: String) async throws -> SubscriptionSyncResponse {
        var request = URLRequest(
            url: baseURL.appending(path: "/api/v1/subscriptions/rss/\(id)/sync")
        )
        request.httpMethod = "POST"
        return try await send(request)
    }

    func getXSubscriptions() async throws -> XSubscriptionsResponse {
        try await request(url: baseURL.appending(path: "/api/v1/subscriptions/x"))
    }

    func updateXBookmarkSettings(dailySyncEnabled: Bool) async throws {
        var request = URLRequest(
            url: baseURL.appending(path: "/api/v1/subscriptions/x/settings")
        )
        request.httpMethod = "PATCH"
        request.httpBody = try JSONEncoder().encode(
            UpdateXBookmarkSettingsRequest(dailySyncEnabled: dailySyncEnabled)
        )
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        let _: EmptyResponse = try await send(request)
    }

    func syncXBookmarks() async throws {
        var request = URLRequest(url: baseURL.appending(path: "/api/v1/subscriptions/x/sync"))
        request.httpMethod = "POST"
        let _: EmptyResponse = try await send(request)
    }

    private static func filterHome(_ response: HomeResponse, hiding ids: Set<String>) -> HomeResponse {
        func visible(_ items: [HomeItem]) -> [HomeItem] {
            items.filter { !ids.contains($0.id) }
        }

        let collections = response.customCollections.map { collection in
            let items = visible(collection.items)
            return HomeCollection(
                collectionId: collection.collectionId,
                title: collection.title,
                layout: collection.layout,
                position: collection.position,
                count: items.count,
                items: items
            )
        }
        return HomeResponse(
            recentBookmarks: visible(response.recentBookmarks),
            jumpBackIn: visible(response.jumpBackIn),
            byContentType: HomeContentTypeSections(
                videos: visible(response.byContentType.videos),
                podcasts: visible(response.byContentType.podcasts),
                articles: visible(response.byContentType.articles)
            ),
            customCollections: collections,
            sectionOrder: response.sectionOrder,
            requestId: response.requestId,
            traceId: response.traceId
        )
    }

    private func overlayUnfinishedBookmarks(
        _ response: PaginatedBookmarksResponse,
        contentType: ContentType?
    ) async -> PaginatedBookmarksResponse {
        guard let bookmarkMutationOutbox else { return response }
        return PaginatedBookmarksResponse(
            items: await bookmarkMutationOutbox.overlay(
                response.items,
                matching: LibraryQuery(isFinished: false, contentType: contentType)
            ),
            nextCursor: response.nextCursor
        )
    }

    private func request<Response: Decodable>(url: URL) async throws -> Response {
        try await send(URLRequest(url: url))
    }

    private func send<Response: Decodable>(_ input: URLRequest) async throws -> Response {
        var request = input
        let token = try await tokenProvider()
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Accept")

        let (data, response) = try await session.data(for: request)
        guard let http = response as? HTTPURLResponse else {
            throw APIError.invalidResponse
        }
        guard (200..<300).contains(http.statusCode) else {
            let payload = try? JSONDecoder().decode(APIErrorPayload.self, from: data)
            throw APIError.server(
                status: http.statusCode,
                message: payload?.error ?? HTTPURLResponse.localizedString(forStatusCode: http.statusCode),
                code: payload?.code
            )
        }
        return try JSONDecoder().decode(Response.self, from: data)
    }
}

private struct AddProviderSubscriptionRequest: Encodable {
    let channelId: String
    let name: String
    let imageUrl: String?
}

private struct ReadingProgressRequest: Encodable {
    let position: Double
    let duration: Double
}

private struct RegisterOAuthStateRequest: Encodable {
    let state: String
}

private struct CompleteOAuthRequest: Encodable {
    let code: String
    let state: String
    let codeVerifier: String
    let redirectUri: String
}

private struct UpdateProviderSubscriptionRequest: Encodable {
    let action: String
}

private struct ActionRequest: Encodable {
    let action: String
}

private struct AddRssFeedRequest: Encodable {
    let feedUrl: String
    let seedMode: String
}

private struct UpdateXBookmarkSettingsRequest: Encodable {
    let dailySyncEnabled: Bool
}

private struct SaveEditorialBookmarkRequest: Encodable {
    let url: String
    let tags: [String]
}

private struct EmptyResponse: Decodable {}
