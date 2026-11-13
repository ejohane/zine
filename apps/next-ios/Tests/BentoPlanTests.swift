import XCTest
import UIKit
@testable import ZineNext

final class BentoPlanTests: XCTestCase {
    func testEverySampleAndFilterFitsWithoutOverlapsOrMissingItems() {
        for section in ContentSection.allCases {
            let items = SampleStories.items.filter { section == .home || $0.section == section }
            let plan = BentoPlan.placements(for: items)
            XCTAssertEqual(Set(plan.map(\.index)), Set(items.indices))
            for width in [CGFloat(660), 891, 1060] {
                let frames = plan.map { BentoPlan.frame($0, width: width) }
                for (index, frame) in frames.enumerated() {
                    XCTAssertGreaterThan(frame.width, 0)
                    XCTAssertGreaterThan(frame.height, 44)
                    XCTAssertGreaterThanOrEqual(frame.minX, 0)
                    XCTAssertLessThanOrEqual(frame.maxX, width + 0.01)
                    for other in frames.dropFirst(index + 1) { XCTAssertFalse(frame.intersects(other)) }
                    let item = items[plan[index].index]
                    if item.section == .podcasts { XCTAssertEqual(frame.width, frame.height, accuracy: 0.01) }
                    if item.section == .articles { XCTAssertGreaterThan(frame.height, frame.width) }
                    if item.section == .videos { XCTAssertGreaterThan(frame.width / frame.height, 1.9) }
                }
            }
        }
    }

    func testLocalSamplesHaveOriginalsStableIDsAndValidArtwork() throws {
        let items = SampleStories.items
        XCTAssertEqual(items.count, 22)
        XCTAssertEqual(Set(items.map(\.id)).count, items.count)
        XCTAssertEqual(Set(items.map(\.section)), Set(ContentSection.allCases.filter { $0 != .home }))
        for item in items {
            XCTAssertTrue(item.isSample)
            XCTAssertNotNil(item.url?.host)
            XCTAssertFalse(item.title.isEmpty)
            XCTAssertTrue(item.body.isEmpty, "No fabricated article text")
            if let image = item.image { XCTAssertNotNil(UIImage(named: image)) }
        }
    }
}
