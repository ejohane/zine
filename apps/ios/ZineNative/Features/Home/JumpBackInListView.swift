import SwiftUI

struct JumpBackInListView: View {
    let client: APIClient
    let onContentChanged: () -> Void
    let onExternalOpen: (Bookmark) -> Void
    let tabReselection: Int

    @State private var store: JumpBackInListStore
    @State private var contentType: ContentType?
    @State private var titleCollapseProgress: CGFloat = 0
    @State private var isVisible = false
    @Namespace private var bookmarkTransition

    init(
        client: APIClient,
        onContentChanged: @escaping () -> Void = {},
        onExternalOpen: @escaping (Bookmark) -> Void = { _ in },
        tabReselection: Int = 0
    ) {
        self.client = client
        self.onContentChanged = onContentChanged
        self.onExternalOpen = onExternalOpen
        self.tabReselection = tabReselection
        _store = State(initialValue: JumpBackInListStore(client: client))
    }

    var body: some View {
        content
            .navigationTitle("")
            .navigationBarTitleDisplayMode(.inline)
            .contentTypeFilterChrome(background: ZineTheme.surface)
            .toolbarBackground(ZineTheme.surface, for: .tabBar)
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
        ScrollViewReader { proxy in
            List {
                CollapsingListTitle(
                    title: "Jump Back In",
                    progress: titleCollapseProgress,
                    background: ZineTheme.surface
                )
                .id(ScrollAnchor.top)

                Section {
                    resultRows
                } header: {
                    ContentTypeFilterBar(
                        selection: $contentType,
                        background: ZineTheme.surface
                    )
                        .textCase(nil)
                        .listRowInsets(EdgeInsets())
                }
            }
            .listStyle(.plain)
            .scrollContentBackground(.hidden)
            .background(ZineTheme.surface)
            .onScrollGeometryChange(for: CGFloat.self) { geometry in
                let offset = geometry.contentOffset.y + geometry.contentInsets.top
                return CollapsingListTitle.collapseProgress(scrollOffset: offset)
            } action: { _, progress in
                titleCollapseProgress = progress
            }
            .onChange(of: tabReselection) {
                handleTabReselection(using: proxy)
            }
            .onAppear { isVisible = true }
            .onDisappear { isVisible = false }
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
    }

    private enum ScrollAnchor {
        static let top = "jump-back-in-list-top"
    }

    private func handleTabReselection(using proxy: ScrollViewProxy) {
        FilteredListTabAction.perform(
            isVisible: isVisible,
            collapseProgress: titleCollapseProgress,
            hasActiveFilter: contentType != nil,
            proxy: proxy,
            topID: ScrollAnchor.top,
            resetFilter: { contentType = nil }
        )
    }

    @ViewBuilder
    private var resultRows: some View {
        if store.isLoading && store.items.isEmpty {
            FilteredListLoadingRow(
                label: "Loading history…",
                background: ZineTheme.surface
            )
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
            .listRowBackground(ZineTheme.surface)
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
            .listRowBackground(ZineTheme.surface)
            .listRowSeparator(.hidden)
        } else {
            ForEach(store.items) { bookmark in
                NavigationLink(value: bookmark) {
                    BookmarkRow(bookmark: bookmark)
                }
                .listRowInsets(EdgeInsets(top: 6, leading: 18, bottom: 6, trailing: 14))
                .listRowBackground(ZineTheme.surface)
                .listRowSeparator(.hidden)
                .matchedTransitionSource(id: bookmark.id, in: bookmarkTransition)
                .task {
                    await store.loadMoreIfNeeded(current: bookmark)
                }
            }
        }
    }
}
