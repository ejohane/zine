import Foundation
import XCTest
@testable import ZineNative

final class ArticleReaderTests: XCTestCase {
    func testArticleContentDecodesReadableAvailability() throws {
        let response = try JSONDecoder().decode(
            ArticleContentResponse.self,
            from: Data(Self.availableJSON.utf8)
        )

        XCTAssertEqual(response.articleBody.availability, .available)
        XCTAssertEqual(response.articleBody.pipelineStatus, .available)
        XCTAssertEqual(response.articleBody.wordCount, 640)
        XCTAssertEqual(response.readableContent, "<article><p>Readable body</p></article>")
    }

    func testHTMLDocumentEscapesMetadataAndInstallsDefenseInDepthPolicy() throws {
        let metadata = Self.metadata(title: "A <quiet> & useful reader")
        let response = try JSONDecoder().decode(
            ArticleContentResponse.self,
            from: Data(Self.availableJSON.utf8)
        )
        let html = ArticleHTMLDocumentBuilder.makeHTML(
            for: ArticleReaderDocument(metadata: metadata, response: response)
        )

        XCTAssertTrue(html.contains("A &lt;quiet&gt; &amp; useful reader"))
        XCTAssertTrue(html.contains("script-src 'none'"))
        XCTAssertTrue(html.contains("frame-src 'none'"))
        XCTAssertTrue(html.contains("<article><p>Readable body</p></article>"))
    }

    func testHTMLDocumentAppliesReaderFontScaleToTypographyOnly() throws {
        let response = try JSONDecoder().decode(
            ArticleContentResponse.self,
            from: Data(Self.availableJSON.utf8)
        )
        let html = ArticleHTMLDocumentBuilder.makeHTML(
            for: ArticleReaderDocument(metadata: Self.metadata(), response: response),
            fontScale: ArticleReaderFontSize.extraLarge.scale
        )

        XCTAssertTrue(html.contains("--reader-font-scale: 1.3"))
        XCTAssertTrue(html.contains("font-size: calc(17px * var(--reader-font-scale))"))
        XCTAssertTrue(html.contains("padding: calc(var(--reader-top-inset) + 72px) 22px calc(env(safe-area-inset-bottom) + 68px)"))
        XCTAssertFalse(html.contains("zoom:"))
    }

    func testHTMLDocumentPlacesCreatorAvatarBeforeCreatorName() throws {
        let response = try JSONDecoder().decode(
            ArticleContentResponse.self,
            from: Data(Self.availableJSON.utf8)
        )
        let html = ArticleHTMLDocumentBuilder.makeHTML(
            for: ArticleReaderDocument(
                metadata: Self.metadata(
                    creatorImageURL: URL(string: "https://example.com/avatar.jpg?size=48&fit=crop")
                ),
                response: response
            )
        )

        let avatar = "<img class=\"creator-avatar\" src=\"https://example.com/avatar.jpg?size=48&amp;fit=crop\" alt=\"\">"
        XCTAssertTrue(html.contains(avatar))
        XCTAssertLessThan(html.range(of: avatar)!.lowerBound, html.range(of: "<span>Author</span>")!.lowerBound)
    }

    func testHTMLDocumentPlacesRuleBetweenCreatorMetadataAndBody() throws {
        let response = try JSONDecoder().decode(
            ArticleContentResponse.self,
            from: Data(Self.availableJSON.utf8)
        )
        let html = ArticleHTMLDocumentBuilder.makeHTML(
            for: ArticleReaderDocument(metadata: Self.metadata(), response: response)
        )

        let title = "<h1>A dependable reader</h1>"
        let rule = "<hr class=\"title-rule\" aria-hidden=\"true\">"
        let metadata = "<div class=\"meta\">"
        let body = "<main>"
        XCTAssertLessThan(html.range(of: title)!.lowerBound, html.range(of: metadata)!.lowerBound)
        XCTAssertLessThan(html.range(of: metadata)!.lowerBound, html.range(of: rule)!.lowerBound)
        XCTAssertLessThan(html.range(of: rule)!.lowerBound, html.range(of: body)!.lowerBound)
    }

