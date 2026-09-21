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
    @State private var retry = 0
    @State private var loadID = UUID()

    private var player: PodcastPlayer { PodcastPlayer(rawValue: preference) ?? .overcast }
    private var destination: PodcastDestination? {
        guard let destination = result?.destination, destination.isValid(for: player) else { return nil }
        return destination
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            if let destination {
                Button {
                    ActionRowHaptics.play()
                    let options: [UIApplication.OpenExternalURLOptionsKey: Any] =
                        destination.url.scheme == "https" ? [.universalLinksOnly: true] : [:]
                    UIApplication.shared.open(destination.url, options: options) { opened in
                        if opened { onOpen() } else { appUnavailable = true }
                    }
                } label: {
                    Label(destination.label(for: player), systemImage: "arrow.up.forward.app")
                        .font(.subheadline.weight(.semibold))
                        .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
                }
                .accessibilityIdentifier("podcast-player-open")
                if destination.kind != .episode {
                    Text(destination.kind == .show
                         ? "Choose this episode in the show’s episode list."
                         : "Overcast will ask you to add this feed. An exact episode link isn’t available.")
                        .font(.caption)
                        .foregroundStyle(ZineTheme.secondaryText)
                }
            } else if isLoading {
                ProgressView("Finding the episode in \(player.title)…")
                    .font(.caption)
            } else {
                Text(failed || result?.temporarilyUnavailable == true
                     ? "Couldn’t check \(player.title) right now."
                     : "No verified episode link is available in \(player.title) yet.")
                    .font(.caption)
                    .foregroundStyle(ZineTheme.secondaryText)
                Button("Try again") { retry += 1 }
                    .accessibilityIdentifier("podcast-player-retry")
            }
            Button("Open publisher page") {
                openURL(publisherURL) { accepted in if accepted { onOpen() } }
            }
            .font(.subheadline)
            .accessibilityIdentifier("podcast-publisher-open")
        }
        .tint(ZineTheme.brandAccent)
        .task(id: "\(bookmarkID):\(preference):\(retry)") {
            let requestID = UUID()
            loadID = requestID
            result = nil
            failed = false
            isLoading = true
            defer { if loadID == requestID { isLoading = false } }
            do {
                let resolved = try await client.podcastDestination(id: bookmarkID, player: player)
                try Task.checkCancellation()
                if loadID == requestID { result = resolved }
            } catch is CancellationError {
                return
            } catch {
                if !Task.isCancelled && loadID == requestID { failed = true }
            }
        }
        .alert("Couldn’t open \(player.title)", isPresented: $appUnavailable) {
            Button("Open publisher page") {
                openURL(publisherURL) { accepted in if accepted { onOpen() } }
            }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("Check that the app is installed. You can also choose another podcast app in Settings.")
        }
    }
}
