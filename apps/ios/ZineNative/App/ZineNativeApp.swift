import ClerkKit
import SwiftUI

@main
struct ZineNativeApp: App {
    private let configuration = AppConfiguration.current

    init() {
        if configuration.isClerkConfigured {
            Clerk.configure(publishableKey: configuration.clerkPublishableKey)
        }
    }

    var body: some Scene {
        WindowGroup {
            rootView
        }
    }

    @ViewBuilder
    private var rootView: some View {
#if DEBUG
        if ProcessInfo.processInfo.arguments.contains("-screenshot-fixtures") {
            ScreenshotLibraryView()
        } else {
            configuredRootView
        }
#else
        configuredRootView
#endif
    }

    @ViewBuilder
    private var configuredRootView: some View {
        if configuration.isClerkConfigured {
            AppRootView(configuration: configuration)
                .environment(Clerk.shared)
                .onOpenURL { url in
                    Task { try? await Clerk.shared.handle(url) }
                }
        } else {
            ConfigurationRequiredView()
        }
    }
}
