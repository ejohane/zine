import Foundation
import Testing
@testable import ZineNative

struct InboxCacheTests {
    @Test func keepsOnlyFirstPageAndSupportsOptimisticRemovalRollback() async throws {
        let directory = FileManager.default.temporaryDirectory
            .appending(path: UUID().uuidString, directoryHint: .isDirectory)
        defer { try? FileManager.default.removeItem(at: directory) }

        let cache = InboxCache(userID: "test-user", baseDirectory: directory)
        let query = InboxQuery(provider: .rss, contentType: .article)
        let items = (0..<35).map(makeBookmark)

        await cache.saveFirstPage(items: items, nextCursor: "next", query: query)
        var snapshot = await cache.load(query: query)

        #expect(snapshot?.items.count == 30)
        #expect(snapshot?.nextCursor == "next")
        #expect(await cache.load(query: InboxQuery()) == nil)

        await cache.remove(id: items[4].id, query: query)
        snapshot = await cache.load(query: query)
        #expect(snapshot?.items.contains(where: { $0.id == items[4].id }) == false)

        await cache.restore(items[4], at: 4, query: query)
        snapshot = await cache.load(query: query)
        #expect(snapshot?.items[4].id == items[4].id)
        #expect(snapshot?.items.count == 30)
    }

    private func makeBookmark(index: Int) -> Bookmark {
        Bookmark(
            id: "inbox-\(index)",
            itemId: "item-\(index)",
            title: "Inbox item \(index)",
            thumbnailUrl: nil,
            canonicalUrl: URL(string: "https://example.com/items/\(index)")!,
            contentType: .article,
            provider: .rss,
            creator: "Creator",
            creatorImageUrl: nil,
            creatorId: nil,
            publisher: nil,
            summary: nil,
            duration: nil,
            publishedAt: nil,
            wordCount: nil,
            readingTimeMinutes: 5,
            state: "INBOX",
            ingestedAt: "2026-07-15T00:00:00Z",
            bookmarkedAt: nil,
            lastOpenedAt: nil,
            progress: nil,
            isFinished: false,
            finishedAt: nil,
            tags: []
        )
    }
}
