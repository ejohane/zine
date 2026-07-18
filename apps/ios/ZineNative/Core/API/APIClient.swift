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
    var session: URLSession = .shared

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
        return try await request(url: components.url!)
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
        return response.item
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

    func setFinished(id: String, isFinished: Bool) async throws -> FinishedStateResponse.FinishedBookmark {
        var request = URLRequest(url: baseURL.appending(path: "/api/v1/bookmarks/\(id)"))
        request.httpMethod = "PATCH"
        request.httpBody = try JSONEncoder().encode(["isFinished": isFinished])
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        let response: FinishedStateResponse = try await send(request)
        return response.bookmark
    }

    func archiveBookmark(id: String) async throws {
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

private struct EmptyResponse: Decodable {}
