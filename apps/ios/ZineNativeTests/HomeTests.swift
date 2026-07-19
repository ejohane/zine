import Foundation
import XCTest
@testable import ZineNative

final class HomeTests: XCTestCase {
    @MainActor
    func testBuildsOrderedDashboardAndInsertsQuickWinsAfterInbox() {
        let resume = makeHomeItem(id: "resume", minutes: 30, lastOpenedAt: "2026-07-18T10:00:00Z")
        let quick = makeHomeItem(id: "quick", minutes: 5)
        let recent = makeHomeItem(id: "recent", minutes: 20)
        let collectionItem = makeHomeItem(id: "collection-item", minutes: 15)
        let home = HomeResponse(
            recentBookmarks: [quick, recent],
            jumpBackIn: [resume],
            byContentType: HomeContentTypeSections(videos: [], podcasts: [], articles: []),
            customCollections: [
                HomeCollection(
                    collectionId: "collection-1",
                    title: "Ideas",
                    layout: .stackRail,
                    position: 0,
                    count: 1,
                    items: [collectionItem]
                ),
            ],
            sectionOrder: [
                HomeLayoutSection(kind: .builtIn, builtInSection: .jumpBackIn, collectionId: nil),
                HomeLayoutSection(kind: .builtIn, builtInSection: .inbox, collectionId: nil),
                HomeLayoutSection(
                    kind: .builtIn,
                    builtInSection: .recentlyBookmarked,
                    collectionId: nil
                ),
                HomeLayoutSection(
                    kind: .collection,
                    builtInSection: nil,
                    collectionId: "collection-1"
                ),
            ],
            requestId: nil,
            traceId: nil
        )

        let sections = HomeStore.makeSections(home: home, inboxItems: [makeBookmark(index: 0)])

        XCTAssertEqual(
            sections.map(\.id),
            ["jump-back-in", "inbox", "quick-wins", "recently-saved", "collection-collection-1"]
        )
    }

    func testDecodesCompactHomeResponseWithProgress() throws {
        let response = try JSONDecoder().decode(
            HomeResponse.self,
            from: Data(
                """
                {
                  "recentBookmarks":[],
                  "jumpBackIn":[{
                    "id":"ui_1","itemId":"item_1","title":"Continue reading",
                    "thumbnailUrl":null,"canonicalUrl":"https://example.com/item",
                    "contentType":"ARTICLE","provider":"RSS","creator":"Example",
                    "creatorImageUrl":null,"creatorId":"creator_1","publisher":null,
                    "summary":null,"duration":null,"publishedAt":null,
                    "readingTimeMinutes":8,"bookmarkedAt":"2026-07-18T00:00:00Z",
                    "lastOpenedAt":"2026-07-18T01:00:00Z",
                    "progress":{"position":4,"duration":8,"percent":50}
                  }],
                  "byContentType":{"videos":[],"podcasts":[],"articles":[]},
                  "customCollections":[],
                  "sectionOrder":[{"kind":"BUILT_IN","builtInSection":"JUMP_BACK_IN"}],
                  "requestId":"request-1","traceId":"trace-1"
                }
                """.utf8
            )
        )

        XCTAssertEqual(response.jumpBackIn.first?.progress?.percent, 50)
        XCTAssertEqual(response.jumpBackIn.first?.creatorId, "creator_1")
        XCTAssertTrue(response.jumpBackIn.first?.isQuickWin == true)
    }

    @MainActor
    func testJumpBackInKeepsTheSixMostRecentItems() throws {
        let home = HomeResponse(
            recentBookmarks: [],
            jumpBackIn: (0..<8).map {
                makeHomeItem(
                    id: "resume-\($0)",
                    minutes: 20,
                    lastOpenedAt: "2026-07-18T\(String(format: "%02d", $0)):00:00Z"
                )
            },
            byContentType: HomeContentTypeSections(videos: [], podcasts: [], articles: []),
            customCollections: [],
            sectionOrder: [
                HomeLayoutSection(kind: .builtIn, builtInSection: .jumpBackIn, collectionId: nil),
            ],
            requestId: nil,
            traceId: nil
        )

        let sections = HomeStore.makeSections(home: home, inboxItems: [])
        let jumpBackIn = try XCTUnwrap(sections.first)

        guard case .jumpBackIn(let items) = jumpBackIn else {
            return XCTFail("Expected Jump Back In to be the first section")
        }

        XCTAssertEqual(items.map(\.id), (0..<6).map { "resume-\($0)" })
    }

