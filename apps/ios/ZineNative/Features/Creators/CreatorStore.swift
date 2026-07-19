import Foundation
import Observation

@MainActor
@Observable
final class CreatorStore {
    private(set) var profile: CreatorProfile?
    private(set) var bookmarks: [Bookmark] = []
    private(set) var completedBookmarks: [Bookmark] = []
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

        do {
            let response = try await client.listCreatorBookmarks(
                creatorId: creatorId,
                isFinished: false
            )
            guard !Task.isCancelled else { return }
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

        do {
            let response = try await client.listCreatorBookmarks(
                creatorId: creatorId,
                isFinished: true
            )
            guard !Task.isCancelled else { return }
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
