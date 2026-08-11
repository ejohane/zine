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
        onContentChanged: @escaping () -> Void = {},
        onExternalOpen: @escaping (Bookmark) -> Void = { _ in },
        tabReselection: Int = 0
    ) {
        self.route = route
        self.client = client
        self.onContentChanged = onContentChanged
        self.onExternalOpen = onExternalOpen
        self.tabReselection = tabReselection
        _store = State(initialValue: HomeSectionListStore(route: route, client: client))
        _contentType = State(initialValue: route.initialContentTypeFilter)
    }

    var body: some View {
        content
            .navigationTitle("")
            .navigationBarTitleDisplayMode(.inline)
            .contentTypeFilterChrome()
            .toolbar(.visible, for: .navigationBar)
            .toolbar {
                ToolbarItem(placement: .principal) {
                    CollapsedListTitle(
                        title: route.title,
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
            .task(id: contentType) {
                await store.reload(contentType: contentType)
            }
            .alert("Couldn’t update inbox", isPresented: actionErrorBinding) {
                Button("OK", role: .cancel) {
                    store.dismissError()
                }
            } message: {
                Text(store.errorMessage ?? "Please try again.")
            }
    }

    private var content: some View {
        ScrollViewReader { proxy in
            List {
                CollapsingListTitle(
                    title: route.title,
                    progress: titleCollapseProgress
                )
                .id(ScrollAnchor.top)

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
            ProgressView("Loading \(route.title.lowercased())…")
                .frame(maxWidth: .infinity, minHeight: 260)
                .listRowSeparator(.hidden)
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
            .listRowSeparator(.hidden)
        } else {
            ForEach(store.items) { bookmark in
                NavigationLink(value: bookmark) {
                    BookmarkRow(bookmark: bookmark)
                }
                .listRowInsets(EdgeInsets(top: 6, leading: 18, bottom: 6, trailing: 14))
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
            get: { store.errorMessage != nil && !store.items.isEmpty },
            set: { if !$0 { store.dismissError() } }
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
