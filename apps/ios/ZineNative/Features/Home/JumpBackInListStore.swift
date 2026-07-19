import Foundation
import Observation

@MainActor
@Observable
final class JumpBackInListStore {
    private(set) var items: [Bookmark] = []
    private(set) var isLoading = false
    private(set) var isLoadingMore = false
    private(set) var errorMessage: String?
    private(set) var nextCursor: String?

    private let client: APIClient
    private var removedIndices: [String: Int] = [:]

    init(client: APIClient) {
        self.client = client
    }

    func reload() async {
        errorMessage = nil
        isLoading = items.isEmpty
        defer { isLoading = false }

        do {
            let response = try await client.listOpenedBookmarks()
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
            let response = try await client.listOpenedBookmarks(cursor: nextCursor)
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
        if bookmark.isFinished || bookmark.state != "BOOKMARKED" {
            items.remove(at: index)
        } else {
            items[index] = bookmark
        }
    }

    func setBookmarked(_ bookmark: Bookmark, isBookmarked: Bool, phase: BookmarkChangePhase) {
        if isBookmarked {
            guard !items.contains(where: { $0.id == bookmark.id }) else { return }
            let index = min(removedIndices.removeValue(forKey: bookmark.id) ?? 0, items.endIndex)
            items.insert(bookmark, at: index)
        } else if let index = items.firstIndex(where: { $0.id == bookmark.id }) {
            removedIndices[bookmark.id] = index
            items.remove(at: index)
        } else if phase == .rollback {
            let index = min(removedIndices.removeValue(forKey: bookmark.id) ?? 0, items.endIndex)
            items.insert(bookmark, at: index)
        }
    }

    func promote(_ bookmark: Bookmark) {
        guard let index = items.firstIndex(where: { $0.id == bookmark.id }) else { return }
        let item = items.remove(at: index)
        items.insert(item, at: 0)
    }

    private func prefetchImages(in bookmarks: [Bookmark]) {
        let urls = bookmarks.flatMap { [$0.thumbnailUrl, $0.creatorImageUrl].compactMap { $0 } }
        AppImagePipeline.prefetch(urls)
    }
}
