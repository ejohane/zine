import ClerkKit
import ClerkKitUI
import SwiftUI
import UIKit

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

struct SearchCreatorRoute: Hashable {
    let bookmark: Bookmark
}

struct ZineTabNavigationActions {
    var home: ((HomeNavigationRoute) -> Void)?
    var homeSection: ((HomeSectionRoute) -> Void)?
    var bookmark: ((Bookmark) -> Void)?
    var settings: ((SettingsRoute) -> Void)?
    var creator: ((SearchCreatorRoute) -> Void)?
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
                    userID: user.id,
                    userCreatedAt: user.createdAt,
                    userEmail: user.primaryEmailAddress?.emailAddress
                )
                .id("\(user.id)-\(user.primaryEmailAddress?.emailAddress ?? "")-\(configuration.apiBaseURL.absoluteString)")
            } else {
                ZineAuthEntryView()
            }
        }
    }
}

struct AuthenticatedAppView: View {
    private enum SourcesPresentation {
        case firstUse
        case replay
    }

    private enum AppTab: Hashable {
        case home
        case library
        case inbox
        case search
    }

    private enum SettingsEntryRoute: Hashable {
        case root
    }

    @Environment(\.scenePhase) private var scenePhase

    private let configuration: AppConfiguration
    private let userID: String
    @State private var session: AuthenticatedAppSession
    private var client: APIClient { session.client }
    private var inboxCache: InboxCache { session.inboxCache }
    private var libraryCache: LibraryCache { session.libraryCache }
    private var offlineLibrarySynchronizer: OfflineLibrarySynchronizer { session.offlineLibrarySynchronizer }
    private var commandSession: NativeCommandSession { session.commandSession }
    private var homeStore: HomeStore { session.homeStore }
    @State private var sourcesPresentation: SourcesPresentation?
    @State private var search = ""
    @State private var searchTabReselection = 0
    @State private var selectedTab = AppTab.home
    @State private var navigationPath = NavigationPath()
    @State private var homeTabReselection = 0
    @State private var inboxTabReselection = 0
    @State private var inboxTitleCollapseState = ListTitleCollapseState()
    @State private var libraryTabReselection = 0
    @State private var homeTitleCollapseState = ListTitleCollapseState()
    @State private var libraryTitleCollapseState = ListTitleCollapseState()
    @State private var searchTitleCollapseState = ListTitleCollapseState()
    @State private var homeRevision = 0
    @State private var libraryRevision = 0
    @State private var offlineSyncRevision = 0
    @State private var externalOpenEvent: ExternalBookmarkOpenEvent?
    @State private var externalOpenError: String?
    @Namespace private var navigationTransition

    init(configuration: AppConfiguration, userID: String, userCreatedAt: Date, userEmail: String?, initialSession: AuthenticatedAppSession? = nil) {
        self.configuration = configuration
        self.userID = userID
        let replayRequested = SourcesOnboardingReplayAccess.consumePreviewRequest(
            verifiedEmail: userEmail
        )
        let shouldPresentFirstUse = SourcesOnboardingProgress.shouldPresent(
            userID: userID,
            createdAt: userCreatedAt
        )
        _sourcesPresentation = State(initialValue: replayRequested
            ? .replay
            : (shouldPresentFirstUse ? .firstUse : nil))
        _session = State(initialValue: initialSession ?? AuthenticatedAppSession(
            baseURL: configuration.apiBaseURL, userID: userID,
            tokenProvider: {
                guard let token = try await Clerk.shared.auth.getToken() else {
                    throw APIError.missingSession
                }
                return token
            }
        ))
    }

    var body: some View {
        if let sourcesPresentation {
            ChooseSourcesView(client: client, configuration: configuration) {
                if sourcesPresentation == .firstUse {
                    SourcesOnboardingProgress.markCompleted(userID: userID)
                }
                self.sourcesPresentation = nil
            }
        } else {
            appShell
        }
    }

