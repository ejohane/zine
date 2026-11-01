import Foundation

struct RssDiscovery: Decodable {
    var candidates: [RssFeedCandidate]

    var isSubscribed: Bool { candidates.contains { $0.isSubscribed } }
}

struct RssFeedCandidate: Decodable, Identifiable {
    let feedUrl: String
    let title: String?
    var subscription: Subscription?

    struct Subscription: Decodable {
        let feedId: String
        let status: RssFeedStatus
    }

    var id: String { feedUrl }
    var displayName: String { title?.isEmpty == false ? title! : feedUrl }
    var isSubscribed: Bool {
        guard let subscription else { return false }
        return subscription.status != .unsubscribed
    }
}
