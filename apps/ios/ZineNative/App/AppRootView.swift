import ClerkKit
import ClerkKitUI
import SwiftUI

struct ExternalBookmarkOpenEvent: Equatable {
    enum Change: Equatable {
        case promote
        case rollback
    }

    let id = UUID()
    let bookmark: Bookmark
    let openedAt: Date
    let change: Change
}

struct ZineTabNavigationActions {
    var home: ((HomeNavigationRoute) -> Void)?
    var homeSection: ((HomeSectionRoute) -> Void)?
    var bookmark: ((Bookmark) -> Void)?
    var settings: ((SettingsRoute) -> Void)?
}

private struct ZineTabNavigationActionsKey: EnvironmentKey {
    static let defaultValue = ZineTabNavigationActions()
}

extension EnvironmentValues {
    var zineTabNavigationActions: ZineTabNavigationActions {
        get { self[ZineTabNavigationActionsKey.self] }
        set { self[ZineTabNavigationActionsKey.self] = newValue }
    }
}

struct AppRootView: View {
    let configuration: AppConfiguration

    @Environment(Clerk.self) private var clerk

    var body: some View {
        Group {
            if let user = clerk.user {
                AuthenticatedAppView(
                    configuration: configuration,
                    userID: user.id
                )
            } else {
                AuthView(isDismissible: false)
            }
        }
    }
}

private struct AuthenticatedAppView: View {
    private enum AppTab: Hashable {
        case home
        case library
        case settings
        case search
    }

    @Environment(\.scenePhase) private var scenePhase

    private let client: APIClient
    private let libraryCache: LibraryCache

    @State private var homeStore: HomeStore
    @State private var search = ""
    @State private var selectedTab = AppTab.home
    @State private var navigationPath = NavigationPath()
    @State private var homeTabReselection = 0
    @State private var libraryTabReselection = 0
    @State private var homeTitleCollapseProgress: CGFloat = 0
    @State private var libraryTitleCollapseProgress: CGFloat = 0
    @State private var homeRevision = 0
    @State private var libraryRevision = 0
    @State private var externalOpenEvent: ExternalBookmarkOpenEvent?
    @State private var externalOpenError: String?
    @Namespace private var navigationTransition

    init(configuration: AppConfiguration, userID: String) {
        let client = APIClient(
            baseURL: configuration.apiBaseURL,
            tokenProvider: {
                guard let token = try await Clerk.shared.auth.getToken() else {
                    throw APIError.missingSession
                }
                return token
            },
            articleBodyCache: ArticleBodyCache(userID: userID)
        )
        let homeCache = HomeCache(userID: userID)
        self.client = client
        libraryCache = LibraryCache(userID: userID)
        _homeStore = State(initialValue: HomeStore(client: client, cache: homeCache))
    }

