#if DEBUG
import SwiftUI

struct ScreenshotOnboardingNewsletterView: View {
    @State private var fixture: NewsletterFixture

    init(connected: Bool) {
        _fixture = State(initialValue: NewsletterFixture(connected: connected))
    }

    var body: some View {
        NavigationStack {
            OnboardingNewsletterSubscriptionsView(client: NewsletterSubscriptionsClient(
                load: { await fixture.load() },
                connect: { await fixture.connect() },
                disconnect: {},
                sync: { await fixture.sync() },
                update: { id, action in await fixture.update(id: id, action: action) },
                unsubscribe: { _ in }
            ))
        }
        .tint(ZineTheme.brandAccent)
    }
}

private actor NewsletterFixture {
    private var connected: Bool
    private var discovered: Bool
    private var selectedIDs: Set<String>

    init(connected: Bool) {
        self.connected = connected
        discovered = connected
        selectedIDs = connected ? ["dense"] : []
    }

    func connect() { connected = true }
    func sync() { discovered = true }

    func update(id: String, action: String) {
        if action == "activate" { selectedIDs.insert(id) }
        if action == "hide" { selectedIDs.remove(id) }
    }

    func load() -> NewsletterSubscriptionsResponse {
        let items = connected && discovered ? [
            feed("Dense Discovery", id: "dense", from: "hello@densediscovery.com"),
            feed("The Pragmatic Engineer", id: "pragmatic", from: "newsletter@pragmaticengineer.com"),
            feed("The Browser", id: "browser", from: "newsletter@thebrowser.com"),
            feed("Read Max", id: "readmax", from: "hello@readmax.com"),
        ] : []
        return NewsletterSubscriptionsResponse(
            connection: connected ? ProviderConnection(
                status: "ACTIVE", providerUserId: "fixture", connectedAt: nil, lastRefreshedAt: nil
            ) : nil,
            items: items,
            stats: NewsletterStats(
                total: items.count, active: selectedIDs.count,
                hidden: items.count - selectedIDs.count, unsubscribed: 0,
                lastSyncAt: nil, lastSyncStatus: "SUCCESS", lastSyncError: nil
            )
        )
    }

    private func feed(_ title: String, id: String, from: String) -> NewsletterFeed {
        NewsletterFeed(
            id: id,
            displayName: title,
            fromAddress: from,
            imageUrl: nil,
            status: selectedIDs.contains(id) ? .active : .unsubscribed,
            lastSeenAt: nil,
            autoBookmark: false
        )
    }
}

struct ScreenshotOnboardingXView: View {
    @State private var fixture: XFixture

    init(connected: Bool) {
        _fixture = State(initialValue: XFixture(connected: connected))
    }

    var body: some View {
        NavigationStack {
            OnboardingXBookmarksView(client: XSubscriptionsClient(
                load: { await fixture.load() },
                connect: { await fixture.connect() },
                disconnect: {},
                sync: {},
                updateDailySync: { _ in }
            ))
        }
        .tint(ZineTheme.brandAccent)
    }
}

private actor XFixture {
    private var connected: Bool

    init(connected: Bool) { self.connected = connected }
    func connect() { connected = true }

    func load() -> XSubscriptionsResponse {
        XSubscriptionsResponse(
            connection: connected ? ProviderConnection(
                status: "ACTIVE", providerUserId: "fixture", connectedAt: nil, lastRefreshedAt: nil
            ) : nil,
            connected: connected,
            connectionStatus: connected ? "ACTIVE" : nil,
            importedCount: connected ? 128 : 0,
            sync: nil
        )
    }
}
#endif
