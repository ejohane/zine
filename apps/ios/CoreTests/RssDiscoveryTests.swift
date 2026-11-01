import Foundation
import XCTest
@testable import ZineCore

final class RssDiscoveryTests: XCTestCase {
    func testExistingSubscriptionsIncludePausedAndErrorFeeds() throws {
        for status in ["ACTIVE", "PAUSED", "ERROR"] {
            let discovery = try decode(status: status)
            XCTAssertTrue(discovery.isSubscribed)
        }
    }

    func testRemovedFeedCanBeSubscribedAgain() throws {
        XCTAssertFalse(try decode(status: "UNSUBSCRIBED").isSubscribed)
    }

    func testNewFeedAndEmptyDiscoveryAreNotSubscribed() throws {
        let data = Data(#"{"candidates":[{"feedUrl":"https://example.com/feed","title":null,"subscription":null}]}"#.utf8)
        let result = try JSONDecoder().decode(RssDiscovery.self, from: data)
        XCTAssertFalse(result.isSubscribed)
        XCTAssertEqual(result.candidates.first?.displayName, "https://example.com/feed")
        XCTAssertFalse(RssDiscovery(candidates: []).isSubscribed)
    }

    @MainActor
    func testClientUsesAuthenticatedDiscoveryAndPreservesArticleQuery() async throws {
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [RssDiscoveryProtocol.self]
        let session = URLSession(configuration: configuration)
        defer { session.invalidateAndCancel() }
        let client = APIClient(baseURL: URL(string: "https://rss.invalid")!, tokenProvider: { "fixture" }, session: session)
        let result = try await client.discoverRssFeeds(url: URL(string: "https://example.com/article?author=a&post=2")!)
        XCTAssertEqual(result.candidates.first?.displayName, "Author")
    }

    func testCreatorDiscoveryUsesProfileURLAndFallsBackToProviderURL() {
        XCTAssertEqual(creator(provider: .web, external: "https://author.example", identifier: "https://fallback.example").rssSourceURL?.absoluteString, "https://author.example")
        XCTAssertEqual(creator(provider: .rss, external: nil, identifier: "https://author.example").rssSourceURL?.absoluteString, "https://author.example")
        XCTAssertEqual(creator(provider: .substack, external: "mailto:author@example.com", identifier: "https://author.substack.com").rssSourceURL?.absoluteString, "https://author.substack.com")
        XCTAssertNil(creator(provider: .web, external: nil, identifier: "author-name").rssSourceURL)
        XCTAssertNil(creator(provider: .youtube, external: "https://youtube.com/channel/123", identifier: "123").rssSourceURL)
    }

    private func creator(provider: Provider, external: String?, identifier: String) -> CreatorProfile {
        CreatorProfile(id: "creator", name: "Author", imageUrl: nil, provider: provider,
                       providerCreatorId: identifier, description: nil, handle: nil,
                       externalUrl: external.flatMap(URL.init(string:)), createdAt: 0, updatedAt: 0)
    }

    private func decode(status: String) throws -> RssDiscovery {
        let data = Data("""
        {"candidates":[{"feedUrl":"https://example.com/feed","title":"Author","subscription":{"feedId":"feed-1","status":"\(status)"}}]}
        """.utf8)
        return try JSONDecoder().decode(RssDiscovery.self, from: data)
    }
}

private final class RssDiscoveryProtocol: URLProtocol, @unchecked Sendable {
    override class func canInit(with request: URLRequest) -> Bool { request.url?.host == "rss.invalid" }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
    override func startLoading() {
        let source = URLComponents(url: request.url!, resolvingAgainstBaseURL: false)?.queryItems?.first { $0.name == "url" }?.value
        guard request.httpMethod == "GET",
              request.url?.path == "/api/v1/subscriptions/rss/discover",
              request.value(forHTTPHeaderField: "Authorization") == "Bearer fixture",
              source == "https://example.com/article?author=a&post=2" else {
            client?.urlProtocol(self, didFailWithError: APIError.invalidResponse)
            return
        }
        let data = Data(#"{"candidates":[{"feedUrl":"https://example.com/feed","title":"Author","subscription":null}]}"#.utf8)
        client?.urlProtocol(self, didReceive: HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: ["Content-Type": "application/json"])!, cacheStoragePolicy: .notAllowed)
        client?.urlProtocol(self, didLoad: data)
        client?.urlProtocolDidFinishLoading(self)
    }
    override func stopLoading() {}
}
