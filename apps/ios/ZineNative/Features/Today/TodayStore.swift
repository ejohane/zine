import Foundation
import Observation

@MainActor
@Observable
final class TodayStore {
    private(set) var response: EditorialTodayResponse?
    private(set) var isLoading = false
    private(set) var isRefreshing = false
    private(set) var isShowingCachedIssue = false
    private(set) var cachedAt: Date?
    private(set) var errorMessage: String?
    private(set) var refreshErrorMessage: String?
    private(set) var actionErrorMessage: String?

    private let client: APIClient
    private let cache: EditorialIssueCache
    private let onContentChanged: () -> Void
    private var recordedImpressions = Set<String>()

    init(
        client: APIClient,
        cache: EditorialIssueCache,
        onContentChanged: @escaping () -> Void = {}
    ) {
        self.client = client
        self.cache = cache
        self.onContentChanged = onContentChanged
    }

    var issue: EditorialIssue? { response?.issue }

    func reload() async {
        errorMessage = nil
        refreshErrorMessage = nil

        if response == nil, let cached = await cache.loadLatest() {
            response = cached.response
            cachedAt = cached.savedAt
            isShowingCachedIssue = true
        }

        isLoading = response == nil
        isRefreshing = response != nil
        defer {
            isLoading = false
            isRefreshing = false
        }

        do {
            let remote = try await client.getEditorialToday()
            if remote.issue == nil, response?.issue != nil {
                response = responseKeepingCachedIssue(remote)
                isShowingCachedIssue = true
            } else {
                response = remote
                isShowingCachedIssue = false
                cachedAt = nil
            }
            if remote.issue != nil {
                await cache.save(remote)
            }
        } catch is CancellationError {
            return
        } catch {
            if response?.issue == nil {
                errorMessage = error.localizedDescription
            } else {
                refreshErrorMessage = error.localizedDescription
                isShowingCachedIssue = true
            }
        }
    }

    func source(id: String) -> EditorialSource? {
        issue?.sources.first { $0.id == id }
    }

    func presentation(for sourceID: String) -> EditorialSourcePresentation? {
        response?.presentation.sources[sourceID]
    }

    func stories(for recommendation: EditorialRecommendation) -> [EditorialStory] {
        let ids = Set(recommendation.relatedStoryIds)
        return issue?.stories.filter { ids.contains($0.id) } ?? []
    }

    @discardableResult
    func saveSource(id sourceID: String) async -> Bool {
        guard let issue, let source = source(id: sourceID) else { return false }
        if presentation(for: sourceID)?.isSaved == true { return true }

        do {
            let result = try await client.saveBookmark(url: source.canonicalUrl)
            updatePresentation(sourceID) { presentation in
                presentation.isSaved = true
                presentation.zineUserItemId = result.bookmark.userItemId
            }
            onContentChanged()
            await recordFeedback(
                editionID: issue.id,
                targetType: .source,
                targetID: sourceID,
                eventType: .saved,
                reportsFailure: true
            )
            return true
        } catch is CancellationError {
            return false
        } catch {
            actionErrorMessage = error.localizedDescription
            return false
        }
    }

    func sourceOpened(id sourceID: String) async {
        guard let issue else { return }
        if let userItemID = presentation(for: sourceID)?.zineUserItemId {
            try? await client.markOpened(id: userItemID)
            onContentChanged()
        }
        await recordFeedback(
            editionID: issue.id,
            targetType: .source,
            targetID: sourceID,
            eventType: .opened
        )
    }

    func setSourceSaved(id sourceID: String, isSaved: Bool) {
        updatePresentation(sourceID) { $0.isSaved = isSaved }
        onContentChanged()
        guard isSaved, let issue else { return }
        Task {
            await recordFeedback(
                editionID: issue.id,
                targetType: .source,
                targetID: sourceID,
                eventType: .saved
            )
        }
    }

    func setSourceFinished(id sourceID: String, isFinished: Bool) {
        updatePresentation(sourceID) { $0.isFinished = isFinished }
        onContentChanged()
        guard isFinished, let issue else { return }
        Task {
            await recordFeedback(
                editionID: issue.id,
                targetType: .source,
                targetID: sourceID,
                eventType: .finished
            )
        }
    }

    func recordImpression(
        targetType: EditorialFeedbackTargetType,
        targetID: String
    ) async {
        guard let issue else { return }
        let key = "\(issue.id)|\(targetType.rawValue)|\(targetID)"
        guard recordedImpressions.insert(key).inserted else { return }
        await recordFeedback(
            editionID: issue.id,
            targetType: targetType,
            targetID: targetID,
            eventType: .impression
        )
    }

    func recordAction(
        targetType: EditorialFeedbackTargetType,
        targetID: String,
        eventType: EditorialFeedbackEventType
    ) async {
        guard let issue else { return }
        await recordFeedback(
            editionID: issue.id,
            targetType: targetType,
            targetID: targetID,
            eventType: eventType,
            reportsFailure: true
        )
    }

    func dismissActionError() {
        actionErrorMessage = nil
    }

    private func responseKeepingCachedIssue(
        _ remote: EditorialTodayResponse
    ) -> EditorialTodayResponse {
        guard let cachedIssue = response?.issue,
              let cachedPresentation = response?.presentation
        else { return remote }

        return EditorialTodayResponse(
            issue: cachedIssue,
            expectedEditionDate: remote.expectedEditionDate,
            generation: remote.generation,
            freshness: remote.freshness,
            presentation: cachedPresentation,
            requestId: remote.requestId,
            traceId: remote.traceId
        )
    }

    private func updatePresentation(
        _ sourceID: String,
        change: (inout EditorialSourcePresentation) -> Void
    ) {
        guard var current = response,
              var sourcePresentation = current.presentation.sources[sourceID]
        else { return }
        change(&sourcePresentation)
        current.presentation.sources[sourceID] = sourcePresentation
        response = current
    }

    private func recordFeedback(
        editionID: String,
        targetType: EditorialFeedbackTargetType,
        targetID: String,
        eventType: EditorialFeedbackEventType,
        reportsFailure: Bool = false
    ) async {
        let feedback = EditorialFeedbackRequest(
            clientEventId: UUID().uuidString,
            editionId: editionID,
            targetType: targetType,
            targetId: targetID,
            eventType: eventType,
            occurredAt: Date().formatted(.iso8601)
        )

        do {
            _ = try await client.sendEditorialFeedback(feedback)
        } catch is CancellationError {
            return
        } catch {
            do {
                try await Task.sleep(for: .milliseconds(400))
                _ = try await client.sendEditorialFeedback(feedback)
            } catch is CancellationError {
                return
            } catch {
                if reportsFailure {
                    actionErrorMessage = error.localizedDescription
                }
            }
        }
    }
}
