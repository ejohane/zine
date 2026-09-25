import Foundation
import Observation

@MainActor
@Observable
final class HomeSectionListStore {
    private struct InboxPage {
        var items: [Bookmark]
        var nextCursor: String?
    }

    private(set) var items: [Bookmark] = []
    private(set) var isLoading = false
    private(set) var isLoadingMore = false
    private(set) var isResolvingInboxFilter = false
    private(set) var errorMessage: String?
    private(set) var actionErrorMessage: String?
    private(set) var nextCursor: String?

    private let route: HomeSectionRoute
    private let client: APIClient
    private let inboxCache: InboxCache?
    private let initialInboxItems: [Bookmark]
    private var activeContentType: ContentType?
    private var inboxPages: [String: InboxPage] = [:]
    private var didHydrateInboxCache = false
    private var removedIndices: [String: Int] = [:]
    private var pendingInboxItemIDs: Set<String> = []
    private var committedInboxItemIDs: Set<String> = []

    init(
        route: HomeSectionRoute,
        client: APIClient,
        inboxCache: InboxCache? = nil,
        initialItems: [Bookmark] = []
    ) {
        self.route = route
        self.client = client
        self.inboxCache = inboxCache
        initialInboxItems = route == .inbox ? initialItems : []
        items = initialInboxItems
        isResolvingInboxFilter = route == .inbox && initialItems.isEmpty
    }

    func selectInboxFilter(_ contentType: ContentType?) {
        guard route == .inbox, activeContentType != contentType else { return }

        let visibleAllItems = activeContentType == nil ? items : initialInboxItems
        activeContentType = contentType
        errorMessage = nil
        isLoading = true
        isLoadingMore = false

        let allItems: [Bookmark]
        if let cachedAllItems = inboxPages[InboxQuery().cacheKey]?.items,
           !cachedAllItems.isEmpty {
            allItems = cachedAllItems
        } else {
            allItems = visibleAllItems
        }
        let previewItems = visibleInboxItems(allItems).filter {
            contentType == nil || $0.contentType == contentType
        }

        if let page = inboxPages[InboxQuery(contentType: contentType).cacheKey],
           !visibleInboxItems(page.items).isEmpty || previewItems.isEmpty {
            items = visibleInboxItems(page.items)
            nextCursor = page.nextCursor
            isResolvingInboxFilter = false
        } else {
            items = previewItems
            nextCursor = nil
            isResolvingInboxFilter = true
        }
    }

    func reload(contentType: ContentType? = nil) async {
        let filterChanged = activeContentType != contentType
        errorMessage = nil

        if route == .inbox {
            if filterChanged { selectInboxFilter(contentType) }
            isLoading = true
            await hydrateInboxCacheIfNeeded(contentType: contentType)
            guard !Task.isCancelled, activeContentType == contentType else { return }
        } else if filterChanged {
            activeContentType = contentType
            items = []
            nextCursor = nil
            isLoadingMore = false
        }

        isLoading = route == .inbox || items.isEmpty
        defer {
            if activeContentType == contentType {
                isLoading = false
            }
        }

        do {
            let response = try await request(contentType: contentType)
            guard !Task.isCancelled, activeContentType == contentType else { return }
            items = route == .inbox ? visibleInboxItems(response.items) : response.items
            nextCursor = response.nextCursor
            if route == .inbox {
                inboxPages[InboxQuery(contentType: contentType).cacheKey] = InboxPage(
                    items: items,
                    nextCursor: response.nextCursor
                )
                isResolvingInboxFilter = false
                await inboxCache?.saveFirstPage(
                    items: items,
                    nextCursor: response.nextCursor,
                    query: InboxQuery(contentType: contentType)
                )
            }
            prefetchImages(in: response.items)
        } catch is CancellationError {
            return
        } catch {
            if route == .inbox { isResolvingInboxFilter = false }
            errorMessage = error.localizedDescription
        }
    }

    private func hydrateInboxCacheIfNeeded(contentType: ContentType?) async {
        guard !didHydrateInboxCache else { return }
        let snapshots = await inboxCache?.loadAll() ?? [:]
        guard !Task.isCancelled, activeContentType == contentType else { return }

        for (key, snapshot) in snapshots where inboxPages[key] == nil {
            inboxPages[key] = InboxPage(items: snapshot.items, nextCursor: snapshot.nextCursor)
        }
        didHydrateInboxCache = true

        if let page = inboxPages[InboxQuery(contentType: contentType).cacheKey] {
            let cachedItems = visibleInboxItems(page.items)
            if !cachedItems.isEmpty || items.isEmpty {
                items = cachedItems
                nextCursor = page.nextCursor
                isResolvingInboxFilter = false
            }
        }
    }

