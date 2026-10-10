import Foundation
import XCTest
@testable import ZineCore

final class HomeJumpBackInTests: XCTestCase {
    @MainActor
    func testZeroThroughEightCandidatesUseOnlyCompleteCompactRows() async throws {
        for count in 0...8 {
            let fixture = try HomeGridFixture(count: count)
            defer { fixture.close() }
            await fixture.store.reload()
            let expected = count == 0 ? 0 : 1 + min(6, count - 1) / 2 * 2
            XCTAssertEqual(fixture.ids.count, expected, "candidate count \(count)")
            XCTAssertEqual(fixture.ids, Array(fixture.bookmarks.prefix(expected)).map(\.id))
            XCTAssertEqual(max(0, fixture.ids.count - 1) % 2, 0)
        }
    }

    @MainActor
    func testArchiveAndCompletionFilterBeforeCroppingAndRestoreImmediately() async throws {
        for finished in [false, true] {
            for index in [0, 3] { // hero and compact tile
                let fixture = try HomeGridFixture(count: 9)
                defer { fixture.close() }
                await fixture.store.reload()
                let bookmark = fixture.bookmarks[index]
                let transaction = try fixture.client.bookmarkState.begin(
                    bookmark, finished: finished ? true : nil, state: finished ? nil : "ARCHIVED")
                XCTAssertEqual(fixture.ids, Array(fixture.bookmarks.filter { $0.id != bookmark.id }.prefix(7)).map(\.id))
                fixture.client.bookmarkState.commit(transaction)
                let restore = try fixture.client.bookmarkState.begin(bookmark, finished: false, state: "BOOKMARKED")
                fixture.client.bookmarkState.commit(restore)
                XCTAssertEqual(fixture.ids, fixture.bookmarks.prefix(7).map(\.id))
            }
        }
    }

    @MainActor
    func testMutationAPIFailuresRollBackWithoutLosingBackfill() async throws {
        let fixture = try HomeGridFixture(count: 8)
        defer { fixture.close() }
        await fixture.store.reload()
        HomeGridProtocol.rejectMutations = true
        for index in [0, 3] {
            let bookmark = fixture.bookmarks[index]
            do {
                try await fixture.client.archiveBookmark(id: bookmark.id, bookmark: bookmark)
                XCTFail("Expected archive failure")
            } catch { }
            XCTAssertEqual(fixture.ids, fixture.bookmarks.prefix(7).map(\.id))
            do {
                _ = try await fixture.client.setFinished(id: bookmark.id, isFinished: true, bookmark: bookmark)
                XCTFail("Expected completion failure")
            } catch { }
            XCTAssertEqual(fixture.ids, fixture.bookmarks.prefix(7).map(\.id))
        }
    }

    @MainActor
    func testOverlappingHomeOmissionKeepsRollbackCandidateAndOlderHistory() async throws {
        let fixture = try HomeGridFixture(count: 8)
        defer { fixture.close() }
        await fixture.store.reload()
        let hero = fixture.bookmarks[0]
        let transaction = try fixture.client.bookmarkState.begin(hero, finished: true)
        HomeGridProtocol.home = fixture.response(Array(fixture.bookmarks.dropFirst()))
        await fixture.store.reload()
        XCTAssertEqual(fixture.ids, fixture.bookmarks.dropFirst().map(\.id))
        fixture.client.bookmarkState.rollback(transaction)
        XCTAssertEqual(fixture.ids, fixture.bookmarks.prefix(7).map(\.id))
    }

