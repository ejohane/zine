import Foundation
import XCTest
@testable import ZineCore

final class BookmarkLinkTests: XCTestCase {
    func testRecognizesOnlyBookmarkDestinations() throws {
        for value in ["https://myzine.app/item/a-public", "https://www.myzine.app/item/a-public", "zine://item/a-public"] {
            XCTAssertEqual(BookmarkLink.bookmarkID(from: try XCTUnwrap(URL(string: value))), "a-public")
        }
    }

    func testRejectsCallbacksUntrustedHostsAndMalformedIDs() throws {
        for value in [
            "zine://oauth/callback?code=auth-code", "app.zine.native://callback",
            "zine://widget/home", "zine://widget/appearance",
            "zine://widget/bookmark?id=a&user=alice&api=https%3A%2F%2Fapi.myzine.app",
            "http://myzine.app/item/a", "https://myzine.app.evil.com/item/a",
            "https://other.example/item/a", "https://user@myzine.app/item/a",
            "https://myzine.app:443/item/a", "https://myzine.app/item/",
            "https://myzine.app/item/a/b", "https://myzine.app/item/%2Fsecret",
            "https://myzine.app/item/..", "zine://item/a?token=x",
            "https://myzine.app/item/a#other", "https://myzine.app/item/" + String(repeating: "x", count: 129),
        ] {
            XCTAssertNil(BookmarkLink.bookmarkID(from: try XCTUnwrap(URL(string: value))), value)
        }
    }

    func testRepeatedBookmarkLinksHaveDistinctDeliveryIdentity() {
        let first = BookmarkLinkRequest(bookmarkID: "a")
        let second = BookmarkLinkRequest(bookmarkID: "a")
        XCTAssertNotEqual(first.id, second.id)
    }
}
