import ClerkKit
import SwiftUI

enum AppAppearance: String, CaseIterable, Identifiable {
    static let storageKey = "appAppearance"

    case system
    case light
    case dark

    var id: String { rawValue }

    var title: String {
        switch self {
        case .system: "System"
        case .light: "Light"
        case .dark: "Dark"
        }
    }

    var systemImage: String {
        switch self {
        case .system: "circle.lefthalf.filled"
        case .light: "sun.max"
        case .dark: "moon"
        }
    }

    var colorScheme: ColorScheme? {
        switch self {
        case .system: nil
        case .light: .light
        case .dark: .dark
        }
    }
}

@main
struct ZineNativeApp: App {
    private let configuration = AppConfiguration.current
    @AppStorage(AppAppearance.storageKey) private var storedAppearance = AppAppearance.system.rawValue

    init() {
        if configuration.isClerkConfigured {
            Clerk.configure(publishableKey: configuration.clerkPublishableKey)
        }
    }

    var body: some Scene {
        WindowGroup {
            rootView
                .preferredColorScheme(appearance.colorScheme)
        }
    }

    private var appearance: AppAppearance {
        AppAppearance(rawValue: storedAppearance) ?? .system
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
