import Foundation

struct ProviderSubscriptionsClient {
    var load: () async throws -> ProviderSubscriptionsResponse
    var add: (ProviderSubscriptionItem) async throws -> Void
    var remove: (String) async throws -> Void
    var setPaused: (String, Bool) async throws -> Void
    var sync: (String) async throws -> SubscriptionSyncResponse
    var connect: () async throws -> Void
    var disconnect: () async throws -> Void

    @MainActor
    static func live(
        provider: SubscriptionSource,
        apiClient: APIClient,
        configuration: AppConfiguration
    ) -> Self {
        let oauthSession = ProviderOAuthSession(apiClient: apiClient, configuration: configuration)
        return Self(
            load: { try await apiClient.listProviderSubscriptions(provider) },
            add: { try await apiClient.addProviderSubscription($0, provider: provider) },
            remove: { try await apiClient.removeProviderSubscription(id: $0, provider: provider) },
            setPaused: {
                try await apiClient.setProviderSubscriptionPaused(
                    id: $0,
                    provider: provider,
                    isPaused: $1
                )
            },
            sync: { try await apiClient.syncProviderSubscription(id: $0, provider: provider) },
            connect: { try await oauthSession.connect(provider) },
            disconnect: { try await apiClient.disconnectProvider(provider) }
        )
    }
}
