import Foundation
import Observation

@MainActor
@Observable
final class CreatorStore {
    private(set) var profile: CreatorProfile?
    private var bookmarkMembership = BookmarkMembershipSnapshot()
    private var completedMembership = BookmarkMembershipSnapshot()
    private var storedBookmarks: [Bookmark] = []
    private(set) var bookmarks: [Bookmark] {
        get { visibleBookmarks(finished: false) }
        set { storedBookmarks = retainingMutatedRows(storedBookmarks, replacingWith: newValue) }
    }
    private var storedCompletedBookmarks: [Bookmark] = []
    private(set) var completedBookmarks: [Bookmark] {
        get { visibleBookmarks(finished: true) }
        set { storedCompletedBookmarks = retainingMutatedRows(storedCompletedBookmarks, replacingWith: newValue) }
    }

    private func retainingMutatedRows(_ old: [Bookmark], replacingWith new: [Bookmark]) -> [Bookmark] {
        let receivedIDs = Set(new.map(\.id))
        return new + old.filter { client.bookmarkState.changedIDs.contains($0.id) && !receivedIDs.contains($0.id) }
    }

    private func visibleBookmarks(finished: Bool) -> [Bookmark] {
        var seen = Set<String>()
        let snapshot = finished ? completedMembership : bookmarkMembership
        let candidates = (storedBookmarks + storedCompletedBookmarks).filter {
            snapshot.includes($0.id, state: client.bookmarkState)
        }
        return client.bookmarkState.overlay(candidates).filter {
            seen.insert($0.id).inserted && $0.state == "BOOKMARKED" && $0.isFinished == finished
        }
    }

    private(set) var latestContent: [CreatorContentItem] = []
    private(set) var latestProvider: Provider?
    private(set) var latestReason: String?
    private(set) var isLoading = false
    private(set) var isLoadingBookmarks = false
    private(set) var isLoadingCompletedBookmarks = false
    private(set) var isLoadingMore = false
    private(set) var isLoadingMoreCompleted = false
    private(set) var isLoadingLatest = false
    private(set) var profileErrorMessage: String?
    private(set) var bookmarksErrorMessage: String?
    private(set) var completedBookmarksErrorMessage: String?
    private(set) var latestErrorMessage: String?
    private(set) var nextCursor: String?
    private(set) var completedNextCursor: String?

    let creatorId: String
    private let client: APIClient

    init(creatorId: String, client: APIClient) {
        self.creatorId = creatorId
        self.client = client
    }

    func reload() async {
        profileErrorMessage = nil
        bookmarksErrorMessage = nil
        completedBookmarksErrorMessage = nil
        latestErrorMessage = nil
        isLoading = profile == nil && bookmarks.isEmpty && completedBookmarks.isEmpty

        async let profileLoad: Void = loadProfile()
        async let bookmarksLoad: Void = loadBookmarks(reset: true)
        async let completedBookmarksLoad: Void = loadCompletedBookmarks(reset: true)
        async let latestLoad: Void = loadLatestContent()
        _ = await (profileLoad, bookmarksLoad, completedBookmarksLoad, latestLoad)

        isLoading = false
    }

    func loadMoreIfNeeded(current bookmark: Bookmark) async {
        guard bookmark.id == bookmarks.last?.id,
            let nextCursor,
            !isLoadingBookmarks,
            !isLoadingMore
        else { return }

        isLoadingMore = true
        defer { isLoadingMore = false }

        do {
            let response = try await client.listCreatorBookmarks(
                creatorId: creatorId,
                cursor: nextCursor,
                isFinished: false
            )
            guard !Task.isCancelled else { return }
            bookmarkMembership.includeReturned(response.items.map(\.id))
            let existingIDs = Set(bookmarks.map(\.id))
            bookmarks.append(contentsOf: response.items.filter { !existingIDs.contains($0.id) })
            self.nextCursor = response.nextCursor
        } catch is CancellationError {
            return
        } catch {
            bookmarksErrorMessage = error.localizedDescription
        }
    }

    func loadMoreCompletedIfNeeded(current bookmark: Bookmark) async {
        guard bookmark.id == completedBookmarks.last?.id,
            let completedNextCursor,
            !isLoadingCompletedBookmarks,
            !isLoadingMoreCompleted
        else { return }

        isLoadingMoreCompleted = true
        defer { isLoadingMoreCompleted = false }

        do {
            let response = try await client.listCreatorBookmarks(
                creatorId: creatorId,
                cursor: completedNextCursor,
                isFinished: true
            )
            guard !Task.isCancelled else { return }
            completedMembership.includeReturned(response.items.map(\.id))
            let existingIDs = Set(completedBookmarks.map(\.id))
            completedBookmarks.append(
                contentsOf: response.items.filter { !existingIDs.contains($0.id) }
            )
            self.completedNextCursor = response.nextCursor
        } catch is CancellationError {
            return
        } catch {
            completedBookmarksErrorMessage = error.localizedDescription
        }
    }

    private func loadProfile() async {
        do {
            profile = try await client.getCreator(id: creatorId).creator
        } catch is CancellationError {
            return
        } catch {
            profileErrorMessage = error.localizedDescription
        }
    }

    private func loadBookmarks(reset: Bool) async {
        isLoadingBookmarks = reset && bookmarks.isEmpty
        defer { isLoadingBookmarks = false }

        let readRevision = client.bookmarkState.revision
        do {
            let response = try await client.listCreatorBookmarks(
                creatorId: creatorId,
                isFinished: false
            )
            let queuedIDs = await client.pendingBookmarkMutationIDs()
            guard !Task.isCancelled else { return }
            bookmarkMembership.accept(previousIDs: (storedBookmarks + storedCompletedBookmarks).map(\.id), receivedIDs: response.items.map(\.id), startedAt: readRevision, queuedIDs: queuedIDs)
            bookmarks = response.items
            nextCursor = response.nextCursor
        } catch is CancellationError {
            return
        } catch {
            bookmarksErrorMessage = error.localizedDescription
        }
    }

    private func loadCompletedBookmarks(reset: Bool) async {
        isLoadingCompletedBookmarks = reset && completedBookmarks.isEmpty
        defer { isLoadingCompletedBookmarks = false }

        let readRevision = client.bookmarkState.revision
        do {
            let response = try await client.listCreatorBookmarks(
                creatorId: creatorId,
                isFinished: true
            )
            let queuedIDs = await client.pendingBookmarkMutationIDs()
            guard !Task.isCancelled else { return }
            completedMembership.accept(previousIDs: (storedBookmarks + storedCompletedBookmarks).map(\.id), receivedIDs: response.items.map(\.id), startedAt: readRevision, queuedIDs: queuedIDs)
            completedBookmarks = response.items
            completedNextCursor = response.nextCursor
        } catch is CancellationError {
            return
        } catch {
            completedBookmarksErrorMessage = error.localizedDescription
        }
    }

    private func loadLatestContent() async {
        isLoadingLatest = latestContent.isEmpty
        defer { isLoadingLatest = false }

        do {
            let response = try await client.getCreatorLatestContent(id: creatorId)
            guard !Task.isCancelled else { return }
            latestContent = response.items
            latestProvider = response.provider
            latestReason = response.reason
        } catch is CancellationError {
            return
        } catch {
            latestErrorMessage = error.localizedDescription
        }
    }
}
