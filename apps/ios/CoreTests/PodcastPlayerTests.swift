import Foundation
import XCTest
@testable import ZineCore

final class PodcastPlayerTests: XCTestCase {
    func testSavedDestinationsSelectInstantlyAndFallbackWithoutNetwork() throws {
        let original = URL(string: "https://publisher.example/episode")!
        let links: [String: PodcastDestination] = [
            "OVERCAST": .init(url: URL(string: "https://overcast.fm/+itunes123")!, kind: .show),
            "APPLE_PODCASTS": .init(url: URL(string: "https://podcasts.apple.com/podcast/id123?i=456")!, kind: .episode),
            "POCKET_CASTS": .init(url: URL(string: "https://pca.st/episode/456")!, kind: .episode)
        ]
        for player in PodcastPlayer.allCases {
            let target = PodcastOpenTarget(player: player, destinations: links, originalURL: original)
            XCTAssertEqual(target.url, links[player.rawValue]?.url)
        }
        XCTAssertEqual(PodcastOpenTarget(player: .overcast, destinations: nil, originalURL: original).url, original)
        let invalid = ["OVERCAST": PodcastDestination(url: URL(string: "https://attacker.example")!, kind: .show)]
        XCTAssertEqual(PodcastOpenTarget(player: .overcast, destinations: invalid, originalURL: original).url, original)
    }

    func testBookmarkAndHomeCacheRoundTripSavedLinksAndDecodeOlderPayloads() throws {
        let json = #"{"id":"bookmark","itemId":"item","title":"Episode","canonicalUrl":"https://publisher.example/episode","contentType":"PODCAST","provider":"RSS","creator":"Show","state":"BOOKMARKED","ingestedAt":"2026-09-21","isFinished":false,"tags":[],"podcastDestinations":{"OVERCAST":{"kind":"show","url":"https://overcast.fm/+itunes123"}}}"#
        let bookmark = try JSONDecoder().decode(Bookmark.self, from: Data(json.utf8))
        let cached = try JSONDecoder().decode(Bookmark.self, from: JSONEncoder().encode(bookmark))
        XCTAssertEqual(cached.podcastDestinations?["OVERCAST"]?.kind, .show)
        let home = HomeItem(bookmark: cached, openedAt: Date())
        let homeCached = try JSONDecoder().decode(HomeItem.self, from: JSONEncoder().encode(home))
        XCTAssertEqual(homeCached.podcastDestinations, bookmark.podcastDestinations)
        var old = try JSONSerialization.jsonObject(with: Data(json.utf8)) as! [String: Any]
        old.removeValue(forKey: "podcastDestinations")
        let legacy = try JSONDecoder().decode(Bookmark.self, from: JSONSerialization.data(withJSONObject: old))
        XCTAssertNil(legacy.podcastDestinations)
    }

    func testOriginalPlayerDetectionPreservesTheSharedTimestamp() {
        let url = URL(string: "https://overcast.fm/+example?t=120")!
        XCTAssertEqual(PodcastPlayer.originalPlayer(for: url), .overcast)
        XCTAssertEqual(url.query, "t=120")
        XCTAssertNil(PodcastPlayer.originalPlayer(for: URL(string: "https://publisher.example/episode")!))
    }
    func testEveryPreferenceSelectsItsOwnButtonBranding() {
        for player in PodcastPlayer.allCases {
            XCTAssertEqual(PodcastPlayer.originalPlayer(for: player.brandingURL), player)
        }
    }
    func testHonestLabelsAndDestinationValidation() {
        let show = PodcastDestination(url: URL(string: "https://overcast.fm/+itunes123")!, kind: .show)
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