    @MainActor
    func testExclusionsBeyondTwentyRefillAcrossCursorTiesAndCacheRestart() async throws {
        let fixture = try HomeGridFixture(count: 40, equalTimes: true)
        defer { fixture.close() }
        HomeGridProtocol.home = fixture.response(Array(fixture.bookmarks.prefix(20)))
        for bookmark in fixture.bookmarks.prefix(34) {
            _ = try fixture.client.bookmarkState.begin(bookmark, finished: true)
        }
        // First page overlaps all 20 Home rows. A tied-time cursor leads to six older eligible rows.
        let cursorPayload = try JSONSerialization.data(withJSONObject: [
            "sortValue": fixture.bookmarks[29].lastOpenedAt!, "id": fixture.bookmarks[29].id,
        ], options: [.sortedKeys])
        let cursor = cursorPayload.base64EncodedString().replacingOccurrences(of: "+", with: "-")
            .replacingOccurrences(of: "/", with: "_").replacingOccurrences(of: "=", with: "")
        HomeGridProtocol.pages = [
            "": (Array(fixture.bookmarks.prefix(30)), cursor),
            cursor: (Array(fixture.bookmarks.dropFirst(30)), nil),
        ]
        await fixture.store.reload()
        XCTAssertEqual(HomeGridProtocol.requestedCursors, ["", cursor])
        XCTAssertEqual(fixture.ids, fixture.bookmarks.dropFirst(34).prefix(5).map(\.id))
        XCTAssertEqual(Set(fixture.ids).count, fixture.ids.count)
        let saved = await fixture.cache.load()
        XCTAssertEqual(saved?.home?.jumpBackIn.count, 40, "Cache retains the candidate buffer, not five display cards")
        // Remove the synthetic transactions before simulating a process restart.
        HomeGridProtocol.offline = true
        let restartedClient = APIClient(baseURL: fixture.client.baseURL, tokenProvider: { "fixture" }, session: fixture.session)
        let restarted = HomeStore(client: restartedClient, cache: HomeCache(userID: "grid", baseDirectory: fixture.root))
        await restarted.reload()
        let restartedIDs = restarted.sections.flatMap { section -> [String] in
            if case .jumpBackIn(let items) = section { return items.map(\.id) }
            return []
        }
        XCTAssertEqual(restartedIDs, fixture.bookmarks.prefix(7).map(\.id))
    }

    @MainActor
    func testOptimisticDuplicateIsOneHeroAndFailedOpenRestoresOrder() async throws {
        let fixture = try HomeGridFixture(count: 8)
        defer { fixture.close() }
        await fixture.store.reload()
        let openedAt = Date(timeIntervalSince1970: 1_900_000_000)
        let promoted = fixture.bookmarks[5]
        fixture.store.promoteOpened(promoted, at: openedAt)
        XCTAssertEqual(fixture.ids.first, promoted.id)
        XCTAssertEqual(fixture.ids.count, 7)
        XCTAssertEqual(Set(fixture.ids).count, 7)
        fixture.store.rollbackOpened(id: promoted.id, openedAt: openedAt)
        XCTAssertEqual(fixture.ids, fixture.bookmarks.prefix(7).map(\.id))
    }

    @MainActor
    func testQueuedCompletionStaysHiddenAcrossCacheRestartAndCanBeRestored() async throws {
        let fixture = try HomeGridFixture(count: 8)
        defer { fixture.close() }
        await fixture.store.reload()
        let outbox = OfflineBookmarkMutationOutbox(userID: "grid", baseDirectory: fixture.root)
        HomeGridProtocol.offline = true
        let client = APIClient(baseURL: fixture.client.baseURL, tokenProvider: { "fixture" }, session: fixture.session,
            bookmarkMutationOutbox: outbox)
        let hero = fixture.bookmarks[0]
        let receipt = try await client.setFinishedWithReceipt(id: hero.id, isFinished: true, bookmark: hero)
        XCTAssertEqual(receipt.delivery, .localPending)
        let restartedClient = APIClient(baseURL: fixture.client.baseURL, tokenProvider: { "fixture" }, session: fixture.session,
            bookmarkMutationOutbox: OfflineBookmarkMutationOutbox(userID: "grid", baseDirectory: fixture.root))
        let restarted = HomeStore(client: restartedClient, cache: HomeCache(userID: "grid", baseDirectory: fixture.root))
        await restarted.reload()
        func ids() -> [String] {
            restarted.sections.flatMap { section -> [String] in
                if case .jumpBackIn(let items) = section { return items.map(\.id) }
                return []
            }
        }
        XCTAssertEqual(ids(), fixture.bookmarks.dropFirst().map(\.id))
        _ = try await restartedClient.setFinishedWithReceipt(id: hero.id, isFinished: false, bookmark: hero)
        await restarted.reload()
        XCTAssertEqual(ids(), fixture.bookmarks.prefix(7).map(\.id))
    }

