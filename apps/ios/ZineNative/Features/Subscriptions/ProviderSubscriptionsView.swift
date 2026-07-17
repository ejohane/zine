import SwiftUI

struct ProviderSubscriptionsView: View {
    @State private var store: ProviderSubscriptionsStore
    @State private var searchText = ""
    @State private var pendingRemoval: ProviderSubscriptionItem?
    @State private var showsDisconnectConfirmation = false

    private let provider: SubscriptionSource

    init(
        provider: SubscriptionSource,
        client: APIClient,
        configuration: AppConfiguration = .current
    ) {
        self.provider = provider
        _store = State(
            initialValue: ProviderSubscriptionsStore(
                provider: provider,
                client: .live(
                    provider: provider,
                    apiClient: client,
                    configuration: configuration
                )
            )
        )
    }

    init(provider: SubscriptionSource, client: ProviderSubscriptionsClient) {
        self.provider = provider
        _store = State(
            initialValue: ProviderSubscriptionsStore(provider: provider, client: client)
        )
    }

    private var filteredItems: [ProviderSubscriptionItem] {
        let query = searchText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !query.isEmpty else { return store.items }
        return store.items.filter { $0.name.localizedStandardContains(query) }
    }

    var body: some View {
        Group {
            if store.isLoading && store.items.isEmpty {
                ProgressView("Loading \(provider.title)…")
            } else if let error = store.errorMessage, store.items.isEmpty {
                ContentUnavailableView {
                    Label("\(provider.title) unavailable", systemImage: "exclamationmark.triangle")
                } description: {
                    Text(error)
                } actions: {
                    Button("Try again") { Task { await store.reload() } }
                }
            } else {
                subscriptionList
            }
        }
        .navigationTitle(provider.title)
        .navigationBarTitleDisplayMode(.inline)
        .searchable(text: $searchText, prompt: searchPrompt)
        .task { await store.reload() }
        .alert("Couldn’t update \(provider.title)", isPresented: actionErrorBinding) {
            Button("OK", role: .cancel) { store.dismissActionError() }
        } message: {
            Text(store.actionErrorMessage ?? "Please try again.")
        }
        .alert("\(provider.title) synced", isPresented: syncMessageBinding) {
            Button("OK", role: .cancel) { store.dismissSyncMessage() }
        } message: {
            Text(store.syncMessage ?? "The subscription is up to date.")
        }
        .confirmationDialog(
            "Remove \(pendingRemoval?.name ?? "this subscription")?",
            isPresented: removalBinding,
            titleVisibility: .visible,
            presenting: pendingRemoval
        ) { item in
            Button("Remove Subscription", role: .destructive) {
                Task { await store.remove(item) }
            }
            Button("Cancel", role: .cancel) {}
        } message: { _ in
            Text("New items will stop arriving. Existing inbox items are removed; bookmarks are kept.")
        }
        .confirmationDialog(
            "Disconnect \(provider.providerTitle)?",
            isPresented: $showsDisconnectConfirmation,
            titleVisibility: .visible
        ) {
            Button("Disconnect", role: .destructive) { Task { await store.disconnect() } }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text(
                "Zine will stop reading your \(provider.providerTitle) subscriptions until you reconnect. Your account will not be changed."
            )
        }
    }

    private var searchPrompt: String {
        provider == .youtube ? "Search channels" : "Search shows"
    }

    private var subscriptionList: some View {
        List {
            connectionSection

            if store.connectionRequired || store.connection?.isActive != true {
                Section {
                    ContentUnavailableView(
                        "\(provider.providerTitle) isn’t connected",
                        systemImage: provider.systemImage,
                        description: Text(
                            "Sign in to \(provider.providerTitle) to import and manage \(provider.itemNoun)s in Zine."
                        )
                    )
                }
            } else if filteredItems.isEmpty {
                Section {
                    ContentUnavailableView(
                        searchText.isEmpty ? "No \(provider.itemNoun)s" : "No matches",
                        systemImage: searchText.isEmpty ? provider.systemImage : "magnifyingglass",
                        description: Text(
                            searchText.isEmpty
                                ? "The \(provider.itemNoun)s you follow will appear here."
                                : "Try another name."
                        )
                    )
                }
            } else {
                Section(provider == .youtube ? "Channels" : "Shows") {
                    ForEach(filteredItems) { item in itemRow(item) }
                }
            }
        }
        .refreshable { await store.reload() }
    }

