import XCTest
@testable import ZineNative

final class BookmarkTests: XCTestCase {
    func testDecodesBookmarkAndFormatsDuration() throws {
        let data = Data(
            """
            {
              "id":"ui_1","itemId":"item_1","title":"A long conversation",
              "thumbnailUrl":null,"canonicalUrl":"https://example.com/item",
              "contentType":"PODCAST","provider":"SPOTIFY","creator":"Example Show",
              "creatorImageUrl":null,"creatorId":null,"publisher":null,"summary":null,
              "duration":5570,"publishedAt":null,"wordCount":null,"readingTimeMinutes":null,
              "state":"BOOKMARKED","ingestedAt":"2026-07-11T00:00:00Z",
              "bookmarkedAt":"2026-07-11T00:00:00Z","lastOpenedAt":null,"progress":null,
              "isFinished":false,"finishedAt":null,"tags":[]
            }
            """.utf8
        )

        let bookmark = try JSONDecoder().decode(Bookmark.self, from: data)

        XCTAssertEqual(bookmark.provider, .spotify)
        XCTAssertEqual(bookmark.consumptionLabel, "1 hr 32 min")
    }

    func testLibraryQueryIdentityIncludesEveryFilter() {
        let first = LibraryQuery(search: "swift", isFinished: false, provider: .rss, contentType: .article)
        let second = LibraryQuery(search: "swift", isFinished: true, provider: .rss, contentType: .article)

        XCTAssertNotEqual(first, second)
    }

    func testInboxQueryIdentityIncludesEveryFilter() {
        XCTAssertNotEqual(
            InboxQuery(provider: .youtube, contentType: .video),
            InboxQuery(provider: .youtube, contentType: .article)
        )
        XCTAssertNotEqual(
            InboxQuery(provider: .youtube),
            InboxQuery(provider: .spotify)
        )
    }

    func testProviderTitlesUseProductCapitalization() {
        XCTAssertEqual(Provider.youtube.title, "YouTube")
        XCTAssertEqual(Provider.x.title, "X")
        XCTAssertEqual(Provider.rss.title, "RSS")
    }

    func testDecodesCreatorProfileAndLatestContent() throws {
        let creator = try JSONDecoder().decode(
            CreatorResponse.self,
            from: Data(
                """
                {"creator":{"id":"creator_1","name":"Creator One","imageUrl":null,
                "provider":"YOUTUBE","providerCreatorId":"channel_1","description":"Videos",
                "handle":"@creator","externalUrl":"https://youtube.com/@creator",
                "createdAt":1,"updatedAt":2}}
                """.utf8
            )
        )
        let latest = try JSONDecoder().decode(
            CreatorLatestContentResponse.self,
            from: Data(
                """
                {"items":[{"id":"video_1","title":"New video","description":null,
                "thumbnailUrl":null,"publishedAt":1752797600000,
                "externalUrl":"https://youtube.com/watch?v=video_1","duration":600,
                "itemId":null,"isBookmarked":false}],"provider":"YOUTUBE"}
                """.utf8
            )
        )

        XCTAssertEqual(creator.creator.provider, .youtube)
        XCTAssertEqual(latest.items.first?.duration, 600)
        XCTAssertEqual(latest.reason, nil)
    }

    func testProviderOpenActionsMatchDestinationsAndBrandLogos() {
        XCTAssertEqual(Provider.youtube.openAction.title, "Open in YouTube")
        XCTAssertEqual(Provider.youtube.openAction.logo, .asset("YouTubeLogo"))
        XCTAssertEqual(Provider.spotify.openAction.title, "Open in Spotify")
        XCTAssertEqual(Provider.spotify.openAction.logo, .asset("SpotifyLogo"))
        XCTAssertEqual(Provider.substack.openAction.title, "Open in Substack")
        XCTAssertEqual(Provider.substack.openAction.logo, .asset("SubstackLogo"))
        XCTAssertEqual(Provider.web.openAction.title, "Open on Web")
        XCTAssertEqual(Provider.web.openAction.logo, .system("safari.fill"))
        XCTAssertEqual(Provider.x.openAction.title, "Open in X")
        XCTAssertEqual(Provider.x.openAction.logo, .asset("XLogo"))
        XCTAssertEqual(Provider.youtube.creatorActionTitle, "View on YouTube")
        XCTAssertEqual(Provider.spotify.creatorActionTitle, "View on Spotify")
        XCTAssertEqual(Provider.substack.creatorActionTitle, "View on Substack")
        XCTAssertEqual(Provider.x.creatorActionTitle, "View on X")
    }
}
