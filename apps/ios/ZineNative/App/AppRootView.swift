import ClerkKit
import ClerkKitUI
import SwiftUI

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
    private let client: APIClient
    private let libraryCache: LibraryCache
    private let inboxCache: InboxCache

    @State private var search = ""
    @State private var libraryRevision = 0

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
        libraryCache = LibraryCache(userID: userID)
        inboxCache = InboxCache(userID: userID)
    }

    var body: some View {
        TabView {
            Tab("Inbox", systemImage: "tray") {
                InboxView(
                    client: client,
                    cache: inboxCache,
                    onLibraryChanged: markLibraryChanged
                )
            }

            Tab("Library", systemImage: "books.vertical") {
                LibraryView(
                    client: client,
                    cache: libraryCache,
                    refreshRevision: libraryRevision
                )
            }

            Tab(role: .search) {
                LibraryView(
                    client: client,
                    cache: libraryCache,
                    searchText: $search,
                    refreshRevision: libraryRevision
                )
                .searchable(text: $search, prompt: "Search your library")
            }
        }
    }

    private func markLibraryChanged() {
        libraryRevision += 1
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
