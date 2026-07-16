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

private struct EmptyResponse: Decodable {}
