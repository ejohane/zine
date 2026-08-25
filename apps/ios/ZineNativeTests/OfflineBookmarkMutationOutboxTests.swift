import Foundation
import XCTest
@testable import ZineNative

final class OfflineBookmarkMutationOutboxTests: XCTestCase {
    override func setUp() {
        super.setUp()
        MutationURLProtocol.handler = nil
        MutationURLProtocol.requests = []
    }

    func testOutboxCoalescesPropertiesAndArchiveSupersedesBookmarkMutations() async throws {
        let directory = Self.temporaryDirectory()
        defer { try? FileManager.default.removeItem(at: directory) }
        let bookmark = Self.bookmark(id: "bookmark-1")
        let outbox = OfflineBookmarkMutationOutbox(
            userID: "test-user",
            baseDirectory: directory
        )

        _ = await outbox.stageFinished(
            bookmarkID: bookmark.id,
            isFinished: true,
            bookmark: bookmark
        )
        _ = await outbox.stageFinished(
            bookmarkID: bookmark.id,
            isFinished: false,
            bookmark: bookmark
        )
        _ = await outbox.stageTags(bookmarkID: bookmark.id, tags: ["first"])
        _ = await outbox.stageTags(bookmarkID: bookmark.id, tags: ["second"])

        var pending = await outbox.pendingMutations()
        XCTAssertEqual(pending.count, 2)
        XCTAssertEqual(pending.map(\.kind), [.finished, .tags])
        let overlaid = await outbox.overlay(bookmark)
        XCTAssertEqual(overlaid?.isFinished, false)
        XCTAssertEqual(overlaid?.tags.map(\.name), ["second"])

        _ = await outbox.stageArchive(bookmarkID: bookmark.id, bookmark: bookmark)
        pending = await outbox.pendingMutations()
        XCTAssertEqual(pending.count, 1)
        XCTAssertEqual(pending.first?.kind, .archive)
        let archivedOverlay = await outbox.overlay(bookmark)
        XCTAssertNil(archivedOverlay)

        let reloaded = OfflineBookmarkMutationOutbox(
            userID: "test-user",
            baseDirectory: directory
        )
        let reloadedPending = await reloaded.pendingMutations()
        let reloadedOverlay = await reloaded.overlay(bookmark)
        XCTAssertEqual(reloadedPending, pending)
        XCTAssertNil(reloadedOverlay)
        let otherUserOutbox = OfflineBookmarkMutationOutbox(
            userID: "different-user",
            baseDirectory: directory
        )
        let otherUserPending = await otherUserOutbox.pendingMutations()
        XCTAssertTrue(otherUserPending.isEmpty)
    }

    func testCompletionMovesCachedBookmarkBetweenLibraryQueriesAcrossRelaunch() async throws {
        let directory = Self.temporaryDirectory()
        defer { try? FileManager.default.removeItem(at: directory) }
        let bookmark = Self.bookmark(id: "bookmark-1")
        let outbox = OfflineBookmarkMutationOutbox(
            userID: "test-user",
            baseDirectory: directory
        )

        _ = await outbox.stageFinished(
            bookmarkID: bookmark.id,
            isFinished: true,
            bookmark: bookmark
        )

        let unfinished = await outbox.overlay([bookmark], matching: LibraryQuery())
        XCTAssertTrue(unfinished.isEmpty)
        let finished = await outbox.overlay(
            [],
            matching: LibraryQuery(isFinished: true)
        )
        XCTAssertEqual(finished.map(\.id), [bookmark.id])
        XCTAssertEqual(finished.first?.isFinished, true)

        let reloaded = OfflineBookmarkMutationOutbox(
            userID: "test-user",
            baseDirectory: directory
        )
        let reloadedUnfinished = await reloaded.overlay([bookmark], matching: LibraryQuery())
        let reloadedFinished = await reloaded.overlay(
            [],
            matching: LibraryQuery(isFinished: true)
        )
        XCTAssertTrue(reloadedUnfinished.isEmpty)
        XCTAssertEqual(reloadedFinished.map(\.id), [bookmark.id])
    }

