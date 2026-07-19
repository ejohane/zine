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
    var creatorActionTitle: String {
        switch self {
        case .youtube, .spotify, .substack, .x, .web:
            "View on \(title)"
        case .gmail:
            "View in Gmail"
        case .rss:
            "View feed"
        }
    }

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

struct ProviderLinkButton: View {
    @Environment(\.colorScheme) private var colorScheme
    @Environment(\.openURL) private var openURL

    let provider: Provider
    let destination: URL
    let title: String
    var onOpen: () -> Void = {}

    private var action: ProviderOpenAction { provider.openAction }

    var body: some View {
        Button {
            ActionRowHaptics.play()
            onOpen()
            openURL(destination)
        } label: {
            HStack(spacing: 8) {
                providerLogo
                    .frame(width: 18, height: 18)

                Text(title)

                Image(systemName: "arrow.up.right")
                    .font(.caption.weight(.bold))
            }
            .font(.subheadline.weight(.semibold))
            .foregroundStyle(action.foregroundColor)
            .padding(.horizontal, 15)
            .frame(minHeight: 44)
            .background(action.backgroundColor, in: Capsule())
            .contentShape(Capsule())
        }
        .buttonStyle(.plain)
        .overlay {
            if action.needsDarkModeBorder && colorScheme == .dark {
                Capsule()
                    .stroke(.white.opacity(0.22), lineWidth: 1)
                    .allowsHitTesting(false)
            }
        }
        .accessibilityLabel(title)
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

struct ProviderOpenButton: View {
    @Environment(\.colorScheme) private var colorScheme
    @Environment(\.openURL) private var openURL

    let provider: Provider
    let destination: URL
    let onOpen: () -> Void

    init(
        provider: Provider,
        destination: URL,
        onOpen: @escaping () -> Void = {}
    ) {
        self.provider = provider
        self.destination = destination
        self.onOpen = onOpen
    }

    private var action: ProviderOpenAction { provider.openAction }

    var body: some View {
        Button {
            onOpen()
            openURL(destination)
        } label: {
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
