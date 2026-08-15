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
    @State private var homeNavigationPath = NavigationPath()
    @State private var libraryNavigationPath = NavigationPath()
    @State private var settingsNavigationPath = NavigationPath()
    @State private var searchNavigationPath = NavigationPath()
    @State private var homeTabReselection = 0
    @State private var libraryTabReselection = 0
    @State private var homeRevision = 0
    @State private var libraryRevision = 0
    @State private var externalOpenEvent: ExternalBookmarkOpenEvent?
    @State private var externalOpenError: String?

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
                    navigationPath: $homeNavigationPath
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
                    navigationPath: $libraryNavigationPath
                )
                .tint(ZineTheme.brandAccent)
            }

            Tab("Settings", systemImage: "gearshape", value: AppTab.settings) {
                AppSettingsView(
                    client: client,
                    navigationPath: $settingsNavigationPath
                )
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
                    navigationPath: $searchNavigationPath
                )
                .searchable(text: $search, prompt: "Search your library")
                .tint(ZineTheme.brandAccent)
            }
        }
        .zineTabShellChrome()
        .zineNavigationTabBar(
            for: selectedRootSurface,
            navigationDepth: selectedNavigationDepth
        )
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

    private var selectedNavigationDepth: Int {
        switch selectedTab {
        case .home:
            homeNavigationPath.count
        case .library:
            libraryNavigationPath.count
        case .settings:
            settingsNavigationPath.count
        case .search:
            searchNavigationPath.count
        }
    }

    private var selectedRootSurface: ZineTabRootSurface {
        switch selectedTab {
        case .home: .home
        case .library: .library
        case .settings: .settings
        case .search: .search
        }
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
