import Foundation
import XCTest
@testable import ZineNative

final class EditorialTests: XCTestCase {
    func testDecodesTodayContractWithoutAnIssue() throws {
        let response = try JSONDecoder().decode(
            EditorialTodayResponse.self,
            from: Data(
                """
                {
                  "issue":null,
                  "expectedEditionDate":"2026-07-19",
                  "generation":{
                    "status":"PREPARING",
                    "latestEditionId":null,
                    "message":"The first edition is being prepared."
                  },
                  "freshness":{
                    "isCurrent":false,
                    "sourceStatus":null,
                    "warnings":[]
                  },
                  "presentation":{"sources":{}},
                  "requestId":"request-1",
                  "traceId":"trace-1"
                }
                """.utf8
            )
        )

        XCTAssertNil(response.issue)
        XCTAssertEqual(response.generation.status, .preparing)
        XCTAssertEqual(response.expectedEditionDate, "2026-07-19")
    }

    func testDecodesSourcePresentationWithLiveZineState() throws {
        let response = try JSONDecoder().decode(
            EditorialTodayResponse.self,
            from: Data(
                """
                {
                  "issue":null,
                  "expectedEditionDate":"2026-07-19",
                  "generation":{
                    "status":"UNAVAILABLE",
                    "latestEditionId":null,
                    "message":null
                  },
                  "freshness":{
                    "isCurrent":false,
                    "sourceStatus":null,
                    "warnings":[]
                  },
                  "presentation":{"sources":{"source-1":{
                    "title":"A field guide",
                    "subtitle":"Example",
                    "imageUrl":"https://example.com/image.jpg",
                    "provider":"WEB",
                    "excerpt":"Useful context.",
                    "zineUserItemId":"user-item-1",
                    "zineItemId":"item-1",
                    "isSaved":true,
                    "isFinished":false
                  }}},
                  "requestId":"request-1",
                  "traceId":"trace-1"
                }
                """.utf8
            )
        )

        let source = try XCTUnwrap(response.presentation.sources["source-1"])
        XCTAssertEqual(source.zineProvider, .web)
        XCTAssertEqual(source.zineUserItemId, "user-item-1")
        XCTAssertTrue(source.isSaved)
        XCTAssertFalse(source.isFinished)
    }

    func testEditorialSourceProvidesImmediateBookmarkDetailContent() {
        let source = EditorialSource(
            id: "source-1",
            origin: .zine,
            role: .analysis,
            canonicalUrl: URL(string: "https://example.com/story")!,
            title: "Fallback title",
            creator: "Fallback creator",
            publisher: "Example",
            publishedAt: nil,
            xTweetId: nil,
            zineItemId: "item-1",
            zineUserItemId: "user-item-1",
            contentType: "ARTICLE",
            userState: "BOOKMARKED"
        )
        let presentation = EditorialSourcePresentation(
            title: "Presented title",
            subtitle: "Presented creator",
            imageUrl: "https://example.com/image.jpg",
            provider: "RSS",
            excerpt: "Useful context.",
            zineUserItemId: "user-item-1",
            zineItemId: "item-1",
            isSaved: true,
            isFinished: false
        )

        let content = BookmarkDetailContent(
            source: source,
            presentation: presentation,
            userItemID: "user-item-1"
        )

        XCTAssertEqual(content.id, "user-item-1")
        XCTAssertEqual(content.title, "Presented title")
        XCTAssertEqual(content.creator, "Presented creator")
        XCTAssertEqual(content.provider, .rss)
        XCTAssertEqual(content.contentType, .article)
        XCTAssertEqual(content.summary, "Useful context.")
        XCTAssertEqual(content.thumbnailUrl, URL(string: "https://example.com/image.jpg"))
    }

    func testDecodesWhyTodayXVoicesAndZineConnections() throws {
        let story = try JSONDecoder().decode(
            EditorialStory.self,
            from: Data(
                """
                {
                  "id":"story-1",
                  "rank":1,
                  "type":"CONVERSATION",
                  "lifecycle":"DEVELOPING",
                  "title":"Browser agents move into real workflows",
                  "lede":{"text":"Lede","claimIds":["claim-1"]},
                  "whatHappened":{"text":"What happened","claimIds":["claim-1"]},
                  "whyItMatters":{"text":"Why it matters","claimIds":["claim-1"]},
                  "conversation":{"text":"Conversation","claimIds":["claim-1"]},
                  "editorialAnalysis":{"text":"Analysis","claimIds":["claim-1"]},
                  "importance":5,
                  "momentum":"HIGH",
                  "topics":["Agents"],
                  "sourceIds":["x:1","zine:1"],
                  "claimIds":["claim-1"],
                  "whyToday":{"text":"Several voices converged today.","claimIds":["claim-1"]},
                  "representativeXVoices":[{
                    "sourceId":"x:1",
                    "name":"Maya Chen",
                    "handle":"@mayac",
                    "contribution":"Focused on permissions and review."
                  }],
                  "zineConnections":[{
                    "sourceId":"zine:1",
                    "relationship":"UNFINISHED_CONTEXT",
                    "reason":"A saved guide makes the conversation actionable."
                  }]
                }
                """.utf8
            )
        )

        XCTAssertEqual(story.whyToday?.text, "Several voices converged today.")
        XCTAssertEqual(story.representativeXVoices?.first?.handle, "@mayac")
        XCTAssertEqual(story.zineConnections?.first?.relationship, .unfinishedContext)
    }

