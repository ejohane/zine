import Foundation
import XCTest
@testable import ZineCore

final class HomeCompositionTests: XCTestCase {
    func testCompositionUsesRealItemContentAndPreservesCrossSectionOverlap() throws {
        let first = item("a"), second = item("b")
        let composition = HomeComposition(sections: [
            .init(id: "lead", layout: .single, card: .featured, itemIds: ["b"]),
            .init(id: "rail", title: "Saved Reads", layout: .horizontal, card: .landscape, itemIds: ["b", "a"]),
        ])
        let restored = try JSONDecoder().decode(HomeComposition.self, from: JSONEncoder().encode(composition))
        let resolved = restored.resolve(items: [first, second])
        XCTAssertEqual(resolved.map(\.id), ["lead", "rail"])
        XCTAssertEqual(resolved[1].items, [second, first])
        XCTAssertEqual(resolved[0].items[0].title, "Real title b")
        XCTAssertEqual(resolved[0].items[0].thumbnailUrl, second.thumbnailUrl)
        XCTAssertEqual(restored.resolve(items: [first, second], hiddenIDs: ["b"]).map(\.id), ["rail"])
        XCTAssertEqual(restored.resolve(items: [first])[0].items, [first])
    }

    func testInvalidAndFutureCompositionsFallBackWithoutBreakingHomeDecoding() throws {
        for composition: [String: Any] in [
            ["version": 2, "sections": []],
            ["version": 1, "sections": [["id": "future", "layout": "html", "card": "story", "itemIds": ["a"]]]],
            ["version": 1, "sections": "bad"],
        ] {
            let data = try JSONSerialization.data(withJSONObject: [
                "recentBookmarks": [], "jumpBackIn": [],
                "byContentType": ["videos": [], "podcasts": [], "articles": []],
                "customCollections": [], "sectionOrder": [], "composition": composition,
            ])
            let response = try JSONDecoder().decode(HomeResponse.self, from: data)
            XCTAssertFalse(try XCTUnwrap(response.composition).isValid)
            XCTAssertTrue(response.composition!.resolve(items: [item("a")]).isEmpty)
        }
    }

    func testLayoutRulesRejectDuplicatesAndIncoherentCards() {
        for section in [
            HomeComposition.Section(id: "a", layout: .horizontal, card: .featured, itemIds: ["a"]),
            .init(id: "a", layout: .single, card: .cover, itemIds: ["a", "b"]),
            .init(id: "a", layout: .vertical, card: .row, itemIds: ["a", "a"]),
            .init(id: "a", layout: .horizontal, card: .tile, itemIds: ["a"]),
            .init(id: "a", title: "Paragraph\nMore", layout: .single, card: .featured, itemIds: ["a"]),
        ] {
            XCTAssertFalse(HomeComposition(sections: [section]).isValid)
        }
    }

    func testPendingCompletionAndArchivePreserveManifestButHideCards() {
        let composition = HomeComposition(sections: [
            .init(id: "rail", layout: .horizontal, card: .landscape, itemIds: ["a", "b"]),
        ])
        let home = HomeResponse(composition: composition, compositionItems: [item("a"), item("b")],
                                recentBookmarks: [], jumpBackIn: [],
                                byContentType: .init(videos: [], podcasts: [], articles: []),
                                customCollections: [], sectionOrder: [], requestId: nil, traceId: nil)
        let filtered = APIClient.filterHome(home, hiding: ["a"])
        XCTAssertEqual(filtered.composition, composition)
        XCTAssertEqual(filtered.compositionItems?.map(\.id), ["b"])
    }

    private func item(_ id: String) -> HomeItem {
        HomeItem(id: id, itemId: "item-\(id)", title: "Real title \(id)",
                 thumbnailUrl: URL(string: "https://example.com/\(id).jpg"),
                 canonicalUrl: URL(string: "https://example.com/\(id)")!,
                 contentType: .article, provider: .web, creator: "Real author", creatorImageUrl: nil,
                 creatorId: nil, publisher: nil, summary: "Actual source excerpt", duration: nil,
                 publishedAt: nil, readingTimeMinutes: 8, bookmarkedAt: nil, lastOpenedAt: nil, progress: nil)
    }
}
