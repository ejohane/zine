import Observation
import SwiftUI

@MainActor
@Observable
private final class NewsletterSubscriptionsStore {
    private(set) var response: NewsletterSubscriptionsResponse?
    private(set) var isLoading = false
    private(set) var isUpdatingConnection = false
    private(set) var isSyncing = false
    private(set) var pendingFeedIDs = Set<String>()
    private(set) var errorMessage: String?
    private(set) var actionMessage: String?

    private let client: APIClient
    private let oauth: ProviderOAuthSession

    init(client: APIClient, configuration: AppConfiguration) {
        self.client = client
        oauth = ProviderOAuthSession(apiClient: client, configuration: configuration)
    }

    func reload() async {
        isLoading = response == nil
        errorMessage = nil
        defer { isLoading = false }
        do {
            response = try await client.listNewsletters()
        } catch is CancellationError {
            return
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func connect() async {
        isUpdatingConnection = true
        defer { isUpdatingConnection = false }
        do {
            try await oauth.connect(.gmail)
            await reloadAfterMutation()
        } catch is CancellationError {
            return
        } catch {
            actionMessage = "Gmail couldn’t be connected. \(error.localizedDescription)"
        }
    }

    func disconnect() async {
        isUpdatingConnection = true
        defer { isUpdatingConnection = false }
        do {
            try await client.disconnectProvider(.gmail)
            await reloadAfterMutation()
        } catch {
            actionMessage = "Gmail couldn’t be disconnected. \(error.localizedDescription)"
        }
    }

    func sync() async {
        isSyncing = true
        defer { isSyncing = false }
        do {
            try await client.syncNewsletters()
            await reloadAfterMutation()
        } catch {
            actionMessage = "Newsletters couldn’t be synced. \(error.localizedDescription)"
        }
    }

    func setActive(_ feed: NewsletterFeed, isActive: Bool) async {
        await perform(feed) {
            try await client.updateNewsletter(id: feed.id, action: isActive ? "activate" : "hide")
        }
    }

    func unsubscribe(_ feed: NewsletterFeed) async {
        await perform(feed) { try await client.unsubscribeNewsletter(id: feed.id) }
    }

    func dismissMessage() { actionMessage = nil }

    private func perform(_ feed: NewsletterFeed, action: () async throws -> Void) async {
        pendingFeedIDs.insert(feed.id)
        defer { pendingFeedIDs.remove(feed.id) }
        do {
            try await action()
            await reloadAfterMutation()
        } catch {
            actionMessage = "\(feed.displayName) couldn’t be updated. \(error.localizedDescription)"
        }
    }

    private func reloadAfterMutation() async {
        do {
            response = try await client.listNewsletters()
            errorMessage = nil
        } catch {
            actionMessage = "The change was saved, but the list couldn’t be refreshed."
        }
    }
}

struct NewsletterSubscriptionsView: View {
    @State private var store: NewsletterSubscriptionsStore
    @State private var searchText = ""
    @State private var pendingUnsubscribe: NewsletterFeed?
    @State private var showsDisconnectConfirmation = false

    init(client: APIClient, configuration: AppConfiguration = .current) {
        _store = State(
            initialValue: NewsletterSubscriptionsStore(
                client: client,
                configuration: configuration
            )
        )
    }

    private var filteredFeeds: [NewsletterFeed] {
        let items = store.response?.items.filter { $0.status != .unsubscribed } ?? []
        let query = searchText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !query.isEmpty else { return items }
        return items.filter {
            $0.displayName.localizedStandardContains(query)
                || ($0.fromAddress?.localizedStandardContains(query) == true)
        }
    }

    var body: some View {
        Group {
            if store.isLoading && store.response == nil {
                ProgressView("Loading newsletters…")
            } else if let error = store.errorMessage, store.response == nil {
                ContentUnavailableView {
                    Label("Newsletters unavailable", systemImage: "exclamationmark.triangle")
                } description: {
                    Text(error)
                } actions: {
                    Button("Try again") { Task { await store.reload() } }
                }
            } else {
                newsletterList
            }
        }
        .navigationTitle("Newsletters")
        .navigationBarTitleDisplayMode(.inline)
        .searchable(text: $searchText, prompt: "Search newsletters")
        .task { await store.reload() }
        .alert("Couldn’t update newsletters", isPresented: messageBinding) {
            Button("OK", role: .cancel) { store.dismissMessage() }
        } message: {
            Text(store.actionMessage ?? "Please try again.")
        }
        .confirmationDialog(
            "Unsubscribe from \(pendingUnsubscribe?.displayName ?? "this newsletter")?",
            isPresented: unsubscribeBinding,
            titleVisibility: .visible,
            presenting: pendingUnsubscribe
        ) { feed in
            Button("Unsubscribe", role: .destructive) {
                Task { await store.unsubscribe(feed) }
            }
            Button("Cancel", role: .cancel) {}
        } message: { _ in
            Text("Zine will use the newsletter’s unsubscribe method when available and stop importing new issues.")
        }
        .confirmationDialog(
            "Disconnect Gmail?",
            isPresented: $showsDisconnectConfirmation,
            titleVisibility: .visible
        ) {
            Button("Disconnect", role: .destructive) { Task { await store.disconnect() } }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("Zine will stop reading newsletters from Gmail until you reconnect. Your Gmail account and messages will not be changed.")
        }
    }

    private var newsletterList: some View {
        List {
            connectionSection

            if store.response?.connection?.isActive != true {
                Section {
                    ContentUnavailableView(
                        "Gmail isn’t connected",
                        systemImage: SubscriptionSource.gmail.systemImage,
                        description: Text("Connect Gmail with read-only access to detect and manage newsletters.")
                    )
                }
            } else if filteredFeeds.isEmpty {
                Section {
                    ContentUnavailableView(
                        searchText.isEmpty ? "No newsletters found" : "No matching newsletters",
                        systemImage: searchText.isEmpty ? "envelope" : "magnifyingglass",
                        description: Text(
                            searchText.isEmpty
                                ? "Sync Gmail to discover newsletters."
                                : "Try another name or sender."
                        )
                    )
                }
            } else {
                Section("Newsletters") {
                    ForEach(filteredFeeds) { feed in newsletterRow(feed) }
                }
            }
        }
        .refreshable { await store.reload() }
    }

    private var connectionSection: some View {
        Section("Account") {
            LabeledContent("Gmail") {
                Text(connectionLabel).foregroundStyle(connectionColor)
            }

            if store.isUpdatingConnection {
                HStack { ProgressView(); Text("Updating connection…").foregroundStyle(.secondary) }
            } else if store.response?.connection?.isActive == true {
                Button {
                    Task { await store.sync() }
                } label: {
                    Label(store.isSyncing ? "Syncing…" : "Sync Newsletters", systemImage: "arrow.clockwise")
                }
                .disabled(store.isSyncing)

                Button("Disconnect Gmail", role: .destructive) {
                    showsDisconnectConfirmation = true
                }
            } else {
                Button {
                    Task { await store.connect() }
                } label: {
                    Label(
                        store.response?.connection?.needsAttention == true
                            ? "Reconnect Gmail"
                            : "Connect Gmail",
                        systemImage: "person.crop.circle.badge.plus"
                    )
                }
            }
        }
    }

    private var connectionLabel: String {
        if store.response?.connection?.isActive == true { return "Connected" }
        if store.response?.connection?.needsAttention == true { return "Needs attention" }
        return "Not connected"
    }

    private var connectionColor: Color {
        if store.response?.connection?.isActive == true { return .green }
        if store.response?.connection?.needsAttention == true { return .orange }
        return .secondary
    }

    private func newsletterRow(_ feed: NewsletterFeed) -> some View {
        HStack(spacing: 12) {
            CachedRemoteImage(url: feed.imageUrl, targetSize: CGSize(width: 44, height: 44)) {
                Image(systemName: "envelope.fill")
                    .resizable()
                    .scaledToFit()
                    .padding(10)
                    .foregroundStyle(.tertiary)
            }
            .frame(width: 44, height: 44)
            .clipShape(.circle)

            VStack(alignment: .leading, spacing: 3) {
                Text(feed.displayName).lineLimit(2)
                Text(feed.fromAddress ?? feed.status.title)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
            }

            Spacer()
            if store.pendingFeedIDs.contains(feed.id) {
                ProgressView()
            } else {
                Menu {
                    if feed.status == .active {
                        Button { Task { await store.setActive(feed, isActive: false) } } label: {
                            Label("Hide", systemImage: "eye.slash")
                        }
                    } else {
                        Button { Task { await store.setActive(feed, isActive: true) } } label: {
                            Label("Activate", systemImage: "checkmark.circle")
                        }
                    }
                    Button("Unsubscribe", systemImage: "envelope.badge", role: .destructive) {
                        pendingUnsubscribe = feed
                    }
                } label: {
                    Image(systemName: "ellipsis.circle").font(.title3)
                }
            }
        }
        .padding(.vertical, 3)
    }

    private var messageBinding: Binding<Bool> {
        Binding(
            get: { store.actionMessage != nil },
            set: { if !$0 { store.dismissMessage() } }
        )
    }

    private var unsubscribeBinding: Binding<Bool> {
        Binding(
            get: { pendingUnsubscribe != nil },
            set: { if !$0 { pendingUnsubscribe = nil } }
        )
    }
}
