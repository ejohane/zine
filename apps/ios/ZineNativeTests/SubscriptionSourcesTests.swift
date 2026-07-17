import Foundation
import Testing
@testable import ZineNative

struct SubscriptionSourcesTests {
    @Test func buildsOAuthRequestsForEveryConnectedProvider() throws {
        let app = AppConfiguration(
            apiBaseURL: URL(string: "https://api.example.com")!,
            clerkPublishableKey: "pk_test_value",
            googleClientID: "12345.apps.googleusercontent.com",
            spotifyClientID: "spotify-client",
            xClientID: "x-client"
        )
        let pkce = try ProviderOAuth.generatePKCE()

        for provider in [
            SubscriptionSource.youtube,
            .spotify,
            .gmail,
            .x,
        ] {
            let configuration = try ProviderOAuth.configuration(for: provider, app: app)
            let url = try ProviderOAuth.authorizationURL(
                configuration: configuration,
                state: "\(provider.rawValue):12345678-1234-1234-1234-123456789012",
                challenge: pkce.challenge
            )
            let values = queryValues(url)

            #expect(values["client_id"] == configuration.clientID)
            #expect(values["redirect_uri"] == configuration.redirectUri.absoluteString)
            #expect(values["code_challenge_method"] == "S256")
            #expect(values["scope"] == configuration.scopes.joined(separator: " "))
        }

        #expect(pkce.verifier.count == 43)
        #expect(!pkce.verifier.contains("="))
    }

    @Test func usesProviderSpecificScopesAndRedirects() throws {
        let app = AppConfiguration(
            apiBaseURL: URL(string: "https://api.example.com")!,
            clerkPublishableKey: "pk_test_value",
            googleClientID: "12345.apps.googleusercontent.com",
            spotifyClientID: "spotify-client",
            xClientID: "x-client"
        )

        let youtube = try ProviderOAuth.configuration(for: .youtube, app: app)
        let gmail = try ProviderOAuth.configuration(for: .gmail, app: app)
        let spotify = try ProviderOAuth.configuration(for: .spotify, app: app)
        let x = try ProviderOAuth.configuration(for: .x, app: app)

        #expect(youtube.redirectUri.absoluteString == "com.googleusercontent.apps.12345:/oauth2redirect")
        #expect(youtube.scopes.contains { $0.contains("youtube.readonly") })
        #expect(gmail.scopes.contains { $0.contains("gmail.readonly") })
        #expect(spotify.redirectUri.absoluteString == "zine://oauth/callback")
        #expect(spotify.scopes == ["user-library-read"])
        #expect(x.scopes.contains("bookmark.read"))
        #expect(x.scopes.contains("offline.access"))
    }

    @Test func validatesOAuthCallbackState() throws {
        let callback = URL(string: "zine://oauth/callback?code=auth-code&state=expected")!

        #expect(
            try ProviderOAuth.parseCallback(callback, expectedState: "expected")
                == ProviderOAuth.Callback(code: "auth-code", state: "expected")
        )
        #expect(throws: ProviderOAuthError.self) {
            try ProviderOAuth.parseCallback(callback, expectedState: "different")
        }
    }

    @Test func decodesSubscriptionHubAndProviderItems() throws {
        let hub = try JSONDecoder().decode(
            SubscriptionsHubResponse.self,
            from: Data(
                """
                {"sources":[
                  {"provider":"YOUTUBE","connectionStatus":"ACTIVE","activeCount":2},
                  {"provider":"RSS","connectionStatus":null,"activeCount":1}
                ]}
                """.utf8
            )
        )
        let provider = try JSONDecoder().decode(
            ProviderSubscriptionsResponse.self,
            from: Data(
                """
                {
                  "connection":{"status":"ACTIVE","providerUserId":"user","connectedAt":100,"lastRefreshedAt":200},
                  "connectionRequired":false,
                  "items":[{
                    "subscriptionId":"sub-1","channelId":"source-1","name":"Active Source",
                    "imageUrl":null,"status":"ACTIVE","isSubscribed":true,"lastPolledAt":300
                  }]
                }
                """.utf8
            )
        )

        #expect(hub.sources[0].provider == .youtube)
        #expect(hub.sources[0].statusText == "Connected · 2 channels")
        #expect(hub.sources[1].statusText == "1 feed")
        #expect(provider.connection?.isActive == true)
        #expect(provider.items[0].status == .active)
    }

    @MainActor
    @Test func providerStoreReloadsAfterAddingAnItem() async {
        let item = ProviderSubscriptionItem(
            subscriptionId: nil,
            channelId: "show-1",
            name: "Show One",
            imageUrl: nil,
            status: nil,
            isSubscribed: false,
            lastPolledAt: nil
        )
        let subscribed = ProviderSubscriptionItem(
            subscriptionId: "sub-1",
            channelId: item.channelId,
            name: item.name,
            imageUrl: nil,
            status: .active,
            isSubscribed: true,
            lastPolledAt: nil
        )
        let recorder = SubscriptionClientRecorder(
            responses: [response(items: [item]), response(items: [subscribed])]
        )
        let store = ProviderSubscriptionsStore(provider: .spotify, client: recorder.client)

        await store.reload()
        await store.add(item)

        #expect(store.items == [subscribed])
        #expect(await recorder.addedIDs == [item.channelId])
    }

    private func response(items: [ProviderSubscriptionItem]) -> ProviderSubscriptionsResponse {
        ProviderSubscriptionsResponse(
            connection: ProviderConnection(
                status: "ACTIVE",
                providerUserId: "provider-user",
                connectedAt: 100,
                lastRefreshedAt: 200
            ),
            connectionRequired: false,
            items: items
        )
    }

    private func queryValues(_ url: URL) -> [String: String] {
        let query = URLComponents(url: url, resolvingAgainstBaseURL: false)
        return Dictionary(uniqueKeysWithValues: (query?.queryItems ?? []).compactMap {
            item in item.value.map { (item.name, $0) }
        })
    }
}

private actor SubscriptionClientRecorder {
    private var responses: [ProviderSubscriptionsResponse]
    private(set) var addedIDs: [String] = []

    init(responses: [ProviderSubscriptionsResponse]) {
        self.responses = responses
    }

    nonisolated var client: ProviderSubscriptionsClient {
        ProviderSubscriptionsClient(
            load: { [self] in await nextResponse() },
            add: { [self] item in await recordAdd(item.channelId) },
            remove: { _ in },
            setPaused: { _, _ in },
            sync: { _ in SubscriptionSyncResponse(itemsFound: 0) },
            connect: {},
            disconnect: {}
        )
    }

    private func nextResponse() -> ProviderSubscriptionsResponse { responses.removeFirst() }
    private func recordAdd(_ id: String) { addedIDs.append(id) }
}
