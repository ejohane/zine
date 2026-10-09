import Foundation

extension APIClient {
    func publicationRequest<T: Decodable>(
        _ path: String, method: String = "GET", body: PublicationValue? = nil,
        anonymous: Bool = false, key: String? = nil, rawBody: Data? = nil, contentType: String = "application/json"
    ) async throws -> T {
        let pieces = path.split(separator: "?", maxSplits: 1, omittingEmptySubsequences: false)
        var components = URLComponents(url: baseURL.appending(path: "/api/v1/\(pieces[0])"), resolvingAgainstBaseURL: false)!
        if pieces.count > 1 { components.percentEncodedQuery = String(pieces[1]) }
        var request = URLRequest(url: components.url!, cachePolicy: .reloadIgnoringLocalCacheData)
        request.httpMethod = method
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        if !anonymous { request.setValue("Bearer \(try await tokenProvider())", forHTTPHeaderField: "Authorization") }
        if let key { request.setValue(key, forHTTPHeaderField: "Idempotency-Key") }
        if let rawBody { request.httpBody = rawBody }
        else if let body { request.httpBody = try JSONEncoder().encode(body) }
        if request.httpBody != nil { request.setValue(contentType, forHTTPHeaderField: "Content-Type") }
        let (data, response) = try await session.data(for: request)
        try Task.checkCancellation()
        guard let http = response as? HTTPURLResponse else { throw APIError.invalidResponse }
        guard (200..<300).contains(http.statusCode) else {
            let payload = try? JSONDecoder().decode(PublicationErrorBody.self, from: data)
            throw PublicationRequestError(status: http.statusCode,
                message: payload?.error ?? HTTPURLResponse.localizedString(forStatusCode: http.statusCode),
                code: payload?.code, details: payload?.details)
        }
        return try JSONDecoder().decode(T.self, from: data)
    }
    func ownPublication() async throws -> PersonalPublication {
        let r: PublicationEnvelope = try await publicationRequest("me/publication"); return r.publication
    }
    func publicPublication(_ id: String) async throws -> PersonalPublication {
        let r: PublicationEnvelope = try await publicationRequest("publications/\(id)", anonymous: true); return r.publication
    }
    func publicationIssues(_ id: String? = nil, cursor: String? = nil) async throws -> IssuePage {
        let path = id.map { "publications/\($0)/issues" } ?? "me/publication/issues"
        return try await publicationRequest(path + (cursor.map { "?cursor=\($0)" } ?? ""), anonymous: id != nil)
    }
    func personalIssue(_ id: String, owner: Bool = false) async throws -> PersonalIssue {
        let r: IssueEnvelope = try await publicationRequest(owner ? "me/issues/\(id)" : "issues/\(id)", anonymous: !owner); return r.issue
    }
    func createPersonalIssue(key: String) async throws -> PersonalIssue {
        let r: IssueEnvelope = try await publicationRequest("me/publication/issues", method: "POST",
            body: .object(["kind": .string("INDEPENDENT")]), key: key); return r.issue
    }
    func mutatePersonalIssue(_ id: String, revision: Int, operations: [PublicationOperation], key: String) async throws -> PersonalIssue {
        let r: IssueEnvelope = try await publicationRequest("me/issues/\(id)", method: "PATCH",
            body: .object(["expectedRevision": .integer(revision), "operations": .array(operations.map(PublicationValue.object))]), key: key)
        return r.issue
    }
    func publishPersonalIssue(_ issue: PersonalIssue, key: String) async throws -> PersonalIssue {
        let r: IssueEnvelope = try await publicationRequest("me/issues/\(issue.id)/publish", method: "POST",
            body: .object(["expectedRevision": .integer(issue.revision)]), key: key); return r.issue
    }
    func publicationSubscription(_ id: String, method: String = "GET", muted: Bool? = nil) async throws -> PersonalSubscription {
        let r: SubscriptionEnvelope = try await publicationRequest("publications/\(id)/subscription", method: method,
            body: muted.map { .object(["muted": .bool($0)]) }); return r.subscription
    }
    /// Owner previews use a fixed authenticated API path, never a cover URL from content.
    func ownPublicationCover(_ assetID: String) async throws -> Data {
        guard assetID.range(of: "^[0-9A-HJKMNP-TV-Z]{26}$", options: .regularExpression) != nil else {
            throw APIError.invalidResponse
        }
        var request = URLRequest(url: baseURL.appending(path: "/api/v1/me/publication-assets/\(assetID)"), cachePolicy: .reloadIgnoringLocalCacheData)
        request.setValue("Bearer \(try await tokenProvider())", forHTTPHeaderField: "Authorization")
        request.setValue("image/*", forHTTPHeaderField: "Accept")
        let (data, response) = try await session.data(for: request)
        try Task.checkCancellation()
        guard let http = response as? HTTPURLResponse else { throw APIError.invalidResponse }
        guard (200..<300).contains(http.statusCode) else {
            throw PublicationRequestError(status: http.statusCode, message: "Cover preview is unavailable.", code: nil, details: nil)
        }
        guard data.count <= 5 * 1024 * 1024 else { throw APIError.invalidResponse }
        return data
    }
    func uploadPublicationCover(_ bytes: Data, contentType: String) async throws -> String {
        struct Asset: Decodable { struct Value: Decodable { var id: String }; var asset: Value }
        let r: Asset = try await publicationRequest("me/publication-assets", method: "POST", rawBody: bytes, contentType: contentType)
        return r.asset.id
    }
}
