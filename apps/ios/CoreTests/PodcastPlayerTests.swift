import Foundation
import XCTest
@testable import ZineCore

final class PodcastPlayerTests: XCTestCase {
    func testOriginalPlayerDetectionPreservesTheSharedTimestamp() {
        let url = URL(string: "https://overcast.fm/+example?t=120")!
        XCTAssertEqual(PodcastPlayer.originalPlayer(for: url), .overcast)
        XCTAssertEqual(url.query, "t=120")
        XCTAssertNil(PodcastPlayer.originalPlayer(for: URL(string: "https://publisher.example/episode")!))
    }
    func testHonestLabelsAndDestinationValidation() {
        let show = PodcastDestination(url: URL(string: "https://overcast.fm/itunes123")!, kind: .show)
        XCTAssertEqual(show.label(for: .overcast), "Open show in Overcast")
        XCTAssertTrue(show.isValid(for: .overcast))
        XCTAssertFalse(show.isValid(for: .applePodcasts))
        let spoof = PodcastDestination(url: URL(string: "https://overcast.fm.attacker.example/episode")!, kind: .episode)
        XCTAssertFalse(spoof.isValid(for: .overcast))
        let add = PodcastDestination(url: URL(string: "overcast://x-callback-url/add?url=https%3A%2F%2Fexample.com%2Frss")!, kind: .subscribe)
        XCTAssertTrue(add.isValid(for: .overcast))
        XCTAssertEqual(add.label(for: .overcast), "Add show to Overcast")
    }
}
