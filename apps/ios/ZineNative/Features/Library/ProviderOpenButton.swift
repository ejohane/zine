import SwiftUI

enum ProviderLogo: Equatable {
    case asset(String)
    case system(String)
}

struct ProviderOpenAction {
    let title: String
    let accessibilityLabel: String
    let backgroundColor: Color
    let foregroundColor: Color
    let logo: ProviderLogo
    let needsDarkModeBorder: Bool
}

extension Provider {
    var openAction: ProviderOpenAction {
        switch self {
        case .youtube:
            ProviderOpenAction(
                title: "Open in YouTube",
                accessibilityLabel: "Open in YouTube",
                backgroundColor: Color(red: 1, green: 0, blue: 0),
                foregroundColor: .white,
                logo: .asset("YouTubeLogo"),
                needsDarkModeBorder: false
            )
        case .spotify:
            ProviderOpenAction(
                title: "Open in Spotify",
                accessibilityLabel: "Open in Spotify",
                backgroundColor: Color(red: 29 / 255, green: 185 / 255, blue: 84 / 255),
                foregroundColor: .white,
                logo: .asset("SpotifyLogo"),
                needsDarkModeBorder: false
            )
        case .substack:
            ProviderOpenAction(
                title: "Open in Substack",
                accessibilityLabel: "Open in Substack",
                backgroundColor: Color(red: 1, green: 103 / 255, blue: 25 / 255),
                foregroundColor: .white,
                logo: .asset("SubstackLogo"),
                needsDarkModeBorder: false
            )
        case .x:
            ProviderOpenAction(
                title: "Open in X",
                accessibilityLabel: "Open in X",
                backgroundColor: .black,
                foregroundColor: .white,
                logo: .asset("XLogo"),
                needsDarkModeBorder: true
            )
        case .web:
            ProviderOpenAction(
                title: "Open on Web",
                accessibilityLabel: "Open on the web",
                backgroundColor: Color(uiColor: .systemBlue),
                foregroundColor: .white,
                logo: .system("safari.fill"),
                needsDarkModeBorder: false
            )
        case .gmail:
            ProviderOpenAction(
                title: "Open in Gmail",
                accessibilityLabel: "Open in Gmail",
                backgroundColor: Color(uiColor: .systemBlue),
                foregroundColor: .white,
                logo: .system("envelope.fill"),
                needsDarkModeBorder: false
            )
        case .rss:
            ProviderOpenAction(
                title: "Open RSS Item",
                accessibilityLabel: "Open RSS item",
                backgroundColor: Color(uiColor: .systemOrange),
                foregroundColor: .white,
                logo: .system("dot.radiowaves.left.and.right"),
                needsDarkModeBorder: false
            )
        }
    }
}

struct ProviderOpenButton: View {
    @Environment(\.colorScheme) private var colorScheme

    let provider: Provider
    let destination: URL

    private var action: ProviderOpenAction { provider.openAction }

    var body: some View {
        Link(destination: destination) {
            providerLogo
                .frame(width: 27, height: 27)
                .frame(width: 56, height: 56)
                .background(action.backgroundColor, in: Circle())
                .foregroundStyle(action.foregroundColor)
                .accessibilityHidden(true)
        }
        .buttonStyle(.plain)
        .overlay {
            if action.needsDarkModeBorder && colorScheme == .dark {
                Circle()
                    .stroke(.white.opacity(0.22), lineWidth: 1)
                    .allowsHitTesting(false)
            }
        }
        .accessibilityLabel(action.accessibilityLabel)
        .actionRowHaptic()
    }

    @ViewBuilder
    private var providerLogo: some View {
        switch action.logo {
        case let .asset(name):
            Image(name)
                .resizable()
                .scaledToFit()
        case let .system(name):
            Image(systemName: name)
                .resizable()
                .scaledToFit()
                .symbolRenderingMode(.monochrome)
        }
    }
}
