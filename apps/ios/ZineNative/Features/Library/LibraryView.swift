import SwiftUI

struct LibraryView: View {
    let client: APIClient
    let searchText: Binding<String>?
    let refreshRevision: Int
    let onContentChanged: () -> Void
    let onExternalOpen: (Bookmark) -> Void
    let tabReselection: Int
    let onTitleCollapseProgressChanged: (CGFloat) -> Void
    let transitionNamespace: Namespace.ID

    @State private var store: LibraryStore
    @State private var showsFinished = false
    @State private var provider: Provider?
    @State private var contentType: ContentType?
    @State private var titleCollapseProgress: CGFloat = 0
    @State private var isVisible = false
    @Environment(\.zineTabNavigationActions) private var navigation

    init(
        client: APIClient,
        cache: LibraryCache,
        searchText: Binding<String>? = nil,
        refreshRevision: Int = 0,
        onContentChanged: @escaping () -> Void = {},
        onExternalOpen: @escaping (Bookmark) -> Void = { _ in },
        tabReselection: Int = 0,
        onTitleCollapseProgressChanged: @escaping (CGFloat) -> Void = { _ in },
        transitionNamespace: Namespace.ID
    ) {
        self.client = client
        self.searchText = searchText
        self.refreshRevision = refreshRevision
        self.onContentChanged = onContentChanged
        self.onExternalOpen = onExternalOpen
        self.tabReselection = tabReselection
        self.onTitleCollapseProgressChanged = onTitleCollapseProgressChanged
        self.transitionNamespace = transitionNamespace
        _store = State(initialValue: LibraryStore(
            client: client,
            cache: cache,
            onContentChanged: onContentChanged
        ))
    }

    private var search: String {
        searchText?.wrappedValue ?? ""
    }

    private var isSearchMode: Bool {
        searchText != nil
    }

    private var query: LibraryQuery {
        LibraryQuery(
            search: search,
            isFinished: showsFinished,
            provider: provider,
            contentType: contentType
        )
    }

