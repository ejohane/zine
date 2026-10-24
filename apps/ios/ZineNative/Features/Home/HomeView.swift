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
        let hasJumpBackIn = sections.contains { section in
            if case .jumpBackIn = section { return true }
            return false
        }

        return sections.filter { section in
            switch section {
            case .quickWins:
                false
            case .featuredArticle:
                !hasJumpBackIn
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
    var usesComposition = false
    let onContentChanged: () -> Void
    let onExternalOpen: (Bookmark) -> Void
    let onHomeItemExternalOpen: (HomeItem) -> Void
    let tabReselection: Int
    let onTitleCollapseProgressChanged: (CGFloat) -> Void
    let transitionNamespace: Namespace.ID?
    let registersNavigationDestinations: Bool

    @Namespace private var localTransitionNamespace
    @State private var localTitleCollapseState = ListTitleCollapseState()
    private let suppliedTitleCollapseState: ListTitleCollapseState?

    private var titleCollapseState: ListTitleCollapseState {
        suppliedTitleCollapseState ?? localTitleCollapseState
    }

    init(
        client: APIClient,
        store: HomeStore,
        density: HomeLayoutDensity = .standard,
        title: String = "Home",
        usesComposition: Bool = false,
        onContentChanged: @escaping () -> Void,
        onExternalOpen: @escaping (Bookmark) -> Void,
        onHomeItemExternalOpen: @escaping (HomeItem) -> Void,
        tabReselection: Int = 0,
        onTitleCollapseProgressChanged: @escaping (CGFloat) -> Void = { _ in },
        transitionNamespace: Namespace.ID? = nil,
        registersNavigationDestinations: Bool = true,
        titleCollapseState: ListTitleCollapseState? = nil
    ) {
        suppliedTitleCollapseState = titleCollapseState
        self.client = client
        self.store = store
        self.density = density
        self.title = title
        self.usesComposition = usesComposition
        self.onContentChanged = onContentChanged
        self.onExternalOpen = onExternalOpen
        self.onHomeItemExternalOpen = onHomeItemExternalOpen
        self.tabReselection = tabReselection
        self.onTitleCollapseProgressChanged = onTitleCollapseProgressChanged
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
                        .zinePushedDestinationChrome()
                }
                .navigationDestination(for: HomeSectionRoute.self) { route in
                    Group {
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
                                onItemVisibilityChanged: { id, isVisible in
                                    store.setItemVisibility(id: id, isVisible: isVisible)
                                },
                                onContentChanged: onContentChanged,
                                onExternalOpen: onExternalOpen,
                                tabReselection: tabReselection
                            )
                        }
                    }
                    .zinePushedDestinationChrome()
                }
                .navigationDestination(for: HomeLabCollectionRoute.self) { route in
                    HomeLabCollectionView(route: route, store: store, transitionNamespace: bookmarkTransition)
                        .zinePushedDestinationChrome()
                }
        } else {
            screen
        }
    }

    private var screen: some View {
        content
            .navigationTitle("")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                if registersNavigationDestinations {
                    ToolbarItem(placement: .principal) {
                        ObservedListTitle(title: title, state: titleCollapseState, compact: true)
                    }
                }
            }
            .zineScreenChrome()
            .task(id: store.jumpBackInCandidateIDs) {
                await store.refillJumpBackIn()
            }
    }

    private var bookmarkTransition: Namespace.ID {
        transitionNamespace ?? localTransitionNamespace
    }

    @ViewBuilder
    private var content: some View {
        if store.isLoading && (dashboardSections.isEmpty && composedSections.isEmpty) {
            ZineLoadingView(label: "Loading \(title)…")
        } else if let error = store.errorMessage, (dashboardSections.isEmpty && composedSections.isEmpty) {
            ContentUnavailableView {
                Label("\(title) unavailable", systemImage: "exclamationmark.triangle")
            } description: {
                Text(error)
            } actions: {
                Button("Try again") {
                    Task { await store.reload() }
                }
            }
        } else if (dashboardSections.isEmpty && composedSections.isEmpty) {
            ScrollView {
                ObservedListTitle(title: title, state: titleCollapseState)
                    .padding(.horizontal, 18)
                ContentUnavailableView(
                    usesComposition ? (store.hasHomeComposition ? "No items in these collections" : "Build your Home Lab") : "Nothing to pick up yet",
                    systemImage: "sparkles.rectangle.stack",
                    description: Text(usesComposition
                        ? (store.hasHomeComposition ? "Your saved items stay in Library. An agent can update your collections whenever you’re ready." : "An agent can organize your saved items into collections here.")
                        : "New inbox items and saved content will appear here.")
                )
            }
            .background(ZineTheme.canvas)
            .refreshable { await store.reload() }
        } else {
            ScrollView {
                LazyVStack(spacing: density.sectionSpacing) {
                    ObservedListTitle(title: title, state: titleCollapseState)
                        .padding(.horizontal, 18)

                    if !composedSections.isEmpty {
                        ForEach(composedSections) { section in
                            HomeComposedSectionView(resolved: section,
                                                    transitionNamespace: bookmarkTransition, client: client)
                        }
                    } else {
                        ForEach(dashboardSections) { section in
                            HomeDashboardSectionView(section: section, density: density,
                                                     transitionNamespace: bookmarkTransition, client: client)
                        }
                    }
                }
                .environment(\.homeTabReselection, tabReselection)
                .padding(.vertical, density == .compact ? 6 : 10)
                .padding(.bottom, density == .compact ? 16 : 24)
            }
            .background(ZineTheme.canvas)
            .onScrollGeometryChange(for: CGFloat.self) { geometry in
                let offset = geometry.contentOffset.y + geometry.contentInsets.top
                return CollapsingListTitle.collapseProgress(scrollOffset: offset)
            } action: { _, progress in
                titleCollapseState.progress = progress
                onTitleCollapseProgressChanged(progress)
            }
            .refreshable {
                await store.reload()
            }
        }
    }

    private var composedSections: [HomeComposedSection] { usesComposition ? store.composedSections : [] }

    private var dashboardSections: [HomeDashboardSection] {
        usesComposition ? [] : density.visibleSections(from: store.sections)
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
        case .resumeArticle(let item):
            BookmarkDetailView(
                item: item,
                client: client,
                resumesArticleReading: true,
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
        }
    }
}
