import Foundation
import Observation

enum ArticleReaderPhase: Equatable {
    case loading
    case preparing
    case ready(ArticleReaderDocument)
    case unavailable(String)
    case failed(String)
}

@MainActor
@Observable
final class ArticleReaderStore {
    private(set) var phase: ArticleReaderPhase
    private(set) var isFinished: Bool

    let metadata: ArticleReaderMetadata
    let initialProgressFraction: Double

    private let client: APIClient
    private var loadGeneration = 0

    init(
        metadata: ArticleReaderMetadata,
        client: APIClient,
        initialPhase: ArticleReaderPhase = .loading
    ) {
        self.metadata = metadata
        self.client = client
        phase = initialPhase
        isFinished = metadata.isFinished
        initialProgressFraction = min(
            max((metadata.initialProgress?.percent ?? 0) / 100, 0),
            1
        )
    }

    var readyDocument: ArticleReaderDocument? {
        guard case let .ready(document) = phase else { return nil }
        return document
    }

    func load() async {
        loadGeneration += 1
        let generation = loadGeneration
        var hasReadableCache = false

        if let cached = await client.cachedArticleContent(id: metadata.bookmarkID),
           cached.readableContent != nil
        {
            phase = .ready(ArticleReaderDocument(metadata: metadata, response: cached))
            hasReadableCache = true
        } else {
            phase = .loading
        }

        do {
            let current = try await client.getArticleContent(id: metadata.bookmarkID)
            guard !Task.isCancelled, generation == loadGeneration else { return }
            if await acceptIfReadable(current) { return }

            phase = .preparing
            let requested = try await client.requestArticleContent(id: metadata.bookmarkID)
            guard !Task.isCancelled, generation == loadGeneration else { return }
            if await acceptIfReadable(requested) { return }

            if requested.articleBody.isPreparing || requested.request?.queued == true {
                await pollUntilTerminal(generation: generation)
            } else {
                phase = .unavailable(Self.unavailableMessage(for: requested.articleBody))
            }
        } catch is CancellationError {
            return
        } catch {
            guard !hasReadableCache, generation == loadGeneration else { return }
            phase = .failed("Zine couldn’t load this article. Check your connection and try again.")
        }
    }

    func persistProgress(_ fraction: Double) async -> BookmarkProgress? {
        let clamped = min(max(fraction, 0), 1)
        do {
            try await client.updateProgress(id: metadata.bookmarkID, fraction: clamped)
        } catch is CancellationError {
            return nil
        } catch {
            do {
                try await Task.sleep(for: .milliseconds(500))
                try await client.updateProgress(id: metadata.bookmarkID, fraction: clamped)
            } catch {
                return nil
            }
        }

        return BookmarkProgress(
            position: clamped,
            duration: 1,
            percent: clamped * 100
        )
    }

    func toggleFinished() async -> Bool? {
        do {
            let result = try await client.setFinished(
                id: metadata.bookmarkID,
                isFinished: !isFinished
            )
            isFinished = result.isFinished
            return result.isFinished
        } catch {
            return nil
        }
    }

    private func pollUntilTerminal(generation: Int) async {
        let delays: [Duration] = [
            .seconds(1), .seconds(1), .seconds(2), .seconds(2),
            .seconds(3), .seconds(3), .seconds(4), .seconds(4),
        ]

        for delay in delays {
            do {
                try await Task.sleep(for: delay)
                guard !Task.isCancelled, generation == loadGeneration else { return }
                let response = try await client.getArticleContent(id: metadata.bookmarkID)
                guard !Task.isCancelled, generation == loadGeneration else { return }
                if await acceptIfReadable(response) { return }
                if !response.articleBody.isPreparing {
                    phase = .unavailable(Self.unavailableMessage(for: response.articleBody))
                    return
                }
            } catch is CancellationError {
                return
            } catch {
                // A later poll may still succeed; preserve the preparation state.
            }
        }

        guard generation == loadGeneration else { return }
        phase = .failed("This article is taking longer than expected. You can try again or open the original.")
    }

    private func acceptIfReadable(_ response: ArticleContentResponse) async -> Bool {
        guard response.readableContent != nil else { return false }
        await client.cacheArticleContent(response, id: metadata.bookmarkID)
        phase = .ready(ArticleReaderDocument(metadata: metadata, response: response))
        return true
    }

    private static func unavailableMessage(for status: ArticleBodyStatus) -> String {
        switch status.lastErrorCode {
        case "NOT_READERABLE", "QUALITY_REJECTED", "NO_ACCEPTABLE_BODY":
            "This page doesn’t contain a dependable article body, so Zine won’t show an incomplete version."
        case "ITEM_NOT_ELIGIBLE":
            "This item isn’t an article that Zine can display in the reader."
        default:
            "Zine can’t display this article reliably yet."
        }
    }
}
