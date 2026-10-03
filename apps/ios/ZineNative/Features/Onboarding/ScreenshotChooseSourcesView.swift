#if DEBUG
import SwiftUI

/// Deterministic layout fixture. It does not exercise Clerk or provider OAuth.
struct ScreenshotChooseSourcesView: View {
    let showsCompletedSource: Bool

    private let client = APIClient(
        baseURL: URL(string: "https://fixture.invalid")!,
        tokenProvider: { "screenshot-fixture" }
    )

    var body: some View {
        ChooseSourcesView(
            client: client,
            loadSources: {
                SubscriptionsHubResponse(
                    sources: showsCompletedSource
                        ? [SubscriptionSourceSummary(
                            provider: .youtube,
                            connectionStatus: "ACTIVE",
                            activeCount: 2
                        )]
                        : []
                )
            },
            onContinue: {}
        )
    }
}
#endif
