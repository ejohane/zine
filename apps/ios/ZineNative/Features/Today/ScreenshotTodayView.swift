#if DEBUG
import SwiftUI

struct ScreenshotTodayView: View {
    var body: some View {
        NavigationStack {
            TodayEditionView(
                response: ScreenshotTodayFixtures.response,
                onSaveSource: { _ in },
                onFeedback: { _, _, _ in }
            )
            .navigationTitle("Today")
            .navigationBarTitleDisplayMode(.inline)
            .navigationDestination(for: TodayNavigationRoute.self) { route in
                switch route {
                case .story(let id):
                    if let story = ScreenshotTodayFixtures.issue.stories.first(where: { $0.id == id }) {
                        EditorialStoryDetailView(
                            story: story,
                            issue: ScreenshotTodayFixtures.issue,
                            presentation: ScreenshotTodayFixtures.response.presentation,
                            onImpression: {},
                            onFeedback: { _ in }
                        )
                    } else {
                        ContentUnavailableView("Story unavailable", systemImage: "newspaper")
                    }
                case .source(let id): Text("Source \(id)")
                }
            }
        }
    }
}

struct ScreenshotTodayStoryView: View {
    var body: some View {
        NavigationStack {
            EditorialStoryDetailView(
                story: ScreenshotTodayFixtures.cover,
                issue: ScreenshotTodayFixtures.issue,
                presentation: ScreenshotTodayFixtures.response.presentation,
                onImpression: {},
                onFeedback: { _ in }
            )
        }
    }
}

private enum ScreenshotTodayFixtures {
    static let sourceStatus = EditorialSourceStatus(
        xArchive: .complete,
        zineInbox: .complete,
        zineBookmarks: .complete,
        externalVerification: .complete
    )

    static let xSource = EditorialSource(
        id: "x:browser-agents",
        origin: .x,
        role: .commentary,
        canonicalUrl: URL(string: "https://x.com/example/status/1")!,
        title: nil,
        creator: "Maya Chen",
        publisher: "X",
        publishedAt: "2026-07-18T12:00:00Z",
        xTweetId: "1",
        zineItemId: nil,
        zineUserItemId: nil,
        contentType: "POST",
        userState: nil
    )

    static let zineSource = EditorialSource(
        id: "zine:browser-agents",
        origin: .zine,
        role: .analysis,
        canonicalUrl: URL(string: "https://example.com/browser-agents")!,
        title: "A field guide to browser agents",
        creator: "Practical AI",
        publisher: "Practical AI",
        publishedAt: "2026-07-18T13:00:00Z",
        xTweetId: nil,
        zineItemId: "item-1",
        zineUserItemId: "user-item-1",
        contentType: "ARTICLE",
        userState: "INBOX"
    )

    static let secondSource = EditorialSource(
        id: "external:small-models",
        origin: .external,
        role: .verification,
        canonicalUrl: URL(string: "https://example.com/small-models")!,
        title: "Why smaller models are winning real workloads",
        creator: "The Gradient",
        publisher: "The Gradient",
        publishedAt: "2026-07-18T14:00:00Z",
        xTweetId: nil,
        zineItemId: nil,
        zineUserItemId: nil,
        contentType: "ARTICLE",
        userState: nil
    )

    static let cover = EditorialStory(
        id: "story-browser-agents",
        rank: 1,
        type: .trend,
        lifecycle: .developing,
        title: "Agents are moving from chat windows into the browser",
        lede: cited("The strongest conversation across your timeline was not about a new benchmark. It was about agents beginning to operate the tools where work already happens."),
        whatHappened: cited("Several independent builders demonstrated browser-native agent workflows and linked to new implementation guides."),
        whyItMatters: cited("The browser is becoming a control surface for agents, which changes how products expose actions, permissions, and context."),
        conversation: cited("The excitement is real, but the best voices focused on reliability and review rather than spectacle."),
        editorialAnalysis: cited("The practical shift is from asking whether an agent can browse to deciding which actions it should be trusted to take."),
        importance: 5,
        momentum: .high,
        topics: ["Agents", "Browsers"],
        sourceIds: [xSource.id, zineSource.id],
        claimIds: ["claim-1"],
        whyToday: cited("Independent builders converged on browser permissions and review in the same daily window."),
        representativeXVoices: [
            EditorialRepresentativeXVoice(
                sourceId: xSource.id,
                name: "Maya Chen",
                handle: "@mayac",
                contribution: "Framed permissions—not browsing itself—as the important product shift."
            ),
        ],
        zineConnections: [
            EditorialZineConnection(
                sourceId: zineSource.id,
                relationship: .unfinishedContext,
                reason: "Your saved implementation guide turns the X conversation into something you can use."
            ),
        ]
    )