    func testEditorialCacheKeepsAnExistingRevisionImmutable() async throws {
        let directory = temporaryDirectory()
        defer { try? FileManager.default.removeItem(at: directory) }
        let cache = EditorialIssueCache(userID: "user-1", baseDirectory: directory)

        await cache.save(makeResponse(revision: 1, headline: "Original"))
        await cache.save(makeResponse(revision: 1, headline: "Changed"))

        let loaded = await cache.loadLatest()
        XCTAssertEqual(loaded?.response.issue?.headline, "Original")
        XCTAssertEqual(loaded?.response.issue?.revision, 1)
    }

    func testEditorialCacheAdvancesToANewRevision() async throws {
        let directory = temporaryDirectory()
        defer { try? FileManager.default.removeItem(at: directory) }
        let cache = EditorialIssueCache(userID: "user-1", baseDirectory: directory)

        await cache.save(makeResponse(revision: 1, headline: "First revision"))
        await cache.save(makeResponse(revision: 2, headline: "Corrected edition"))

        let loaded = await cache.loadLatest()
        XCTAssertEqual(loaded?.response.issue?.headline, "Corrected edition")
        XCTAssertEqual(loaded?.response.issue?.revision, 2)
    }

    func testUnavailableXCoverageProducesTheStrongestNotice() throws {
        var response = makeResponse(revision: 1, headline: "Issue")
        response = EditorialTodayResponse(
            issue: response.issue,
            expectedEditionDate: response.expectedEditionDate,
            generation: EditorialGenerationState(
                status: .stale,
                latestEditionId: response.issue?.id,
                message: "Today is still preparing."
            ),
            freshness: EditorialFreshness(
                isCurrent: false,
                sourceStatus: EditorialSourceStatus(
                    xArchive: .unavailable,
                    zineInbox: .complete,
                    zineBookmarks: .complete,
                    externalVerification: .complete
                ),
                warnings: []
            ),
            presentation: response.presentation,
            requestId: response.requestId,
            traceId: response.traceId
        )

        let notice = try XCTUnwrap(TodayIssueNotice.make(
            response: response,
            isShowingCachedIssue: true,
            refreshErrorMessage: "Offline"
        ))
        XCTAssertEqual(notice.kind, .xUnavailable)
    }

    private func temporaryDirectory() -> URL {
        FileManager.default.temporaryDirectory
            .appending(path: UUID().uuidString, directoryHint: .isDirectory)
    }

    private func makeResponse(revision: Int, headline: String) -> EditorialTodayResponse {
        let sourceStatus = EditorialSourceStatus(
            xArchive: .complete,
            zineInbox: .complete,
            zineBookmarks: .complete,
            externalVerification: .complete
        )
        let cited = EditorialCitedText(text: "Context", claimIds: ["claim-1"])
        let source = EditorialSource(
            id: "source-1",
            origin: .x,
            role: .commentary,
            canonicalUrl: URL(string: "https://x.com/example/status/1")!,
            title: nil,
            creator: "Example",
            publisher: "X",
            publishedAt: nil,
            xTweetId: "1",
            zineItemId: nil,
            zineUserItemId: nil,
            contentType: "POST",
            userState: nil
        )
        let story = EditorialStory(
            id: "story-1",
            rank: 1,
            type: .conversation,
            lifecycle: .developing,
            title: "Story",
            lede: cited,
            whatHappened: cited,
            whyItMatters: cited,
            conversation: cited,
            editorialAnalysis: cited,
            importance: 4,
            momentum: .high,
            topics: ["Topic"],
            sourceIds: [source.id],
            claimIds: ["claim-1"],
            whyToday: nil,
            representativeXVoices: nil,
            zineConnections: nil
        )
        let issue = EditorialIssue(
            schemaVersion: 1,
            id: "edition-2026-07-19-r\(revision)",
            userId: "user-1",
            editionDate: "2026-07-19",
            timezone: "America/Chicago",
            revision: revision,
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
            headline: headline,
            dek: "Dek",
            briefing: [cited],
            stories: [story],
            recommendations: [],
            emergingSignals: [],
            bigPicture: cited,
            coverageNotes: [],
            sources: [source]
        )
        return EditorialTodayResponse(
            issue: issue,
            expectedEditionDate: issue.editionDate,
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
                source.id: EditorialSourcePresentation(
                    title: nil,
                    subtitle: "Example",
                    imageUrl: nil,
                    provider: "X",
                    excerpt: "A useful post.",
                    zineUserItemId: nil,
                    zineItemId: nil,
                    isSaved: false,
                    isFinished: false
                ),
            ]),
            requestId: "request-1",
            traceId: "trace-1"
        )
    }
}
