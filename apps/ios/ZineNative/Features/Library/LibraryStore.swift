import Foundation
import Observation

@MainActor
@Observable
final class LibraryStore {
    private(set) var items: [Bookmark] = []
    private(set) var isLoading = false
    private(set) var isLoadingMore = false
    private(set) var errorMessage: String?
    private(set) var nextCursor: String?

    private let client: APIClient
    private var activeQuery = LibraryQuery()

    init(client: APIClient) {
        self.client = client
    }

    func reload(query: LibraryQuery) async {
        activeQuery = query
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }

        do {
            let response = try await client.listBookmarks(query: query)
            guard !Task.isCancelled, activeQuery == query else { return }
            items = response.items
            nextCursor = response.nextCursor
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
            let response = try await client.listBookmarks(
                query: activeQuery,
                cursor: nextCursor
            )
            guard !Task.isCancelled else { return }
            let existingIDs = Set(items.map(\.id))
            items.append(contentsOf: response.items.filter { !existingIDs.contains($0.id) })
            self.nextCursor = response.nextCursor
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
        }
    }
}
