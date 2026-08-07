import SwiftUI

struct JumpBackInListView: View {
    let client: APIClient
    let onContentChanged: () -> Void
    let onExternalOpen: (Bookmark) -> Void

    @State private var store: JumpBackInListStore
    @State private var contentType: ContentType?
    @State private var titleCollapseProgress: CGFloat = 0
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
            .navigationTitle("")
            .navigationBarTitleDisplayMode(.inline)
            .solidContentTypeFilterChrome()
            .toolbar(.visible, for: .navigationBar)
            .toolbar {
                ToolbarItem(placement: .principal) {
                    CollapsedListTitle(
                        title: "Jump Back In",
                        progress: titleCollapseProgress
                    )
                }
            }
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
            .task(id: contentType) {
                await store.reload(contentType: contentType)
            }
    }

    private var content: some View {
        List {
            CollapsingListTitle(
                title: "Jump Back In",
                progress: titleCollapseProgress
            )

            Section {
                resultRows
            } header: {
                ContentTypeFilterBar(selection: $contentType)
                    .textCase(nil)
                    .listRowInsets(EdgeInsets())
            }
        }
        .listStyle(.plain)
        .scrollContentBackground(.hidden)
        .background(ZineTheme.canvas)
        .onScrollGeometryChange(for: CGFloat.self) { geometry in
            let offset = geometry.contentOffset.y + geometry.contentInsets.top
            return CollapsingListTitle.collapseProgress(scrollOffset: offset)
        } action: { _, progress in
            titleCollapseProgress = progress
        }
        .refreshable {
            await store.reload(contentType: contentType)
        }
        .overlay(alignment: .bottom) {
            if store.isLoadingMore {
                ProgressView()
                    .padding()
            }
        }
        .foregroundStyle(ZineTheme.primaryText)
    }

    @ViewBuilder
    private var resultRows: some View {
        if store.isLoading && store.items.isEmpty {
            ProgressView("Loading history…")
                .frame(maxWidth: .infinity, minHeight: 260)
                .listRowSeparator(.hidden)
        } else if let error = store.errorMessage, store.items.isEmpty {
            ContentUnavailableView {
                Label("History unavailable", systemImage: "exclamationmark.triangle")
            } description: {
                Text(error)
            } actions: {
                Button("Try again") {
                    Task { await store.reload(contentType: contentType) }
                }
            }
            .frame(maxWidth: .infinity, minHeight: 320)
            .listRowSeparator(.hidden)
        } else if store.items.isEmpty {
            ContentUnavailableView(
                contentType.map { "No opened \($0.title.lowercased())s" } ?? "No opened bookmarks",
                systemImage: contentType?.systemImage ?? "clock.arrow.circlepath",
                description: Text(
                    contentType == nil
                        ? "Bookmarks you open will appear here."
                        : "Try another format or return to All."
                )
            )
            .frame(maxWidth: .infinity, minHeight: 320)
            .listRowSeparator(.hidden)
        } else {
            ForEach(store.items) { bookmark in
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
        }
    }
}