    @MainActor
    func testPendingCompletionOfOptimisticHeroSurvivesRefreshAndRollback() async throws {
        let fixture = try HomeGridFixture(count: 8)
        defer { fixture.close() }
        await fixture.store.reload()
        let promoted = fixture.bookmarks[5]
        fixture.store.promoteOpened(promoted, at: Date(timeIntervalSince1970: 1_900_000_000))
        let transaction = try fixture.client.bookmarkState.begin(promoted, finished: true)
        HomeGridProtocol.home = fixture.response(fixture.bookmarks.filter { $0.id != promoted.id })
        await fixture.store.reload()
        XCTAssertFalse(fixture.ids.contains(promoted.id))
        XCTAssertEqual(fixture.ids.count, 7)
        fixture.client.bookmarkState.rollback(transaction)
        XCTAssertEqual(fixture.ids.first, promoted.id)
        XCTAssertEqual(Set(fixture.ids).count, 7)
    }

    @MainActor
    func testRawDuplicatesAndMixedTimestampPrecisionDoNotDuplicateHero() async throws {
        let fixture = try HomeGridFixture(count: 8, equalTimes: true)
        defer { fixture.close() }
        var rows = fixture.bookmarks
        let newer = HomeItem(bookmark: rows[7], lastOpenedAt: "2026-10-09T10:00:00.999Z")
        rows.append(rows[0])
        let original = fixture.response(rows)
        HomeGridProtocol.home = HomeResponse(recentBookmarks: [], jumpBackIn: original.jumpBackIn + [newer],
            byContentType: original.byContentType, customCollections: [], sectionOrder: [], requestId: nil, traceId: nil)
        await fixture.store.reload()
        XCTAssertEqual(fixture.ids.first, rows[7].id)
        XCTAssertEqual(Set(fixture.ids).count, 7)
        XCTAssertEqual(fixture.ids.dropFirst(), fixture.bookmarks.prefix(6).map(\.id)[...])
    }

    @MainActor
    func testFailedRefillRetriesCursorAndExhaustionStopsFurtherRequests() async throws {
        let fixture = try HomeGridFixture(count: 20)
        defer { fixture.close() }
        await fixture.store.reload()
        for bookmark in fixture.bookmarks.prefix(16) { fixture.store.setItemVisibility(id: bookmark.id, isVisible: false) }
        HomeGridProtocol.failOpened = true
        await fixture.store.refillJumpBackIn()
        XCTAssertEqual(fixture.ids.count, 3)
        HomeGridProtocol.failOpened = false
        HomeGridProtocol.pages = ["": (Array(fixture.bookmarks.suffix(4)), nil)]
        await fixture.store.refillJumpBackIn()
        let requests = HomeGridProtocol.requestedCursors.count
        await fixture.store.refillJumpBackIn()
        XCTAssertEqual(HomeGridProtocol.requestedCursors.count, requests)
        fixture.store.setItemVisibility(id: fixture.bookmarks[0].id, isVisible: true)
        XCTAssertEqual(fixture.ids.count, 5)
    }
}

