import SwiftUI
import XCTest
@testable import ZineNative

final class BookmarkDescriptionTests: XCTestCase {
    func testLinksPreserveUnicodeLineBreaksAndExcludeTrailingPunctuation() {
        let text = "👋 Read https://example.com/article?q=one&v=2.\nThen (https://example.org/next)."
        let result = BookmarkDescription.attributedText(text)
        XCTAssertEqual(String(result.characters), text)
        let links = result.runs.compactMap { run -> String? in
            guard run.link != nil else { return nil }
            XCTAssertNil(run.underlineStyle)
            return String(result[run.range].characters)
        }
        XCTAssertEqual(links, ["https://example.com/article?q=one&v=2", "https://example.org/next"])
        XCTAssertEqual(result.runs.compactMap(\.link).map(\.absoluteString), links)
    }

    func testPlainTextAndNonWebAddressesRemainUnlinked() {
        for text in ["", "An ordinary description.", "Email hello@example.com or ftp://example.com/file"] {
            let result = BookmarkDescription.attributedText(text)
            XCTAssertEqual(String(result.characters), text)
            XCTAssertTrue(result.runs.compactMap(\.link).isEmpty)
        }
    }

    func testBareWebAddressGetsAnOpenableDestination() {
        let result = BookmarkDescription.attributedText("Visit www.example.com for details.")
        XCTAssertEqual(result.runs.compactMap(\.link).map(\.absoluteString), ["http://www.example.com"])
    }
}
