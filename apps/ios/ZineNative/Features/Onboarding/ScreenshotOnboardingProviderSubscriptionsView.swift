#if DEBUG
import SwiftUI

/// Visual fixture only. It renders the real onboarding view with local provider data.
struct ScreenshotOnboardingProviderSubscriptionsView: View {
    let showsConnectedSubscriptions: Bool

    var body: some View {
        NavigationStack {
            OnboardingProviderSubscriptionsView(
                provider: .youtube,
                client: ProviderSubscriptionsClient(
                    load: { Self.response(connected: showsConnectedSubscriptions) },
                    add: { _ in },
                    remove: { _ in },
                    setPaused: { _, _ in },
                    setAutoBookmark: { _, _ in },
                    sync: { _ in SubscriptionSyncResponse(itemsFound: 0) },
                    connect: {},
                    disconnect: {}
                )
            )
        }
        .tint(ZineTheme.brandAccent)
    }

    private static func response(connected: Bool) -> ProviderSubscriptionsResponse {
        ProviderSubscriptionsResponse(
            connection: connected
                ? ProviderConnection(
                    status: "ACTIVE",
                    providerUserId: "fixture",
                    connectedAt: nil,
                    lastRefreshedAt: nil
                )
                : nil,
            connectionRequired: !connected,
            items: connected
                ? [
                    item("Cleo Abram", id: "cleo", selected: true),
                    item("MKBHD", id: "mkbhd", selected: false),
                    item("Vox", id: "vox", selected: false),
                    item("Veritasium", id: "veritasium", selected: true),
                    item("The B1M", id: "b1m", selected: false),
                ]
                : []
        )
    }

    private static func item(
        _ name: String,
        id: String,
        selected: Bool
    ) -> ProviderSubscriptionItem {
        ProviderSubscriptionItem(
            subscriptionId: selected ? "subscription-\(id)" : nil,
            channelId: id,
            name: name,
            imageUrl: nil,
            status: selected ? .active : nil,
            isSubscribed: selected,
            lastPolledAt: nil,
            autoBookmark: nil
        )
    }
}
#endif
