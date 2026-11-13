import XCTest
@testable import ZineNext

final class APIPreviewTests: XCTestCase {
    @MainActor
    func testLifecycleCompletionArchiveAndProgressStayIndependentAfterRelaunch() throws {
        let file = URL.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: file) }
        let space = SavedSpace(fileURL: file)
        let received = try XCTUnwrap(space.contents(in: .home, scope: .received).first)
        XCTAssertFalse(space.contents(in: .home).contains { $0.id == received.id })
        space.setStatus("dismissed", for: received.id)
        XCTAssertTrue(space.contents(in: .home, scope: .dismissed).contains { $0.id == received.id })
        try space.save(urlText: received.url!.absoluteString, title: "", section: received.section, contextText: "Worth a second look")
        space.setProgress(0.43, for: received.id)
        space.toggleArchive(received.id)
        let reopened = SavedSpace(fileURL: file)
        let saved = try XCTUnwrap(reopened.items.first { $0.id == received.id })
        XCTAssertEqual(saved.api?.status, "saved")
        XCTAssertEqual(saved.api?.archived, true)
        XCTAssertEqual(saved.progressFraction ?? 0, 0.43, accuracy: 0.001)
        XCTAssertFalse(saved.isFinished)
        XCTAssertTrue(reopened.contents(in: .home).contains { $0.id == saved.id }, "Default /v1 saved retrieval includes archives")
        XCTAssertTrue(reopened.contents(in: .home, scope: .archived).contains { $0.id == saved.id })
        XCTAssertEqual(saved.api?.context.last?.text, "Worth a second look")
    }

    @MainActor
    func testContextSearchAndMultipleCollectionMembershipPersist() throws {
        let file = URL.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: file) }
        let space = SavedSpace(fileURL: file)
        let item = try XCTUnwrap(space.contents(in: .home).first)
        space.addContext("A uniquely memorable blue teapot", to: item.id)
        space.toggleCollection("ai-design", for: item.id)
        let reopened = SavedSpace(fileURL: file)
        XCTAssertEqual(reopened.search("blue teapot", mode: .keyword).first?.id, item.id)
        XCTAssertEqual(reopened.search("blue teapot", mode: .keyword).first?.evidence.first?.field, "context")
        XCTAssertEqual(reopened.items.first { $0.id == item.id }?.api?.collectionIds.count, 2)
        XCTAssertFalse(reopened.search("designing with AI", mode: .semantic).isEmpty)
        XCTAssertTrue(reopened.search("unconfigured semantic query", mode: .semantic).isEmpty)
        let count = reopened.items.count
        reopened.toggleCollection("ai-design", for: item.id)
        XCTAssertEqual(reopened.items.count, count, "Removing membership does not remove a save")
    }

    func testFixturesCarryCoverageAvailabilityAndReferencedMaterial() throws {
        let fixtures = APIFixtures.bundled
        XCTAssertEqual(fixtures.itemList.items.count, 22)
        XCTAssertTrue(fixtures.itemList.items.contains { $0.enrichment.components.contains { $0.status == "failed" } })
        XCTAssertTrue(fixtures.itemList.items.contains { $0.enrichment.components.contains { $0.status == "processing" } })
        for item in fixtures.itemList.items {
            if item.content.summary != nil {
                XCTAssertEqual(item.enrichment.fields["summary"]?.provenance.coverage, "metadata_only")
            }
            for collectionID in item.collectionIds { XCTAssertTrue(fixtures.collectionList.collections.contains { $0.id == collectionID }) }
        }
        XCTAssertEqual(fixtures.details.values.compactMap(\.material).count, 2)
        XCTAssertTrue(fixtures.details.values.compactMap(\.material).allSatisfy { $0.provenance.method == "mock_fixture" })
        let ownedIDs = Set(fixtures.itemList.items.map(\.id))
        for collection in fixtures.collectionList.collections {
            for note in collection.notes ?? [] { XCTAssertTrue(Set(note.itemIds).isSubset(of: ownedIDs)) }
        }
    }
}
