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

    func testHTMLDocumentAppliesReaderFontScaleToTypographyOnly() throws {
        let response = try JSONDecoder().decode(
            ArticleContentResponse.self,
            from: Data(Self.availableJSON.utf8)
        )
        let html = ArticleHTMLDocumentBuilder.makeHTML(
            for: ArticleReaderDocument(metadata: Self.metadata(), response: response),
            fontScale: ArticleReaderFontSize.extraLarge.scale
        )

        XCTAssertTrue(html.contains("--reader-font-scale: 1.3"))
        XCTAssertTrue(html.contains("font-size: calc(17px * var(--reader-font-scale))"))
        XCTAssertTrue(html.contains("padding: 88.0px 22px 96px"))
        XCTAssertFalse(html.contains("zoom:"))
    }

    func testHTMLDocumentPlacesCreatorAvatarBeforeCreatorName() throws {
        let response = try JSONDecoder().decode(
            ArticleContentResponse.self,
            from: Data(Self.availableJSON.utf8)
        )
        let html = ArticleHTMLDocumentBuilder.makeHTML(
            for: ArticleReaderDocument(
                metadata: Self.metadata(
                    creatorImageURL: URL(string: "https://example.com/avatar.jpg?size=48&fit=crop")
                ),
                response: response
            )
        )

        let avatar = "<img class=\"creator-avatar\" src=\"https://example.com/avatar.jpg?size=48&amp;fit=crop\" alt=\"\">"
        XCTAssertTrue(html.contains(avatar))
        XCTAssertLessThan(html.range(of: avatar)!.lowerBound, html.range(of: "<span>Author</span>")!.lowerBound)
    }

    func testHTMLDocumentPlacesRuleBetweenCreatorMetadataAndBody() throws {
        let response = try JSONDecoder().decode(
            ArticleContentResponse.self,
            from: Data(Self.availableJSON.utf8)
        )
        let html = ArticleHTMLDocumentBuilder.makeHTML(
            for: ArticleReaderDocument(metadata: Self.metadata(), response: response)
        )

        let title = "<h1>A dependable reader</h1>"
        let rule = "<hr class=\"title-rule\" aria-hidden=\"true\">"
        let metadata = "<div class=\"meta\">"
        let body = "<main>"
        XCTAssertLessThan(html.range(of: title)!.lowerBound, html.range(of: metadata)!.lowerBound)
        XCTAssertLessThan(html.range(of: metadata)!.lowerBound, html.range(of: rule)!.lowerBound)
        XCTAssertLessThan(html.range(of: rule)!.lowerBound, html.range(of: body)!.lowerBound)
    }

    func testReaderFontSizePresetsHaveStableIncreasingScales() {
        XCTAssertEqual(ArticleReaderFontSize.allCases.map(\.title), [
            "Small", "Default", "Large", "Extra Large",
        ])
        XCTAssertEqual(ArticleReaderFontSize.allCases.map(\.scale), [0.9, 1, 1.15, 1.3])
    }

    @MainActor
    func testReaderUsesPreciseStoredProgressInsteadOfRoundedPercent() {
        let progress = BookmarkProgress(position: 0.2574, duration: 1, percent: 26)
        let store = ArticleReaderStore(
            metadata: Self.metadata(initialProgress: progress),
            client: Self.client { _ in (500, "{}") }
        )

        XCTAssertEqual(progress.fraction, 0.2574, accuracy: 0.000_001)
        XCTAssertEqual(store.initialProgressFraction, 0.2574, accuracy: 0.000_001)
        XCTAssertEqual(
            BookmarkProgress(position: 4, duration: 0, percent: 37).fraction,
            0.37,
            accuracy: 0.000_001
        )
    }

    @MainActor
    func testProgressWritesRemainOrderedWhenTheFirstRequestIsSlow() async {
        var writes: [Double] = []
        var activeWrites = 0
        var maximumActiveWrites = 0
        let queue = ArticleProgressWriteQueue { fraction in
            activeWrites += 1
            maximumActiveWrites = max(maximumActiveWrites, activeWrites)
            if fraction == 0.2 {
                try? await Task.sleep(for: .milliseconds(100))
            }
            writes.append(fraction)
            activeWrites -= 1
            return true
        }

        let first = Task { @MainActor in await queue.enqueue(0.2) }
        await Task.yield()
        let second = Task { @MainActor in await queue.enqueue(0.8) }

        let firstResult = await first.value
        let secondResult = await second.value
        XCTAssertTrue(firstResult)
        XCTAssertTrue(secondResult)
        XCTAssertEqual(writes, [0.2, 0.8])
        XCTAssertEqual(maximumActiveWrites, 1)
    }

    func testReaderChromeOffsetDirectlyTracksBothScrollDirections() {
        var tracker = ArticleReaderChromeOffsetTracker()

        tracker.begin(at: 100)
        XCTAssertEqual(tracker.update(scrollOffset: 120), 20)
        XCTAssertEqual(tracker.update(scrollOffset: 150), 50)
        XCTAssertNil(tracker.update(scrollOffset: 150))
        XCTAssertEqual(tracker.offset, 50)

        XCTAssertEqual(tracker.update(scrollOffset: 138), 38)
        XCTAssertEqual(tracker.update(scrollOffset: 100), 0)
    }

    func testReaderChromeOffsetStaysPutAcrossAPause() {
        var tracker = ArticleReaderChromeOffsetTracker()

        tracker.begin(at: 0)
        XCTAssertEqual(tracker.update(scrollOffset: 80), 56)
        tracker.end()
        XCTAssertEqual(tracker.offset, 56)

        tracker.begin(at: 80)
        XCTAssertNil(tracker.update(scrollOffset: 80))
        XCTAssertEqual(tracker.update(scrollOffset: 66), 42)
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

    private static func metadata(
        title: String = "A dependable reader",
        creatorImageURL: URL? = nil,
        initialProgress: BookmarkProgress? = BookmarkProgress(
            position: 0.25,
            duration: 1,
            percent: 25
        )
    ) -> ArticleReaderMetadata {
        ArticleReaderMetadata(
            bookmarkID: "bookmark-1",
            title: title,
            creator: "Author",
            creatorImageURL: creatorImageURL,
            canonicalURL: URL(string: "https://example.com/article")!,
            readingTimeMinutes: 4,
            initialProgress: initialProgress,
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