    func testAPIQueuesOfflineMutationsAndReplaysThemInOrder() async throws {
        let directory = Self.temporaryDirectory()
        defer { try? FileManager.default.removeItem(at: directory) }
        let outbox = OfflineBookmarkMutationOutbox(
            userID: "test-user",
            baseDirectory: directory
        )
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [MutationURLProtocol.self]
        let client = APIClient(
            baseURL: URL(string: "https://api.myzine.app")!,
            tokenProvider: { "test-token" },
            session: URLSession(configuration: configuration),
            articleBodyCache: ArticleBodyCache(userID: "test-user", baseDirectory: directory),
            bookmarkMutationOutbox: outbox
        )
        MutationURLProtocol.handler = { _ in throw URLError(.notConnectedToInternet) }

        let first = Self.bookmark(id: "finished")
        let second = Self.bookmark(id: "tagged")
        let third = Self.bookmark(id: "archived")
        let completion = try await client.setFinished(
            id: first.id,
            isFinished: true,
            bookmark: first
        )
        let tags = try await client.setTags(id: second.id, tags: ["offline"])
        try await client.archiveBookmark(id: third.id, bookmark: third)

        XCTAssertTrue(completion.isFinished)
        XCTAssertEqual(tags.map(\.name), ["offline"])
        let pendingCount = await client.pendingBookmarkMutationCount()
        let cachedTags = try await client.listTags()
        XCTAssertEqual(pendingCount, 3)
        XCTAssertEqual(cachedTags.map(\.name), ["offline"])

        MutationURLProtocol.requests = []
        MutationURLProtocol.handler = { request in
            switch (request.httpMethod, request.url?.path) {
            case ("PATCH", "/api/v1/bookmarks/finished"):
                return (200, Data(#"{"bookmark":{"id":"finished","itemId":"item-finished","isFinished":true,"finishedAt":"2026-08-25T00:00:00Z"}}"#.utf8))
            case ("PUT", "/api/v1/bookmarks/tagged/tags"):
                return (200, Data(#"{"tags":[{"id":"server-tag","name":"offline"}]}"#.utf8))
            case ("DELETE", "/api/v1/bookmarks/archived"):
                return (200, Data("{}".utf8))
            default:
                return (404, Data(#"{"error":"not found"}"#.utf8))
            }
        }

        await client.flushPendingBookmarkMutations()

        let flushedCount = await client.pendingBookmarkMutationCount()
        XCTAssertEqual(flushedCount, 0)
        XCTAssertEqual(
            MutationURLProtocol.requests.map { "\($0.httpMethod ?? "") \($0.url?.path ?? "")" },
            [
                "PATCH /api/v1/bookmarks/finished",
                "PUT /api/v1/bookmarks/tagged/tags",
                "DELETE /api/v1/bookmarks/archived",
            ]
        )
    }

    func testPendingCompletionAndArchiveHideCachedHomeItems() async {
        let directory = Self.temporaryDirectory()
        defer { try? FileManager.default.removeItem(at: directory) }
        let outbox = OfflineBookmarkMutationOutbox(
            userID: "test-user",
            baseDirectory: directory
        )
        _ = await outbox.stageFinished(bookmarkID: "finished", isFinished: true)
        _ = await outbox.stageArchive(bookmarkID: "archived")
        let client = APIClient(
            baseURL: URL(string: "https://api.myzine.app")!,
            tokenProvider: { "test-token" },
            bookmarkMutationOutbox: outbox
        )
        let finished = Self.homeItem(id: "finished")
        let archived = Self.homeItem(id: "archived")
        let visible = Self.homeItem(id: "visible")
        let home = HomeResponse(
            recentBookmarks: [finished, archived, visible],
            jumpBackIn: [finished, visible],
            byContentType: HomeContentTypeSections(
                videos: [],
                podcasts: [],
                articles: [archived, visible]
            ),
            customCollections: [
                HomeCollection(
                    collectionId: "saved",
                    title: "Saved",
                    layout: .stackRail,
                    position: 0,
                    count: 3,
                    items: [finished, archived, visible]
                ),
            ],
            sectionOrder: [],
            requestId: nil,
            traceId: nil
        )

        let overlaid = await client.overlayHome(home)

        XCTAssertEqual(overlaid.recentBookmarks.map(\.id), ["visible"])
        XCTAssertEqual(overlaid.jumpBackIn.map(\.id), ["visible"])
        XCTAssertEqual(overlaid.byContentType.articles.map(\.id), ["visible"])
        XCTAssertEqual(overlaid.customCollections.first?.items.map(\.id), ["visible"])
        XCTAssertEqual(overlaid.customCollections.first?.count, 1)
    }

    func testPermanentMutationFailureIsNotRetriedForever() async throws {
        let directory = Self.temporaryDirectory()
        defer { try? FileManager.default.removeItem(at: directory) }
        let outbox = OfflineBookmarkMutationOutbox(
            userID: "test-user",
            baseDirectory: directory
        )
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [MutationURLProtocol.self]
        let client = APIClient(
            baseURL: URL(string: "https://api.myzine.app")!,
            tokenProvider: { "test-token" },
            session: URLSession(configuration: configuration),
            bookmarkMutationOutbox: outbox
        )
        MutationURLProtocol.handler = { _ in
            (400, Data(#"{"error":"invalid mutation"}"#.utf8))
        }

        do {
            _ = try await client.setFinished(id: "bookmark-1", isFinished: true)
            XCTFail("Expected the permanent rejection to be returned to the UI")
        } catch {
            let pendingCount = await client.pendingBookmarkMutationCount()
            XCTAssertEqual(pendingCount, 0)
        }
    }

    func testColdLaunchSessionRestorationDoesNotDropPendingMutations() async {
        let directory = Self.temporaryDirectory()
        defer { try? FileManager.default.removeItem(at: directory) }
        let outbox = OfflineBookmarkMutationOutbox(
            userID: "test-user",
            baseDirectory: directory
        )
        _ = await outbox.stageTags(bookmarkID: "bookmark-1", tags: ["offline"])
        _ = await outbox.stageFinished(bookmarkID: "bookmark-1", isFinished: true)
        let client = APIClient(
            baseURL: URL(string: "https://api.myzine.app")!,
            tokenProvider: { throw APIError.missingSession },
            bookmarkMutationOutbox: outbox
        )

        await client.flushPendingBookmarkMutations()

        let pending = await outbox.pendingMutations()
        XCTAssertEqual(pending.map(\.kind), [.tags, .finished])
    }

    func testEveryURLLoadingFailureRetainsOfflineIntent() {
        XCTAssertTrue(URLError(.notConnectedToInternet).isRetryableOfflineMutationFailure)
        XCTAssertTrue(URLError(.secureConnectionFailed).isRetryableOfflineMutationFailure)
        XCTAssertTrue(URLError(.appTransportSecurityRequiresSecureConnection)
            .isRetryableOfflineMutationFailure)
    }

    private static func temporaryDirectory() -> URL {
        FileManager.default.temporaryDirectory
            .appending(path: "offline-mutations-\(UUID().uuidString)", directoryHint: .isDirectory)
    }

    private static func bookmark(id: String) -> Bookmark {
        Bookmark(
            id: id,
            itemId: "item-\(id)",
            title: "Saved \(id)",
            thumbnailUrl: nil,
            canonicalUrl: URL(string: "https://example.com/\(id)")!,
            contentType: .article,
            provider: .web,
            creator: "Creator",
            creatorImageUrl: nil,
            creatorId: nil,
            publisher: nil,
            summary: nil,
            duration: nil,
            publishedAt: nil,
            wordCount: 640,
            readingTimeMinutes: 4,
            state: "BOOKMARKED",
            ingestedAt: "2026-08-25T00:00:00Z",
            bookmarkedAt: "2026-08-25T00:00:00Z",
            lastOpenedAt: nil,
            progress: nil,
            isFinished: false,
            finishedAt: nil,
            tags: []
        )
    }

    private static func homeItem(id: String) -> HomeItem {
        HomeItem(
            id: id,
            itemId: "item-\(id)",
            title: "Saved \(id)",
            thumbnailUrl: nil,
            canonicalUrl: URL(string: "https://example.com/\(id)")!,
            contentType: .article,
            provider: .web,
            creator: "Creator",
            creatorImageUrl: nil,
            creatorId: nil,
            publisher: nil,
            summary: nil,
            duration: nil,
            publishedAt: nil,
            readingTimeMinutes: 4,
            bookmarkedAt: "2026-08-25T00:00:00Z",
            lastOpenedAt: nil,
            progress: nil
        )
    }
}

private final class MutationURLProtocol: URLProtocol, @unchecked Sendable {
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
