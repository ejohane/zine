import SwiftUI

struct HomeSectionListView: View {
    let route: HomeSectionRoute
    let client: APIClient
    let onContentChanged: () -> Void
    let onExternalOpen: (Bookmark) -> Void

    @State private var store: HomeSectionListStore
    @Namespace private var bookmarkTransition

    init(
        route: HomeSectionRoute,
        client: APIClient,
        onContentChanged: @escaping () -> Void = {},
        onExternalOpen: @escaping (Bookmark) -> Void = { _ in }
    ) {
        self.route = route
        self.client = client
        self.onContentChanged = onContentChanged
        self.onExternalOpen = onExternalOpen
        _store = State(initialValue: HomeSectionListStore(route: route, client: client))
    }

    var body: some View {
        content
            .navigationTitle(route.title)
            .navigationBarTitleDisplayMode(.large)
            .navigationDestination(for: Bookmark.self) { bookmark in
                BookmarkDetailView(
                    bookmark: bookmark,
                    client: client,
                    onUpdate: { updated in
                        store.update(updated)
                        onContentChanged()
                    },
                    onBookmarkChange: { changed, isBookmarked, _ in
                        store.setBookmarked(changed, isBookmarked: isBookmarked)
                        onContentChanged()
                    },
                    onBookmarkCommit: { _, _ in onContentChanged() },
                    onExternalOpen: onExternalOpen
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
            ProgressView("Loading \(route.title.lowercased())…")
        } else if let error = store.errorMessage, store.items.isEmpty {
            ContentUnavailableView {
                Label("Section unavailable", systemImage: "exclamationmark.triangle")
            } description: {
                Text(error)
            } actions: {
                Button("Try again") {
                    Task { await store.reload() }
                }
            }
        } else if store.items.isEmpty {
            ContentUnavailableView(
                "Nothing here yet",
                systemImage: "rectangle.stack",
                description: Text("Items for this section will appear here.")
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
