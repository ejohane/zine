import Foundation
import Testing
@testable import ZineNative

struct LibraryCacheTests {
    @Test func roundTripsSnapshotsByQuery() async throws {
        let directory = FileManager.default.temporaryDirectory
            .appending(path: UUID().uuidString, directoryHint: .isDirectory)
        defer { try? FileManager.default.removeItem(at: directory) }

        let cache = LibraryCache(userID: "test-user", baseDirectory: directory)
        let query = LibraryQuery(provider: .youtube)
        let bookmark = makeBookmark()

        await cache.save(items: [bookmark], nextCursor: "next", query: query)
        let snapshot = await cache.load(query: query)

        #expect(snapshot?.items == [bookmark])
        #expect(snapshot?.nextCursor == "next")
        #expect(await cache.load(query: LibraryQuery()) == nil)
    }

    private func makeBookmark() -> Bookmark {
        Bookmark(
            id: "bookmark-1",
            itemId: "item-1",
            title: "Cached bookmark",
            thumbnailUrl: URL(string: "https://example.com/image.jpg"),
            canonicalUrl: URL(string: "https://example.com")!,
            contentType: .video,
            provider: .youtube,
            creator: "Creator",
            creatorImageUrl: nil,
            creatorId: nil,
            publisher: nil,
            summary: nil,
            duration: 60,
            publishedAt: nil,
            wordCount: nil,
            readingTimeMinutes: nil,
            state: "READY",
            ingestedAt: "2026-07-12T00:00:00Z",
            bookmarkedAt: nil,
            lastOpenedAt: nil,
            progress: nil,
            isFinished: false,
            finishedAt: nil,
            tags: []
        )
    }
}
