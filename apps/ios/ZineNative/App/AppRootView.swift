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
    @Environment(\.scenePhase) private var scenePhase

    private let client: APIClient
    private let editorialCache: EditorialIssueCache
    private let homeCache: HomeCache
    private let libraryCache: LibraryCache

    @State private var search = ""
    @State private var homeRevision = 0
    @State private var libraryRevision = 0
    @State private var externalOpenEvent: ExternalBookmarkOpenEvent?
    @State private var externalOpenError: String?

    init(configuration: AppConfiguration, userID: String) {
        client = APIClient(
            baseURL: configuration.apiBaseURL,
            tokenProvider: {
                guard let token = try await Clerk.shared.auth.getToken() else {
                    throw APIError.missingSession
                }
                return token
            }
        )
        editorialCache = EditorialIssueCache(userID: userID)
        homeCache = HomeCache(userID: userID)
        libraryCache = LibraryCache(userID: userID)
    }

    var body: some View {
        TabView {
            Tab("Today", systemImage: "newspaper") {
                TodayView(
                    client: client,
                    cache: editorialCache,
                    refreshRevision: homeRevision,
                    onContentChanged: markBookmarkContentChanged,
                    onExternalOpen: handleExternalOpen
                )
                .tint(Color.accentColor)
            }

            Tab("Home", systemImage: "house") {
                HomeView(
                    client: client,
                    cache: homeCache,
                    refreshRevision: homeRevision,
                    externalOpenEvent: externalOpenEvent,
                    onContentChanged: markBookmarkContentChanged,
                    onExternalOpen: handleExternalOpen,
                    onHomeItemExternalOpen: handleHomeItemExternalOpen
                )
                .tint(Color.accentColor)
            }

            Tab("Library", systemImage: "books.vertical") {
                LibraryView(
                    client: client,
                    cache: libraryCache,
                    refreshRevision: libraryRevision,
                    onContentChanged: markHomeChanged,
                    onExternalOpen: handleExternalOpen
                )
                .tint(Color.accentColor)
            }

            Tab("Settings", systemImage: "gearshape") {
                AppSettingsView(client: client)
                    .tint(Color.accentColor)
            }

            Tab(role: .search) {
                LibraryView(
                    client: client,
                    cache: libraryCache,
                    searchText: $search,
                    refreshRevision: libraryRevision,
                    onContentChanged: markHomeChanged,
                    onExternalOpen: handleExternalOpen
                )
                .searchable(text: $search, prompt: "Search your library")
                .tint(Color.accentColor)
            }
        }
        .tint(Color.primary)
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
