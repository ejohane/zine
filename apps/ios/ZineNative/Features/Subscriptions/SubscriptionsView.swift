import Observation
import SwiftUI

@MainActor
@Observable
final class SubscriptionsHubStore {
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
                ZineLoadingView(label: "Loading sources…")
            } else if let error = store.errorMessage, store.sources.isEmpty {
                ContentUnavailableView {
                    Label("Sources unavailable", systemImage: "exclamationmark.triangle")
                } description: {
                    Text(error)
                } actions: {
                    Button("Try again") { Task { await store.reload() } }
                }
            } else {
                dashboard
            }
        }
        .navigationTitle("Sources")
        .navigationBarTitleDisplayMode(.inline)
        .navigationDestination(for: SubscriptionSource.self) { source in
            destination(for: source)
        }
        .task { await store.reload() }
        .zineScreenChrome()
    }

    private var dashboard: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 16) {
                dashboardHeader

                if let error = store.errorMessage {
                    refreshNotice(error)
                }

                Text("CONNECTED PLACES")
                    .font(.system(.caption2, design: .rounded, weight: .bold))
                    .tracking(1.2)
                    .foregroundStyle(ZineTheme.tertiaryText)
                    .padding(.leading, 3)
                    .padding(.top, 4)

                ForEach(orderedSources) { summary in
                    sourceCard(summary)
                }

                Text("Pull to refresh source status. Each source keeps its own connection, sync, and delivery controls.")
                    .font(.system(.footnote, design: .rounded))
                    .foregroundStyle(ZineTheme.tertiaryText)
                    .padding(.horizontal, 3)
                    .padding(.top, 4)
            }
            .padding(.horizontal, 18)
            .padding(.top, 16)
            .padding(.bottom, 30)
        }
        .background(ZineTheme.canvas)
        .refreshable { await store.reload() }
    }

    private var dashboardHeader: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text("BUILD YOUR FEED")
                .font(.system(.caption, design: .rounded, weight: .bold))
                .tracking(1.4)
                .foregroundStyle(ZineTheme.brandAccent)

            Text("Everything you follow,\nin one Zine.")
                .font(.system(size: 34, weight: .bold, design: .rounded))
                .foregroundStyle(ZineTheme.primaryText)
                .fixedSize(horizontal: false, vertical: true)

            Text("Connect the services you already use. Zine keeps each source’s real sync status and controls in one place.")
                .font(.system(.body, design: .rounded))
                .foregroundStyle(ZineTheme.secondaryText)
                .fixedSize(horizontal: false, vertical: true)

            HStack(spacing: 0) {
                sourceMetric(value: "\(connectedCount)", label: "CONNECTED")
                Divider()
                    .overlay(ZineTheme.border)
                    .padding(.vertical, 4)
                sourceMetric(value: "\(activeItemCount)", label: "ACTIVE")
                Divider()
                    .overlay(ZineTheme.border)
                    .padding(.vertical, 4)
                sourceMetric(value: "\(SubscriptionSource.allCases.count)", label: "AVAILABLE")
            }
            .padding(.vertical, 14)
            .background(ZineTheme.surface, in: .rect(cornerRadius: 18))
            .overlay {
                RoundedRectangle(cornerRadius: 18)
                    .stroke(ZineTheme.border.opacity(0.7), lineWidth: 1)
            }
        }
    }

    private func sourceMetric(value: String, label: String) -> some View {
        VStack(spacing: 3) {
            Text(value)
                .font(.system(.title2, design: .rounded, weight: .bold))
                .foregroundStyle(ZineTheme.primaryText)
            Text(label)
                .font(.system(size: 9, weight: .bold, design: .rounded))
                .tracking(0.8)
                .foregroundStyle(ZineTheme.tertiaryText)
        }
        .frame(maxWidth: .infinity)
    }

    private func sourceCard(_ summary: SubscriptionSourceSummary) -> some View {
        NavigationLink(value: summary.provider) {
            HStack(spacing: 15) {
                Image(systemName: summary.provider.systemImage)
                    .font(.system(size: 21, weight: .bold))
                    .foregroundStyle(
                        summary.needsAttention ? ZineTheme.onAccent : ZineTheme.primaryText
                    )
                    .frame(width: 48, height: 48)
                    .background(
                        summary.needsAttention ? ZineTheme.brandAccent : ZineTheme.raised,
                        in: .rect(cornerRadius: 15)
                    )

                VStack(alignment: .leading, spacing: 6) {
                    Text(summary.provider.title)
                        .font(.system(.headline, design: .rounded, weight: .bold))
                        .foregroundStyle(ZineTheme.primaryText)
                    Text(summary.provider.connectedDescription)
                        .font(.system(.caption, design: .rounded))
                        .foregroundStyle(ZineTheme.secondaryText)
                        .lineLimit(2)
                    SourceStatusPill(
                        text: summary.statusText,
                        needsAttention: summary.needsAttention
                    )
                }

                Spacer(minLength: 4)
                Image(systemName: "chevron.right")
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(
                        summary.needsAttention ? ZineTheme.brandAccent : ZineTheme.tertiaryText
                    )
            }
            .padding(16)
            .background(ZineTheme.surface, in: .rect(cornerRadius: 20))
            .overlay {
                RoundedRectangle(cornerRadius: 20)
                    .stroke(
                        summary.needsAttention
                            ? ZineTheme.brandAccent.opacity(0.8)
                            : ZineTheme.border.opacity(0.65),
                        lineWidth: 1
                    )
            }
        }
        .buttonStyle(.plain)
        .accessibilityIdentifier("source-\(summary.provider.pathComponent)")
    }

    private func refreshNotice(_ error: String) -> some View {
        HStack(alignment: .top, spacing: 11) {
            Image(systemName: "wifi.exclamationmark")
                .foregroundStyle(ZineTheme.brandAccent)
            VStack(alignment: .leading, spacing: 3) {
                Text("Showing your last source status")
                    .font(.system(.subheadline, design: .rounded, weight: .bold))
                    .foregroundStyle(ZineTheme.primaryText)
                Text(error)
                    .font(.system(.caption, design: .rounded))
                    .foregroundStyle(ZineTheme.secondaryText)
                    .lineLimit(2)
            }
            Spacer()
            Button("Retry") { Task { await store.reload() } }
                .font(.system(.caption, design: .rounded, weight: .bold))
        }
        .padding(14)
        .background(ZineTheme.surface, in: .rect(cornerRadius: 16))
        .overlay {
            RoundedRectangle(cornerRadius: 16)
                .stroke(ZineTheme.brandAccent.opacity(0.5), lineWidth: 1)
        }
    }

    private var orderedSources: [SubscriptionSourceSummary] {
        let byProvider = Dictionary(uniqueKeysWithValues: store.sources.map { ($0.provider, $0) })
        return SubscriptionSource.allCases.map { provider in
            byProvider[provider]
                ?? SubscriptionSourceSummary(
                    provider: provider,
                    connectionStatus: nil,
                    activeCount: 0
                )
        }
    }

    private var connectedCount: Int {
        orderedSources.filter { $0.isConnected }.count
    }

    private var activeItemCount: Int {
        orderedSources.reduce(0) { $0 + $1.activeCount }
    }

    @ViewBuilder
    private func destination(for source: SubscriptionSource) -> some View {
        switch source.destination {
        case .providerSubscriptions:
            ProviderSubscriptionsView(
                provider: source,
                client: client,
                configuration: configuration
            )
        case .newsletters:
            NewsletterSubscriptionsView(client: client, configuration: configuration)
        case .xBookmarks:
            XSubscriptionsView(client: client, configuration: configuration)
        case .rssFeeds:
            RssSubscriptionsView(client: client)
        }
    }
}
