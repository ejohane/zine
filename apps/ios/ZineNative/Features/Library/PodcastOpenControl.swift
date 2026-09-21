import SwiftUI
import UIKit

struct PodcastOpenControl: View {
    let bookmarkID: String
    let publisherURL: URL
    let client: APIClient
    let onOpen: () -> Void

    @AppStorage(PodcastPlayer.preferenceKey) private var preference = PodcastPlayer.overcast.rawValue
    @Environment(\.openURL) private var openURL
    @State private var result: PodcastDestinationResponse?
    @State private var isLoading = false
    @State private var failed = false
    @State private var appUnavailable = false
    @State private var resolutionUnavailable = false
    @State private var retry = 0
    @State private var loadID = UUID()
    @State private var resolvedKey: String?

    private var player: PodcastPlayer { PodcastPlayer(rawValue: preference) ?? .overcast }
    private var requestKey: String { "\(bookmarkID):\(preference):\(retry)" }
    private var destination: PodcastDestination? {
        guard resolvedKey == requestKey,
              let destination = result?.destination, destination.isValid(for: player) else { return nil }
        return destination
    }
    private var loading: Bool { isLoading || resolvedKey != requestKey }

    var body: some View {
        ProviderOpenButton(provider: .web, destination: player.brandingURL, onActivate: activate)
            .accessibilityIdentifier("podcast-player-open")
            .accessibilityLabel(destination?.label(for: player) ?? "Open in \(player.title)")
            .accessibilityHint(destination?.kind == .show
                               ? "Opens the show. Choose the episode from its list."
                               : "")
            .accessibilityValue(loading ? "Finding destination" : "")
            .disabled(loading)
            .overlay(alignment: .bottomTrailing) {
                if loading {
                    ProgressView()
                        .controlSize(.mini)
                        .tint(ZineTheme.primaryText)
                        .padding(4)
                        .background(ZineTheme.surface, in: Circle())
                        .allowsHitTesting(false)
                }
            }
            .contextMenu {
                Button("Open publisher page", action: openPublisher)
                Button("Check player link again") { retry += 1 }
            }
            .task(id: requestKey) {
                let requestID = UUID()
                let key = requestKey
                let requestedPlayer = player
                loadID = requestID
                result = nil
                failed = false
                isLoading = true
                appUnavailable = false
                resolutionUnavailable = false
                defer {
                    if loadID == requestID {
                        isLoading = false
                        resolvedKey = key
                    }
                }
                do {
                    let resolved = try await client.podcastDestination(id: bookmarkID, player: requestedPlayer)
                    try Task.checkCancellation()
                    if loadID == requestID { result = resolved }
                } catch is CancellationError {
                    return
                } catch {
                    if !Task.isCancelled && loadID == requestID { failed = true }
                }
            }
            .alert("Couldn’t open \(player.title)", isPresented: $appUnavailable) {
                Button("Open publisher page", action: openPublisher)
                Button("Cancel", role: .cancel) {}
            } message: {
                Text("Check that the app is installed. You can also choose another podcast app in Settings.")
            }
            .alert("Link unavailable in \(player.title)", isPresented: $resolutionUnavailable) {
                Button("Try again") { retry += 1 }
                Button("Open publisher page", action: openPublisher)
                Button("Cancel", role: .cancel) {}
            } message: {
                Text(failed || result?.temporarilyUnavailable == true
                     ? "Couldn’t check \(player.title) right now. Please try again."
                     : "A verified link isn’t available for this podcast yet.")
            }
    }

    private func activate() {
        guard let destination else {
            resolutionUnavailable = true
            return
        }
        UIApplication.shared.open(destination.url, options: [.universalLinksOnly: true]) { opened in
            if opened { onOpen() } else { appUnavailable = true }
        }
    }

    private func openPublisher() {
        openURL(publisherURL) { accepted in if accepted { onOpen() } }
    }
}
