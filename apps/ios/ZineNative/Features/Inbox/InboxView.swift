import SwiftUI

struct InboxView: View {
    let client: APIClient

    @State private var store: InboxStore
    @State private var provider: Provider?
    @State private var contentType: ContentType?
    @Namespace private var bookmarkTransition

    init(
        client: APIClient,
        cache: InboxCache,
        onLibraryChanged: @escaping () -> Void
    ) {
        self.client = client
        _store = State(initialValue: InboxStore(
            client: client,
            cache: cache,
            onLibraryChanged: onLibraryChanged
        ))
    }

    private var query: InboxQuery {
        InboxQuery(provider: provider, contentType: contentType)
    }

    var body: some View {
        NavigationStack {
            content
                .navigationTitle("Inbox")
                .toolbar {
                    ToolbarItem(placement: .topBarLeading) {
                        filterMenu
                    }
                }
                .navigationDestination(for: Bookmark.self) { bookmark in
                    BookmarkDetailView(
                        bookmark: bookmark,
                        client: client,
                        onUpdate: { _ in },
                        onBookmarkChange: { changed, isBookmarked, phase in
                            store.handleDetailBookmarkChange(
                                changed,
                                isBookmarked: isBookmarked,
                                phase: phase
                            )
                        },
                        onBookmarkCommit: { changed, _ in
                            store.commitDetailBookmarkChange(id: changed.id)
                        }
                    )
                    .navigationTransition(
                        .zoom(sourceID: bookmark.id, in: bookmarkTransition)
                    )
                }
        }
        .task(id: query) {
            await store.reload(query: query)
        }
        .alert("Couldn’t update inbox", isPresented: actionErrorBinding) {
            Button("OK", role: .cancel) {
                store.dismissActionError()
            }
        } message: {
            Text(store.actionErrorMessage ?? "Please try again.")
        }
    }

    @ViewBuilder
    private var content: some View {
        if store.isLoading && store.items.isEmpty {
            ProgressView("Loading inbox…")
        } else if let error = store.errorMessage, store.items.isEmpty {
            ContentUnavailableView {
                Label("Inbox unavailable", systemImage: "exclamationmark.triangle")
            } description: {
                Text(error)
            } actions: {
                Button("Try again") {
                    Task { await store.reload(query: query) }
                }
            }
        } else if store.items.isEmpty {
            ContentUnavailableView(
                "Inbox is clear",
                systemImage: "tray",
                description: Text("New items from your sources will appear here.")
            )
        } else {
            List(store.items) { bookmark in
                NavigationLink(value: bookmark) {
                    BookmarkRow(bookmark: bookmark)
                }
                .listRowInsets(EdgeInsets(top: 6, leading: 18, bottom: 6, trailing: 14))
                .listRowSeparator(.hidden)
                .matchedTransitionSource(id: bookmark.id, in: bookmarkTransition)
                .swipeActions(edge: .leading, allowsFullSwipe: true) {
                    Button {
                        Task { await store.bookmark(bookmark) }
                    } label: {
                        Label("Bookmark", systemImage: "bookmark.fill")
                    }
                    .tint(.green)
                    .accessibilityLabel("Bookmark inbox item")
                }
                .swipeActions(edge: .trailing, allowsFullSwipe: true) {
                    Button(role: .destructive) {
                        Task { await store.archive(bookmark) }
                    } label: {
                        Label("Archive", systemImage: "archivebox.fill")
                    }
                    .accessibilityLabel("Archive inbox item")
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

    private var actionErrorBinding: Binding<Bool> {
        Binding(
            get: { store.actionErrorMessage != nil },
            set: { if !$0 { store.dismissActionError() } }
        )
    }

    private var filterMenu: some View {
        Menu {
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
            Label(
                "Filter",
                systemImage: hasFilters
                    ? "line.3.horizontal.decrease.circle.fill"
                    : "line.3.horizontal.decrease.circle"
            )
        }
        .accessibilityLabel("Filter inbox")
    }

    private var hasFilters: Bool {
        provider != nil || contentType != nil
    }
}
