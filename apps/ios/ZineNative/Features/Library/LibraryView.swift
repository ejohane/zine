import ClerkKitUI
import SwiftUI

struct LibraryView: View {
    let client: APIClient

    @State private var store: LibraryStore
    @State private var search = ""
    @State private var showsFinished = false
    @State private var provider: Provider?
    @State private var contentType: ContentType?

    init(client: APIClient) {
        self.client = client
        _store = State(initialValue: LibraryStore(client: client))
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
        NavigationStack {
            content
                .navigationTitle("Library")
                .searchable(text: $search, prompt: "Search your library")
                .toolbar {
                    ToolbarItem(placement: .topBarLeading) {
                        filterMenu
                    }
                    ToolbarItem(placement: .topBarTrailing) {
                        UserButton()
                    }
                }
                .navigationDestination(for: Bookmark.self) { bookmark in
                    BookmarkDetailView(bookmark: bookmark, client: client) { updated in
                        store.update(updated)
                    }
                }
        }
        .task(id: query) {
            if !search.isEmpty {
                try? await Task.sleep(for: .milliseconds(250))
            }
            guard !Task.isCancelled else { return }
            await store.reload(query: query)
        }
    }

    @ViewBuilder
    private var content: some View {
        if store.isLoading && store.items.isEmpty {
            ProgressView("Loading library…")
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
        } else if store.items.isEmpty {
            ContentUnavailableView.search(text: search)
        } else {
            List(store.items) { bookmark in
                NavigationLink(value: bookmark) {
                    BookmarkRow(bookmark: bookmark)
                }
                .task {
                    await store.loadMoreIfNeeded(current: bookmark)
                }
            }
            .listStyle(.plain)
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
