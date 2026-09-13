import Foundation
import Observation

@MainActor
@Observable
final class LibraryStore {
    private(set) var items: [Bookmark] = []
    private(set) var isLoading = false
    private(set) var isLoadingMore = false
    private(set) var errorMessage: String?
    private(set) var actionErrorMessage: String?
    private(set) var nextCursor: String?

    private let client: APIClient
    private let cache: LibraryCache
    private let onContentChanged: () -> Void
    private let prefetch: ([URL]) -> Void
    private var activeQuery = LibraryQuery()
    private var unbookmarkedIndices: [String: Int] = [:]

    init(
        client: APIClient,
        cache: LibraryCache,
        onContentChanged: @escaping () -> Void = {},
        prefetch: @escaping ([URL]) -> Void = { _ in }
    ) {
        self.client = client
        self.cache = cache
        self.onContentChanged = onContentChanged
        self.prefetch = prefetch
    }

    func reset() {
        items = []
        nextCursor = nil
        errorMessage = nil
        isLoading = false
        isLoadingMore = false
    }

    func reload(query: LibraryQuery) async {
        let queryChanged = activeQuery != query
        activeQuery = query
        errorMessage = nil

        if queryChanged {
            items = []
            nextCursor = nil
        }

        var cachedSnapshot = await cache.load(query: query)
        if cachedSnapshot == nil, query == LibraryQuery() {
            cachedSnapshot = await cache.loadOfflineLibrary()
        }
        if let snapshot = cachedSnapshot {
            guard !Task.isCancelled, activeQuery == query else { return }
            items = await client.overlayLibraryBookmarks(snapshot.items, query: query)
            nextCursor = snapshot.nextCursor
            prefetchImages(in: items)
        }

        isLoading = items.isEmpty
        defer { isLoading = false }

        do {
            let response = try await client.listBookmarks(query: query)
            guard !Task.isCancelled, activeQuery == query else { return }
            items = response.items
            nextCursor = response.nextCursor
            prefetchImages(in: response.items)
            await cache.save(
                items: response.items,
                nextCursor: response.nextCursor,
                query: query
            )
        } catch is CancellationError {
            return
        } catch {
            guard activeQuery == query else { return }
            if query == LibraryQuery(),
               let offlineSnapshot = await cache.loadOfflineLibrary()
            {
                items = await client.overlayLibraryBookmarks(offlineSnapshot.items, query: query)
                nextCursor = offlineSnapshot.nextCursor
                prefetchImages(in: items)
            }
            errorMessage = error.localizedDescription
        }
    }

    func loadMoreIfNeeded(current item: Bookmark) async {
        guard item.id == items.last?.id,
              let nextCursor,
              !isLoading,
              !isLoadingMore
        else { return }

        isLoadingMore = true
        defer { isLoadingMore = false }

        do {
            let response = try await client.listBookmarks(
                query: activeQuery,
                cursor: nextCursor
            )
            guard !Task.isCancelled else { return }
            let existingIDs = Set(items.map(\.id))
            items.append(contentsOf: response.items.filter { !existingIDs.contains($0.id) })
            self.nextCursor = response.nextCursor
            prefetchImages(in: response.items)
            await cache.save(items: items, nextCursor: response.nextCursor, query: activeQuery)
        } catch is CancellationError {
            return
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func update(_ bookmark: Bookmark) {
        if let index = items.firstIndex(where: { $0.id == bookmark.id }) {
            if bookmark.isFinished == activeQuery.isFinished {
                items[index] = bookmark
            } else {
                items.remove(at: index)
            }
            persistCurrentState()
            onContentChanged()
        }
    }

    func setBookmarked(_ bookmark: Bookmark, isBookmarked: Bool) {
        if isBookmarked {
            guard !items.contains(where: { $0.id == bookmark.id }),
                  bookmark.isFinished == activeQuery.isFinished
            else { return }

            let index = min(unbookmarkedIndices.removeValue(forKey: bookmark.id) ?? 0, items.endIndex)
            items.insert(bookmark, at: index)
        } else if let index = items.firstIndex(where: { $0.id == bookmark.id }) {
            unbookmarkedIndices[bookmark.id] = index
            items.remove(at: index)
        } else {
            return
        }

        persistCurrentState()
        onContentChanged()
    }

    func complete(_ bookmark: Bookmark) async {
        guard !bookmark.isFinished,
              let removal = removeOptimistically(bookmark)
        else { return }

        do {
            _ = try await client.setFinished(
                id: bookmark.id,
                isFinished: true,
                bookmark: bookmark
            )
            onContentChanged()
        } catch {
            restore(removal, message: "The bookmark couldn’t be completed. Please try again.")
        }
    }

    func archive(_ bookmark: Bookmark) async {
        guard let removal = removeOptimistically(bookmark) else { return }

        do {
            try await client.archiveBookmark(id: bookmark.id, bookmark: bookmark)
            onContentChanged()
        } catch {
            restore(removal, message: "The bookmark couldn’t be archived. Please try again.")
        }
    }

    func dismissActionError() {
        actionErrorMessage = nil
    }

    private func prefetchImages(in bookmarks: [Bookmark]) {
        var seenURLs = Set<URL>()
        let urls = bookmarks
            .flatMap { [$0.thumbnailUrl, $0.creatorImageUrl].compactMap { $0 } }
            .filter { seenURLs.insert($0).inserted }

        prefetch(urls)
    }

    private func persistCurrentState() {
        let items = items
        let nextCursor = nextCursor
        let query = activeQuery
        Task {
            await cache.save(items: items, nextCursor: nextCursor, query: query)
        }
    }

    private func removeOptimistically(_ bookmark: Bookmark) -> OptimisticRemoval? {
        guard let index = items.firstIndex(where: { $0.id == bookmark.id }) else { return nil }
        let removal = OptimisticRemoval(bookmark: items.remove(at: index), index: index, query: activeQuery)
        persistCurrentState()
        return removal
    }

    private func restore(_ removal: OptimisticRemoval, message: String) {
        guard activeQuery == removal.query,
              !items.contains(where: { $0.id == removal.bookmark.id })
        else { return }

        items.insert(removal.bookmark, at: min(removal.index, items.endIndex))
        actionErrorMessage = message
        persistCurrentState()
    }
}

private struct OptimisticRemoval {
    let bookmark: Bookmark
    let index: Int
    let query: LibraryQuery
}
