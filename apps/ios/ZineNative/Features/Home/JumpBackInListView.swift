import SwiftUI

struct JumpBackInListView: View {
    let client: APIClient
    let onContentChanged: () -> Void
    let onExternalOpen: (Bookmark) -> Void

    @State private var store: JumpBackInListStore
    @Namespace private var bookmarkTransition

    init(
        client: APIClient,
        onContentChanged: @escaping () -> Void = {},
        onExternalOpen: @escaping (Bookmark) -> Void = { _ in }
    ) {
        self.client = client
        self.onContentChanged = onContentChanged
        self.onExternalOpen = onExternalOpen
        _store = State(initialValue: JumpBackInListStore(client: client))
    }

    var body: some View {
        content
            .navigationTitle("Jump Back In")
            .navigationBarTitleDisplayMode(.large)
            .navigationDestination(for: Bookmark.self) { bookmark in
                BookmarkDetailView(
                    bookmark: bookmark,
                    client: client,
                    onUpdate: { updated in
                        store.update(updated)
                        onContentChanged()
                    },
                    onBookmarkChange: { changed, isBookmarked, phase in
                        store.setBookmarked(changed, isBookmarked: isBookmarked, phase: phase)
                        onContentChanged()
                    },
                    onBookmarkCommit: { _, _ in onContentChanged() },
                    onExternalOpen: { opened in
                        store.promote(opened)
                        onExternalOpen(opened)
                    }
                )
                .navigationTransition(
                    .zoom(sourceID: bookmark.id, in: bookmarkTransition)
                )
            }
            .task {
                await store.reload()
            }
    }

    @ViewBuilder
    private var content: some View {
        if store.isLoading && store.items.isEmpty {
            ProgressView("Loading history…")
        } else if let error = store.errorMessage, store.items.isEmpty {
            ContentUnavailableView {
                Label("History unavailable", systemImage: "exclamationmark.triangle")
            } description: {
                Text(error)
            } actions: {
                Button("Try again") {
                    Task { await store.reload() }
                }
            }
        } else if store.items.isEmpty {
            ContentUnavailableView(
                "No opened bookmarks",
                systemImage: "clock.arrow.circlepath",
                description: Text("Bookmarks you open will appear here.")
            )
        } else {
            List(store.items) { bookmark in
                NavigationLink(value: bookmark) {
                    BookmarkRow(bookmark: bookmark)
                }
                .listRowInsets(EdgeInsets(top: 6, leading: 18, bottom: 6, trailing: 14))
                .listRowSeparator(.hidden)
                .matchedTransitionSource(id: bookmark.id, in: bookmarkTransition)
                .task {
                    await store.loadMoreIfNeeded(current: bookmark)
                }
            }
            .listStyle(.plain)
            .refreshable {
                await store.reload()
            }
            .overlay(alignment: .bottom) {
                if store.isLoadingMore {
                    ProgressView()
                        .padding()
                }
            }
        }
    }
}
