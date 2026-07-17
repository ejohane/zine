import Foundation

enum SubscriptionSource: String, CaseIterable, Decodable, Hashable, Identifiable {
    case youtube = "YOUTUBE"
    case spotify = "SPOTIFY"
    case gmail = "GMAIL"
    case x = "X"
    case rss = "RSS"

    var id: Self { self }

    var pathComponent: String { rawValue.lowercased() }

    var title: String {
        switch self {
        case .youtube: "YouTube"
        case .spotify: "Spotify"
        case .gmail: "Newsletters"
        case .x: "X Bookmarks"
        case .rss: "RSS"
        }
    }

    var providerTitle: String {
        switch self {
        case .gmail: "Gmail"
        case .x: "X"
        default: title
        }
    }

    var systemImage: String {
        switch self {
        case .youtube: "play.rectangle.fill"
        case .spotify: "waveform.circle.fill"
        case .gmail: "envelope.fill"
        case .x: "bookmark.square.fill"
        case .rss: "dot.radiowaves.left.and.right"
        }
    }

    var itemNoun: String {
        switch self {
        case .youtube: "channel"
        case .spotify: "show"
        case .gmail: "newsletter"
        case .x: "bookmark"
        case .rss: "feed"
        }
    }

    var connectedDescription: String {
        switch self {
        case .youtube: "Videos from your selected channels appear in Inbox after sync."
        case .spotify: "New episodes from your selected shows appear in Inbox."
        case .gmail: "Active newsletters from Gmail appear in Inbox as articles."
        case .x: "Your X bookmarks are imported into your Zine library."
        case .rss: "RSS feeds sync directly without an external account."
        }
    }
}

enum ProviderSubscriptionStatus: String, Decodable {
    case active = "ACTIVE"
    case paused = "PAUSED"
    case disconnected = "DISCONNECTED"

    var title: String {
        switch self {
        case .active: "Active"
        case .paused: "Paused"
        case .disconnected: "Needs attention"
        }
    }
}

struct ProviderConnection: Decodable, Equatable {
    let status: String
    let providerUserId: String?
    let connectedAt: Int?
    let lastRefreshedAt: Int?

    var isActive: Bool { status == "ACTIVE" }
    var needsAttention: Bool { status == "EXPIRED" || status == "REVOKED" }
}

struct SubscriptionSourceSummary: Decodable, Equatable, Identifiable {
    let provider: SubscriptionSource
    let connectionStatus: String?
    let activeCount: Int

    var id: SubscriptionSource { provider }
    var isConnected: Bool { connectionStatus == "ACTIVE" }
    var needsAttention: Bool { connectionStatus == "EXPIRED" || connectionStatus == "REVOKED" }

    var statusText: String {
        let count = "\(activeCount) \(provider.itemNoun)\(activeCount == 1 ? "" : "s")"
        if provider == .rss { return activeCount > 0 ? count : "No account required" }
        if needsAttention { return "Needs attention · \(count)" }
        if isConnected { return "Connected · \(count)" }
        return activeCount > 0 ? "Not connected · \(count)" : "Not connected"
    }
}

struct SubscriptionsHubResponse: Decodable, Equatable {
    let sources: [SubscriptionSourceSummary]
}

struct ProviderSubscriptionItem: Decodable, Equatable, Identifiable {
    let subscriptionId: String?
    let channelId: String
    let name: String
    let imageUrl: URL?
    let status: ProviderSubscriptionStatus?
    let isSubscribed: Bool
    let lastPolledAt: Int?

    var id: String { channelId }
}

struct ProviderSubscriptionsResponse: Decodable, Equatable {
    let connection: ProviderConnection?
    let connectionRequired: Bool
    let items: [ProviderSubscriptionItem]
}

struct SubscriptionSyncResponse: Decodable, Equatable {
    let itemsFound: Int
}

enum NewsletterStatus: String, Decodable {
    case active = "ACTIVE"
    case hidden = "HIDDEN"
    case unsubscribed = "UNSUBSCRIBED"

    var title: String {
        switch self {
        case .active: "Active"
        case .hidden: "Hidden"
        case .unsubscribed: "Unsubscribed"
        }
    }
}

struct NewsletterFeed: Decodable, Equatable, Identifiable {
    let id: String
    let displayName: String
    let fromAddress: String?
    let imageUrl: URL?
    let status: NewsletterStatus
    let lastSeenAt: Int?
}

struct NewsletterStats: Decodable, Equatable {
    let total: Int
    let active: Int
    let hidden: Int
    let unsubscribed: Int
    let lastSyncAt: Int?
    let lastSyncStatus: String
    let lastSyncError: String?
}

struct NewsletterSubscriptionsResponse: Decodable, Equatable {
    let connection: ProviderConnection?
    let items: [NewsletterFeed]
    let stats: NewsletterStats
}

enum RssFeedStatus: String, Decodable {
    case active = "ACTIVE"
    case paused = "PAUSED"
    case unsubscribed = "UNSUBSCRIBED"
    case error = "ERROR"

    var title: String {
        switch self {
        case .active: "Active"
        case .paused: "Paused"
        case .unsubscribed: "Removed"
        case .error: "Needs attention"
        }
    }
}

struct RssFeed: Decodable, Equatable, Identifiable {
    let id: String
    let feedUrl: URL
    let title: String
    let description: String?
    let siteUrl: URL?
    let imageUrl: URL?
    let status: RssFeedStatus
    let errorCount: Int
    let lastError: String?
    let lastPolledAt: Int?
    let lastSuccessAt: Int?
}

struct RssStats: Decodable, Equatable {
    let total: Int
    let active: Int
    let paused: Int
    let unsubscribed: Int
    let error: Int
    let lastSuccessAt: Int?
}

struct RssSubscriptionsResponse: Decodable, Equatable {
    let items: [RssFeed]
    let stats: RssStats
}

struct XBookmarkSyncState: Decodable, Equatable {
    let status: String
    let dailySyncEnabled: Bool
    let lastSyncAt: Int?
    let lastSuccessAt: Int?
    let lastError: String?
    let rateLimitedUntil: Int?
    let lastEstimatedBillableReads: Int
}

struct XSubscriptionsResponse: Decodable, Equatable {
    let connection: ProviderConnection?
    let connected: Bool
    let connectionStatus: String?
    let importedCount: Int
    let sync: XBookmarkSyncState?
}
