import Foundation
import XCTest
@testable import ZineNative

final class OfflineLibrarySynchronizerTests: XCTestCase {
    override func setUp() {
        super.setUp()
        OfflineSyncURLProtocol.requests = []
    }

    func testSynchronizerCachesEveryEligibleUnfinishedArticleAcrossPages() async throws {
        let directory = FileManager.default.temporaryDirectory
            .appending(path: "offline-library-\(UUID().uuidString)", directoryHint: .isDirectory)
        defer { try? FileManager.default.removeItem(at: directory) }

        let webArticle = Self.bookmark(id: "web-article", provider: .web, contentType: .article)
        let rssArticle = Self.bookmark(id: "rss-article", provider: .rss, contentType: .article)
        let unavailableArticle = Self.bookmark(
            id: "unavailable-article",
            provider: .web,
            contentType: .article
        )
        let substackArticle = Self.bookmark(
            id: "substack-article",
            provider: .substack,
            contentType: .article
        )
        let video = Self.bookmark(id: "video", provider: .youtube, contentType: .video)

        OfflineSyncURLProtocol.handler = { request in
            switch request.url?.path {
            case "/api/v1/bookmarks":
                let cursor = URLComponents(url: request.url!, resolvingAgainstBaseURL: false)?
                    .queryItems?
                    .first(where: { $0.name == "cursor" })?
                    .value
                if cursor == "page-2" {
                    return (200, try Self.pageJSON(
                        items: [rssArticle, unavailableArticle, substackArticle, video],
                        nextCursor: nil
                    ))
                }
                return (200, try Self.pageJSON(items: [webArticle], nextCursor: "page-2"))
            case "/api/v1/bookmarks/web-article/article-content",
                 "/api/v1/bookmarks/rss-article/article-content":
                return (200, Data(Self.availableArticleJSON.utf8))
            case "/api/v1/bookmarks/unavailable-article/article-content":
                return (200, Data(Self.unavailableArticleJSON.utf8))
            default:
                return (404, Data(#"{"error":"not found"}"#.utf8))
            }
        }

        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [OfflineSyncURLProtocol.self]
        let articleCache = ArticleBodyCache(userID: "test-user", baseDirectory: directory)
        let libraryCache = LibraryCache(userID: "test-user", baseDirectory: directory)
        let client = APIClient(
            baseURL: URL(string: "https://api.myzine.app")!,
            tokenProvider: { "test-token" },
            session: URLSession(configuration: configuration),
            articleBodyCache: articleCache
        )
        let synchronizer = OfflineLibrarySynchronizer(
            client: client,
            libraryCache: libraryCache
        )

        await synchronizer.synchronize()

        let snapshot = await libraryCache.loadOfflineLibrary()
        XCTAssertEqual(snapshot?.items.map(\.id), [
            "web-article", "rss-article", "unavailable-article", "substack-article", "video",
        ])
        let cachedWebArticle = await articleCache.load(bookmarkID: "web-article")
        let cachedRssArticle = await articleCache.load(bookmarkID: "rss-article")
        let cachedSubstackArticle = await articleCache.load(bookmarkID: "substack-article")
        let cachedUnavailableArticle = await articleCache.load(bookmarkID: "unavailable-article")
        let cachedVideo = await articleCache.load(bookmarkID: "video")
        XCTAssertNotNil(cachedWebArticle)
        XCTAssertNotNil(cachedRssArticle)
        XCTAssertNil(cachedSubstackArticle)
        XCTAssertNil(cachedUnavailableArticle)
        XCTAssertNil(cachedVideo)

        let articleRequests = OfflineSyncURLProtocol.requests.filter {
            $0.url?.path.hasSuffix("/article-content") == true
        }
        XCTAssertEqual(articleRequests.map { $0.url!.path }.sorted(), [
            "/api/v1/bookmarks/rss-article/article-content",
            "/api/v1/bookmarks/unavailable-article/article-content",
            "/api/v1/bookmarks/web-article/article-content",
        ])

        await synchronizer.synchronize()
        let repeatedArticleRequests = OfflineSyncURLProtocol.requests.filter {
            $0.url?.path.hasSuffix("/article-content") == true
        }
        XCTAssertEqual(repeatedArticleRequests.count, 3)
    }

    private static func bookmark(
        id: String,
        provider: Provider,
        contentType: ContentType
    ) -> Bookmark {
        Bookmark(
            id: id,
            itemId: "item-\(id)",
            title: "Saved \(id)",
            thumbnailUrl: nil,
            canonicalUrl: URL(string: "https://example.com/\(id)")!,
            contentType: contentType,
            provider: provider,
            creator: "Creator",
            creatorImageUrl: nil,
            creatorId: nil,
            publisher: nil,
            summary: nil,
            duration: nil,
            publishedAt: nil,
            wordCount: contentType == .article ? 640 : nil,
            readingTimeMinutes: contentType == .article ? 4 : nil,
            state: "READY",
            ingestedAt: "2026-08-23T12:00:00Z",
            bookmarkedAt: "2026-08-23T12:00:00Z",
            lastOpenedAt: nil,
            progress: nil,
            isFinished: false,
            finishedAt: nil,
            tags: []
        )
    }

    private static func pageJSON(items: [Bookmark], nextCursor: String?) throws -> Data {
        try JSONEncoder().encode(BookmarkPage(items: items, nextCursor: nextCursor))
    }

    private struct BookmarkPage: Encodable {
        let items: [Bookmark]
        let nextCursor: String?
    }

    private static let availableArticleJSON = """
    {
      "content":"<article><p>Readable offline body</p></article>",
      "articleBody":{
        "availability":"AVAILABLE","pipelineStatus":"AVAILABLE","schemaVersion":1,
        "extractorVersion":9,"sourceKind":"PUBLIC_WEB","contentHash":"offline-hash",
        "wordCount":640,"readingTimeMinutes":4,"qualityScore":0.98,
        "qualityWarnings":[],"lastErrorCode":null,"updatedAt":"2026-08-23T12:00:00Z"
      },
      "requestId":"request-1","traceId":"trace-1"
    }
    """

    private static let unavailableArticleJSON = """
    {
      "content":null,
      "articleBody":{
        "availability":"UNAVAILABLE","pipelineStatus":"UNAVAILABLE","schemaVersion":1,
        "extractorVersion":9,"sourceKind":"PUBLIC_WEB","contentHash":null,
        "wordCount":null,"readingTimeMinutes":null,"qualityScore":null,
        "qualityWarnings":[],"lastErrorCode":"EXTRACTION_FAILED",
        "updatedAt":"2026-08-23T12:00:00Z"
      },
      "requestId":"request-2","traceId":"trace-2"
    }
    """
}

private final class OfflineSyncURLProtocol: URLProtocol, @unchecked Sendable {
    static var handler: ((URLRequest) throws -> (Int, Data))?
    static var requests: [URLRequest] = []

    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }

    override func startLoading() {
        Self.requests.append(request)
        do {
            let (status, data) = try Self.handler?(request) ?? (500, Data())
            let response = HTTPURLResponse(
                url: request.url!,
                statusCode: status,
                httpVersion: "HTTP/1.1",
                headerFields: ["Content-Type": "application/json"]
            )!
            client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
            client?.urlProtocol(self, didLoad: data)
            client?.urlProtocolDidFinishLoading(self)
        } catch {
            client?.urlProtocol(self, didFailWithError: error)
        }
    }

    override func stopLoading() {}
}
