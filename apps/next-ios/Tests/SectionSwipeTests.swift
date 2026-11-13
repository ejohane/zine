import XCTest
@testable import ZineNext

final class SectionSwipeTests: XCTestCase {
    func testLeftSwipeAdvancesAndRightSwipeReturns() {
        XCTAssertEqual(SectionSwipe.selection(from: .home, translation: -64), .podcasts)
        XCTAssertEqual(SectionSwipe.selection(from: .home, translation: -128), .articles)
        XCTAssertEqual(SectionSwipe.selection(from: .videos, translation: 64), .articles)
    }

    func testShortSwipeOnlyCommitsAfterCrossingTheReleaseThreshold() {
        XCTAssertEqual(SectionSwipe.selection(from: .home, translation: -40), .home)
        XCTAssertEqual(SectionSwipe.selection(from: .home, translation: -40, ended: true), .podcasts)
        XCTAssertEqual(SectionSwipe.selection(from: .articles, translation: -20, ended: true), .articles)
        XCTAssertEqual(SectionSwipe.selection(from: .articles, translation: 0, ended: true), .articles)
    }

    func testEdgesDoNotWrapOrGenerateNewSelections() {
        XCTAssertEqual(SectionSwipe.selection(from: .home, translation: 1000), .home)
        XCTAssertEqual(SectionSwipe.selection(from: .posts, translation: -1000), .posts)
        XCTAssertEqual(SectionSwipe.selection(from: .home, translation: -1000), .posts)
    }
}
