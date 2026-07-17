import Observation
import SwiftUI

@MainActor
@Observable
private final class SubscriptionsHubStore {
    private(set) var sources: [SubscriptionSourceSummary] = []
    private(set) var isLoading = false
    private(set) var errorMessage: String?

    private let loadSources: () async throws -> SubscriptionsHubResponse

    init(loadSources: @escaping () async throws -> SubscriptionsHubResponse) {
        self.loadSources = loadSources
    }

    func reload() async {
        isLoading = sources.isEmpty
        errorMessage = nil
        defer { isLoading = false }

        do {
            let response = try await loadSources()
            guard !Task.isCancelled else { return }
            sources = response.sources
        } catch is CancellationError {
            return
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}

struct SubscriptionsView: View {
    let client: APIClient
    let configuration: AppConfiguration

    @State private var store: SubscriptionsHubStore

    init(client: APIClient, configuration: AppConfiguration = .current) {
        self.client = client
        self.configuration = configuration
        _store = State(
            initialValue: SubscriptionsHubStore(loadSources: client.listSubscriptionSources)
        )
    }

    var body: some View {
        Group {
            if store.isLoading && store.sources.isEmpty {
                ProgressView("Loading subscriptions…")
            } else if let error = store.errorMessage, store.sources.isEmpty {
                ContentUnavailableView {
                    Label("Subscriptions unavailable", systemImage: "exclamationmark.triangle")
                } description: {
                    Text(error)
                } actions: {
                    Button("Try again") { Task { await store.reload() } }
                }
            } else {
                List {
                    Section {
                        ForEach(orderedSources) { summary in
                            NavigationLink(value: summary.provider) {
                                subscriptionSourceRow(summary)
                            }
                        }
                    } footer: {
                        Text("Connect accounts and choose what Zine should sync from each source.")
                    }
                }
                .refreshable { await store.reload() }
            }
        }
        .navigationTitle("Subscriptions")
        .navigationBarTitleDisplayMode(.inline)
        .navigationDestination(for: SubscriptionSource.self) { source in
            destination(for: source)
        }
        .task { await store.reload() }
    }

    private var orderedSources: [SubscriptionSourceSummary] {
        let byProvider = Dictionary(uniqueKeysWithValues: store.sources.map { ($0.provider, $0) })
        return SubscriptionSource.allCases.compactMap { byProvider[$0] }
    }

    private func subscriptionSourceRow(_ summary: SubscriptionSourceSummary) -> some View {
        HStack(spacing: 12) {
            Image(systemName: summary.provider.systemImage)
                .font(.title3)
                .foregroundStyle(summary.needsAttention ? .orange : .primary)
                .frame(width: 28)

            VStack(alignment: .leading, spacing: 3) {
                Text(summary.provider.title)
                Text(summary.statusText)
                    .font(.caption)
                    .foregroundStyle(summary.needsAttention ? .orange : .secondary)
            }
        }
        .padding(.vertical, 3)
    }

    @ViewBuilder
    private func destination(for source: SubscriptionSource) -> some View {
        switch source {
        case .youtube, .spotify:
            ProviderSubscriptionsView(
                provider: source,
                client: client,
                configuration: configuration
            )
        case .gmail:
            NewsletterSubscriptionsView(client: client, configuration: configuration)
        case .x:
            XSubscriptionsView(client: client, configuration: configuration)
        case .rss:
            RssSubscriptionsView(client: client)
        }
    }
}
