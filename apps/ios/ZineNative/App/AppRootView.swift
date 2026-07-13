import ClerkKit
import ClerkKitUI
import SwiftUI

struct AppRootView: View {
    let configuration: AppConfiguration

    @Environment(Clerk.self) private var clerk

    var body: some View {
        Group {
            if let user = clerk.user {
                LibraryView(
                    client: APIClient(
                        baseURL: configuration.apiBaseURL,
                        tokenProvider: {
                            guard let token = try await Clerk.shared.auth.getToken() else {
                                throw APIError.missingSession
                            }
                            return token
                        }
                    ),
                    cache: LibraryCache(userID: user.id)
                )
            } else {
                AuthView(isDismissible: false)
            }
        }
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
