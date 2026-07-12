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
}
