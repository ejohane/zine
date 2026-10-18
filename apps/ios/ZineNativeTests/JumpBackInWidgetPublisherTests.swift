import XCTest
@testable import ZineNative

@MainActor
final class JumpBackInWidgetPublisherTests: XCTestCase {
    func testAccountSwitchAndSignOutClearContentAndRejectLateArtwork() async throws {
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: directory) }
        let storage = JumpBackInWidgetStorage(directory: directory)
        let a = JumpBackInWidgetScope(userID: "a", apiBaseURL: URL(string: "https://example.invalid")!)
        let b = JumpBackInWidgetScope(userID: "b", apiBaseURL: a.apiBaseURL)
        var pending: CheckedContinuation<Data?, Never>?
        let started = expectation(description: "Artwork request started")
        let publisher = JumpBackInWidgetPublisher(storage: storage, reload: {}, loadArtwork: { _ in
            await withCheckedContinuation { continuation in
                pending = continuation
                started.fulfill()
            }
        })
        let item = HomeItem(id: "one", itemId: "item-one", title: "Title", thumbnailUrl: URL(string: "https://example.invalid/image"),
            canonicalUrl: URL(string: "https://example.invalid/article")!, contentType: .article, provider: .web,
            creator: "Creator", creatorImageUrl: nil, creatorId: nil, publisher: nil, summary: nil,
            duration: nil, publishedAt: nil, readingTimeMinutes: nil, bookmarkedAt: nil,
            lastOpenedAt: "2026-10-18T00:00:00Z", progress: nil)
        publisher.activate(a)
        let publishing = Task { await publisher.publish([item], scope: a) }
        await fulfillment(of: [started], timeout: 2)
        XCTAssertEqual(storage.load()?.items.first?.id, "one", "Metadata is published before artwork")
        publisher.activate(b)
        XCTAssertNil(storage.load())
        await publisher.publish([], scope: b)
        pending?.resume(returning: Data([1, 2, 3]))
        await publishing.value
        XCTAssertEqual(storage.load()?.scope, b, "Old account's suspended writer must not repopulate the widget")
        XCTAssertEqual(storage.load()?.items, [])
        publisher.activate(nil)
        XCTAssertNil(storage.load())
        await publisher.publish([item], scope: a)
        XCTAssertNil(storage.load(), "A signed-out session cannot publish")
    }
}
