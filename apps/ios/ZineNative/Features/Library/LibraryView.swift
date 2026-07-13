import ClerkKitUI
import SwiftUI

private enum AccountRoute: Hashable {
    case appearance
}

struct LibraryView: View {
    let client: APIClient

    @State private var store: LibraryStore
    @State private var search = ""
    @State private var showsFinished = false
    @State private var provider: Provider?
    @State private var contentType: ContentType?
    @Namespace private var bookmarkTransition

    init(client: APIClient, cache: LibraryCache) {
        self.client = client
        _store = State(initialValue: LibraryStore(client: client, cache: cache))
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
                        accountButton
                    }
                }
                .navigationDestination(for: Bookmark.self) { bookmark in
                    BookmarkDetailView(bookmark: bookmark, client: client) { updated in
                        store.update(updated)
                    }
                    .navigationTransition(
                        .zoom(sourceID: bookmark.id, in: bookmarkTransition)
                    )
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
                .matchedTransitionSource(id: bookmark.id, in: bookmarkTransition)
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

    private var accountButton: some View {
        UserButton()
            .userProfileRows([
                UserProfileCustomRow(
                    route: AccountRoute.appearance,
                    title: "Appearance",
                    icon: .system(name: "circle.lefthalf.filled"),
                    placement: .before(.signOut)
                ),
            ])
            .userProfileDestination { route in
                switch route {
                case .appearance:
                    AppearanceSettingsView()
                }
            }
    }
}

private struct AppearanceSettingsView: View {
    @AppStorage(AppAppearance.storageKey) private var storedAppearance = AppAppearance.system.rawValue

    private var selection: Binding<AppAppearance> {
        Binding(
            get: { AppAppearance(rawValue: storedAppearance) ?? .system },
            set: { storedAppearance = $0.rawValue }
        )
    }

    var body: some View {
        List {
            Section {
                ForEach(AppAppearance.allCases) { appearance in
                    Button {
                        selection.wrappedValue = appearance
                    } label: {
                        Label(appearance.title, systemImage: appearance.systemImage)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .contentShape(.rect)
                            .overlay(alignment: .trailing) {
                                if selection.wrappedValue == appearance {
                                    Image(systemName: "checkmark")
                                        .fontWeight(.semibold)
                                }
                            }
                    }
                    .buttonStyle(.plain)
                }
            } footer: {
                Text("System follows your iPhone’s appearance setting.")
            }
        }
        .navigationTitle("Appearance")
        .navigationBarTitleDisplayMode(.inline)
    }
}
