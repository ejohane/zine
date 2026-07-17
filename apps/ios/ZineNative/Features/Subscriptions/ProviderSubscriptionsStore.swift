import Foundation
import Observation

@MainActor
@Observable
final class ProviderSubscriptionsStore {
    private(set) var items: [ProviderSubscriptionItem] = []
    private(set) var connection: ProviderConnection?
    private(set) var connectionRequired = false
    private(set) var isLoading = false
    private(set) var errorMessage: String?
    private(set) var actionErrorMessage: String?
    private(set) var pendingItemIDs = Set<String>()
    private(set) var syncMessage: String?
    private(set) var isUpdatingConnection = false

    let provider: SubscriptionSource
    private let client: ProviderSubscriptionsClient

    init(provider: SubscriptionSource, client: ProviderSubscriptionsClient) {
        self.provider = provider
        self.client = client
    }

    func reload() async {
        errorMessage = nil
        isLoading = items.isEmpty
        defer { isLoading = false }

        do {
            let response = try await client.load()
            guard !Task.isCancelled else { return }
            items = response.items
            connection = response.connection
            connectionRequired = response.connectionRequired
        } catch is CancellationError {
            return
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func add(_ item: ProviderSubscriptionItem) async {
        await perform(item: item, failureMessage: "The \(provider.itemNoun) couldn’t be added.") {
            try await client.add(item)
        }
    }

    func connect() async {
        isUpdatingConnection = true
        defer { isUpdatingConnection = false }

        do {
            try await client.connect()
            await refreshAfterMutation()
        } catch is CancellationError {
            return
        } catch {
            actionErrorMessage = "\(provider.providerTitle) couldn’t be connected. \(error.localizedDescription)"
        }
    }

    func disconnect() async {
        isUpdatingConnection = true
        defer { isUpdatingConnection = false }

        do {
            try await client.disconnect()
            await refreshAfterMutation()
        } catch {
            actionErrorMessage = "\(provider.providerTitle) couldn’t be disconnected. \(error.localizedDescription)"
        }
    }

    func remove(_ item: ProviderSubscriptionItem) async {
        guard let subscriptionId = item.subscriptionId else { return }
        await perform(item: item, failureMessage: "The subscription couldn’t be removed.") {
            try await client.remove(subscriptionId)
        }
    }

    func setPaused(_ item: ProviderSubscriptionItem, isPaused: Bool) async {
        guard let subscriptionId = item.subscriptionId else { return }
        let failure = isPaused
            ? "The subscription couldn’t be paused."
            : "The subscription couldn’t be resumed."
        await perform(item: item, failureMessage: failure) {
            try await client.setPaused(subscriptionId, isPaused)
        }
    }

    func sync(_ item: ProviderSubscriptionItem) async {
        guard let subscriptionId = item.subscriptionId else { return }
        pendingItemIDs.insert(item.channelId)
        syncMessage = nil
        defer { pendingItemIDs.remove(item.channelId) }

        do {
            let result = try await client.sync(subscriptionId)
            let noun = provider == .youtube ? "video" : "episode"
            syncMessage = result.itemsFound == 1
                ? "Fetched 1 new \(noun) from \(item.name)."
                : "Fetched \(result.itemsFound) new \(noun)s from \(item.name)."
            await refreshAfterMutation()
        } catch {
            actionErrorMessage = "The subscription couldn’t be synced. \(error.localizedDescription)"
        }
    }

    func dismissActionError() { actionErrorMessage = nil }
    func dismissSyncMessage() { syncMessage = nil }

    private func perform(
        item: ProviderSubscriptionItem,
        failureMessage: String,
        action: () async throws -> Void
    ) async {
        pendingItemIDs.insert(item.channelId)
        defer { pendingItemIDs.remove(item.channelId) }

        do {
            try await action()
            await refreshAfterMutation()
        } catch {
            actionErrorMessage = "\(failureMessage) \(error.localizedDescription)"
        }
    }

    private func refreshAfterMutation() async {
        do {
            let response = try await client.load()
            items = response.items
            connection = response.connection
            connectionRequired = response.connectionRequired
        } catch {
            actionErrorMessage = "The change was saved, but the list couldn’t be refreshed. Pull to refresh."
        }
    }
}
