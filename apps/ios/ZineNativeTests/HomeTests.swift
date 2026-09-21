import Foundation
import XCTest
@testable import ZineNative

final class HomeTests: XCTestCase {
    func testCompactHomeHidesQuickWinsCareRideAndFavesWithoutChangingStandardHome() {
        let sections: [HomeDashboardSection] = [
            .quickWins([makeHomeItem(id: "quick", minutes: 5)]),
            .collection(HomeCollection(
                collectionId: "care-ride",
                title: "Care Ride",
                layout: .stackRail,
                position: 0,
                count: 1,
                items: [makeHomeItem(id: "care", minutes: 12)]
            )),
            .collection(HomeCollection(
                collectionId: "faves",
                title: "Faves",
                layout: .coverRail,
                position: 1,
                count: 1,
                items: [makeHomeItem(id: "favorite", minutes: 12)]
            )),
            .collection(HomeCollection(
                collectionId: "ideas",
                title: "Ideas",
                layout: .stackRail,
                position: 2,
                count: 1,
                items: [makeHomeItem(id: "idea", minutes: 12)]
            )),
        ]

        XCTAssertEqual(
            HomeLayoutDensity.compact.visibleSections(from: sections).map(\.id),
            ["collection-ideas"]
        )
        XCTAssertEqual(
            HomeLayoutDensity.standard.visibleSections(from: sections).map(\.id),
            sections.map(\.id)
        )
    }

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