    func testHTMLDocumentOmitsOnlyTheAppGeneratedEndFooter() throws {
        let response = try JSONDecoder().decode(
            ArticleContentResponse.self,
            from: Data(Self.availableJSON.replacingOccurrences(
                of: "<article><p>Readable body</p></article>",
                with: "<article><p>Readable body</p><hr id='publisher-rule'><footer id='publisher-footer'>Publisher notes</footer></article>"
            ).utf8)
        )
        let html = ArticleHTMLDocumentBuilder.makeHTML(
            for: ArticleReaderDocument(metadata: Self.metadata(), response: response)
        )

        XCTAssertFalse(html.contains("zine-reader-end"))
        XCTAssertTrue(html.contains("<hr id='publisher-rule'>"))
        XCTAssertTrue(html.contains("<footer id='publisher-footer'>Publisher notes</footer>"))
    }

    func testReaderFontSizePresetsHaveStableIncreasingScales() {
        XCTAssertEqual(ArticleReaderFontSize.allCases.map(\.title), [
            "Small", "Default", "Large", "Extra Large",
        ])
        XCTAssertEqual(ArticleReaderFontSize.allCases.map(\.scale), [0.9, 1, 1.15, 1.3])
    }

    @MainActor
    func testReaderUsesPreciseStoredProgressInsteadOfRoundedPercent() {
        let progress = BookmarkProgress(position: 0.2574, duration: 1, percent: 26)
        let store = ArticleReaderStore(
            metadata: Self.metadata(initialProgress: progress),
            client: Self.client { _ in (500, "{}") }
        )

        XCTAssertEqual(progress.fraction, 0.2574, accuracy: 0.000_001)
        XCTAssertEqual(store.initialProgressFraction, 0.2574, accuracy: 0.000_001)
        XCTAssertEqual(
            BookmarkProgress(position: 4, duration: 0, percent: 37).fraction,
            0.37,
            accuracy: 0.000_001
        )
    }

    @MainActor
    func testProgressWritesRemainOrderedWhenTheFirstRequestIsSlow() async {
        var writes: [Double] = []
        var activeWrites = 0
        var maximumActiveWrites = 0
        let queue = ArticleProgressWriteQueue { fraction in
            activeWrites += 1
            maximumActiveWrites = max(maximumActiveWrites, activeWrites)
            if fraction == 0.2 {
                try? await Task.sleep(for: .milliseconds(100))
            }
            writes.append(fraction)
            activeWrites -= 1
            return true
        }

        let first = Task { @MainActor in await queue.enqueue(0.2) }
        await Task.yield()
        let second = Task { @MainActor in await queue.enqueue(0.8) }

        let firstResult = await first.value
        let secondResult = await second.value
        XCTAssertTrue(firstResult)
        XCTAssertTrue(secondResult)
        XCTAssertEqual(writes, [0.2, 0.8])
        XCTAssertEqual(maximumActiveWrites, 1)
    }

    func testChromeStartsVisibleAndStaysVisibleAtTop() {
        var chrome = ArticleReaderChromeState()
        XCTAssertTrue(chrome.isVisible)
        chrome.toggle(at: 0)
        XCTAssertTrue(chrome.isVisible)
        chrome.toggle(at: 200)
        XCTAssertFalse(chrome.isVisible)
        XCTAssertEqual(chrome.update(offset: 0), true)
        XCTAssertTrue(chrome.isVisible)
    }

    func testEndRevealFiresOncePerArrivalWithoutBounceRepeats() {
        var end = ArticleReaderEndState()
        XCTAssertFalse(end.settled(offset: 500, maximum: 1000))
        XCTAssertTrue(end.settled(offset: 998, maximum: 1000))
        XCTAssertFalse(end.settled(offset: 1000, maximum: 1000))
        XCTAssertFalse(end.settled(offset: 500, maximum: 1000))
        XCTAssertTrue(end.settled(offset: 1000, maximum: 1000))
    }

    func testShortArticleCanRevealControlsAfterUserScroll() {
        var end = ArticleReaderEndState()
        XCTAssertTrue(end.settled(offset: 0, maximum: -100))
    }

    func testEndRevealResetsChromeTravelAndDoesNotToggleVisibleChrome() {
        var chrome = ArticleReaderChromeState()
        XCTAssertNil(chrome.reveal())
        chrome.toggle(at: 200)
        XCTAssertFalse(chrome.isVisible)
        XCTAssertEqual(chrome.reveal(), true)
        XCTAssertTrue(chrome.isVisible)
        XCTAssertNil(chrome.reveal())
    }

