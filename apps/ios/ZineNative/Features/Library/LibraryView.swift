import SwiftUI

struct LibraryView: View {
    let client: APIClient
    let searchText: Binding<String>?
    let searchHistoryKey: String
    let refreshRevision: Int
    let onContentChanged: () -> Void
    let onExternalOpen: (Bookmark) -> Void
    let tabReselection: Int
    let onTitleCollapseProgressChanged: (CGFloat) -> Void
    let transitionNamespace: Namespace.ID

    @Environment(\.nativeCommandSession) private var commandSession
    @AppStorage private var searchHistoryData: Data
    @State private var hasFocusedSearch = false
    @State private var recentlyOpened: [HomeItem] = []
    @FocusState private var searchInputFocused: Bool
    @State private var store: LibraryStore
    @State private var statusFilter: Bool?
    @State private var creatorMatches: [Bookmark] = []
    @State private var provider: Provider?
    @State private var contentType: ContentType?
    @State private var localTitleCollapseState = ListTitleCollapseState()
    private let suppliedTitleCollapseState: ListTitleCollapseState?

    private var titleCollapseState: ListTitleCollapseState {
        suppliedTitleCollapseState ?? localTitleCollapseState
    }
    @State private var isVisible = false
    @State private var isShowingAddBookmark = false
    @Environment(\.zineTabNavigationActions) private var navigation

