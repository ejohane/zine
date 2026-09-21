import Foundation

enum PodcastPlayer: String, Codable, CaseIterable, Identifiable {
    case overcast = "OVERCAST"
    case pocketCasts = "POCKET_CASTS"
    case applePodcasts = "APPLE_PODCASTS"

    static let preferenceKey = "defaultPodcastPlayer"
    var id: String { rawValue }
    var title: String {
        switch self {
        case .overcast: "Overcast"
        case .pocketCasts: "Pocket Casts"
        case .applePodcasts: "Apple Podcasts"
        }
    }

    var brandingURL: URL {
        switch self {
        case .overcast: URL(string: "https://overcast.fm")!
        case .pocketCasts: URL(string: "https://pocketcasts.com")!
        case .applePodcasts: URL(string: "https://podcasts.apple.com")!
        }
    }

    static func originalPlayer(for url: URL) -> PodcastPlayer? {
        switch url.host?.lowercased() {
        case "overcast.fm", "www.overcast.fm": .overcast
        case "podcasts.apple.com": .applePodcasts
        case "pocketcasts.com", "www.pocketcasts.com", "pca.st": .pocketCasts
        default: nil
        }
    }
}

struct PodcastDestinationResponse: Decodable {
    let destination: PodcastDestination?
    let originalUrl: URL?
    let publisherUrl: URL
    let temporarilyUnavailable: Bool
}

struct PodcastDestination: Decodable, Equatable {
    enum Kind: String, Decodable { case episode, show, subscribe }
    let url: URL
    let kind: Kind

    func label(for player: PodcastPlayer) -> String {
        switch kind {
        case .episode: "Open episode in \(player.title)"
        case .show: "Open show in \(player.title)"
        case .subscribe: "Add show to \(player.title)"
        }
    }

    func isValid(for player: PodcastPlayer) -> Bool {
        guard url.user == nil, url.password == nil else { return false }
        if kind == .subscribe {
            return player == .overcast && url.scheme == "overcast" && url.host == "x-callback-url"
                && url.path == "/add"
        }
        return url.scheme == "https" && PodcastPlayer.originalPlayer(for: url) == player
    }
}
