import Foundation
import Testing
#if canImport(ZineCore)
@testable import ZineCore
#else
@testable import ZineNative
#endif

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

    @Test func preservesOfflineCorpusSeparatelyFromThePagedLibrarySnapshot() async throws {
        let directory = FileManager.default.temporaryDirectory
            .appending(path: UUID().uuidString, directoryHint: .isDirectory)
        defer { try? FileManager.default.removeItem(at: directory) }

        let cache = LibraryCache(userID: "test-user", baseDirectory: directory)
        let first = makeBookmark(id: "bookmark-1")
        let second = makeBookmark(id: "bookmark-2")

        await cache.saveOfflineLibrary(items: [first, second], nextCursor: nil)
        await cache.save(items: [first], nextCursor: "page-2", query: LibraryQuery())

        let reloaded = LibraryCache(userID: "test-user", baseDirectory: directory)
        #expect(await reloaded.load(query: LibraryQuery())?.items == [first])
        #expect(await reloaded.loadOfflineLibrary()?.items == [first, second])
    }

    @Test func offlineCorpusSurvivesQuerySnapshotPruning() async throws {
        let directory = FileManager.default.temporaryDirectory
            .appending(path: UUID().uuidString, directoryHint: .isDirectory)
        defer { try? FileManager.default.removeItem(at: directory) }

        let cache = LibraryCache(userID: "test-user", baseDirectory: directory)
        let offlineItems = [makeBookmark(id: "offline")]
        await cache.saveOfflineLibrary(items: offlineItems, nextCursor: nil)

        for index in 0..<20 {
            await cache.save(
                items: [makeBookmark(id: "query-\(index)")],
                nextCursor: nil,
                query: LibraryQuery(search: "query-\(index)")
            )
        }

        #expect(await cache.loadOfflineLibrary()?.items == offlineItems)
    }

    private func makeBookmark(id: String = "bookmark-1") -> Bookmark {
        Bookmark(
            id: id,
            itemId: "item-\(id)",
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