    init(
        client: APIClient,
        cache: LibraryCache,
        searchText: Binding<String>? = nil,
        searchHistoryKey: String = "zine.search.history",
        refreshRevision: Int = 0,
        onContentChanged: @escaping () -> Void = {},
        onExternalOpen: @escaping (Bookmark) -> Void = { _ in },
        tabReselection: Int = 0,
        onTitleCollapseProgressChanged: @escaping (CGFloat) -> Void = { _ in },
        transitionNamespace: Namespace.ID,
        titleCollapseState: ListTitleCollapseState? = nil
    ) {
        _searchHistoryData = AppStorage(wrappedValue: Data(), searchHistoryKey)
        suppliedTitleCollapseState = titleCollapseState
        self.client = client
        self.searchText = searchText
        self.searchHistoryKey = searchHistoryKey
        self.refreshRevision = refreshRevision
        self.onContentChanged = onContentChanged
        self.onExternalOpen = onExternalOpen
        self.tabReselection = tabReselection
        self.onTitleCollapseProgressChanged = onTitleCollapseProgressChanged
        self.transitionNamespace = transitionNamespace
        _store = State(initialValue: LibraryStore(
            client: client,
            cache: cache,
            onContentChanged: onContentChanged,
            prefetch: AppImagePipeline.prefetch
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
            isFinished: statusFilter ?? false,
            includesFinished: isSearchMode && statusFilter == nil,
            provider: provider,
            contentType: contentType
        )
    }

    var body: some View {
        content
            .navigationTitle("")
            .navigationBarTitleDisplayMode(.inline)
            .contentTypeFilterChrome()
            .toolbar {
                if !isSearchMode {
                    ToolbarItem(placement: .topBarTrailing) {
                        Button {
                            isShowingAddBookmark = true
                        } label: {
                            Image(systemName: "plus")
                        }
                        .accessibilityLabel("Add bookmark")
                        .accessibilityIdentifier("library-add-bookmark")
                    }
                }
            }
            .zineScreenChrome()
            .task(id: LibraryReloadKey(query: query, revision: refreshRevision)) {
                if isSearchMode && search.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                    creatorMatches = []
                    store.reset()
                    if let home = try? await client.getHome(), !Task.isCancelled {
                        recentlyOpened = Array(home.jumpBackIn.filter { $0.lastOpenedAt != nil }
                            .sorted { ($0.lastOpenedAt ?? "") > ($1.lastOpenedAt ?? "") }.prefix(3))
                    }
                    return
                }
                if !search.isEmpty {
                    try? await Task.sleep(for: .milliseconds(250))
                }
                guard !Task.isCancelled else { return }
                await store.reload(query: query)
                if isSearchMode { await loadMatchingCreators() }
            }
            .alert("Couldn’t update bookmark", isPresented: actionErrorBinding) {
                Button("OK", role: .cancel) {
                    store.dismissActionError()
                }
            } message: {
                Text(store.actionErrorMessage ?? "Please try again.")
            }
            .sheet(isPresented: $isShowingAddBookmark) {
                AddBookmarkSheet(
                    client: BookmarkShareClient.live(
                        baseURL: client.baseURL,
                        session: client.session,
                        tokenProvider: { try await client.tokenProvider() }
                    ),
                    onSaved: {
                        Task { await store.reload(query: query) }
                        onContentChanged()
                    }
                )
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
                    HStack {
                        ObservedListTitle(title: "Search", state: titleCollapseState)
                        filterMenu
                            .labelStyle(.iconOnly)
                            .foregroundStyle(hasFilters ? ZineTheme.brandAccent : ZineTheme.primaryText)
                            .frame(minWidth: 44, minHeight: 44)
                    }
                    .id(ScrollAnchor.top)
                    .listRowInsets(EdgeInsets(top: 0, leading: 18, bottom: 0, trailing: 18))
                    .listRowBackground(ZineTheme.canvas)
                    .listRowSeparator(.hidden)

                    searchField
                        .listRowInsets(EdgeInsets())
                        .listRowBackground(ZineTheme.canvas)
                        .listRowSeparator(.hidden)
                }
                if isSearchMode && search.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                    searchLandingRows
                } else if isSearchMode {
                    if !creatorMatches.isEmpty { creatorResults }
                    if !store.items.isEmpty {
                        Section("Bookmarks") { resultRows }
                            .textCase(nil)
                    } else {
                        resultRows
                    }
                } else {
                    ObservedListTitle(title: "Library", state: titleCollapseState)
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
            .scrollDismissesKeyboard(.interactively)
            .listStyle(.plain)
            .scrollContentBackground(.hidden)
            .background(ZineTheme.canvas)
            .onScrollGeometryChange(for: CGFloat.self) { geometry in
                let offset = geometry.contentOffset.y + geometry.contentInsets.top
                return FilteredListScrollState.collapseProgress(scrollOffset: offset)
            } action: { _, progress in
                titleCollapseState.progress = progress
                onTitleCollapseProgressChanged(progress)
            }
            .onChange(of: tabReselection) {
                if isSearchMode { searchInputFocused = true }
                handleTabReselection(using: proxy)
            }
            .onChange(of: store.items) { _, _ in commandSession?.recordUIChange("library.items") }
            .onAppear {
                isVisible = true
                commandSession?.library = store
                commandSession?.applyLibraryQuery = { requested in
                    searchText?.wrappedValue = requested.search
                    statusFilter = requested.includesFinished ? nil : requested.isFinished
                    provider = requested.provider
                    contentType = requested.contentType
                    await store.reload(query: requested)
                }
                commandSession?.route = isSearchMode ? "search" : "library"
            }
            .onDisappear {
                isVisible = false
                searchInputFocused = false
            }
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
            collapseProgress: titleCollapseState.progress,
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
                    if isSearchMode {
                        rememberSearch()
                        searchInputFocused = false
                    }
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

    private func loadMatchingCreators() async {
        let requested = query
        let term = search.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !term.isEmpty, !Task.isCancelled, store.activeQuery == requested else { return }
        var matches: [Bookmark] = []
        var seen = Set<String>()
        func append(_ items: [Bookmark]) {
            for item in items {
                if let id = item.creatorId, !id.isEmpty,
                   item.creator.localizedCaseInsensitiveContains(term), seen.insert(id).inserted {
                    matches.append(item)
                }
            }
        }
        append(store.items)
        creatorMatches = matches
        var cursor = store.nextCursor
        while let next = cursor, !Task.isCancelled {
            guard let page = try? await client.listBookmarks(query: requested, cursor: next, limit: 100),
                  !Task.isCancelled, requested == query else { return }
            append(page.items)
            creatorMatches = matches
            cursor = page.nextCursor
        }
    }

    private var creatorResults: some View {
        Section("Creators") {
            ScrollView(.horizontal, showsIndicators: false) {
                LazyHStack(alignment: .top, spacing: 18) {
                    ForEach(creatorMatches, id: \.creatorId) { item in
                        Button {
                            rememberSearch()
                            searchInputFocused = false
                            navigation.creator?(SearchCreatorRoute(bookmark: item))
                        } label: {
                            VStack(spacing: 8) {
                                CreatorAvatar(imageUrl: item.creatorImageUrl, creator: item.creator,
                                              contentType: item.contentType, size: 64)
                                Text(item.creator)
                                    .font(.caption.weight(.medium))
                                    .foregroundStyle(ZineTheme.primaryText)
                                    .lineLimit(2)
                                    .multilineTextAlignment(.center)
                            }
                            .frame(width: 90)
                        }
                        .buttonStyle(.plain)
                    }
                }
                .padding(.vertical, 6)
            }
            .listRowBackground(ZineTheme.canvas)
            .listRowSeparator(.hidden)
        }
        .textCase(nil)
    }

    private var searchField: some View {
        HStack(spacing: 10) {
            Image(systemName: "magnifyingglass")
                .foregroundStyle(ZineTheme.secondaryText)
            TextField("Search your library", text: searchText ?? .constant(""))
                .foregroundStyle(ZineTheme.primaryText)
                .focused($searchInputFocused)
                .submitLabel(.search)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
                .accessibilityIdentifier("library-search-input")
                .onSubmit {
                    rememberSearch()
                    searchInputFocused = false
                }
            if !search.isEmpty {
                Button {
                    searchText?.wrappedValue = ""
                    searchInputFocused = true
                } label: {
                    Image(systemName: "xmark.circle.fill")
                        .foregroundStyle(ZineTheme.secondaryText)
                }
                .accessibilityLabel("Clear search")
            }
            if searchInputFocused {
                Button("Done") { searchInputFocused = false }
                    .accessibilityLabel("Dismiss search keyboard")
            }
        }
        .padding(12)
        .background(ZineTheme.raised, in: RoundedRectangle(cornerRadius: 12))
        .padding(.horizontal, 18)
        .padding(.vertical, 10)
        .background(ZineTheme.canvas)
        .onAppear {
            if !hasFocusedSearch {
                hasFocusedSearch = true
                searchInputFocused = true
            }
        }
    }

    private var recentSearches: [String] {
        (try? JSONDecoder().decode([String].self, from: searchHistoryData)) ?? []
    }

    private static func recordSearch(_ search: String, key: String) {
        let term = search.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !term.isEmpty else { return }
        let data = UserDefaults.standard.data(forKey: key) ?? Data()
        let recent = (try? JSONDecoder().decode([String].self, from: data)) ?? []
        let history = [term] + recent.filter { $0.caseInsensitiveCompare(term) != .orderedSame }
        if let encoded = try? JSONEncoder().encode(Array(history.prefix(5))) {
            UserDefaults.standard.set(encoded, forKey: key)
        }
    }

    private func rememberSearch() {
        Self.recordSearch(search, key: searchHistoryKey)
    }

    @ViewBuilder
    private var searchLandingRows: some View {
        if !recentSearches.isEmpty {
            Section {
                ForEach(recentSearches, id: \.self) { term in
                    Button {
                        searchText?.wrappedValue = term
                        rememberSearch()
                        searchInputFocused = false
                    } label: {
                        Label(term, systemImage: "clock")
                            .foregroundStyle(ZineTheme.primaryText)
                            .frame(maxWidth: .infinity, alignment: .leading)
                    }
                    .listRowBackground(ZineTheme.canvas)
                }
            } header: {
                HStack {
                    Text("Recent searches")
                    Spacer()
                    Button("Clear") { searchHistoryData = Data() }
                        .accessibilityLabel("Clear recent searches")
                }
                .textCase(nil)
            }
        }
        if !recentlyOpened.isEmpty {
            Section("Recently opened") {
                ForEach(recentlyOpened) { item in
                    let route = HomeNavigationRoute.item(item, sectionID: "search-recent")
                    Button {
                        searchInputFocused = false
                        navigation.home?(route)
                    } label: {
                        HStack(spacing: 10) {
                            CachedRemoteImage(url: item.thumbnailUrl, targetSize: CGSize(width: 64, height: 48)) {
                                ZineTheme.raised
                            }
                            .frame(width: 64, height: 48)
                            .clipShape(.rect(cornerRadius: 7))
                            VStack(alignment: .leading, spacing: 3) {
                                Text(item.title)
                                    .font(.subheadline.weight(.semibold))
                                    .foregroundStyle(ZineTheme.primaryText)
                                    .lineLimit(1)
                                Text(item.creator)
                                    .font(.caption)
                                    .foregroundStyle(ZineTheme.secondaryText)
                                    .lineLimit(1)
                            }
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(.vertical, 2)
                    }
                    .buttonStyle(.plain)
                    .listRowBackground(ZineTheme.canvas)
                    .listRowSeparator(.hidden)
                    .matchedTransitionSource(id: route.sourceID, in: transitionNamespace)
                }
            }
            .textCase(nil)
        }
        if recentSearches.isEmpty && recentlyOpened.isEmpty {
            Text("Search by title or creator")
                .font(.subheadline)
                .foregroundStyle(ZineTheme.secondaryText)
                .listRowBackground(ZineTheme.canvas)
                .listRowSeparator(.hidden)
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
            Picker("Status", selection: $statusFilter) {
                Text("All bookmarks").tag(Bool?.none)
                Text("Unfinished").tag(Bool?.some(false))
                Text("Finished").tag(Bool?.some(true))
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
        statusFilter != nil || provider != nil || contentType != nil
    }

}

private struct LibraryReloadKey: Hashable {
    let query: LibraryQuery
    let revision: Int
}
