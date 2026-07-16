import Foundation
import Observation

@MainActor
@Observable
final class InboxStore {
    private(set) var items: [Bookmark] = []
    private(set) var isLoading = false
    private(set) var isLoadingMore = false
    private(set) var errorMessage: String?
    private(set) var actionErrorMessage: String?
    private(set) var nextCursor: String?

    private let client: APIClient
    private let cache: InboxCache
    private let onLibraryChanged: () -> Void
    private var activeQuery = InboxQuery()
    private var pendingItemIDs = Set<String>()
    private var detailRemovals: [String: InboxOptimisticRemoval] = [:]

    init(
        client: APIClient,
        cache: InboxCache,
        onLibraryChanged: @escaping () -> Void
    ) {
        self.client = client
        self.cache = cache
        self.onLibraryChanged = onLibraryChanged
    }

    func reload(query: InboxQuery) async {
        let queryChanged = activeQuery != query
        activeQuery = query
        errorMessage = nil

        if queryChanged {
            items = []
            nextCursor = nil
        }

        if let snapshot = await cache.load(query: query) {
            guard !Task.isCancelled, activeQuery == query else { return }
            items = snapshot.items.filter { !pendingItemIDs.contains($0.id) }
            nextCursor = snapshot.nextCursor
        }

        isLoading = items.isEmpty
        defer { isLoading = false }

        do {
            let response = try await client.listInbox(query: query)
            guard !Task.isCancelled, activeQuery == query else { return }
            items = response.items.filter { !pendingItemIDs.contains($0.id) }
            nextCursor = response.nextCursor
            await cache.saveFirstPage(
                items: response.items,
                nextCursor: response.nextCursor,
                query: query
            )
        } catch is CancellationError {
            return
        } catch {
            guard activeQuery == query else { return }
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
            let response = try await client.listInbox(query: activeQuery, cursor: nextCursor)
            guard !Task.isCancelled else { return }
            let existingIDs = Set(items.map(\.id))
            items.append(contentsOf: response.items.filter {
                !existingIDs.contains($0.id) && !pendingItemIDs.contains($0.id)
            })
            self.nextCursor = response.nextCursor
        } catch is CancellationError {
            return
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func bookmark(_ bookmark: Bookmark) async {
        guard let removal = removeOptimistically(bookmark) else { return }

        do {
            try await client.bookmarkItem(id: bookmark.id)
            await cache.remove(id: bookmark.id, query: removal.query)
            pendingItemIDs.remove(bookmark.id)
            onLibraryChanged()
        } catch {
            restore(removal, message: "The item couldn’t be bookmarked. Please try again.")
        }
    }

    func archive(_ bookmark: Bookmark) async {
        guard let removal = removeOptimistically(bookmark) else { return }

        do {
            try await client.archiveInboxItem(id: bookmark.id)
            await cache.remove(id: bookmark.id, query: removal.query)
            pendingItemIDs.remove(bookmark.id)
        } catch {
            restore(removal, message: "The item couldn’t be archived. Please try again.")
        }
    }

    func handleDetailBookmarkChange(
        _ bookmark: Bookmark,
        isBookmarked: Bool,
        phase: BookmarkChangePhase
    ) {
        switch (isBookmarked, phase) {
        case (true, .optimistic):
            if let removal = removeOptimistically(bookmark) {
                detailRemovals[bookmark.id] = removal
            }
        case (false, .rollback):
            if let removal = detailRemovals.removeValue(forKey: bookmark.id) {
                restore(removal, message: nil)
            }
        default:
            break
        }
    }

    func commitDetailBookmarkChange(id: String) {
        let removal = detailRemovals.removeValue(forKey: id)
        pendingItemIDs.remove(id)
        if let removal {
            Task { await cache.remove(id: id, query: removal.query) }
        }
        onLibraryChanged()
    }

    func dismissActionError() {
        actionErrorMessage = nil
    }

    private func removeOptimistically(_ bookmark: Bookmark) -> InboxOptimisticRemoval? {
        guard !pendingItemIDs.contains(bookmark.id),
              let index = items.firstIndex(where: { $0.id == bookmark.id })
        else { return nil }

        pendingItemIDs.insert(bookmark.id)
        let removal = InboxOptimisticRemoval(
            bookmark: items.remove(at: index),
            index: index,
            query: activeQuery
        )
        Task { await cache.remove(id: bookmark.id, query: activeQuery) }
        return removal
    }

    private func restore(_ removal: InboxOptimisticRemoval, message: String?) {
        pendingItemIDs.remove(removal.bookmark.id)
        guard activeQuery == removal.query,
              !items.contains(where: { $0.id == removal.bookmark.id })
        else { return }

        items.insert(removal.bookmark, at: min(removal.index, items.endIndex))
        actionErrorMessage = message
        Task {
            await cache.restore(removal.bookmark, at: removal.index, query: removal.query)
        }
    }
}

private struct InboxOptimisticRemoval {
    let bookmark: Bookmark
    let index: Int
    let query: InboxQuery
}
