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
    let peopleDailyStore: PeopleDailyStore
    var density: HomeLayoutDensity = .standard
    var title = "Home"
    let onContentChanged: () -> Void
    let onExternalOpen: (Bookmark) -> Void
    let onHomeItemExternalOpen: (HomeItem) -> Void
    let tabReselection: Int

    @Namespace private var bookmarkTransition

    init(
        client: APIClient,
        store: HomeStore,
        peopleDailyStore: PeopleDailyStore,
        density: HomeLayoutDensity = .standard,
        title: String = "Home",
        onContentChanged: @escaping () -> Void,
        onExternalOpen: @escaping (Bookmark) -> Void,
        onHomeItemExternalOpen: @escaping (HomeItem) -> Void,
        tabReselection: Int = 0
    ) {
        self.client = client
        self.store = store
        self.peopleDailyStore = peopleDailyStore
        self.density = density
        self.title = title
        self.onContentChanged = onContentChanged
        self.onExternalOpen = onExternalOpen
        self.onHomeItemExternalOpen = onHomeItemExternalOpen
        self.tabReselection = tabReselection
    }

    var body: some View {
        NavigationStack {
            content
                .navigationTitle(title)
                .navigationBarTitleDisplayMode(density == .compact ? .inline : .automatic)
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
                .navigationDestination(for: PeopleDailyRoute.self) { route in
                    switch route {
                    case let .section(id):
                        PeopleDailySectionView(client: client, sectionID: id)
                    }
                }
        }
        .zineScreenChrome()
    }

    @ViewBuilder
    private var content: some View {
        if store.isLoading && dashboardSections.isEmpty {
            ProgressView("Loading \(title)…")
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
                async let home: Void = store.reload()
                async let today: Void = peopleDailyStore.load()
                _ = await (home, today)
            }
        }
    }

    private var dashboardSections: [HomeDashboardSection] {
        guard let response = peopleDailyStore.response else {
            return density.visibleSections(from: store.sections)
        }
        let topics = HomeStore.strongestTodayTopics(
            sections: response.overviewSections,
            authors: response.authors,
            date: response.date,
            timezone: response.timezone,
            freshnessStatus: response.freshness.status,
            isShowingCachedEdition: peopleDailyStore.isShowingCachedEdition
        )
        return density.visibleSections(
            from: HomeStore.interleaveTodayTopics(topics, into: store.sections)
        )
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
        }
    }
}
