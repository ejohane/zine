import SwiftUI

struct ScreenshotArticleReaderView: View {
    let unavailable: Bool

    private let metadata = ArticleReaderMetadata(
        bookmarkID: "fixture-reader",
        title: "Designing Calm Software in a Noisy World",
        creator: "Mina Park",
        canonicalURL: URL(string: "https://example.com/calm-software")!,
        readingTimeMinutes: 7,
        initialProgress: BookmarkProgress(position: 0.18, duration: 1, percent: 18),
        isFinished: false
    )

    private let client = APIClient(
        baseURL: URL(string: "https://api.myzine.app")!,
        tokenProvider: { "fixture-token" }
    )

    var body: some View {
        NavigationStack {
            ArticleReaderView(
                metadata: metadata,
                client: client,
                initialPhase: unavailable ? .unavailable(
                    "This page doesn’t contain a dependable article body, so Zine won’t show an incomplete version."
                ) : .ready(document),
                loadsOnAppear: false
            )
        }
    }

    private var document: ArticleReaderDocument {
        ArticleReaderDocument(
            metadata: metadata,
            response: ArticleContentResponse(
                content: """
                <p>Good reading software should feel less like another feed and more like a quiet room.</p>
                <h2>Start with the reader’s intent</h2>
                <p>The interface can recede when hierarchy, spacing, and typography do their jobs. A calm product does not remove useful controls; it places them where they are needed and nowhere else.</p>
                <blockquote><p>Clarity is not the absence of detail. It is detail arranged around a purpose.</p></blockquote>
                <p>That principle applies to the system behind the page too. Reliable state, explicit failure, and a safe path back to the original source make the reading surface trustworthy.</p>
                """,
                articleBody: ArticleBodyStatus(
                    availability: .available,
                    pipelineStatus: .available,
                    schemaVersion: 1,
                    extractorVersion: 1,
                    sourceKind: "PUBLIC_WEB",
                    contentHash: "fixture-content-hash",
                    wordCount: 1460,
                    readingTimeMinutes: 7,
                    qualityScore: 0.98,
                    qualityWarnings: [],
                    lastErrorCode: nil,
                    updatedAt: "2026-07-24T12:00:00Z"
                ),
                request: nil,
                requestId: "fixture-request",
                traceId: "fixture-trace"
            )
        )
    }
}

#Preview("Article reader") {
    ScreenshotArticleReaderView(unavailable: false)
}

#Preview("Article unavailable") {
    ScreenshotArticleReaderView(unavailable: true)
}