    private var appShell: some View {
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
                        transitionNamespace: navigationTransition,
                        registersNavigationDestinations: false,
                        titleCollapseState: homeTitleCollapseState
                    )
                    .tint(ZineTheme.brandAccent)
                }

                Tab("Inbox", systemImage: "tray", value: AppTab.inbox) {
                    HomeSectionListView(
                        route: .inbox,
                        client: client,
                        inboxCache: inboxCache,
                        initialItems: homeStore.inboxPreviewItems,
                        onContentChanged: markBookmarkContentChanged,
                        onExternalOpen: handleExternalOpen,
                        tabReselection: inboxTabReselection,
                        title: "Inbox",
                        background: ZineTheme.canvas,
                        refreshRevision: libraryRevision,
                        titleCollapseState: inboxTitleCollapseState
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
                        transitionNamespace: navigationTransition,
                        titleCollapseState: libraryTitleCollapseState
                    )
                    .tint(ZineTheme.brandAccent)
                }

                Tab(value: AppTab.search) {
                    LibraryView(
                        client: client,
                        cache: libraryCache,
                        searchText: $search,
                        searchHistoryKey: "zine.search.history.\(userID)",
                        refreshRevision: libraryRevision,
                        onContentChanged: markHomeChanged,
                        onExternalOpen: handleExternalOpen,
                        tabReselection: searchTabReselection,
                        transitionNamespace: navigationTransition,
                        titleCollapseState: searchTitleCollapseState
                    )
                    .tint(ZineTheme.brandAccent)
                } label: {
                    Label {
                        Text("Search")
                    } icon: {
                        Image(uiImage: UIImage(
                            systemName: "magnifyingglass",
                            withConfiguration: UIImage.SymbolConfiguration(weight: .medium)
                        )!)
                        .renderingMode(.template)
                    }
                }
            }
            .zineTabShellChrome()
            .navigationTitle(selectedRootTitle)
            .navigationBarTitleDisplayMode(.inline)
            .zineRootNavigationChrome(
                compactTitle: selectedCompactRootTitle?.title,
                collapseProgress: selectedCompactRootTitle?.progress ?? 0,
                collapseState: selectedTitleCollapseState
            )
            .toolbar {
                if selectedTab == .home && navigationPath.isEmpty {
                    ToolbarItem(placement: .topBarTrailing) {
                        Button {
                            navigationPath.append(SettingsEntryRoute.root)
                        } label: {
                            Image(systemName: "gearshape")
                                .font(.system(size: 20, weight: .medium))
                                .foregroundStyle(ZineTheme.primaryText)
                                .frame(width: 44, height: 44)
                                .contentShape(Rectangle())
                        }
                        .accessibilityLabel("Settings")
                        .accessibilityIdentifier("home-settings-button")
                    }
                }
            }
            .environment(\.zineTabNavigationActions, tabNavigationActions)
            .navigationDestination(for: SettingsEntryRoute.self) { _ in
                AppSettingsView(
                    client: client,
                    onSignedOut: {
                        await client.removeOfflineArticleData()
                        await libraryCache.removeAll()
                    }
                )
                .zinePushedDestinationChrome()
            }
            .navigationDestination(for: HomeNavigationRoute.self) { route in
                homeDestination(for: route)
                    .navigationTransition(
                        .zoom(sourceID: route.sourceID, in: navigationTransition)
                    )
                    .zinePushedDestinationChrome()
            }
            .navigationDestination(for: HomeSectionRoute.self) { route in
                homeSectionDestination(for: route)
                    .zinePushedDestinationChrome()
            }
            .navigationDestination(for: Bookmark.self) { bookmark in
                bookmarkDestination(for: bookmark)
                    .navigationTransition(
                        .zoom(sourceID: bookmark.id, in: navigationTransition)
                    )
                    .zinePushedDestinationChrome()
            }
            .navigationDestination(for: SearchCreatorRoute.self) { route in
                CreatorView(
                    creatorId: route.bookmark.creatorId ?? "",
                    fallbackName: route.bookmark.creator,
                    fallbackImageUrl: route.bookmark.creatorImageUrl,
                    fallbackProvider: route.bookmark.provider,
                    client: client,
                    onBookmarkUpdate: { _ in markBookmarkContentChanged() },
                    onBookmarkChange: { _, _, _ in markBookmarkContentChanged() },
                    onExternalOpen: handleExternalOpen
                )
                .zinePushedDestinationChrome()
            }
            .navigationDestination(for: SettingsRoute.self) { route in
                settingsDestination(for: route)
                    .zinePushedDestinationChrome()
            }
        }
        .environment(\.nativeCommandSession, commandSession)
        .task {
            commandSession.navigate = navigateCommand
            commandSession.queryLibrary = { query in
                let target: AppTab = query.search.isEmpty ? .library : .search
                let route = query.search.isEmpty ? "library" : "search"
                navigationPath = NavigationPath()
                selectedTab = target
                for _ in 0..<100 {
                    if commandSession.route == route, let apply = commandSession.applyLibraryQuery {
                        await apply(query)
                        // The view task may supersede the explicit reload after bindings change.
                        for _ in 0..<2500 {
                            if let library = commandSession.library,
                               library.activeQuery == query, !library.isReloading { return }
                            try await Task.sleep(for: .milliseconds(20))
                        }
                        throw CommandError("library_query_timed_out")
                    }
                    try await Task.sleep(for: .milliseconds(20))
                }
                throw CommandError("library_navigation_timed_out")
            }
            #if DEBUG && targetEnvironment(simulator)
            if let bridge = SimulatorCommandBridge(session: commandSession) { await bridge.run() }
            #endif
        }
        .onReceive(NotificationCenter.default.publisher(for: .zineBookmarkSaved)) { _ in
            markBookmarkContentChanged()
        }
        .task(id: homeRevision) {
            await homeStore.reload()
        }
        .task(id: offlineSyncRevision) {
            await offlineLibrarySynchronizer.synchronize()
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
                libraryRevision += 1
                offlineSyncRevision += 1
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
                    if newTab == .search { searchTabReselection += 1 }
                }
            }
        )
    }

    private var selectedRootTitle: String {
        switch selectedTab {
        case .home, .library, .inbox:
            ""
        case .search:
            ""
        }
    }

    private var selectedTitleCollapseState: ListTitleCollapseState? {
        switch selectedTab {
        case .home: homeTitleCollapseState
        case .inbox: inboxTitleCollapseState
        case .library: libraryTitleCollapseState
        case .search: searchTitleCollapseState
        }
    }

    private var selectedCompactRootTitle: (title: String, progress: CGFloat)? {
        switch selectedTab {
        case .home:
            ("Home", 0)
        case .inbox:
            ("Inbox", 0)
        case .library:
            ("Library", 0)
        case .search:
            ("Search", 0)
        }
    }

    private var tabNavigationActions: ZineTabNavigationActions {
        ZineTabNavigationActions(
            home: { navigationPath.append($0) },
            homeSection: { route in
                if route == .inbox {
                    selectedTab = .inbox
                } else {
                    navigationPath.append(route)
                }
            },
            bookmark: { navigationPath.append($0) },
            settings: { navigationPath.append($0) },
            creator: { navigationPath.append($0) }
        )
    }

    private func handleTabReselection(_ tab: AppTab) {
        switch tab {
        case .home:
            homeTabReselection += 1
        case .inbox:
            inboxTabReselection += 1
        case .library:
            libraryTabReselection += 1
        case .search:
            searchTabReselection += 1
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
        case .resumeArticle(let item):
            BookmarkDetailView(
                item: item,
                client: client,
                resumesArticleReading: true,
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
                inboxCache: route == .inbox ? inboxCache : nil,
                initialItems: route == .inbox ? homeStore.inboxPreviewItems : [],
                onItemVisibilityChanged: { id, isVisible in
                    homeStore.setItemVisibility(id: id, isVisible: isVisible)
                },
                onContentChanged: markBookmarkContentChanged,
                onExternalOpen: handleExternalOpen,
                tabReselection: homeTabReselection
            )
        }
    }

    private func navigateCommand(_ name: String, id: String?) async throws {
        switch name {
        case "library.open":
            commandSession.reader = nil
            commandSession.bookmarkID = nil
            guard let queryLibrary = commandSession.queryLibrary else { throw CommandError("library_unavailable") }
            try await queryLibrary(LibraryQuery())
            return
        case "bookmark.open":
            guard let id else { throw CommandError("bookmark_id_required") }
            let bookmark = try await client.getBookmark(id: id)
            commandSession.openReader = nil
            navigationPath = NavigationPath()
            navigationPath.append(bookmark)
            for _ in 0..<100 {
                if commandSession.bookmarkID == id, commandSession.openReader != nil { return }
                try await Task.sleep(for: .milliseconds(20))
            }
        case "reader.open":
            guard id == commandSession.bookmarkID, let openReader = commandSession.openReader else {
                throw CommandError("open_bookmark_first")
            }
            openReader()
            for _ in 0..<2500 {
                if commandSession.route == "reader", let reader = commandSession.reader {
                    switch reader.phase {
                    case .ready: return
                    case .failed, .unavailable: throw CommandError("reader_unavailable")
                    default: break
                    }
                }
                try await Task.sleep(for: .milliseconds(20))
            }
        default: throw CommandError("unknown_navigation")
        }
        throw CommandError("navigation_timed_out")
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
                guard !error.isRetryableOfflineMutationFailure else { return }
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
                guard !error.isRetryableOfflineMutationFailure else { return }
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

/// One dependency graph for the lifetime of the authenticated SwiftUI identity.
/// View reconstruction must not pair retained stores with a newly created client.
@MainActor
final class AuthenticatedAppSession {
    let client: APIClient
    let inboxCache: InboxCache
    let libraryCache: LibraryCache
    let homeStore: HomeStore
    let commandSession: NativeCommandSession
    let offlineLibrarySynchronizer: OfflineLibrarySynchronizer

    init(baseURL: URL, userID: String, tokenProvider: @escaping APIClient.TokenProvider,
         transport: URLSession = .shared, baseDirectory: URL? = nil) {
        let client = APIClient(
            baseURL: baseURL, tokenProvider: tokenProvider, session: transport,
            articleBodyCache: ArticleBodyCache(userID: userID, baseDirectory: baseDirectory),
            bookmarkMutationOutbox: OfflineBookmarkMutationOutbox(userID: userID, baseDirectory: baseDirectory)
        )
        self.client = client
        inboxCache = InboxCache(userID: userID, baseDirectory: baseDirectory)
        libraryCache = LibraryCache(userID: userID, baseDirectory: baseDirectory)
        homeStore = HomeStore(client: client, cache: HomeCache(userID: userID, baseDirectory: baseDirectory))
        commandSession = NativeCommandSession(client: client)
        offlineLibrarySynchronizer = OfflineLibrarySynchronizer(client: client, libraryCache: libraryCache)
    }
}