    @MainActor
    func testRecentlySavedKeepsItemsThatAlsoAppearElsewhereOnHome() throws {
        let shared = makeHomeItem(
            id: "shared",
            minutes: 5,
            lastOpenedAt: "2026-08-12T10:00:00Z"
        )
        let recent = makeHomeItem(id: "recent", minutes: 20)
        let home = HomeResponse(
            recentBookmarks: [shared, recent],
            jumpBackIn: [shared],
            byContentType: HomeContentTypeSections(videos: [], podcasts: [], articles: []),
            customCollections: [],
            sectionOrder: [
                HomeLayoutSection(kind: .builtIn, builtInSection: .jumpBackIn, collectionId: nil),
                HomeLayoutSection(
                    kind: .builtIn,
                    builtInSection: .recentlyBookmarked,
                    collectionId: nil
                ),
            ],
            requestId: nil,
            traceId: nil
        )

        let sections = HomeStore.makeSections(home: home, inboxItems: [])
        let jumpBackIn = try XCTUnwrap(sections.first)
        let recentlySaved = try XCTUnwrap(sections.last)

        guard case .jumpBackIn(let jumpBackInItems) = jumpBackIn,
              case .recentlySaved(let recentlySavedItems) = recentlySaved
        else {
            return XCTFail("Expected Jump Back In followed by Recently Saved")
        }

        XCTAssertEqual(jumpBackInItems.map(\.id), ["shared"])
        XCTAssertEqual(recentlySavedItems.map(\.id), ["shared", "recent"])
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

    @MainActor
    func testSuccessfulHomeRefreshDropsOptimisticItemMissingAfterCompletion() {
        let optimistic = makeHomeItem(
            id: "completed",
            minutes: 20,
            lastOpenedAt: "2026-07-18T11:00:00Z"
        )

        let reconciled = HomeStore.reconciledOptimisticOpenedItems(
            [optimistic.id: optimistic],
            serverItems: []
        )

        XCTAssertTrue(reconciled.isEmpty)
    }

    @MainActor
    func testSuccessfulHomeRefreshKeepsNewerOptimisticOpenUntilServerCatchesUp() {
        let server = makeHomeItem(
            id: "opened",
            minutes: 20,
            lastOpenedAt: "2026-07-18T10:00:00Z"
        )
        let optimistic = makeHomeItem(
            id: "opened",
            minutes: 20,
            lastOpenedAt: "2026-07-18T11:00:00Z"
        )

        let reconciled = HomeStore.reconciledOptimisticOpenedItems(
            [optimistic.id: optimistic],
            serverItems: [server]
        )

        XCTAssertEqual(reconciled[optimistic.id], optimistic)
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

    func testFeaturedArticleRouteOpensArticleReaderDirectly() {
        let article = makeHomeItem(id: "featured", minutes: 8, summary: "Useful context.")
        let route = HomeNavigationRoute.articleReader(article, sectionID: "featured-article")

        XCTAssertEqual(route.destination, .articleReader(article))
        XCTAssertEqual(route.sourceID, "featured-article-featured")
    }

    func testContentSpecificHomeListsStartWithTheirMatchingFormatSelected() {
        XCTAssertEqual(HomeSectionRoute.podcasts.initialContentTypeFilter, .podcast)
        XCTAssertEqual(HomeSectionRoute.articles.initialContentTypeFilter, .article)
        XCTAssertEqual(HomeSectionRoute.videos.initialContentTypeFilter, .video)
        XCTAssertNil(HomeSectionRoute.jumpBackIn.initialContentTypeFilter)
        XCTAssertNil(HomeSectionRoute.quickWins.initialContentTypeFilter)
        XCTAssertNil(HomeSectionRoute.collection(id: "collection-1", title: "Ideas").initialContentTypeFilter)
    }

    func testContentTypeChipSelectionCanChangeOrReturnToAll() {
        XCTAssertEqual(
            ContentTypeFilterBar.toggledSelection(current: .article, option: .podcast),
            .podcast
        )
        XCTAssertNil(
            ContentTypeFilterBar.toggledSelection(current: .article, option: .article)
        )
        XCTAssertNil(
            ContentTypeFilterBar.toggledSelection(current: nil, option: nil)
        )
    }

    func testFilteredListCollapseProgressClampsScrollOffset() {
        XCTAssertEqual(FilteredListScrollState.collapseProgress(scrollOffset: -20), 0)
        XCTAssertEqual(FilteredListScrollState.collapseProgress(scrollOffset: 22), 0.5)
        XCTAssertEqual(FilteredListScrollState.collapseProgress(scrollOffset: 80), 1)
    }

    func testRootTitleCollapseProgressClampsScrollOffset() {
        XCTAssertEqual(CollapsingListTitle.collapseProgress(scrollOffset: -20), 0)
        XCTAssertEqual(CollapsingListTitle.collapseProgress(scrollOffset: 22), 0.5)
        XCTAssertEqual(CollapsingListTitle.collapseProgress(scrollOffset: 80), 1)
    }

    func testFilteredListTabReselectionScrollsBeforeResettingFilter() {
        XCTAssertEqual(
            FilteredListTabAction.resolve(
                isVisible: true,
                isAtTop: false,
                hasActiveFilter: true
            ),
            .scrollToTop
        )
        XCTAssertEqual(
            FilteredListTabAction.resolve(
                isVisible: true,
                isAtTop: true,
                hasActiveFilter: true
            ),
            .resetFilter
        )
    }

    func testFilteredListTabReselectionIgnoresUnfilteredOrHiddenLists() {
        XCTAssertEqual(
            FilteredListTabAction.resolve(
                isVisible: true,
                isAtTop: false,
                hasActiveFilter: false
            ),
            .none
        )
        XCTAssertEqual(
            FilteredListTabAction.resolve(
                isVisible: false,
                isAtTop: true,
                hasActiveFilter: true
            ),
            .none
        )
    }

    func testHomeItemProvidesImmediateBookmarkDetailContent() {
        let item = makeHomeItem(id: "instant", minutes: 12)
        let content = BookmarkDetailContent(item: item)

        XCTAssertEqual(content.id, item.id)
        XCTAssertEqual(content.title, item.title)
        XCTAssertEqual(content.canonicalUrl, item.canonicalUrl)
        XCTAssertEqual(content.provider, item.provider)
        XCTAssertEqual(content.creator, item.creator)
        XCTAssertEqual(content.consumptionLabel, "12 min read")
        XCTAssertTrue(content.tags.isEmpty)
    }

    @MainActor
    func testInterleavesOneFeaturedArticleAfterJumpBackIn() {
        let article = makeHomeItem(id: "article", minutes: 8, summary: "Useful context.")
        let sections: [HomeDashboardSection] = [
            .jumpBackIn([makeHomeItem(id: "resume", minutes: 20)]),
            .inbox([makeBookmark(index: 0)]),
            .recentlySaved([makeHomeItem(id: "recent", minutes: 10)]),
        ]

        let result = HomeStore.interleaveFeaturedArticle(article, into: sections)

        XCTAssertEqual(
            result.map(\.id),
            [
                "jump-back-in",
                "featured-article",
                "inbox",
                "recently-saved",
            ]
        )

        guard case .featuredArticle(let featured) = result[1] else {
            return XCTFail("Expected the featured article after Jump Back In")
        }
        XCTAssertEqual(featured.id, article.id)
    }

    @MainActor
    func testLeavesHomeUnchangedWithoutAFeaturedArticle() {
        let sections: [HomeDashboardSection] = [
            .inbox([makeBookmark(index: 0)]),
        ]

        let result = HomeStore.interleaveFeaturedArticle(nil, into: sections)

        XCTAssertEqual(result.map(\.id), ["inbox"])
    }

    @MainActor
    func testFeaturesNewestSavedArticleThatHasContent() throws {
        let video = makeHomeItem(id: "video", minutes: 18, contentType: .video, summary: "Video")
        let emptyArticle = makeHomeItem(id: "empty", minutes: 16, summary: "  ")
        let featured = makeHomeItem(id: "featured", minutes: 19, summary: "Article excerpt")
        let home = HomeResponse(
            recentBookmarks: [video, emptyArticle, featured],
            jumpBackIn: [],
            byContentType: HomeContentTypeSections(videos: [video], podcasts: [], articles: [emptyArticle, featured]),
            customCollections: [],
            sectionOrder: [
                HomeLayoutSection(
                    kind: .builtIn,
                    builtInSection: .recentlyBookmarked,
                    collectionId: nil
                ),
            ],
            requestId: nil,
            traceId: nil
        )

        let sections = HomeStore.makeSections(home: home, inboxItems: [])

        XCTAssertEqual(sections.map(\.id), ["recently-saved", "featured-article"])
        guard case .featuredArticle(let article) = try XCTUnwrap(sections.last) else {
            return XCTFail("Expected a featured article")
        }
        XCTAssertEqual(article.id, "featured")
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
        lastOpenedAt: String? = nil,
        contentType: ContentType = .article,
        summary: String? = nil
    ) -> HomeItem {
        HomeItem(
            id: id,
            itemId: "item-\(id)",
            title: "Item \(id)",
            thumbnailUrl: nil,
            canonicalUrl: URL(string: "https://example.com/\(id)")!,
            contentType: contentType,
            provider: .rss,
            creator: "Creator",
            creatorImageUrl: nil,
            creatorId: "creator-1",
            publisher: nil,
            summary: summary,
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
