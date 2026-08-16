import SwiftUI

enum HomeLayoutDensity: Equatable {
    case standard
    case compact

    private static let hiddenCompactCollectionTitles: Set<String> = [
        "car ride",
        "care ride",
        "career ride",
        "faves",
    ]

    var sectionSpacing: CGFloat {
        switch self {
        case .standard: 30
        case .compact: 18
        }
    }

    func visibleSections(from sections: [HomeDashboardSection]) -> [HomeDashboardSection] {
        guard self == .compact else { return sections }

        return sections.filter { section in
            switch section {
            case .quickWins:
                false
            case .collection(let collection):
                !Self.hiddenCompactCollectionTitles.contains(
                    collection.title.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
                )
            default:
                true
            }
        }
    }
}

struct HomeView: View {
    let client: APIClient
    let store: HomeStore
    var density: HomeLayoutDensity = .standard
    var title = "Home"
    let onContentChanged: () -> Void
    let onExternalOpen: (Bookmark) -> Void
    let onHomeItemExternalOpen: (HomeItem) -> Void
    let tabReselection: Int
    let transitionNamespace: Namespace.ID?
    let registersNavigationDestinations: Bool

    @Namespace private var localTransitionNamespace

    init(
        client: APIClient,
        store: HomeStore,
        density: HomeLayoutDensity = .standard,
        title: String = "Home",
        onContentChanged: @escaping () -> Void,
        onExternalOpen: @escaping (Bookmark) -> Void,
        onHomeItemExternalOpen: @escaping (HomeItem) -> Void,
        tabReselection: Int = 0,
        transitionNamespace: Namespace.ID? = nil,
        registersNavigationDestinations: Bool = true
    ) {
        self.client = client
        self.store = store
        self.density = density
        self.title = title
        self.onContentChanged = onContentChanged
        self.onExternalOpen = onExternalOpen
        self.onHomeItemExternalOpen = onHomeItemExternalOpen
        self.tabReselection = tabReselection
        self.transitionNamespace = transitionNamespace
        self.registersNavigationDestinations = registersNavigationDestinations
    }

    @ViewBuilder
    var body: some View {
        if registersNavigationDestinations {
            screen
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
                            onExternalOpen: onExternalOpen,
                            tabReselection: tabReselection
                        )
                    default:
                        HomeSectionListView(
                            route: route,
                            client: client,
                            onContentChanged: onContentChanged,
                            onExternalOpen: onExternalOpen,
                            tabReselection: tabReselection
                        )
                    }
                }
        } else {
            screen
        }
    }

    private var screen: some View {
        content
            .navigationTitle(title)
            .navigationBarTitleDisplayMode(density == .compact ? .inline : .automatic)
            .zineScreenChrome()
    }

    private var bookmarkTransition: Namespace.ID {
        transitionNamespace ?? localTransitionNamespace
    }

    @ViewBuilder
    private var content: some View {
        if store.isLoading && dashboardSections.isEmpty {
            ZineLoadingView(label: "Loading \(title)…")
        } else if let error = store.errorMessage, dashboardSections.isEmpty {
            ContentUnavailableView {
                Label("\(title) unavailable", systemImage: "exclamationmark.triangle")
            } description: {
                Text(error)
            } actions: {
                Button("Try again") {
                    Task { await store.reload() }
                }
            }
        } else if dashboardSections.isEmpty {
            ContentUnavailableView(
                "Nothing to pick up yet",
                systemImage: "sparkles.rectangle.stack",
                description: Text("New inbox items and saved content will appear here.")
            )
        } else {
            ScrollView {
                LazyVStack(spacing: density.sectionSpacing) {
                    ForEach(dashboardSections) { section in
                        HomeDashboardSectionView(
                            section: section,
                            density: density,
                            transitionNamespace: bookmarkTransition
                        )
                    }
                }
                .padding(.vertical, density == .compact ? 6 : 10)
                .padding(.bottom, density == .compact ? 16 : 24)
            }
            .background(ZineTheme.canvas)
            .refreshable {
                await store.reload()
            }
        }
    }

    private var dashboardSections: [HomeDashboardSection] {
        density.visibleSections(from: store.sections)
    }

    @ViewBuilder
    private func destination(for route: HomeNavigationRoute) -> some View {
        switch route.destination {
        case .item(let item):
            BookmarkDetailView(
                item: item,
                client: client,
                onUpdate: { _ in onContentChanged() },
                onBookmarkCommit: { _, _ in onContentChanged() },
                onExternalOpen: { bookmark, item in
                    if let bookmark {
                        onExternalOpen(bookmark)
                    } else {
                        onHomeItemExternalOpen(item)
                    }
                }
            )
        case .bookmark(let bookmark):
            BookmarkDetailView(
                bookmark: bookmark,
                client: client,
                onUpdate: { _ in onContentChanged() },
                onBookmarkCommit: { _, _ in onContentChanged() },
                onExternalOpen: onExternalOpen
            )
        case .articleReader(let item):
            ArticleReaderView(
                metadata: ArticleReaderMetadata(
                    bookmarkID: item.id,
                    title: item.title,
                    creator: item.creator,
                    creatorImageURL: item.creatorImageUrl,
                    canonicalURL: item.canonicalUrl,
                    readingTimeMinutes: item.readingTimeMinutes,
                    initialProgress: item.progress,
                    isFinished: false,
                    tags: []
                ),
                client: client,
                onRead: { onHomeItemExternalOpen(item) },
                onProgressSaved: { _ in onContentChanged() },
                onFinishedChanged: { _, _ in onContentChanged() },
                onFinishedCommit: { _ in onContentChanged() },
                onTagsChanged: { _ in onContentChanged() }
            )
        }
    }
}
