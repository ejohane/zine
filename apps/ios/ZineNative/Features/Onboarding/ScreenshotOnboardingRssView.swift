#if DEBUG
import SwiftUI

/// Deterministic RSS layout preview; it does not use an authenticated API.
struct ScreenshotOnboardingRssView: View {
    let showsFeeds: Bool

    var body: some View {
        NavigationStack {
            OnboardingRssSubscriptionsView(client: RssSubscriptionsClient(
                load: { Self.response(showsFeeds: showsFeeds) },
                add: { _ in },
                update: { _, _ in },
                remove: { _ in },
                sync: { _ in SubscriptionSyncResponse(itemsFound: 0) }
            ))
        }
        .tint(ZineTheme.brandAccent)
    }

    private static func response(showsFeeds: Bool) -> RssSubscriptionsResponse {
        let feeds = showsFeeds
            ? [
                feed("The Pragmatic Engineer", id: "pragmatic", url: "https://newsletter.pragmaticengineer.com/feed"),
                feed("The Verge", id: "verge", url: "https://www.theverge.com/rss/index.xml"),
                feed("Decoder", id: "decoder", url: "https://feeds.megaphone.fm/decoder", type: "PODCAST"),
            ]
            : []
        return RssSubscriptionsResponse(
            items: feeds,
            stats: RssStats(
                total: feeds.count,
                active: feeds.count,
                paused: 0,
                unsubscribed: 0,
                error: 0,
                lastSuccessAt: nil
            )
        )
    }

    private static func feed(
        _ title: String,
        id: String,
        url: String,
        type: String? = nil
    ) -> RssFeed {
        RssFeed(
            id: id,
            feedUrl: URL(string: url)!,
            title: title,
            description: nil,
            siteUrl: nil,
            imageUrl: nil,
            status: .active,
            errorCount: 0,
            lastError: nil,
            lastPolledAt: nil,
            lastSuccessAt: nil,
            autoBookmark: false,
            feedType: type,
            sourcePlayer: nil
        )
    }
}
#endif