    private func visibleInboxItems(_ bookmarks: [Bookmark]) -> [Bookmark] {
        bookmarks.filter {
            !pendingInboxItemIDs.contains($0.id) && !committedInboxItemIDs.contains($0.id)
        }
    }

    func loadMoreIfNeeded(current item: Bookmark) async {
        guard item.id == items.last?.id,
              let nextCursor,
              !isLoading,
              !isLoadingMore
        else { return }

        isLoadingMore = true
        let requestedContentType = activeContentType
        defer {
            if activeContentType == requestedContentType {
                isLoadingMore = false
            }
        }

        do {
            let response = try await request(
                contentType: requestedContentType,
                cursor: nextCursor
            )
            guard !Task.isCancelled, activeContentType == requestedContentType else { return }
            let existingIDs = Set(items.map(\.id))
            items.append(contentsOf: response.items.filter {
                !existingIDs.contains($0.id)
                    && (route != .inbox || (
                        !pendingInboxItemIDs.contains($0.id)
                            && !committedInboxItemIDs.contains($0.id)
                    ))
            })
            self.nextCursor = response.nextCursor
            if route == .inbox {
                inboxPages[InboxQuery(contentType: requestedContentType).cacheKey] = InboxPage(
                    items: items,
                    nextCursor: response.nextCursor
                )
            }
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
            if route == .inbox {
                for key in Array(inboxPages.keys) {
                    if let pageIndex = inboxPages[key]?.items.firstIndex(where: { $0.id == bookmark.id }) {
                        inboxPages[key]?.items[pageIndex] = bookmark
                    }
                }
            }
        } else {
            items.remove(at: index)
            if route == .inbox { removeInboxItemFromPages(id: bookmark.id) }
        }
    }

    func setBookmarked(_ bookmark: Bookmark, isBookmarked: Bool) {
        if route == .inbox {
            if isBookmarked {
                pendingInboxItemIDs.insert(bookmark.id)
            } else {
                pendingInboxItemIDs.remove(bookmark.id)
            }
        }
        let matchesFilter = activeContentType == nil || bookmark.contentType == activeContentType
        let shouldRemain = (route == .inbox ? !isBookmarked : isBookmarked) && matchesFilter
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

    func dismissActionError() {
        actionErrorMessage = nil
    }

    func removeCachedInboxItem(id: String) async {
        guard route == .inbox else { return }
        committedInboxItemIDs.insert(id)
        pendingInboxItemIDs.remove(id)
        removeInboxItemFromPages(id: id)
        await inboxCache?.removeFromAllQueries(id: id)
    }

    private func removeInboxItemFromPages(id: String) {
        for key in Array(inboxPages.keys) {
            inboxPages[key]?.items.removeAll { $0.id == id }
        }
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
            committedInboxItemIDs.insert(bookmark.id)
            removeInboxItemFromPages(id: bookmark.id)
            await inboxCache?.removeFromAllQueries(id: bookmark.id)
            pendingInboxItemIDs.remove(bookmark.id)
            return true
        } catch is CancellationError {
            restoreInboxItem(bookmark, at: index)
            return false
        } catch {
            restoreInboxItem(bookmark, at: index)
            actionErrorMessage = errorMessage
            return false
        }
    }

    private func restoreInboxItem(_ bookmark: Bookmark, at index: Int) {
        pendingInboxItemIDs.remove(bookmark.id)
        guard activeContentType == nil || bookmark.contentType == activeContentType else { return }
        guard !items.contains(where: { $0.id == bookmark.id }) else { return }
        items.insert(bookmark, at: min(index, items.endIndex))
    }

    private func request(
        contentType: ContentType?,
        cursor: String? = nil
    ) async throws -> PaginatedBookmarksResponse {
        switch route {
        case .jumpBackIn:
            return try await client.listOpenedBookmarks(
                contentType: contentType,
                cursor: cursor
            )
        case .inbox:
            return try await client.listInbox(
                query: InboxQuery(contentType: contentType),
                cursor: cursor
            )
        case .quickWins:
            return try await client.listQuickWinBookmarks(
                contentType: contentType,
                cursor: cursor
            )
        case .recentlySaved, .podcasts, .articles, .videos:
            return try await client.listBookmarks(
                query: LibraryQuery(contentType: contentType),
                cursor: cursor
            )
        case .collection(let id, _):
            return try await client.listCollectionItems(
                id: id,
                contentType: contentType,
                cursor: cursor
            )
        }
    }

    private func shouldKeep(_ bookmark: Bookmark) -> Bool {
        guard activeContentType == nil || bookmark.contentType == activeContentType else {
            return false
        }

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