    func testChromeRequiresSustainedDirectionAndIgnoresJitter() {
        var chrome = ArticleReaderChromeState()
        chrome.toggle(at: 200)
        chrome.begin(at: 200)
        XCTAssertNil(chrome.update(offset: 190))
        XCTAssertNil(chrome.update(offset: 195))
        XCTAssertNil(chrome.update(offset: 185))
        XCTAssertEqual(chrome.update(offset: 160), true)
        XCTAssertNil(chrome.update(offset: 170))
        XCTAssertNil(chrome.update(offset: 180))
        XCTAssertEqual(chrome.update(offset: 205), false)
        chrome.end()
        chrome.begin(at: 205)
        XCTAssertNil(chrome.update(offset: 200))
        XCTAssertFalse(chrome.isVisible)
    }

    func testAppearanceMigratesAndPersistsAcrossInstances() throws {
        let suite = "reader-appearance-\(UUID().uuidString)"
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suite))
        defer { defaults.removePersistentDomain(forName: suite) }
        defaults.set("extraLarge", forKey: ArticleReaderFontSize.storageKey)
        XCTAssertEqual(ArticleReaderAppearance.scale(in: defaults), 1.3)
        defaults.set(1.45, forKey: ArticleReaderAppearance.scaleKey)
        defaults.set(ArticleReaderFontFamily.charter.rawValue, forKey: ArticleReaderFontFamily.storageKey)
        let reopened = try XCTUnwrap(UserDefaults(suiteName: suite))
        XCTAssertEqual(ArticleReaderAppearance.scale(in: reopened), 1.45)
        XCTAssertEqual(reopened.string(forKey: ArticleReaderFontFamily.storageKey), "charter")
    }

    func testPassagePersistsPerAccountAndSurvivesProgressSync() async throws {
        let directory = FileManager.default.temporaryDirectory.appending(path: UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: directory) }
        let cache = ArticleBodyCache(userID: "one", baseDirectory: directory)
        let position = ArticleReadingPosition(contentHash: "hash", nodeIndex: 4, offset: 72,
            quote: "The passage", viewportY: 20, fraction: 0.4)
        await cache.saveReadingPosition(position, bookmarkID: "article")
        await cache.stageProgress(0.4, bookmarkID: "article")
        await cache.markProgressSynced(bookmarkID: "article", fraction: 0.4)
        let reopened = ArticleBodyCache(userID: "one", baseDirectory: directory)
        let restored = await reopened.readingPosition(bookmarkID: "article")
        XCTAssertEqual(restored, position)
        let other = ArticleBodyCache(userID: "two", baseDirectory: directory)
        let isolated = await other.readingPosition(bookmarkID: "article")
        XCTAssertNil(isolated)
        await reopened.remove(bookmarkID: "article")
        let removed = await reopened.readingPosition(bookmarkID: "article")
        XCTAssertNil(removed)
    }

    @MainActor
    func testStoreLoadsTheLocalPassageBeforeMakingTheArticleReady() async throws {
        let directory = FileManager.default.temporaryDirectory.appending(path: UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: directory) }
        let cache = ArticleBodyCache(userID: "reader", baseDirectory: directory)
        let position = ArticleReadingPosition(contentHash: "hash-1", nodeIndex: 3, offset: 12,
            quote: "Remember this passage", viewportY: 20, fraction: 0.6)
        await cache.saveReadingPosition(position, bookmarkID: "bookmark-1")
        let client = Self.client(articleBodyCache: cache) { _ in (200, Self.availableJSON) }
        let store = ArticleReaderStore(metadata: Self.metadata(), client: client)
        await store.load()
        XCTAssertNotNil(store.readyDocument)
        XCTAssertEqual(store.initialReadingPosition, position)
    }

    func testCachePersistsOnlyReadableDocumentsPerUser() async throws {
        let directory = FileManager.default.temporaryDirectory
            .appending(path: "article-cache-\(UUID().uuidString)", directoryHint: .isDirectory)
        defer { try? FileManager.default.removeItem(at: directory) }

        let readable = try JSONDecoder().decode(
            ArticleContentResponse.self,
            from: Data(Self.availableJSON.utf8)
        )
        let unavailable = try JSONDecoder().decode(
            ArticleContentResponse.self,
            from: Data(Self.unavailableJSON.utf8)
        )
        let cache = ArticleBodyCache(userID: "user/one", baseDirectory: directory)
        await cache.save(readable, bookmarkID: "bookmark-1")
        await cache.save(unavailable, bookmarkID: "bookmark-2")

        let reloaded = ArticleBodyCache(userID: "user/one", baseDirectory: directory)
        let otherUser = ArticleBodyCache(userID: "user/two", baseDirectory: directory)
        let cachedReadable = await reloaded.load(bookmarkID: "bookmark-1")
        let cachedUnavailable = await reloaded.load(bookmarkID: "bookmark-2")
        let crossUser = await otherUser.load(bookmarkID: "bookmark-1")

        XCTAssertEqual(cachedReadable?.articleBody.contentHash, "hash-1")
        XCTAssertNil(cachedUnavailable)
        XCTAssertNil(crossUser)
    }

    @MainActor
    func testProgressRemainsLocalWhenOfflineAndFlushesAfterReconnect() async throws {
        let directory = FileManager.default.temporaryDirectory
            .appending(path: "article-progress-\(UUID().uuidString)", directoryHint: .isDirectory)
        defer { try? FileManager.default.removeItem(at: directory) }

        let cache = ArticleBodyCache(userID: "progress-user", baseDirectory: directory)
        let offlineClient = Self.client(articleBodyCache: cache) { request in
            XCTAssertEqual(request.httpMethod, "PUT")
            return (503, #"{"error":"offline"}"#)
        }
        let store = ArticleReaderStore(metadata: Self.metadata(), client: offlineClient)

        let progress = await store.persistProgress(0.64)

        XCTAssertEqual(progress?.fraction, 0.64)
        let pendingProgress = await cache.pendingProgress(bookmarkID: "bookmark-1")
        XCTAssertEqual(pendingProgress, 0.64)

        let onlineClient = Self.client(articleBodyCache: cache) { request in
            XCTAssertEqual(request.httpMethod, "PUT")
            XCTAssertEqual(request.url?.path, "/api/v1/bookmarks/bookmark-1/progress")
            return (200, "{}")
        }
        await onlineClient.flushPendingArticleProgress()

        let flushedProgress = await cache.pendingProgress(bookmarkID: "bookmark-1")
        XCTAssertNil(flushedProgress)
        XCTAssertEqual(ArticleReaderURLProtocol.requests.count, 1)
    }

    @MainActor
    func testReaderRestoresPendingOfflineProgressBeforeShowingCachedBody() async throws {
        let directory = FileManager.default.temporaryDirectory
            .appending(path: "article-progress-\(UUID().uuidString)", directoryHint: .isDirectory)
        defer { try? FileManager.default.removeItem(at: directory) }

        let cache = ArticleBodyCache(userID: "progress-user", baseDirectory: directory)
        let readable = try JSONDecoder().decode(
            ArticleContentResponse.self,
            from: Data(Self.availableJSON.utf8)
        )
        await cache.save(readable, bookmarkID: "bookmark-1")
        await cache.stageProgress(0.73, bookmarkID: "bookmark-1")
        let client = Self.client(articleBodyCache: cache) { _ in
            (503, #"{"error":"offline"}"#)
        }
        let store = ArticleReaderStore(
            metadata: Self.metadata(initialProgress: nil),
            client: client
        )

        await store.load()

        XCTAssertEqual(store.initialProgressFraction, 0.73)
        guard case .ready = store.phase else {
            return XCTFail("Expected cached article to remain ready while offline")
        }
    }

    @MainActor
    func testWarmupMakesReaderReadyWithoutASecondArticleContentRequest() async throws {
        let directory = FileManager.default.temporaryDirectory
            .appending(path: "article-warmup-\(UUID().uuidString)", directoryHint: .isDirectory)
        defer { try? FileManager.default.removeItem(at: directory) }

        let client = Self.client(
            articleBodyCache: ArticleBodyCache(userID: "warm-user", baseDirectory: directory)
        ) { request in
            XCTAssertEqual(request.httpMethod, "GET")
            XCTAssertEqual(request.url?.path, "/api/v1/bookmarks/bookmark-1/article-content")
            return (200, Self.availableJSON)
        }

        try await client.warmArticleContent(id: "bookmark-1")
        let store = ArticleReaderStore(metadata: Self.metadata(), client: client)
        await store.load()

        guard case let .ready(document) = store.phase else {
            return XCTFail("Expected a ready reader, got \(store.phase)")
        }
        XCTAssertEqual(document.response.articleBody.contentHash, "hash-1")
        XCTAssertEqual(ArticleReaderURLProtocol.requests.count, 1)
    }

    func testReaderJoinsAnInFlightWarmupRequest() async throws {
        let response = try JSONDecoder().decode(
            ArticleContentResponse.self,
            from: Data(Self.availableJSON.utf8)
        )
        let coordinator = ArticleContentRequestCoordinator()
        let gate = ArticleRequestGate()
        let fetchStarted = expectation(description: "article content fetch started")
        fetchStarted.assertForOverFulfill = true
        let fetch = {
            fetchStarted.fulfill()
            await gate.wait()
            return response
        }

        let warmup = Task {
            try await coordinator.response(
                bookmarkID: "bookmark-1",
                purpose: .warmup,
                fetch: fetch
            )
        }
        await fulfillment(of: [fetchStarted], timeout: 1)
        let reader = Task {
            try await coordinator.response(
                bookmarkID: "bookmark-1",
                purpose: .reader,
                fetch: fetch
            )
        }
        await Task.yield()
        await gate.open()

        let warmedResponse = try await warmup.value
        let readerResponse = try await reader.value
        XCTAssertEqual(warmedResponse.articleBody.contentHash, "hash-1")
        XCTAssertEqual(readerResponse.articleBody.contentHash, "hash-1")
    }

    func testWarmupOnlyGetsStoredContentAndDoesNotCacheAnUnreadableResponse() async throws {
        let directory = FileManager.default.temporaryDirectory
            .appending(path: "article-warmup-\(UUID().uuidString)", directoryHint: .isDirectory)
        defer { try? FileManager.default.removeItem(at: directory) }
        let cache = ArticleBodyCache(userID: "warm-user", baseDirectory: directory)
        let client = Self.client(articleBodyCache: cache) { request in
            return (200, Self.unavailableJSON)
        }

        try await client.warmArticleContent(id: "bookmark-1")

        XCTAssertEqual(ArticleReaderURLProtocol.requests.count, 1)
        XCTAssertEqual(ArticleReaderURLProtocol.requests.first?.httpMethod, "GET")
        XCTAssertEqual(
            ArticleReaderURLProtocol.requests.first?.url?.path,
            "/api/v1/bookmarks/bookmark-1/article-content"
        )
        let cached = await cache.load(bookmarkID: "bookmark-1")
        XCTAssertNil(cached)
    }

    @MainActor
    func testStoreLoadsAnAvailableArticleWithoutRequestingAgain() async throws {
        let client = Self.client { request in
            XCTAssertEqual(request.httpMethod, "GET")
            return (200, Self.availableJSON)
        }
        let store = ArticleReaderStore(metadata: Self.metadata(), client: client)

        await store.load()

        guard case let .ready(document) = store.phase else {
            return XCTFail("Expected a ready reader, got \(store.phase)")
        }
        XCTAssertEqual(document.response.articleBody.contentHash, "hash-1")
        XCTAssertEqual(ArticleReaderURLProtocol.requests.count, 1)
    }

    @MainActor
    func testStoreRequestsOnceThenShowsATerminalUnavailableState() async throws {
        let client = Self.client { request in
            if request.httpMethod == "POST" {
                return (200, Self.unavailableJSON.replacingOccurrences(
                    of: "\"traceId\":\"trace-1\"",
                    with: "\"request\":{\"queued\":false,\"reason\":\"terminal\"},\"traceId\":\"trace-1\""
                ))
            }
            return (200, Self.notRequestedJSON)
        }
        let store = ArticleReaderStore(metadata: Self.metadata(), client: client)

        await store.load()

        guard case let .unavailable(message) = store.phase else {
            return XCTFail("Expected an unavailable reader, got \(store.phase)")
        }
        XCTAssertTrue(message.contains("dependable article body"))
        XCTAssertEqual(ArticleReaderURLProtocol.requests.map(\.httpMethod), ["GET", "POST"])
    }

    @MainActor
    func testStoreTogglesCompletionThroughTheBookmarkEndpoint() async throws {
        let client = Self.client { request in
            XCTAssertEqual(request.httpMethod, "PATCH")
            XCTAssertEqual(request.url?.path, "/api/v1/bookmarks/bookmark-1")
            let body = try XCTUnwrap(Self.bodyData(from: request))
            let payload = try JSONDecoder().decode([String: Bool].self, from: body)
            XCTAssertEqual(payload, ["isFinished": true])
            return (200, """
                {
                  "bookmark":{
                    "id":"bookmark-1","itemId":"item-1","isFinished":true,
                    "finishedAt":"2026-08-07T12:00:00Z"
                  }
                }
                """)
        }
        let store = ArticleReaderStore(metadata: Self.metadata(), client: client)

        let mutation = try XCTUnwrap(store.beginFinishedToggle())

        XCTAssertTrue(store.isFinished)
        XCTAssertTrue(store.isUpdatingFinished)

        let result = await store.persistFinishedToggle(mutation)

        XCTAssertEqual(result, true)
        XCTAssertTrue(store.isFinished)
        XCTAssertFalse(store.isUpdatingFinished)
    }

    @MainActor
    func testStoreRollsBackOptimisticCompletionWhenTheRequestFails() async throws {
        let client = Self.client { request in
            XCTAssertEqual(request.httpMethod, "PATCH")
            return (500, #"{"error":"unavailable"}"#)
        }
        let store = ArticleReaderStore(metadata: Self.metadata(), client: client)

        let mutation = try XCTUnwrap(store.beginFinishedToggle())

        XCTAssertTrue(store.isFinished)
        let result = await store.persistFinishedToggle(mutation)

        XCTAssertFalse(result)
        XCTAssertFalse(store.isFinished)
        XCTAssertFalse(store.isUpdatingFinished)
    }

    func testTagEndpointsListAndReplaceArticleTags() async throws {
        let client = Self.client { request in
            switch request.httpMethod {
            case "GET":
                XCTAssertEqual(request.url?.path, "/api/v1/tags")
                return (200, #"{"tags":[{"id":"tag-1","name":"Design"}]}"#)
            case "PUT":
                XCTAssertEqual(request.url?.path, "/api/v1/bookmarks/bookmark-1/tags")
                let body = try XCTUnwrap(Self.bodyData(from: request))
                let payload = try JSONDecoder().decode([String: [String]].self, from: body)
                XCTAssertEqual(payload, ["tags": ["Design", "Reading"]])
                return (200, """
                    {
                      "success":true,
                      "tags":[
                        {"id":"tag-1","name":"Design"},
                        {"id":"tag-2","name":"Reading"}
                      ]
                    }
                    """)
            default:
                return (405, "{}")
            }
        }

        let available = try await client.listTags()
        let saved = try await client.setTags(
            id: "bookmark-1",
            tags: ["Design", "Reading"]
        )

        XCTAssertEqual(available.map(\.name), ["Design"])
        XCTAssertEqual(saved.map(\.name), ["Design", "Reading"])
    }

    private static func metadata(
        title: String = "A dependable reader",
        creatorImageURL: URL? = nil,
        initialProgress: BookmarkProgress? = BookmarkProgress(
            position: 0.25,
            duration: 1,
            percent: 25
        )
    ) -> ArticleReaderMetadata {
        ArticleReaderMetadata(
            bookmarkID: "bookmark-1",
            title: title,
            creator: "Author",
            creatorImageURL: creatorImageURL,
            canonicalURL: URL(string: "https://example.com/article")!,
            readingTimeMinutes: 4,
            initialProgress: initialProgress,
            isFinished: false,
            tags: []
        )
    }

    @MainActor
    func testLinkSaveNotifiesHomeAndLibraryOnlyAfterSuccess() async throws {
        let committed = expectation(forNotification: .zineBookmarkSaved, object: nil)
        let client = Self.client { request in
            XCTAssertEqual(request.httpMethod, "POST")
            XCTAssertEqual(request.url?.path, "/api/v1/bookmarks")
            return (200, #"{"bookmark":{"itemId":"new-item","userItemId":"new-bookmark","status":"saved"}}"#)
        }
        _ = try await client.saveBookmark(url: URL(string: "https://example.com/new")!)
        await fulfillment(of: [committed], timeout: 1)

        let noRefresh = expectation(forNotification: .zineBookmarkSaved, object: nil)
        noRefresh.isInverted = true
        let failingClient = Self.client { _ in (500, "{}") }
        do {
            _ = try await failingClient.saveBookmark(url: URL(string: "https://example.com/failure")!)
            XCTFail("Save should fail")
        } catch {}
        await fulfillment(of: [noRefresh], timeout: 0.1)
    }

    private static func client(
        articleBodyCache: ArticleBodyCache? = nil,
        handler: @escaping (URLRequest) throws -> (Int, String)
    ) -> APIClient {
        ArticleReaderURLProtocol.handler = handler
        ArticleReaderURLProtocol.requests = []
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [ArticleReaderURLProtocol.self]
        return APIClient(
            baseURL: URL(string: "https://api.myzine.app")!,
            tokenProvider: { "test-token" },
            session: URLSession(configuration: configuration),
            articleBodyCache: articleBodyCache
        )
    }

    private static func bodyData(from request: URLRequest) -> Data? {
        if let body = request.httpBody {
            return body
        }
        guard let stream = request.httpBodyStream else { return nil }

        stream.open()
        defer { stream.close() }

        var data = Data()
        var buffer = [UInt8](repeating: 0, count: 1_024)
        while true {
            let count = stream.read(&buffer, maxLength: buffer.count)
            guard count > 0 else { break }
            data.append(buffer, count: count)
        }
        return data
    }

    private static let availableJSON = """
    {
      "content":"<article><p>Readable body</p></article>",
      "articleBody":{
        "availability":"AVAILABLE","pipelineStatus":"AVAILABLE","schemaVersion":1,
        "extractorVersion":1,"sourceKind":"PUBLIC_WEB","contentHash":"hash-1",
        "wordCount":640,"readingTimeMinutes":4,"qualityScore":0.98,
        "qualityWarnings":[],"lastErrorCode":null,"updatedAt":"2026-07-24T12:00:00Z"
      },
      "requestId":"request-1","traceId":"trace-1"
    }
    """

    private static let notRequestedJSON = """
    {
      "content":null,
      "articleBody":{
        "availability":"UNAVAILABLE","pipelineStatus":"NOT_REQUESTED","schemaVersion":null,
        "extractorVersion":null,"sourceKind":null,"contentHash":null,"wordCount":null,
        "readingTimeMinutes":null,"qualityScore":null,"qualityWarnings":[],
        "lastErrorCode":null,"updatedAt":null
      },
      "requestId":"request-1","traceId":"trace-1"
    }
    """

    private static let unavailableJSON = """
    {
      "content":null,
      "articleBody":{
        "availability":"UNAVAILABLE","pipelineStatus":"UNAVAILABLE","schemaVersion":null,
        "extractorVersion":1,"sourceKind":null,"contentHash":null,"wordCount":null,
        "readingTimeMinutes":null,"qualityScore":null,"qualityWarnings":[],
        "lastErrorCode":"NOT_READERABLE","updatedAt":"2026-07-24T12:00:00Z"
      },
      "requestId":"request-1","traceId":"trace-1"
    }
    """
}

private final class ArticleReaderURLProtocol: URLProtocol, @unchecked Sendable {
    static var handler: ((URLRequest) throws -> (Int, String))?
    static var requests: [URLRequest] = []

    override class func canInit(with request: URLRequest) -> Bool { true }

    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }

    override func startLoading() {
        Self.requests.append(request)
        do {
            let (status, body) = try Self.handler?(request) ?? (500, "{}")
            let response = HTTPURLResponse(
                url: request.url!,
                statusCode: status,
                httpVersion: nil,
                headerFields: ["Content-Type": "application/json"]
            )!
            client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
            client?.urlProtocol(self, didLoad: Data(body.utf8))
            client?.urlProtocolDidFinishLoading(self)
        } catch {
            client?.urlProtocol(self, didFailWithError: error)
        }
    }

    override func stopLoading() {}
}

private actor ArticleRequestGate {
    private var isOpen = false
    private var continuations: [CheckedContinuation<Void, Never>] = []

    func wait() async {
        guard !isOpen else { return }
        await withCheckedContinuation { continuation in
            continuations.append(continuation)
        }
    }

    func open() {
        isOpen = true
        let pending = continuations
        continuations.removeAll()
        pending.forEach { $0.resume() }
    }
}
