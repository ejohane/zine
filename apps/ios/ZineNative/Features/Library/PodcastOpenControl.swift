import SwiftUI
import UIKit

struct PodcastOpenControl: View {
    let publisherURL: URL
    let destinations: [String: PodcastDestination]?
    let onOpen: () -> Void
    var hapticStyle: UIImpactFeedbackGenerator.FeedbackStyle = .light

    @AppStorage(PodcastPlayer.preferenceKey) private var preference = PodcastPlayer.overcast.rawValue
    @Environment(\.openURL) private var openURL
    @State private var appUnavailable = false

    private var player: PodcastPlayer { PodcastPlayer(rawValue: preference) ?? .overcast }
    private var target: PodcastOpenTarget {
        PodcastOpenTarget(player: player, destinations: destinations, originalURL: publisherURL)
    }

    var body: some View {
        ProviderOpenButton(provider: .web, destination: player.brandingURL, onActivate: activate, hapticStyle: hapticStyle)
            .accessibilityIdentifier("podcast-player-open")
            .accessibilityLabel(target.destination?.label(for: player) ?? "Open original link")
            .accessibilityHint(target.destination?.kind == .show
                               ? "Opens the show. Choose the episode from its list."
                               : "")
            .contextMenu {
                Button("Open original link", action: openPublisherWithFeedback)
            }
            .alert("Couldn’t open \(player.title)", isPresented: $appUnavailable) {
                Button("Open original link", action: openPublisherWithFeedback)
                Button("Cancel", role: .cancel) { ActionRowHaptics.play(style: hapticStyle) }
            } message: {
                Text("Check that the app is installed. You can also choose another podcast app in Settings.")
            }
    }

    private func activate() {
        guard target.destination != nil else {
            openPublisher()
            return
        }
        UIApplication.shared.open(target.url, options: [.universalLinksOnly: true]) { opened in
            if opened { onOpen() } else { appUnavailable = true }
        }
    }

    private func openPublisher() {
        openURL(publisherURL) { accepted in if accepted { onOpen() } }
    }

    private func openPublisherWithFeedback() {
        ActionRowHaptics.play(style: hapticStyle)
        openPublisher()
    }
}
