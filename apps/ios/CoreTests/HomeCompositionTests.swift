import Foundation
import XCTest
@testable import ZineCore

final class HomeCompositionTests: XCTestCase {
    @MainActor
    func testCompositionCommandsUseAuthenticatedAPIAndKeepUncertainReadbackDistinct() async throws {
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [HomeCompositionAPIProtocol.self]
        let client = APIClient(baseURL: URL(string: "https://fixture.invalid")!, tokenProvider: { "fixture-session" },
                               session: URLSession(configuration: configuration))
        let session = NativeCommandSession(client: client)
        let composition = HomeComposition(sections: [])
        let preview = await session.execute(NativeCommand(name: "home.composition.preview", composition: composition))
        XCTAssertEqual(preview.status, "completed")
        XCTAssertEqual(preview.state.homeCompositionResult?.valid, true)
        XCTAssertNil(preview.state.homeCompositionResult?.published)
        let published = await session.execute(NativeCommand(name: "home.composition.publish", composition: composition))
        XCTAssertEqual(published.status, "server_committed")
        XCTAssertEqual(published.state.homeCompositionResult?.published, true)
        XCTAssertEqual(published.state.homeCompositionResult?.verified, false)
        let invalid = await session.execute(NativeCommand(name: "home.composition.publish", composition: .init(version: 2, sections: [])))
        XCTAssertEqual(invalid.status, "failed")
        XCTAssertEqual(invalid.error, "valid_composition_required")
    }

    func testHomeCacheRestoresOnlyTheReplacementArrangementAfterRestart() async throws {
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: directory) }
        let cache = HomeCache(userID: "home-lab", baseDirectory: directory)
        func response(_ id: String) -> HomeResponse {
            HomeResponse(composition: .init(sections: [
                .init(id: id, title: id, layout: .vertical, card: .row, itemIds: ["a"]),
            ]), compositionItems: [item("a")], recentBookmarks: [], jumpBackIn: [],
                         byContentType: .init(videos: [], podcasts: [], articles: []),
                         customCollections: [], sectionOrder: [], requestId: nil, traceId: nil)
        }
        await cache.save(home: response("old"), inboxItems: [])
        await cache.save(home: response("replacement"), inboxItems: [])
        let restartedCache = HomeCache(userID: "home-lab", baseDirectory: directory)
        let restored = await restartedCache.load()
        XCTAssertEqual(restored?.home?.composition?.sections.map(\.id), ["replacement"])
        XCTAssertEqual(restored?.home?.compositionItems?.map(\.id), ["a"])
    }

    func testEmptyArrangementIsPersistableAndReplacementDoesNotMergeCollections() throws {
        let original = HomeComposition(sections: [
            .init(id: "old", title: "Old collection", layout: .vertical, card: .row, itemIds: ["a"]),
        ])
        let replacement = HomeComposition(sections: [
            .init(id: "new", title: "New collection", layout: .twoColumn, card: .grid, itemIds: ["b", "a"]),
        ])
        XCTAssertEqual(original.resolve(items: [item("a")]).map(\.id), ["old"])
        let restored = try JSONDecoder().decode(HomeComposition.self, from: JSONEncoder().encode(replacement))
        XCTAssertEqual(restored.resolve(items: [item("a"), item("b")]).map(\.id), ["new"])
        XCTAssertEqual(restored.resolve(items: [item("a"), item("b")])[0].items.map(\.id), ["b", "a"])
        let cleared = try JSONDecoder().decode(HomeComposition.self, from: Data(#"{"version":1,"sections":[]}"#.utf8))
        XCTAssertTrue(cleared.isValid)
        XCTAssertTrue(cleared.resolve(items: [item("a")]).isEmpty)
    }

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

private final class HomeCompositionAPIProtocol: URLProtocol, @unchecked Sendable {
    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
    override func startLoading() {
        XCTAssertEqual(request.value(forHTTPHeaderField: "Authorization"), "Bearer fixture-session")
        XCTAssertEqual(request.value(forHTTPHeaderField: "Content-Type"), "application/json")
        let publishing = request.url!.path == "/api/v1/home/composition"
        XCTAssertEqual(request.httpMethod, publishing ? "PUT" : "POST")
        if !publishing { XCTAssertEqual(request.url!.path, "/api/v1/home/composition/preview") }
        var body: [String: Any] = ["composition": ["version": 1, "sections": []]]
        if publishing { body["published"] = true; body["verified"] = false }
        else { body["valid"] = true }
        let data = try! JSONSerialization.data(withJSONObject: body)
        client?.urlProtocol(self, didReceive: HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!, cacheStoragePolicy: .notAllowed)
        client?.urlProtocol(self, didLoad: data)
        client?.urlProtocolDidFinishLoading(self)
    }
    override func stopLoading() {}
}
