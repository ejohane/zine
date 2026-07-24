import Foundation
import XCTest
@testable import ZineNative

final class ArticleReaderTests: XCTestCase {
    func testArticleContentDecodesReadableAvailability() throws {
        let response = try JSONDecoder().decode(
            ArticleContentResponse.self,
            from: Data(Self.availableJSON.utf8)
        )

        XCTAssertEqual(response.articleBody.availability, .available)
        XCTAssertEqual(response.articleBody.pipelineStatus, .available)
        XCTAssertEqual(response.articleBody.wordCount, 640)
        XCTAssertEqual(response.readableContent, "<article><p>Readable body</p></article>")
    }

    func testHTMLDocumentEscapesMetadataAndInstallsDefenseInDepthPolicy() throws {
        let metadata = Self.metadata(title: "A <quiet> & useful reader")
        let response = try JSONDecoder().decode(
            ArticleContentResponse.self,
            from: Data(Self.availableJSON.utf8)
        )
        let html = ArticleHTMLDocumentBuilder.makeHTML(
            for: ArticleReaderDocument(metadata: metadata, response: response)
        )

        XCTAssertTrue(html.contains("A &lt;quiet&gt; &amp; useful reader"))
        XCTAssertTrue(html.contains("script-src 'none'"))
        XCTAssertTrue(html.contains("frame-src 'none'"))
        XCTAssertTrue(html.contains("<article><p>Readable body</p></article>"))
    }

    func testCachePersistsOnlyReadableDocumentsPerUser() async throws {
        let directory = FileManager.default.temporaryDirectory
            .appending(path: "article-cache-\(UUID().uuidString)", directoryHint: .isDirectory)
        defer { try? FileManager.default.removeItem(at: directory) }

        let readable = try JSONDecoder().decode(
            ArticleContentResponse.self,
            from: Data(Self.availableJSON.utf8)
        )
        let unavailable = try JSONDecoder().decode(
            ArticleContentResponse.self,
            from: Data(Self.unavailableJSON.utf8)
        )
        let cache = ArticleBodyCache(userID: "user/one", baseDirectory: directory)
        await cache.save(readable, bookmarkID: "bookmark-1")
        await cache.save(unavailable, bookmarkID: "bookmark-2")

        let reloaded = ArticleBodyCache(userID: "user/one", baseDirectory: directory)
        let otherUser = ArticleBodyCache(userID: "user/two", baseDirectory: directory)
        let cachedReadable = await reloaded.load(bookmarkID: "bookmark-1")
        let cachedUnavailable = await reloaded.load(bookmarkID: "bookmark-2")
        let crossUser = await otherUser.load(bookmarkID: "bookmark-1")

        XCTAssertEqual(cachedReadable?.articleBody.contentHash, "hash-1")
        XCTAssertNil(cachedUnavailable)
        XCTAssertNil(crossUser)
    }

    @MainActor
    func testStoreLoadsAnAvailableArticleWithoutRequestingAgain() async throws {
        let client = Self.client { request in
            XCTAssertEqual(request.httpMethod, "GET")
            return (200, Self.availableJSON)
        }
        let store = ArticleReaderStore(metadata: Self.metadata(), client: client)

        await store.load()

        guard case let .ready(document) = store.phase else {
            return XCTFail("Expected a ready reader, got \(store.phase)")
        }
        XCTAssertEqual(document.response.articleBody.contentHash, "hash-1")
        XCTAssertEqual(ArticleReaderURLProtocol.requests.count, 1)
    }

