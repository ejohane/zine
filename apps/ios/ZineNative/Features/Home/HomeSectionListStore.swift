import Foundation
import Observation

@MainActor
@Observable
final class HomeSectionListStore {
    private(set) var items: [Bookmark] = []
    private(set) var isLoading = false
    private(set) var isLoadingMore = false
    private(set) var errorMessage: String?
    private(set) var nextCursor: String?

    private let route: HomeSectionRoute
    private let client: APIClient
    private var removedIndices: [String: Int] = [:]
    private var pendingInboxItemIDs: Set<String> = []

    init(route: HomeSectionRoute, client: APIClient) {
        self.route = route
        self.client = client
    }

    func reload() async {
        errorMessage = nil
        isLoading = items.isEmpty
        defer { isLoading = false }

        do {
            let response = try await request()
            guard !Task.isCancelled else { return }
            items = response.items
            nextCursor = response.nextCursor
            prefetchImages(in: response.items)
        } catch is CancellationError {
            return
        } catch {
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
            let response = try await request(cursor: nextCursor)
            guard !Task.isCancelled else { return }
            let existingIDs = Set(items.map(\.id))
            items.append(contentsOf: response.items.filter { !existingIDs.contains($0.id) })
            self.nextCursor = response.nextCursor
            prefetchImages(in: response.items)
        } catch is CancellationError {
            return
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func update(_ bookmark: Bookmark) {
        guard let index = items.firstIndex(where: { $0.id == bookmark.id }) else { return }
        if shouldKeep(bookmark) {
            items[index] = bookmark
        } else {
            items.remove(at: index)
        }
    }

    func setBookmarked(_ bookmark: Bookmark, isBookmarked: Bool) {
        let shouldRemain = route == .inbox ? !isBookmarked : isBookmarked
        if shouldRemain {
            guard !items.contains(where: { $0.id == bookmark.id }) else { return }
            let index = min(removedIndices.removeValue(forKey: bookmark.id) ?? 0, items.endIndex)
            items.insert(bookmark, at: index)
        } else if let index = items.firstIndex(where: { $0.id == bookmark.id }) {
            removedIndices[bookmark.id] = index
            items.remove(at: index)
        }
    }

    func bookmarkInboxItem(_ bookmark: Bookmark) async -> Bool {
        await updateInboxItem(
            bookmark,
            request: { try await client.bookmarkItem(id: bookmark.id) },
            errorMessage: "The item couldn’t be bookmarked. Please try again."
        )
    }

    func archiveInboxItem(_ bookmark: Bookmark) async -> Bool {
        await updateInboxItem(
            bookmark,
            request: { try await client.archiveInboxItem(id: bookmark.id) },
            errorMessage: "The item couldn’t be archived. Please try again."
        )
    }

    func dismissError() {
        errorMessage = nil
    }

    private func updateInboxItem(
        _ bookmark: Bookmark,
        request: () async throws -> Void,
        errorMessage: String
    ) async -> Bool {
        guard route == .inbox,
              !pendingInboxItemIDs.contains(bookmark.id),
              let index = items.firstIndex(where: { $0.id == bookmark.id })
        else { return false }

        pendingInboxItemIDs.insert(bookmark.id)
        items.remove(at: index)

        do {
            try await request()
            pendingInboxItemIDs.remove(bookmark.id)
            return true
        } catch is CancellationError {
            restoreInboxItem(bookmark, at: index)
            return false
        } catch {
            restoreInboxItem(bookmark, at: index)
            self.errorMessage = errorMessage
            return false
        }
    }

    private func restoreInboxItem(_ bookmark: Bookmark, at index: Int) {
        pendingInboxItemIDs.remove(bookmark.id)
        guard !items.contains(where: { $0.id == bookmark.id }) else { return }
        items.insert(bookmark, at: min(index, items.endIndex))
    }

    private func request(cursor: String? = nil) async throws -> PaginatedBookmarksResponse {
        switch route {
        case .jumpBackIn:
            return try await client.listOpenedBookmarks(cursor: cursor)
        case .inbox:
            return try await client.listInbox(query: InboxQuery(), cursor: cursor)
        case .quickWins:
            return try await client.listQuickWinBookmarks(cursor: cursor)
        case .recentlySaved:
            return try await client.listBookmarks(query: LibraryQuery(), cursor: cursor)
        case .podcasts:
            return try await client.listBookmarks(
                query: LibraryQuery(contentType: .podcast),
                cursor: cursor
            )
        case .articles:
            return try await client.listBookmarks(
                query: LibraryQuery(contentType: .article),
                cursor: cursor
            )
        case .videos:
            return try await client.listBookmarks(
                query: LibraryQuery(contentType: .video),
                cursor: cursor
            )
        case .collection(let id, _):
            return try await client.listCollectionItems(id: id, cursor: cursor)
        }
    }

    private func shouldKeep(_ bookmark: Bookmark) -> Bool {
        switch route {
        case .collection:
            return bookmark.state == "BOOKMARKED"
        case .inbox:
            return bookmark.state == "INBOX" && !bookmark.isFinished
        default:
            return bookmark.state == "BOOKMARKED" && !bookmark.isFinished
        }
    }

    private func prefetchImages(in bookmarks: [Bookmark]) {
        let urls = bookmarks.flatMap { [$0.thumbnailUrl, $0.creatorImageUrl].compactMap { $0 } }
        AppImagePipeline.prefetch(urls)
    }
}
