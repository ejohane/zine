import SwiftUI

struct HomeView: View {
    let client: APIClient
    let refreshRevision: Int
    let externalOpenEvent: ExternalBookmarkOpenEvent?
    let onContentChanged: () -> Void
    let onExternalOpen: (Bookmark) -> Void

    @State private var store: HomeStore
    @Namespace private var bookmarkTransition

    init(
        client: APIClient,
        cache: HomeCache,
        refreshRevision: Int,
        externalOpenEvent: ExternalBookmarkOpenEvent?,
        onContentChanged: @escaping () -> Void,
        onExternalOpen: @escaping (Bookmark) -> Void
    ) {
        self.client = client
        self.refreshRevision = refreshRevision
        self.externalOpenEvent = externalOpenEvent
        self.onContentChanged = onContentChanged
        self.onExternalOpen = onExternalOpen
        _store = State(initialValue: HomeStore(client: client, cache: cache))
    }

    var body: some View {
        NavigationStack {
            content
                .navigationTitle("Home")
                .navigationDestination(for: HomeNavigationRoute.self) { route in
                    destination(for: route)
                        .navigationTransition(
                            .zoom(sourceID: route.sourceID, in: bookmarkTransition)
                        )
                }
                .navigationDestination(for: HomeSectionRoute.self) { route in
                    switch route {
                    case .jumpBackIn:
                        JumpBackInListView(
                            client: client,
                            onContentChanged: onContentChanged,
                            onExternalOpen: onExternalOpen
                        )
                    default:
                        HomeSectionListView(
                            route: route,
                            client: client,
                            onContentChanged: onContentChanged,
                            onExternalOpen: onExternalOpen
                        )
                    }
                }
        }
        .task(id: refreshRevision) {
            await store.reload()
        }
        .onChange(of: externalOpenEvent, initial: true) { _, event in
            guard let event else { return }
            switch event.change {
            case .promote:
                store.promoteOpened(event.bookmark, at: event.openedAt)
            case .rollback:
                store.rollbackOpened(id: event.bookmark.id, openedAt: event.openedAt)
            }
        }
    }

    @ViewBuilder
    private var content: some View {
        if store.isLoading && store.sections.isEmpty {
            ProgressView("Loading Home…")
        } else if let error = store.errorMessage, store.sections.isEmpty {
            ContentUnavailableView {
                Label("Home unavailable", systemImage: "exclamationmark.triangle")
            } description: {
                Text(error)
            } actions: {
                Button("Try again") {
                    Task { await store.reload() }
                }
            }
        } else if store.sections.isEmpty {
            ContentUnavailableView(
                "Nothing to pick up yet",
                systemImage: "sparkles.rectangle.stack",
                description: Text("New inbox items and saved content will appear here.")
            )
        } else {
            ScrollView {
                LazyVStack(spacing: 30) {
                    ForEach(store.sections) { section in
                        HomeDashboardSectionView(
                            section: section,
                            transitionNamespace: bookmarkTransition
                        )
                    }
                }
                .padding(.vertical, 10)
                .padding(.bottom, 24)
            }
            .refreshable {
                await store.reload()
            }
        }
    }

    @ViewBuilder
    private func destination(for route: HomeNavigationRoute) -> some View {
        switch route.destination {
        case .item(let item):
            HomeItemDestination(
                item: item,
                client: client,
                onContentChanged: onContentChanged,
                onExternalOpen: onExternalOpen
            )
        case .bookmark(let bookmark):
            BookmarkDetailView(
                bookmark: bookmark,
                client: client,
                onUpdate: { _ in onContentChanged() },
                onBookmarkCommit: { _, _ in onContentChanged() },
                onExternalOpen: onExternalOpen
            )
        }
    }
}

private struct HomeItemDestination: View {
    let item: HomeItem
    let client: APIClient
    let onContentChanged: () -> Void
    let onExternalOpen: (Bookmark) -> Void

    @State private var bookmark: Bookmark?
    @State private var errorMessage: String?

    var body: some View {
        Group {
            if let bookmark {
                BookmarkDetailView(
                    bookmark: bookmark,
                    client: client,
                    onUpdate: { updated in
                        self.bookmark = updated
                        onContentChanged()
                    },
                    onBookmarkCommit: { _, _ in onContentChanged() },
                    onExternalOpen: onExternalOpen
                )
            } else if let errorMessage {
                ContentUnavailableView {
                    Label("Item unavailable", systemImage: "exclamationmark.triangle")
                } description: {
                    Text(errorMessage)
                } actions: {
                    Button("Try again") {
                        Task { await load() }
                    }
                }
            } else {
                ProgressView("Loading item…")
            }
        }
        .task(id: item.id) {
            await load()
        }
    }

    private func load() async {
        errorMessage = nil
        do {
            bookmark = try await client.getBookmark(id: item.id)
        } catch is CancellationError {
            return
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}