    static let secondStory = EditorialStory(
        id: "story-small-models",
        rank: 2,
        type: .analysis,
        lifecycle: .developing,
        title: "Smaller models are becoming the economic default",
        lede: cited("Developers are comparing models as operating costs rather than mascots, and the cheaper systems are getting more serious attention."),
        whatHappened: cited("A cluster of releases improved capability while lowering the cost of common production tasks."),
        whyItMatters: cited("Cost and latency determine which experiments become durable products."),
        conversation: cited("Builders are sharing task-level comparisons instead of repeating leaderboard scores."),
        editorialAnalysis: cited("The useful question is now which model earns a place in each part of a workflow."),
        importance: 4,
        momentum: .high,
        topics: ["Models", "Economics"],
        sourceIds: [secondSource.id],
        claimIds: ["claim-2"],
        whyToday: nil,
        representativeXVoices: nil,
        zineConnections: nil
    )

    static let issue = EditorialIssue(
        schemaVersion: 1,
        id: "edition-2026-07-19-r1",
        userId: "fixture-user",
        editionDate: "2026-07-19",
        timezone: "America/Chicago",
        revision: 1,
        status: "PUBLISHED",
        generatedAt: "2026-07-19T11:00:00Z",
        window: EditorialWindow(
            newContentAfter: "2026-07-18T11:00:00Z",
            through: "2026-07-19T11:00:00Z",
            comparisonAfter: "2026-07-17T11:00:00Z",
            previousEditionId: nil,
            fallbackWindowUsed: false
        ),
        provenance: EditorialProvenance(
            xRunIds: ["run-1"],
            sourceStatus: sourceStatus,
            warnings: []
        ),
        headline: "The browser is becoming the agent’s operating system",
        dek: "Your timeline converged on a practical shift: agents are leaving the demo and entering the everyday surfaces where work gets done.",
        briefing: [
            cited("Browser agents moved from isolated demos toward workflows with explicit permissions and review."),
            cited("Smaller models gained attention because teams are measuring cost and latency alongside capability."),
            cited("The best item in your Zine connects both conversations through a concrete implementation guide."),
        ],
        stories: [cover, secondStory],
        recommendations: [
            EditorialRecommendation(
                id: "rec-browser-agents",
                sourceId: zineSource.id,
                relatedStoryIds: [cover.id],
                format: .read,
                priority: .must,
                title: "A field guide to browser agents",
                reason: "The clearest bridge between yesterday’s X conversation and something already waiting in your Zine.",
                estimatedMinutes: 8,
                isOriginalSource: true,
                alreadyConsumed: false
            ),
            EditorialRecommendation(
                id: "rec-small-models",
                sourceId: secondSource.id,
                relatedStoryIds: [secondStory.id],
                format: .explore,
                priority: .worthwhile,
                title: "Why smaller models are winning real workloads",
                reason: "Useful evidence for separating production economics from benchmark excitement.",
                estimatedMinutes: 6,
                isOriginalSource: true,
                alreadyConsumed: false
            ),
        ],
        emergingSignals: [
            EditorialEmergingSignal(
                id: "signal-local-agents",
                title: "Local-first agents are picking up momentum",
                summary: cited("Several smaller communities began sharing local execution patterns."),
                whyWatch: cited("Privacy and predictable cost could turn this into a durable countertrend."),
                momentum: .rising,
                sourceIds: [xSource.id],
                claimIds: ["claim-3"]
            ),
        ],
        bigPicture: cited("Raw model capability is becoming abundant enough that control, trust, and workflow fit now determine what becomes useful."),
        coverageNotes: ["Complete X archive, Zine inbox, bookmark, and external-verification coverage."],
        sources: [xSource, zineSource, secondSource]
    )

    static let response = EditorialTodayResponse(
        issue: issue,
        expectedEditionDate: "2026-07-19",
        generation: EditorialGenerationState(
            status: .published,
            latestEditionId: issue.id,
            message: nil
        ),
        freshness: EditorialFreshness(
            isCurrent: true,
            sourceStatus: sourceStatus,
            warnings: []
        ),
        presentation: EditorialPresentation(sources: [
            xSource.id: EditorialSourcePresentation(
                title: "Browser-native agents are getting real",
                subtitle: "Maya Chen on X",
                imageUrl: nil,
                provider: "X",
                excerpt: "The interesting part is not browsing. It is permissioning the work.",
                zineUserItemId: nil,
                zineItemId: nil,
                isSaved: false,
                isFinished: false
            ),
            zineSource.id: EditorialSourcePresentation(
                title: zineSource.title,
                subtitle: "Practical AI · 8 min read",
                imageUrl: nil,
                provider: "RSS",
                excerpt: "A practical guide to actions, context, and review in browser-native systems.",
                zineUserItemId: zineSource.zineUserItemId,
                zineItemId: zineSource.zineItemId,
                isSaved: false,
                isFinished: false
            ),
            secondSource.id: EditorialSourcePresentation(
                title: secondSource.title,
                subtitle: "The Gradient · 6 min read",
                imageUrl: nil,
                provider: "WEB",
                excerpt: "A task-level comparison of cost, latency, and quality.",
                zineUserItemId: nil,
                zineItemId: nil,
                isSaved: false,
                isFinished: false
            ),
        ]),
        requestId: "fixture-request",
        traceId: "fixture-trace"
    )

    private static func cited(_ text: String) -> EditorialCitedText {
        EditorialCitedText(text: text, claimIds: [UUID().uuidString])
    }
}
#endif