    @MainActor
    func testStoreRequestsOnceThenShowsATerminalUnavailableState() async throws {
        let client = Self.client { request in
            if request.httpMethod == "POST" {
                return (200, Self.unavailableJSON.replacingOccurrences(
                    of: "\"traceId\":\"trace-1\"",
                    with: "\"request\":{\"queued\":false,\"reason\":\"terminal\"},\"traceId\":\"trace-1\""
                ))
            }
            return (200, Self.notRequestedJSON)
        }
        let store = ArticleReaderStore(metadata: Self.metadata(), client: client)

        await store.load()

        guard case let .unavailable(message) = store.phase else {
            return XCTFail("Expected an unavailable reader, got \(store.phase)")
        }
        XCTAssertTrue(message.contains("dependable article body"))
        XCTAssertEqual(ArticleReaderURLProtocol.requests.map(\.httpMethod), ["GET", "POST"])
    }

    private static func metadata(title: String = "A dependable reader") -> ArticleReaderMetadata {
        ArticleReaderMetadata(
            bookmarkID: "bookmark-1",
            title: title,
            creator: "Author",
            canonicalURL: URL(string: "https://example.com/article")!,
            readingTimeMinutes: 4,
            initialProgress: BookmarkProgress(position: 0.25, duration: 1, percent: 25),
            isFinished: false
        )
    }

    private static func client(
        handler: @escaping (URLRequest) throws -> (Int, String)
    ) -> APIClient {
        ArticleReaderURLProtocol.handler = handler
        ArticleReaderURLProtocol.requests = []
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [ArticleReaderURLProtocol.self]
        return APIClient(
            baseURL: URL(string: "https://api.myzine.app")!,
            tokenProvider: { "test-token" },
            session: URLSession(configuration: configuration)
        )
    }

    private static let availableJSON = """
    {
      "content":"<article><p>Readable body</p></article>",
      "articleBody":{
        "availability":"AVAILABLE","pipelineStatus":"AVAILABLE","schemaVersion":1,
        "extractorVersion":1,"sourceKind":"PUBLIC_WEB","contentHash":"hash-1",
        "wordCount":640,"readingTimeMinutes":4,"qualityScore":0.98,
        "qualityWarnings":[],"lastErrorCode":null,"updatedAt":"2026-07-24T12:00:00Z"
      },
      "requestId":"request-1","traceId":"trace-1"
    }
    """

    private static let notRequestedJSON = """
    {
      "content":null,
      "articleBody":{
        "availability":"UNAVAILABLE","pipelineStatus":"NOT_REQUESTED","schemaVersion":null,
        "extractorVersion":null,"sourceKind":null,"contentHash":null,"wordCount":null,
        "readingTimeMinutes":null,"qualityScore":null,"qualityWarnings":[],
        "lastErrorCode":null,"updatedAt":null
      },
      "requestId":"request-1","traceId":"trace-1"
    }
    """

    private static let unavailableJSON = """
    {
      "content":null,
      "articleBody":{
        "availability":"UNAVAILABLE","pipelineStatus":"UNAVAILABLE","schemaVersion":null,
        "extractorVersion":1,"sourceKind":null,"contentHash":null,"wordCount":null,
        "readingTimeMinutes":null,"qualityScore":null,"qualityWarnings":[],
        "lastErrorCode":"NOT_READERABLE","updatedAt":"2026-07-24T12:00:00Z"
      },
      "requestId":"request-1","traceId":"trace-1"
    }
    """
}

private final class ArticleReaderURLProtocol: URLProtocol, @unchecked Sendable {
    static var handler: ((URLRequest) throws -> (Int, String))?
    static var requests: [URLRequest] = []

    override class func canInit(with request: URLRequest) -> Bool { true }

    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }

    override func startLoading() {
        Self.requests.append(request)
        do {
            let (status, body) = try Self.handler?(request) ?? (500, "{}")
            let response = HTTPURLResponse(
                url: request.url!,
                statusCode: status,
                httpVersion: nil,
                headerFields: ["Content-Type": "application/json"]
            )!
            client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
            client?.urlProtocol(self, didLoad: Data(body.utf8))
            client?.urlProtocolDidFinishLoading(self)
        } catch {
            client?.urlProtocol(self, didFailWithError: error)
        }
    }

    override func stopLoading() {}
}
