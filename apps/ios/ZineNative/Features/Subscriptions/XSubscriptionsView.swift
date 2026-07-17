import Observation
import SwiftUI

@MainActor
@Observable
private final class XSubscriptionsStore {
    private(set) var response: XSubscriptionsResponse?
    private(set) var isLoading = false
    private(set) var isUpdatingConnection = false
    private(set) var isSyncing = false
    private(set) var isUpdatingSettings = false
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
            response = try await client.getXSubscriptions()
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
            try await oauth.connect(.x)
            await reloadAfterMutation()
        } catch is CancellationError {
            return
        } catch {
            actionMessage = "X couldn’t be connected. \(error.localizedDescription)"
        }
    }

    func disconnect() async {
        isUpdatingConnection = true
        defer { isUpdatingConnection = false }
        do {
            try await client.disconnectProvider(.x)
            await reloadAfterMutation()
        } catch {
            actionMessage = "X couldn’t be disconnected. \(error.localizedDescription)"
        }
    }

    func sync() async {
        isSyncing = true
        defer { isSyncing = false }
        do {
            try await client.syncXBookmarks()
            await reloadAfterMutation()
        } catch {
            actionMessage = "X bookmarks couldn’t be synced. \(error.localizedDescription)"
        }
    }

    func setDailySyncEnabled(_ enabled: Bool) async {
        guard let current = response, current.sync?.dailySyncEnabled != enabled else { return }
        isUpdatingSettings = true
        response = XSubscriptionsResponse(
            connection: current.connection,
            connected: current.connected,
            connectionStatus: current.connectionStatus,
            importedCount: current.importedCount,
            sync: current.sync.map {
                XBookmarkSyncState(
                    status: $0.status,
                    dailySyncEnabled: enabled,
                    lastSyncAt: $0.lastSyncAt,
                    lastSuccessAt: $0.lastSuccessAt,
                    lastError: $0.lastError,
                    rateLimitedUntil: $0.rateLimitedUntil,
                    lastEstimatedBillableReads: $0.lastEstimatedBillableReads
                )
            }
        )
        defer { isUpdatingSettings = false }

        do {
            try await client.updateXBookmarkSettings(dailySyncEnabled: enabled)
            await reloadAfterMutation()
        } catch {
            response = current
            actionMessage = "Daily sync couldn’t be updated. \(error.localizedDescription)"
        }
    }

    func dismissMessage() { actionMessage = nil }

    private func reloadAfterMutation() async {
        do {
            response = try await client.getXSubscriptions()
            errorMessage = nil
        } catch {
            actionMessage = "The change was saved, but X status couldn’t be refreshed."
        }
    }
}

struct XSubscriptionsView: View {
    @State private var store: XSubscriptionsStore
    @State private var showsDisconnectConfirmation = false

    init(client: APIClient, configuration: AppConfiguration = .current) {
        _store = State(
            initialValue: XSubscriptionsStore(client: client, configuration: configuration)
        )
    }

    var body: some View {
        Group {
            if store.isLoading && store.response == nil {
                ProgressView("Loading X bookmarks…")
            } else if let error = store.errorMessage, store.response == nil {
                ContentUnavailableView {
                    Label("X bookmarks unavailable", systemImage: "exclamationmark.triangle")
                } description: {
                    Text(error)
                } actions: {
                    Button("Try again") { Task { await store.reload() } }
                }
            } else {
                settingsList
            }
        }
        .navigationTitle("X Bookmarks")
        .navigationBarTitleDisplayMode(.inline)
        .task { await store.reload() }
        .alert("Couldn’t update X bookmarks", isPresented: messageBinding) {
            Button("OK", role: .cancel) { store.dismissMessage() }
        } message: {
            Text(store.actionMessage ?? "Please try again.")
        }
        .confirmationDialog(
            "Disconnect X?",
            isPresented: $showsDisconnectConfirmation,
            titleVisibility: .visible
        ) {
            Button("Disconnect", role: .destructive) { Task { await store.disconnect() } }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("Zine will stop importing bookmarks from X. Existing items in your library are kept.")
        }
    }

    private var settingsList: some View {
        List {
            Section("Account") {
                LabeledContent("X") {
                    Text(connectionLabel).foregroundStyle(connectionColor)
                }

                if store.isUpdatingConnection {
                    HStack { ProgressView(); Text("Updating connection…").foregroundStyle(.secondary) }
                } else if store.response?.connection?.isActive == true {
                    Button("Disconnect X", role: .destructive) {
                        showsDisconnectConfirmation = true
                    }
                } else {
                    Button {
                        Task { await store.connect() }
                    } label: {
                        Label(
                            store.response?.connection?.needsAttention == true ? "Reconnect X" : "Connect X",
                            systemImage: "person.crop.circle.badge.plus"
                        )
                    }
                }
            }

            if store.response?.connection?.isActive == true {
                Section {
                    LabeledContent("Imported") {
                        Text("\(store.response?.importedCount ?? 0)")
                    }

                    Toggle(
                        "Daily sync",
                        isOn: Binding(
                            get: { store.response?.sync?.dailySyncEnabled ?? false },
                            set: { enabled in Task { await store.setDailySyncEnabled(enabled) } }
                        )
                    )
                    .disabled(store.isUpdatingSettings)

                    Button {
                        Task { await store.sync() }
                    } label: {
                        Label(store.isSyncing ? "Syncing…" : "Sync Now", systemImage: "arrow.clockwise")
                    }
                    .disabled(store.isSyncing)

                    if let lastSyncAt = store.response?.sync?.lastSuccessAt {
                        LabeledContent("Last successful sync") {
                            Text(Date(timeIntervalSince1970: TimeInterval(lastSyncAt) / 1_000), style: .relative)
                        }
                    }
                    if let error = store.response?.sync?.lastError, !error.isEmpty {
                        Text(error).font(.caption).foregroundStyle(.orange)
                    }
                } header: {
                    Text("Bookmark Sync")
                } footer: {
                    Text("X applies API limits and Zine enforces a cooldown between manual syncs.")
                }
            } else {
                Section {
                    ContentUnavailableView(
                        "X isn’t connected",
                        systemImage: SubscriptionSource.x.systemImage,
                        description: Text("Connect X to import bookmarks into your Zine library.")
                    )
                }
            }
        }
        .refreshable { await store.reload() }
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

    private var messageBinding: Binding<Bool> {
        Binding(
            get: { store.actionMessage != nil },
            set: { if !$0 { store.dismissMessage() } }
        )
    }
}