    private var connectionSection: some View {
        Section("Account") {
            LabeledContent {
                Text(connectionLabel)
                    .foregroundStyle(connectionColor)
            } label: {
                Label(provider.providerTitle, systemImage: provider.systemImage)
            }

            if store.isUpdatingConnection {
                HStack {
                    ProgressView()
                    Text(store.connection?.isActive == true ? "Disconnecting…" : "Connecting…")
                        .foregroundStyle(.secondary)
                }
            } else if store.connection?.isActive == true {
                Button("Disconnect \(provider.providerTitle)", role: .destructive) {
                    showsDisconnectConfirmation = true
                }
            } else {
                Button {
                    Task { await store.connect() }
                } label: {
                    Label(
                        store.connection?.needsAttention == true
                            ? "Reconnect \(provider.providerTitle)"
                            : "Connect \(provider.providerTitle)",
                        systemImage: "person.crop.circle.badge.plus"
                    )
                }
            }
        }
    }

    private var connectionLabel: String {
        if store.connection?.isActive == true { return "Connected" }
        if store.connection?.needsAttention == true { return "Needs attention" }
        return "Not connected"
    }

    private var connectionColor: Color {
        if store.connection?.isActive == true { return .green }
        if store.connection?.needsAttention == true { return .orange }
        return .secondary
    }

    private func itemRow(_ item: ProviderSubscriptionItem) -> some View {
        HStack(spacing: 12) {
            CachedRemoteImage(url: item.imageUrl, targetSize: CGSize(width: 44, height: 44)) {
                Image(systemName: provider.systemImage)
                    .resizable()
                    .scaledToFit()
                    .padding(8)
                    .foregroundStyle(.tertiary)
            }
            .frame(width: 44, height: 44)
            .clipShape(.circle)

            VStack(alignment: .leading, spacing: 3) {
                Text(item.name).lineLimit(2)
                Text(item.status?.title ?? "Available to add")
                    .font(.caption)
                    .foregroundStyle(
                        item.status == .active || item.status == nil ? Color.secondary : Color.orange
                    )
            }

            Spacer()

            if store.pendingItemIDs.contains(item.channelId) {
                ProgressView()
            } else if item.isSubscribed {
                subscriptionMenu(item)
            } else {
                Button("Add") { Task { await store.add(item) } }
                    .buttonStyle(.bordered)
            }
        }
        .padding(.vertical, 3)
    }

    private func subscriptionMenu(_ item: ProviderSubscriptionItem) -> some View {
        Menu {
            if item.status == .active {
                Button { Task { await store.sync(item) } } label: {
                    Label("Sync Now", systemImage: "arrow.clockwise")
                }
                Button { Task { await store.setPaused(item, isPaused: true) } } label: {
                    Label("Pause", systemImage: "pause.circle")
                }
            } else if item.status == .paused {
                Button { Task { await store.setPaused(item, isPaused: false) } } label: {
                    Label("Resume", systemImage: "play.circle")
                }
            }

            Button("Remove", systemImage: "trash", role: .destructive) {
                pendingRemoval = item
            }
        } label: {
            Image(systemName: "ellipsis.circle").font(.title3)
        }
        .accessibilityLabel("Manage \(item.name)")
    }

    private var actionErrorBinding: Binding<Bool> {
        Binding(
            get: { store.actionErrorMessage != nil },
            set: { if !$0 { store.dismissActionError() } }
        )
    }

    private var syncMessageBinding: Binding<Bool> {
        Binding(
            get: { store.syncMessage != nil },
            set: { if !$0 { store.dismissSyncMessage() } }
        )
    }

    private var removalBinding: Binding<Bool> {
        Binding(
            get: { pendingRemoval != nil },
            set: { if !$0 { pendingRemoval = nil } }
        )
    }
}
