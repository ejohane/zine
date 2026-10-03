import Foundation
import Testing
@testable import ZineNative

struct SubscriptionSourcesTests {
    @Test func routesEverySupportedSourceToItsRealManagementScreen() {
        #expect(SubscriptionSource.youtube.destination == .providerSubscriptions)
        #expect(SubscriptionSource.spotify.destination == .providerSubscriptions)
        #expect(SubscriptionSource.gmail.destination == .newsletters)
        #expect(SubscriptionSource.x.destination == .xBookmarks)
        #expect(SubscriptionSource.rss.destination == .rssFeeds)
        #expect(SubscriptionSource.allCases.count == 5)
    }

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

    @Test func onboardingChecksReflectSavedSourcesAndExplicitSelections() {
        func summary(
            _ provider: SubscriptionSource,
            status: String? = nil,
            count: Int = 0
        ) -> SubscriptionSourceSummary {
            SubscriptionSourceSummary(
                provider: provider,
                connectionStatus: status,
                activeCount: count
            )
        }

        #expect(!summary(.youtube, status: "ACTIVE").isReadyForOnboarding)
        #expect(summary(.youtube, status: "ACTIVE", count: 1).isReadyForOnboarding)
        #expect(!summary(.youtube, status: "EXPIRED", count: 1).isReadyForOnboarding)
        #expect(!summary(.spotify, status: "ACTIVE").isReadyForOnboarding)
        #expect(summary(.spotify, status: "ACTIVE", count: 1).isReadyForOnboarding)
        #expect(!summary(.gmail, status: "ACTIVE").isReadyForOnboarding)
        #expect(summary(.gmail, status: "ACTIVE", count: 1).isReadyForOnboarding)
        #expect(summary(.x, status: "ACTIVE").isReadyForOnboarding)
        #expect(!summary(.rss).isReadyForOnboarding)
        #expect(summary(.rss, count: 1).isReadyForOnboarding)
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
            lastPolledAt: nil,
            autoBookmark: nil
        )
        let subscribed = ProviderSubscriptionItem(
            subscriptionId: "sub-1",
            channelId: item.channelId,
            name: item.name,
            imageUrl: nil,
            status: .active,
            isSubscribed: true,
            lastPolledAt: nil,
            autoBookmark: false
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

    @MainActor
    @Test func providerStoreShowsSubscriptionsAfterConnecting() async {
        let item = ProviderSubscriptionItem(
            subscriptionId: nil,
            channelId: "channel-1",
            name: "Channel One",
            imageUrl: nil,
            status: nil,
            isSubscribed: false,
            lastPolledAt: nil,
            autoBookmark: nil
        )
        let recorder = SubscriptionClientRecorder(responses: [
            ProviderSubscriptionsResponse(
                connection: nil,
                connectionRequired: true,
                items: []
            ),
            response(items: [item]),
        ])
        let store = ProviderSubscriptionsStore(provider: .youtube, client: recorder.client)

        await store.reload()
        #expect(store.connection?.isActive != true)
        #expect(store.items.isEmpty)

        await store.connect()
        #expect(store.connection?.isActive == true)
        #expect(store.items == [item])
    }

    @MainActor
    @Test func rssStoreAddsOnlyAValidFeedAndReloadsSavedState() async {
        let feed = RssFeed(
            id: "feed-1",
            feedUrl: URL(string: "https://example.com/feed.xml")!,
            title: "Example",
            description: nil,
            siteUrl: nil,
            imageUrl: nil,
            status: .active,
            errorCount: 0,
            lastError: nil,
            lastPolledAt: nil,
            lastSuccessAt: nil,
            autoBookmark: false,
            feedType: nil,
            sourcePlayer: nil
        )
        let empty = RssSubscriptionsResponse(
            items: [],
            stats: RssStats(
                total: 0, active: 0, paused: 0, unsubscribed: 0, error: 0,
                lastSuccessAt: nil
            )
        )
        let saved = RssSubscriptionsResponse(
            items: [feed],
            stats: RssStats(
                total: 1, active: 1, paused: 0, unsubscribed: 0, error: 0,
                lastSuccessAt: nil
            )
        )
        let recorder = RssClientRecorder(responses: [empty, saved])
        let store = RssSubscriptionsStore(client: recorder.client)

        await store.reload()
        #expect(!(await store.add(url: "javascript:alert(1)")))
        #expect(await recorder.addedURLs.isEmpty)

        #expect(await store.add(url: "  https://example.com/feed.xml  "))
        #expect(await recorder.addedURLs == ["https://example.com/feed.xml"])
        #expect(store.response?.items == [feed])
    }

    @MainActor
    @Test func gmailStoreActivatesAUnselectedNewsletter() async {
        let recorder = NewsletterClientRecorder()
        let store = NewsletterSubscriptionsStore(client: recorder.client)

        await store.reload()
        #expect(store.response?.items.first?.status == .unsubscribed)

        if let feed = store.response?.items.first {
            await store.setActive(feed, isActive: true)
        }
        #expect(await recorder.actions == ["activate"])
        #expect(store.response?.items.first?.status == .active)
    }

    @MainActor
    @Test func xStoreShowsSavedConnectionAfterConnecting() async {
        let recorder = XClientRecorder()
        let store = XSubscriptionsStore(client: recorder.client)

        await store.reload()
        #expect(store.response?.connection?.isActive != true)

        await store.connect()
        #expect(await recorder.connectCount == 1)
        #expect(store.response?.connection?.isActive == true)
    }

    @MainActor
    @Test func sourceDashboardKeepsKnownStatusWhenRefreshFails() async {
        let connected = SubscriptionSourceSummary(
            provider: .youtube,
            connectionStatus: "ACTIVE",
            activeCount: 2
        )
        let recorder = HubClientRecorder(
            results: [
                .success(SubscriptionsHubResponse(sources: [connected])),
                .failure(HubTestError.offline),
            ]
        )
        let store = SubscriptionsHubStore(loadSources: recorder.load)

        await store.reload()
        await store.reload()

        #expect(store.sources == [connected])
        #expect(store.errorMessage == HubTestError.offline.localizedDescription)
        #expect(store.isLoading == false)
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

private enum HubTestError: Error, LocalizedError {
    case offline

    var errorDescription: String? { "No connection" }
}

private actor HubClientRecorder {
    private var results: [Result<SubscriptionsHubResponse, Error>]

    init(results: [Result<SubscriptionsHubResponse, Error>]) {
        self.results = results
    }

    nonisolated var load: () async throws -> SubscriptionsHubResponse {
        { [self] in try await next() }
    }

    private func next() throws -> SubscriptionsHubResponse {
        try results.removeFirst().get()
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
            setAutoBookmark: { _, _ in },
            sync: { _ in SubscriptionSyncResponse(itemsFound: 0) },
            connect: {},
            disconnect: {}
        )
    }

    private func nextResponse() -> ProviderSubscriptionsResponse { responses.removeFirst() }
    private func recordAdd(_ id: String) { addedIDs.append(id) }
}

private actor RssClientRecorder {
    private var responses: [RssSubscriptionsResponse]
    private(set) var addedURLs: [String] = []

    init(responses: [RssSubscriptionsResponse]) {
        self.responses = responses
    }

    nonisolated var client: RssSubscriptionsClient {
        RssSubscriptionsClient(
            load: { [self] in await nextResponse() },
            add: { [self] url in await recordAdd(url) },
            update: { _, _ in },
            remove: { _ in },
            sync: { _ in SubscriptionSyncResponse(itemsFound: 0) }
        )
    }

    private func nextResponse() -> RssSubscriptionsResponse { responses.removeFirst() }
    private func recordAdd(_ url: String) { addedURLs.append(url) }
}

private actor NewsletterClientRecorder {
    private var selected = false
    private(set) var actions: [String] = []

    nonisolated var client: NewsletterSubscriptionsClient {
        NewsletterSubscriptionsClient(
            load: { [self] in await response() },
            connect: {},
            disconnect: {},
            sync: {},
            update: { [self] _, action in await record(action) },
            unsubscribe: { _ in }
        )
    }

    private func record(_ action: String) {
        actions.append(action)
        selected = action == "activate"
    }

    private func response() -> NewsletterSubscriptionsResponse {
        NewsletterSubscriptionsResponse(
            connection: ProviderConnection(
                status: "ACTIVE", providerUserId: "fixture", connectedAt: nil, lastRefreshedAt: nil
            ),
            items: [NewsletterFeed(
                id: "newsletter-1", displayName: "A newsletter", fromAddress: "hello@example.com",
                imageUrl: nil, status: selected ? .active : .unsubscribed,
                lastSeenAt: nil, autoBookmark: false
            )],
            stats: NewsletterStats(
                total: 1, active: selected ? 1 : 0, hidden: 0,
                unsubscribed: selected ? 0 : 1,
                lastSyncAt: nil, lastSyncStatus: "SUCCESS", lastSyncError: nil
            )
        )
    }
}

private actor XClientRecorder {
    private(set) var connectCount = 0

    nonisolated var client: XSubscriptionsClient {
        XSubscriptionsClient(
            load: { [self] in await response() },
            connect: { [self] in await recordConnect() },
            disconnect: {},
            sync: {},
            updateDailySync: { _ in }
        )
    }

    private func recordConnect() { connectCount += 1 }

    private func response() -> XSubscriptionsResponse {
        let connected = connectCount > 0
        return XSubscriptionsResponse(
            connection: connected ? ProviderConnection(
                status: "ACTIVE", providerUserId: "fixture",
                connectedAt: nil, lastRefreshedAt: nil
            ) : nil,
            connected: connected,
            connectionStatus: connected ? "ACTIVE" : nil,
            importedCount: 0,
            sync: nil
        )
    }
}