@MainActor
private final class HomeGridFixture {
    let root = FileManager.default.temporaryDirectory.appending(path: UUID().uuidString)
    let session: URLSession
    let client: APIClient
    let cache: HomeCache
    let store: HomeStore
    let bookmarks: [Bookmark]
    var ids: [String] {
        store.sections.flatMap { section -> [String] in
            if case .jumpBackIn(let items) = section { return items.map(\.id) }
            return []
        }
    }
    init(count: Int, equalTimes: Bool = false) throws {
        bookmarks = (0..<count).map { index in
            Bookmark(id: String(format: "id-%03d", count - index), itemId: "item-\(index)", title: "Fixture \(index)",
                thumbnailUrl: nil, canonicalUrl: URL(string: "https://example.invalid/\(index)")!, contentType: .article,
                provider: .web, creator: "Fixture", creatorImageUrl: nil, creatorId: nil, publisher: nil,
                summary: nil, duration: nil, publishedAt: nil, wordCount: nil, readingTimeMinutes: 20,
                state: "BOOKMARKED", ingestedAt: "2026-10-01T00:00:00Z", bookmarkedAt: nil,
                lastOpenedAt: equalTimes ? "2026-10-09T10:00:00.123Z" : Date(timeIntervalSince1970: 1_800_000_000 - Double(index)).formatted(.iso8601),
                progress: nil, isFinished: false, finishedAt: nil, tags: [])
        }
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [HomeGridProtocol.self]
        session = URLSession(configuration: configuration)
        client = APIClient(baseURL: URL(string: "https://home-grid.invalid")!, tokenProvider: { "fixture" }, session: session)
        cache = HomeCache(userID: "grid", baseDirectory: root)
        store = HomeStore(client: client, cache: cache)
        HomeGridProtocol.reset()
        HomeGridProtocol.home = response(bookmarks)
    }
    func response(_ rows: [Bookmark]) -> HomeResponse {
        HomeResponse(recentBookmarks: [], jumpBackIn: rows.map { HomeItem(bookmark: $0, lastOpenedAt: $0.lastOpenedAt!) },
            byContentType: HomeContentTypeSections(videos: [], podcasts: [], articles: []), customCollections: [],
            sectionOrder: [], requestId: nil, traceId: nil)
    }
    func close() {
        session.invalidateAndCancel()
        try? FileManager.default.removeItem(at: root)
    }
}

private final class HomeGridProtocol: URLProtocol, @unchecked Sendable {
    static var home: HomeResponse?
    static var pages: [String: ([Bookmark], String?)] = [:]
    static var requestedCursors: [String] = []
    static var rejectMutations = false
    static var failOpened = false
    static var offline = false
    static func reset() {
        home = nil; pages = [:]; requestedCursors = []; rejectMutations = false; failOpened = false; offline = false
    }
    override class func canInit(with request: URLRequest) -> Bool { request.url?.host == "home-grid.invalid" }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
    override func startLoading() {
        do {
            if Self.offline { throw URLError(.notConnectedToInternet) }
            var status = 200
            let data: Data
            if request.httpMethod != "GET" {
                status = Self.rejectMutations ? 403 : 200
                data = Data("{}".utf8)
            } else if request.url!.path == "/api/v1/home" {
                data = try JSONEncoder().encode(Self.home!)
            } else if request.url!.path == "/api/v1/bookmarks/opened" {
                let cursor = URLComponents(url: request.url!, resolvingAgainstBaseURL: false)!.queryItems?.first { $0.name == "cursor" }?.value ?? ""
                Self.requestedCursors.append(cursor)
                if Self.failOpened { throw URLError(.notConnectedToInternet) }
                let page = Self.pages[cursor] ?? ([], nil)
                data = try JSONEncoder().encode(Page(items: page.0, nextCursor: page.1))
            } else {
                data = try JSONEncoder().encode(Page(items: [], nextCursor: nil))
            }
            client?.urlProtocol(self, didReceive: HTTPURLResponse(url: request.url!, statusCode: status, httpVersion: nil, headerFields: nil)!, cacheStoragePolicy: .notAllowed)
            client?.urlProtocol(self, didLoad: data)
            client?.urlProtocolDidFinishLoading(self)
        } catch { client?.urlProtocol(self, didFailWithError: error) }
    }
    override func stopLoading() {}
    private struct Page: Encodable { let items: [Bookmark]; let nextCursor: String? }
}
