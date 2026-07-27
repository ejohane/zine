import Foundation
import Observation

@MainActor
@Observable
final class PeopleDailyStore {
    private(set) var response: PeopleDailyOverviewResponse?
    private(set) var isLoading = false
    private(set) var isRefreshing = false
    private(set) var isShowingCachedEdition = false
    private(set) var cachedAt: Date?
    private(set) var errorMessage: String?
    private(set) var refreshErrorMessage: String?

    private let client: APIClient
    private let cache: PeopleDailyCache

    init(client: APIClient, cache: PeopleDailyCache) {
        self.client = client
        self.cache = cache
    }

    func load() async {
        errorMessage = nil
        refreshErrorMessage = nil

        if response == nil, let cached = await cache.loadLatest() {
            response = cached.response
            cachedAt = cached.savedAt
            isShowingCachedEdition = true
        }

        isLoading = response == nil
        isRefreshing = response != nil
        defer {
            isLoading = false
            isRefreshing = false
        }

        do {
            let remote = try await client.getPeopleDailyToday()
            response = remote
            cachedAt = nil
            isShowingCachedEdition = false
            await cache.save(remote)
        } catch is CancellationError {
            return
        } catch {
            if response == nil {
                errorMessage = error.localizedDescription
            } else {
                refreshErrorMessage = error.localizedDescription
                isShowingCachedEdition = true
            }
        }
    }
}

@MainActor
@Observable
final class PeopleDailySectionStore {
    private(set) var response: PeopleDailySectionResponse?
    private(set) var isLoading = false
    private(set) var errorMessage: String?

    private let client: APIClient
    private let sectionID: String

    init(client: APIClient, sectionID: String) {
        self.client = client
        self.sectionID = sectionID
    }

    func load() async {
        guard response == nil else { return }
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }
        do {
            response = try await client.getPeopleDailySection(id: sectionID)
        } catch is CancellationError {
            return
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}

@MainActor
@Observable
final class DailyFeedStore {
    private(set) var response: DailyFeedResponse?
    private(set) var isLoading = false
    private(set) var errorMessage: String?

    private let client: APIClient

    init(client: APIClient) {
        self.client = client
    }

    func load() async {
        isLoading = response == nil
        errorMessage = nil
        defer { isLoading = false }

        do {
            response = try await client.getDailyFeed(date: response?.date)
        } catch is CancellationError {
            return
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}

@MainActor
@Observable
final class DailyAuthorActivityStore {
    private(set) var response: DailyAuthorActivityResponse?
    private(set) var isLoading = false
    private(set) var errorMessage: String?

    private let client: APIClient
    private let authorKey: String
    private let date: String

    init(client: APIClient, authorKey: String, date: String) {
        self.client = client
        self.authorKey = authorKey
        self.date = date
    }

    func load(range: DailyAuthorRange) async {
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }

        do {
            response = try await client.getDailyAuthorActivity(
                authorKey: authorKey,
                date: date,
                range: range
            )
        } catch is CancellationError {
            return
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}