    @MainActor
    func testOptimisticExternalOpenMovesBookmarkToFrontWithoutDuplicatingIt() throws {
        let previouslyOpened = makeHomeItem(
            id: "opened",
            minutes: 20,
            lastOpenedAt: "2026-07-18T10:00:00Z"
        )
        let bookmark = makeBookmark(index: 9, state: "BOOKMARKED")
        let optimistic = HomeItem(
            bookmark: bookmark,
            openedAt: Date(timeIntervalSince1970: 1_800_000_000)
        )
        let home = HomeResponse(
            recentBookmarks: [],
            jumpBackIn: [previouslyOpened, optimistic],
            byContentType: HomeContentTypeSections(videos: [], podcasts: [], articles: []),
            customCollections: [],
            sectionOrder: [
                HomeLayoutSection(kind: .builtIn, builtInSection: .jumpBackIn, collectionId: nil),
            ],
            requestId: nil,
            traceId: nil
        )

        let sections = HomeStore.makeSections(
            home: home,
            inboxItems: [],
            optimisticOpenedItems: [optimistic]
        )
        let jumpBackIn = try XCTUnwrap(sections.first)

        guard case .jumpBackIn(let items) = jumpBackIn else {
            return XCTFail("Expected Jump Back In to be the first section")
        }

        XCTAssertEqual(items.map(\.id), [bookmark.id, previouslyOpened.id])
    }

    func testHomeTransitionSourceIDsAreStableAndSectionScoped() {
        let item = makeHomeItem(id: "shared", minutes: 12)

        XCTAssertEqual(
            HomeNavigationRoute.item(item, sectionID: "jump-back-in").sourceID,
            "jump-back-in-shared"
        )
        XCTAssertNotEqual(
            HomeNavigationRoute.item(item, sectionID: "jump-back-in").sourceID,
            HomeNavigationRoute.item(item, sectionID: "videos").sourceID
        )
    }

    func testHomeCacheKeepsOnlyFourInboxItems() async throws {
        let directory = FileManager.default.temporaryDirectory
            .appending(path: UUID().uuidString, directoryHint: .isDirectory)
        defer { try? FileManager.default.removeItem(at: directory) }

        let cache = HomeCache(userID: "test-user", baseDirectory: directory)
        await cache.save(home: nil, inboxItems: (0..<7).map { makeBookmark(index: $0) })

        let snapshot = await cache.load()
        XCTAssertEqual(snapshot?.inboxItems.count, 4)
        XCTAssertEqual(snapshot?.inboxItems.first?.id, "inbox-0")
    }

    private func makeHomeItem(
        id: String,
        minutes: Int,
        lastOpenedAt: String? = nil
    ) -> HomeItem {
        HomeItem(
            id: id,
            itemId: "item-\(id)",
            title: "Item \(id)",
            thumbnailUrl: nil,
            canonicalUrl: URL(string: "https://example.com/\(id)")!,
            contentType: .article,
            provider: .rss,
            creator: "Creator",
            creatorImageUrl: nil,
            creatorId: "creator-1",
            publisher: nil,
            summary: nil,
            duration: nil,
            publishedAt: nil,
            readingTimeMinutes: minutes,
            bookmarkedAt: "2026-07-18T00:00:00Z",
            lastOpenedAt: lastOpenedAt,
            progress: nil
        )
    }

    private func makeBookmark(index: Int, state: String = "INBOX") -> Bookmark {
        Bookmark(
            id: "inbox-\(index)",
            itemId: "item-\(index)",
            title: "Inbox item \(index)",
            thumbnailUrl: nil,
            canonicalUrl: URL(string: "https://example.com/items/\(index)")!,
            contentType: .article,
            provider: .rss,
            creator: "Creator",
            creatorImageUrl: nil,
            creatorId: nil,
            publisher: nil,
            summary: nil,
            duration: nil,
            publishedAt: nil,
            wordCount: nil,
            readingTimeMinutes: 5,
            state: state,
            ingestedAt: "2026-07-18T00:00:00Z",
            bookmarkedAt: nil,
            lastOpenedAt: nil,
            progress: nil,
            isFinished: false,
            finishedAt: nil,
            tags: []
        )
    }
}
