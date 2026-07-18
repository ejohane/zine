import Foundation

struct BookmarkShareClient: Sendable {
    typealias TokenProvider = @MainActor @Sendable () async throws -> String

    var preview: @Sendable (_ url: URL) async throws -> BookmarkSharePreview
    var listTags: @Sendable () async throws -> [BookmarkShareTag]
    var save: @Sendable (_ url: URL, _ tags: [String]) async throws -> BookmarkShareSaveResult

    static func live(
        baseURL: URL,
        session: URLSession = .shared,
        tokenProvider: @escaping TokenProvider
    ) -> BookmarkShareClient {
        let transport = BookmarkShareTransport(
            baseURL: baseURL,
            session: session,
            tokenProvider: tokenProvider
        )

        return BookmarkShareClient(
            preview: { url in
                let response: PreviewResponse = try await transport.post(
                    path: "/api/v1/bookmarks/preview",
                    body: BookmarkURLBody(url: url.absoluteString)
                )
                return response.item
            },
            listTags: {
                let response: TagsResponse = try await transport.get(path: "/api/v1/tags")
                return response.tags
            },
            save: { url, tags in
                let response: SaveResponse = try await transport.post(
                    path: "/api/v1/bookmarks",
                    body: SaveBookmarkBody(url: url.absoluteString, tags: tags)
                )
                return BookmarkShareSaveResult(
                    status: response.bookmark.status,
                    itemID: response.bookmark.itemId,
                    userItemID: response.bookmark.userItemId,
                    item: response.item
                )
            }
        )
    }
}

private struct BookmarkShareTransport: Sendable {
    let baseURL: URL
    let session: URLSession
    let tokenProvider: BookmarkShareClient.TokenProvider

    func get<Response: Decodable & Sendable>(path: String) async throws -> Response {
        let request = try await authorizedRequest(path: path, method: "GET")
        return try await execute(request)
    }

    func post<Body: Encodable & Sendable, Response: Decodable & Sendable>(
        path: String,
        body: Body
    ) async throws -> Response {
        var request = try await authorizedRequest(path: path, method: "POST")
        request.httpBody = try JSONEncoder().encode(body)
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")

        return try await execute(request)
    }

    private func authorizedRequest(path: String, method: String) async throws -> URLRequest {
        var request = URLRequest(url: baseURL.appending(path: path))
        request.httpMethod = method
        request.setValue("application/json", forHTTPHeaderField: "Accept")

        let token = try await tokenProvider()
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        return request
    }

    private func execute<Response: Decodable & Sendable>(
        _ request: URLRequest
    ) async throws -> Response {
        let (data, response) = try await session.data(for: request)
        guard let http = response as? HTTPURLResponse else {
            throw BookmarkShareError.invalidResponse
        }

        guard (200..<300).contains(http.statusCode) else {
            let payload = try? JSONDecoder().decode(ErrorResponse.self, from: data)
            switch http.statusCode {
            case 401, 403:
                throw BookmarkShareError.signedOut
            case 422:
                throw BookmarkShareError.unsupportedURL
            default:
                throw BookmarkShareError.server(
                    status: http.statusCode,
                    message: payload?.error
                        ?? HTTPURLResponse.localizedString(forStatusCode: http.statusCode)
                )
            }
        }

        do {
            return try JSONDecoder().decode(Response.self, from: data)
        } catch {
            throw BookmarkShareError.invalidResponse
        }
    }
}

private struct BookmarkURLBody: Encodable, Sendable {
    let url: String
}

private struct SaveBookmarkBody: Encodable, Sendable {
    let url: String
    let tags: [String]
}

private struct PreviewResponse: Decodable, Sendable {
    let item: BookmarkSharePreview
}

private struct TagsResponse: Decodable, Sendable {
    let tags: [BookmarkShareTag]
}

private struct SaveResponse: Decodable, Sendable {
    struct BookmarkResult: Decodable, Sendable {
        let itemId: String
        let userItemId: String
        let status: BookmarkShareSaveStatus
    }

    let bookmark: BookmarkResult
    let item: BookmarkSharePreview
}

private struct ErrorResponse: Decodable {
    let error: String
}