    var body: some View {
        NavigationStack(path: $navigationPath) {
            TabView(selection: tabSelection) {
                Tab("Home", systemImage: "house", value: AppTab.home) {
                    HomeView(
                        client: client,
                        store: homeStore,
                        density: .compact,
                        onContentChanged: markBookmarkContentChanged,
                        onExternalOpen: handleExternalOpen,
                        onHomeItemExternalOpen: handleHomeItemExternalOpen,
                        tabReselection: homeTabReselection,
                        onTitleCollapseProgressChanged: { homeTitleCollapseProgress = $0 },
                        transitionNamespace: navigationTransition,
                        registersNavigationDestinations: false
                    )
                    .tint(ZineTheme.brandAccent)
                }

                Tab("Library", systemImage: "books.vertical", value: AppTab.library) {
                    LibraryView(
                        client: client,
                        cache: libraryCache,
                        refreshRevision: libraryRevision,
                        onContentChanged: markHomeChanged,
                        onExternalOpen: handleExternalOpen,
                        tabReselection: libraryTabReselection,
                        onTitleCollapseProgressChanged: { libraryTitleCollapseProgress = $0 },
                        transitionNamespace: navigationTransition
                    )
                    .tint(ZineTheme.brandAccent)
                }

                Tab("Settings", systemImage: "gearshape", value: AppTab.settings) {
                    AppSettingsView(client: client)
                    .tint(ZineTheme.brandAccent)
                }

                Tab(value: AppTab.search, role: .search) {
                    LibraryView(
                        client: client,
                        cache: libraryCache,
                        searchText: $search,
                        refreshRevision: libraryRevision,
                        onContentChanged: markHomeChanged,
                        onExternalOpen: handleExternalOpen,
                        transitionNamespace: navigationTransition
                    )
                    .searchable(text: $search, prompt: "Search your library")
                    .tint(ZineTheme.brandAccent)
                }
            }
            .zineTabShellChrome()
            .navigationTitle(selectedRootTitle)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                // Keep root chrome registered beneath pushed destinations so an interactive
                // pop reveals the complete tab shell instead of reconstructing its title bar.
                if let compactTitle = selectedCompactRootTitle {
                    ToolbarItem(placement: .principal) {
                        CollapsedListTitle(
                            title: compactTitle.title,
                            progress: compactTitle.progress
                        )
                    }
                }
            }
            .environment(\.zineTabNavigationActions, tabNavigationActions)
            .navigationDestination(for: HomeNavigationRoute.self) { route in
                homeDestination(for: route)
                    .navigationTransition(
                        .zoom(sourceID: route.sourceID, in: navigationTransition)
                    )
            }
            .navigationDestination(for: HomeSectionRoute.self) { route in
                homeSectionDestination(for: route)
            }
            .navigationDestination(for: Bookmark.self) { bookmark in
                bookmarkDestination(for: bookmark)
                    .navigationTransition(
                        .zoom(sourceID: bookmark.id, in: navigationTransition)
                    )
            }
            .navigationDestination(for: SettingsRoute.self) { route in
                settingsDestination(for: route)
            }
        }
        .task(id: homeRevision) {
            await homeStore.reload()
        }
        .onChange(of: externalOpenEvent, initial: true) { _, event in
            guard let event else { return }
            switch event.change {
            case .promote:
                homeStore.promoteOpened(event.bookmark, at: event.openedAt)
            case .rollback:
                homeStore.rollbackOpened(id: event.bookmark.id, openedAt: event.openedAt)
            }
        }
        .onChange(of: scenePhase) { _, phase in
            if phase == .active {
                homeRevision += 1
            }
        }
        .alert("Couldn’t update Jump Back In", isPresented: Binding(
            get: { externalOpenError != nil },
            set: { if !$0 { externalOpenError = nil } }
        )) {
            Button("OK", role: .cancel) {}
        } message: {
            Text(externalOpenError ?? "Please try again.")
        }
    }

    private var tabSelection: Binding<AppTab> {
        Binding(
            get: { selectedTab },
            set: { newTab in
                if newTab == selectedTab {
                    handleTabReselection(newTab)
                } else {
                    selectedTab = newTab
                }
            }
        )
    }

    private var selectedRootTitle: String {
        switch selectedTab {
        case .home, .library:
            ""
        case .settings:
            "Settings"
        case .search:
            "Search"
        }
    }

    private var selectedCompactRootTitle: (title: String, progress: CGFloat)? {
        switch selectedTab {
        case .home:
            ("Home", homeTitleCollapseProgress)
        case .library:
            ("Library", libraryTitleCollapseProgress)
        case .settings, .search:
            nil
        }
    }

    private var tabNavigationActions: ZineTabNavigationActions {
        ZineTabNavigationActions(
            home: { navigationPath.append($0) },
            homeSection: { navigationPath.append($0) },
            bookmark: { navigationPath.append($0) },
            settings: { navigationPath.append($0) }
        )
    }

    private func handleTabReselection(_ tab: AppTab) {
        switch tab {
        case .home:
            homeTabReselection += 1
        case .library:
            libraryTabReselection += 1
        case .settings, .search:
            break
        }
    }

    private func markHomeChanged() {
        homeRevision += 1
    }

    private func markBookmarkContentChanged() {
        homeRevision += 1
        libraryRevision += 1
    }

    @ViewBuilder
    private func homeDestination(for route: HomeNavigationRoute) -> some View {
        switch route.destination {
        case .item(let item):
            BookmarkDetailView(
                item: item,
                client: client,
                onUpdate: { _ in markBookmarkContentChanged() },
                onBookmarkCommit: { _, _ in markBookmarkContentChanged() },
                onExternalOpen: { bookmark, item in
                    if let bookmark {
                        handleExternalOpen(bookmark)
                    } else {
                        handleHomeItemExternalOpen(item)
                    }
                }
            )
        case .bookmark(let bookmark):
            BookmarkDetailView(
                bookmark: bookmark,
                client: client,
                onUpdate: { _ in markBookmarkContentChanged() },
                onBookmarkCommit: { _, _ in markBookmarkContentChanged() },
                onExternalOpen: handleExternalOpen
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
                onRead: { handleHomeItemExternalOpen(item) },
                onProgressSaved: { _ in markBookmarkContentChanged() },
                onFinishedChanged: { _, _ in markBookmarkContentChanged() },
                onFinishedCommit: { _ in markBookmarkContentChanged() },
                onTagsChanged: { _ in markBookmarkContentChanged() }
            )
        }
    }

    @ViewBuilder
    private func homeSectionDestination(for route: HomeSectionRoute) -> some View {
        switch route {
        case .jumpBackIn:
            JumpBackInListView(
                client: client,
                onContentChanged: markBookmarkContentChanged,
                onExternalOpen: handleExternalOpen,
                tabReselection: homeTabReselection
            )
        default:
            HomeSectionListView(
                route: route,
                client: client,
                onContentChanged: markBookmarkContentChanged,
                onExternalOpen: handleExternalOpen,
                tabReselection: homeTabReselection
            )
        }
    }

    private func bookmarkDestination(for bookmark: Bookmark) -> some View {
        BookmarkDetailView(
            bookmark: bookmark,
            client: client,
            onUpdate: { _ in markBookmarkContentChanged() },
            onBookmarkChange: { _, _, _ in markBookmarkContentChanged() },
            onExternalOpen: handleExternalOpen
        )
    }

    @ViewBuilder
    private func settingsDestination(for route: SettingsRoute) -> some View {
        switch route {
        case .sources:
            SubscriptionsView(client: client)
        case .appearance:
            AppearanceSettingsView()
        }
    }

    private func handleExternalOpen(_ bookmark: Bookmark) {
        guard bookmark.state == "BOOKMARKED", !bookmark.isFinished else { return }

        let openedAt = Date()
        externalOpenEvent = ExternalBookmarkOpenEvent(
            bookmark: bookmark,
            openedAt: openedAt,
            change: .promote
        )

        Task {
            await persistExternalOpen(bookmark, openedAt: openedAt)
        }
    }

    private func handleHomeItemExternalOpen(_ item: HomeItem) {
        Task {
            await persistHomeItemExternalOpen(item)
        }
    }

    private func persistHomeItemExternalOpen(_ item: HomeItem) async {
        do {
            try await client.markOpened(id: item.id)
        } catch is CancellationError {
            return
        } catch {
            do {
                try await Task.sleep(for: .milliseconds(500))
                try await client.markOpened(id: item.id)
            } catch is CancellationError {
                return
            } catch {
                externalOpenError = "Zine couldn’t save that open after retrying."
                return
            }
        }

        homeRevision += 1
    }

    private func persistExternalOpen(_ bookmark: Bookmark, openedAt: Date) async {
        do {
            try await client.markOpened(id: bookmark.id)
        } catch is CancellationError {
            return
        } catch {
            do {
                try await Task.sleep(for: .milliseconds(500))
                try await client.markOpened(id: bookmark.id)
            } catch is CancellationError {
                return
            } catch {
                externalOpenEvent = ExternalBookmarkOpenEvent(
                    bookmark: bookmark,
                    openedAt: openedAt,
                    change: .rollback
                )
                externalOpenError = "Zine couldn’t save that open after retrying. Your Home screen has been restored."
                return
            }
        }

        homeRevision += 1
    }
}

struct ConfigurationRequiredView: View {
    var body: some View {
        ContentUnavailableView {
            Label("Clerk configuration required", systemImage: "key")
        } description: {
            Text("Copy Configuration/Local.xcconfig.example to Local.xcconfig and add Zine’s Clerk publishable key.")
        }
    }
}
