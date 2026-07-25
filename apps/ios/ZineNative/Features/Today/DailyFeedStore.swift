import Foundation
import Observation

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