    var body: some View {
        content
            .navigationTitle(isSearchMode ? "Search" : "")
            .navigationBarTitleDisplayMode(.inline)
            .contentTypeFilterChrome()
            .toolbar(.visible, for: .navigationBar)
            .toolbar {
                if isSearchMode {
                    ToolbarItem(placement: .topBarLeading) {
                        filterMenu
                    }
                }
            }
            .zineScreenChrome()
            .task(id: LibraryReloadKey(query: query, revision: refreshRevision)) {
                if isSearchMode && search.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                    store.reset()
                    return
                }
                if !search.isEmpty {
                    try? await Task.sleep(for: .milliseconds(250))
                }
                guard !Task.isCancelled else { return }
                await store.reload(query: query)
            }
            .alert("Couldn’t update bookmark", isPresented: actionErrorBinding) {
                Button("OK", role: .cancel) {
                    store.dismissActionError()
                }
            } message: {
                Text(store.actionErrorMessage ?? "Please try again.")
            }
    }

    @ViewBuilder
    private var content: some View {
        resultsList
    }

    private var resultsList: some View {
        ScrollViewReader { proxy in
            List {
                if isSearchMode {
                    resultRows
                } else {
                    CollapsingListTitle(
                        title: "Library",
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
            }
            .listStyle(.plain)
            .scrollContentBackground(.hidden)
            .background(ZineTheme.canvas)
            .onScrollGeometryChange(for: CGFloat.self) { geometry in
                let offset = geometry.contentOffset.y + geometry.contentInsets.top
                return FilteredListScrollState.collapseProgress(scrollOffset: offset)
            } action: { _, progress in
                titleCollapseProgress = progress
                onTitleCollapseProgressChanged(progress)
            }
            .onChange(of: tabReselection) {
                handleTabReselection(using: proxy)
            }
            .onAppear { isVisible = true }
            .onDisappear { isVisible = false }
            .refreshable {
                await store.reload(query: query)
            }
            .overlay(alignment: .bottom) {
                if store.isLoadingMore {
                    ProgressView()
                        .padding()
                }
            }
        }
    }

    private enum ScrollAnchor {
        static let top = "library-list-top"
    }

    private func handleTabReselection(using proxy: ScrollViewProxy) {
        FilteredListTabAction.perform(
            isVisible: isVisible && !isSearchMode,
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
            FilteredListLoadingRow(label: "Loading library…")
        } else if let error = store.errorMessage, store.items.isEmpty {
            ContentUnavailableView {
                Label("Library unavailable", systemImage: "exclamationmark.triangle")
            } description: {
                Text(error)
            } actions: {
                Button("Try again") {
                    Task { await store.reload(query: query) }
                }
            }
            .frame(maxWidth: .infinity, minHeight: 320)
            .listRowBackground(ZineTheme.canvas)
            .listRowSeparator(.hidden)
        } else if store.items.isEmpty {
            emptyState
                .frame(maxWidth: .infinity, minHeight: 320)
                .listRowBackground(ZineTheme.canvas)
                .listRowSeparator(.hidden)
        } else {
            ForEach(store.items) { bookmark in
                bookmarkRow(bookmark)
            }
        }
    }

    @ViewBuilder
    private var emptyState: some View {
        if isSearchMode && search.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            ContentUnavailableView(
                "Search your library",
                systemImage: "magnifyingglass",
                description: Text("Find saved items by title or creator.")
            )
        } else if isSearchMode {
            ContentUnavailableView.search(text: search)
        } else if let contentType {
            ContentUnavailableView(
                "No \(contentType.title.lowercased())s",
                systemImage: contentType.systemImage,
                description: Text("Try another format or return to All.")
            )
        } else {
            ContentUnavailableView(
                "No bookmarks",
                systemImage: "bookmark",
                description: Text("Items you bookmark from Inbox will appear here.")
            )
        }
    }

    private func bookmarkRow(_ bookmark: Bookmark) -> some View {
        Group {
            if let navigate = navigation.bookmark {
                Button {
                    navigate(bookmark)
                } label: {
                    BookmarkRow(bookmark: bookmark)
                }
            } else {
                NavigationLink(value: bookmark) {
                    BookmarkRow(bookmark: bookmark)
                }
            }
        }
        .buttonStyle(.plain)
        .listRowInsets(EdgeInsets(top: 6, leading: 18, bottom: 6, trailing: 14))
        .listRowBackground(ZineTheme.canvas)
        .listRowSeparator(.hidden)
        .matchedTransitionSource(id: bookmark.id, in: transitionNamespace)
        .swipeActions(edge: .leading, allowsFullSwipe: true) {
            if !bookmark.isFinished {
                Button {
                    Task { await store.complete(bookmark) }
                } label: {
                    Label("Complete", systemImage: "checkmark.circle.fill")
                }
                .tint(.green)
                .accessibilityLabel("Complete bookmark")
            }
        }
        .swipeActions(edge: .trailing, allowsFullSwipe: true) {
            Button(role: .destructive) {
                Task { await store.archive(bookmark) }
            } label: {
                Label("Archive", systemImage: "archivebox.fill")
            }
            .tint(.red)
            .accessibilityLabel("Archive bookmark")
        }
        .task {
            await store.loadMoreIfNeeded(current: bookmark)
        }
    }

    private var actionErrorBinding: Binding<Bool> {
        Binding(
            get: { store.actionErrorMessage != nil },
            set: { if !$0 { store.dismissActionError() } }
        )
    }

    private var filterMenu: some View {
        Menu {
            Picker("Status", selection: $showsFinished) {
                Text("Unfinished").tag(false)
                Text("Finished").tag(true)
            }

            Picker("Provider", selection: $provider) {
                Text("All providers").tag(Provider?.none)
                ForEach(Provider.allCases) { value in
                    Text(value.title).tag(Provider?.some(value))
                }
            }

            Picker("Format", selection: $contentType) {
                Text("All formats").tag(ContentType?.none)
                ForEach(ContentType.allCases) { value in
                    Text(value.title).tag(ContentType?.some(value))
                }
            }
        } label: {
            Label("Filter", systemImage: hasFilters ? "line.3.horizontal.decrease.circle.fill" : "line.3.horizontal.decrease.circle")
        }
        .accessibilityLabel("Filter library")
    }

    private var hasFilters: Bool {
        showsFinished || provider != nil || contentType != nil
    }

}

private struct LibraryReloadKey: Hashable {
    let query: LibraryQuery
    let revision: Int
}
