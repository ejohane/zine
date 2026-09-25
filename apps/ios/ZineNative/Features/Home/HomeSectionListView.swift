import SwiftUI

struct HomeSectionListView: View {
    let route: HomeSectionRoute
    let client: APIClient
    let onContentChanged: () -> Void
    let onExternalOpen: (Bookmark) -> Void
    let tabReselection: Int

    @State private var store: HomeSectionListStore
    @State private var contentType: ContentType?
    @State private var titleCollapseProgress: CGFloat = 0
    @State private var isVisible = false
    @Namespace private var bookmarkTransition

    init(
        route: HomeSectionRoute,
        client: APIClient,
        inboxCache: InboxCache? = nil,
        initialItems: [Bookmark] = [],
        onContentChanged: @escaping () -> Void = {},
        onExternalOpen: @escaping (Bookmark) -> Void = { _ in },
        tabReselection: Int = 0
    ) {
        self.route = route
        self.client = client
        self.onContentChanged = onContentChanged
        self.onExternalOpen = onExternalOpen
        self.tabReselection = tabReselection
        _store = State(initialValue: HomeSectionListStore(
            route: route,
            client: client,
            inboxCache: inboxCache,
            initialItems: initialItems
        ))
        _contentType = State(initialValue: route.initialContentTypeFilter)
    }

    var body: some View {
        content
            .navigationTitle("")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .principal) {
                    CollapsedListTitle(
                        title: route.title,
                        progress: titleCollapseProgress
                    )
                }
            }
            .contentTypeFilterChrome(background: ZineTheme.surface)
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
                    onBookmarkCommit: { changed, isBookmarked in
                        if isBookmarked {
                            Task { await store.removeCachedInboxItem(id: changed.id) }
                        }
                        onContentChanged()
                    },
                    onExternalOpen: onExternalOpen
                )
                .navigationTransition(
                    .zoom(sourceID: bookmark.id, in: bookmarkTransition)
                )
                .zinePushedDestinationChrome()
            }
            .task(id: contentType) {
                await store.reload(contentType: contentType)
            }
            .alert("Couldn’t update inbox", isPresented: actionErrorBinding) {
                Button("OK", role: .cancel) {
                    store.dismissActionError()
                }
            } message: {
                Text(store.actionErrorMessage ?? "Please try again.")
            }
    }

    private var content: some View {
        ScrollViewReader { proxy in
            List {
                CollapsingListTitle(
                    title: route.title,
                    progress: titleCollapseProgress,
                    background: ZineTheme.surface
                )
                .id(ScrollAnchor.top)

                Section {
                    resultRows
                } header: {
                    ContentTypeFilterBar(
                        selection: filterSelection,
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
                return FilteredListScrollState.collapseProgress(scrollOffset: offset)
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
        static let top = "home-section-list-top"
    }

    private var filterSelection: Binding<ContentType?> {
        Binding(
            get: { contentType },
            set: { selected in
                if route == .inbox { store.selectInboxFilter(selected) }
                contentType = selected
            }
        )
    }

    private func handleTabReselection(using proxy: ScrollViewProxy) {
        FilteredListTabAction.perform(
            isVisible: isVisible,
            collapseProgress: titleCollapseProgress,
            hasActiveFilter: contentType != nil,
            proxy: proxy,
            topID: ScrollAnchor.top,
            resetFilter: { filterSelection.wrappedValue = nil }
        )
    }

    @ViewBuilder
    private var resultRows: some View {
        if route == .inbox, store.isResolvingInboxFilter, store.items.isEmpty {
            ProgressView("Checking inbox…")
                .frame(maxWidth: .infinity, minHeight: 80)
                .listRowBackground(ZineTheme.surface)
                .listRowSeparator(.hidden)
        } else if store.isLoading && store.items.isEmpty && route != .inbox {
            FilteredListLoadingRow(
                label: "Loading \(route.title.lowercased())…",
                background: ZineTheme.surface
            )
        } else if let error = store.errorMessage, store.items.isEmpty {
            ContentUnavailableView {
                Label("Section unavailable", systemImage: "exclamationmark.triangle")
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
                contentType.map { "No \($0.title.lowercased())s" } ?? "Nothing here yet",
                systemImage: contentType?.systemImage ?? "rectangle.stack",
                description: Text(
                    contentType == nil
                        ? "Items for this section will appear here."
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
                .swipeActions(edge: .leading, allowsFullSwipe: true) {
                    if route == .inbox {
                        Button {
                            bookmarkInboxItem(bookmark)
                        } label: {
                            Label("Bookmark", systemImage: "bookmark.fill")
                        }
                        .tint(.green)
                        .accessibilityLabel("Bookmark inbox item")
                    }
                }
                .swipeActions(edge: .trailing, allowsFullSwipe: true) {
                    if route == .inbox {
                        Button(role: .destructive) {
                            archiveInboxItem(bookmark)
                        } label: {
                            Label("Archive", systemImage: "archivebox.fill")
                        }
                        .tint(.red)
                        .accessibilityLabel("Archive inbox item")
                    }
                }
                .task {
                    await store.loadMoreIfNeeded(current: bookmark)
                }
            }
        }
    }

    private var actionErrorBinding: Binding<Bool> {
        Binding(
            get: { store.actionErrorMessage != nil },
            set: { if !$0 { store.dismissActionError() } }
        )
    }

    private func bookmarkInboxItem(_ bookmark: Bookmark) {
        Task {
            if await store.bookmarkInboxItem(bookmark) {
                onContentChanged()
            }
        }
    }

    private func archiveInboxItem(_ bookmark: Bookmark) {
        Task {
            if await store.archiveInboxItem(bookmark) {
                onContentChanged()
            }
        }
    }
}
