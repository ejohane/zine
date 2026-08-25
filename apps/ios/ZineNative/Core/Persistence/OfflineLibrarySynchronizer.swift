import Foundation

actor OfflineLibrarySynchronizer {
    static let maximumBookmarks = 250

    private let client: APIClient
    private let libraryCache: LibraryCache

    init(client: APIClient, libraryCache: LibraryCache) {
        self.client = client
        self.libraryCache = libraryCache
    }

    func synchronize() async {
        await client.flushPendingBookmarkMutations()
        await client.flushPendingArticleProgress()
        await client.cacheTagsForOffline()

        let query = LibraryQuery()
        var bookmarks: [Bookmark] = []
        var cursor: String?

        do {
            repeat {
                try Task.checkCancellation()
                let remaining = Self.maximumBookmarks - bookmarks.count
                guard remaining > 0 else { break }

                let response = try await client.listBookmarks(
                    query: query,
                    cursor: cursor,
                    limit: min(50, remaining)
                )
                let existingIDs = Set(bookmarks.map(\.id))
                bookmarks.append(contentsOf: response.items.filter { !existingIDs.contains($0.id) })
                cursor = response.nextCursor
            } while cursor != nil && bookmarks.count < Self.maximumBookmarks
        } catch is CancellationError {
            return
        } catch {
            return
        }

        await libraryCache.saveOfflineLibrary(items: bookmarks, nextCursor: cursor)
        prefetchImages(in: bookmarks)

        for bookmark in bookmarks where bookmark.provider.opensInZineReader(
            contentType: bookmark.contentType
        ) {
            guard !Task.isCancelled else { return }
            try? await client.cacheArticleContentForOffline(id: bookmark.id)
        }
    }

    private func prefetchImages(in bookmarks: [Bookmark]) {
        var seenURLs = Set<URL>()
        let urls = bookmarks
            .flatMap { [$0.thumbnailUrl, $0.creatorImageUrl].compactMap { $0 } }
            .filter { seenURLs.insert($0).inserted }
        AppImagePipeline.prefetch(urls)
    }
}
