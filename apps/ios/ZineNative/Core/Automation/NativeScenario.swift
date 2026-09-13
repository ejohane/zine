#if os(macOS)
    import Foundation

    /// Only deterministic fixtures are exposed headlessly. The harness uses fresh
    /// storage and cannot access an installed app's files or credentials.
    public enum NativeScenario {
        @MainActor
        public static func run(_ name: String) async throws -> Data {
            guard ["reader-offline", "reader-rollback"].contains(name) else {
                throw CommandError("unknown_scenario")
            }
            let directory = FileManager.default.temporaryDirectory.appending(path: UUID().uuidString)
            defer { try? FileManager.default.removeItem(at: directory) }
            let fixture = ScenarioServer()
            ScenarioProtocol.server = fixture
            let configuration = URLSessionConfiguration.ephemeral
            configuration.protocolClasses = [ScenarioProtocol.self]
            let transport = URLSession(configuration: configuration)
            defer {
                transport.invalidateAndCancel()
                ScenarioProtocol.server = nil
            }
            let client = APIClient(
                baseURL: URL(string: "https://fixture.invalid")!, tokenProvider: { "fixture" },
                session: transport,
                articleBodyCache: ArticleBodyCache(userID: "fixture", baseDirectory: directory),
                bookmarkMutationOutbox: OfflineBookmarkMutationOutbox(
                    userID: "fixture", baseDirectory: directory))
            let library = LibraryStore(
                client: client, cache: LibraryCache(userID: "fixture", baseDirectory: directory))
            let session = NativeCommandSession(client: client)
            session.library = library
            session.navigate = { name, id in
                switch name {
                case "library.open":
                    await library.reload(query: LibraryQuery())
                    session.route = "library"
                case "bookmark.open":
                    guard let id else { throw CommandError("bookmark_id_required") }
                    _ = try await client.getBookmark(id: id)
                    session.bookmarkID = id
                    session.route = "bookmark"
                case "reader.open":
                    guard id == session.bookmarkID else { throw CommandError("open_bookmark_first") }
                    let bookmark = try await client.getBookmark(id: id!)
                    let reader = ArticleReaderStore(
                        metadata: ArticleReaderMetadata(
                            bookmarkID: bookmark.id, title: bookmark.title, creator: bookmark.creator,
                            creatorImageURL: nil, canonicalURL: bookmark.canonicalUrl, readingTimeMinutes: 1,
                            initialProgress: bookmark.progress, isFinished: bookmark.isFinished,
                            tags: bookmark.tags), client: client)
                    session.reader = reader
                    session.route = "reader"
                    session.complete = {
                        guard let mutation = reader.beginFinishedToggle() else { return false }
                        return await reader.persistFinishedToggle(mutation)
                    }
                    await reader.load()
                default: throw CommandError("unknown_navigation")
                }
            }
            var results: [NativeCommandResult] = []
            func run(_ name: String, fraction: Double? = nil, tags: [String]? = nil) async throws {
                let result = await session.execute(
                    NativeCommand(name: name, bookmarkID: "article-1", fraction: fraction, tags: tags))
                results.append(result)
                guard result.status != "failed" else { throw CommandError(result.error ?? "command_failed") }
            }
            try await run("library.open")
            try await run("bookmark.open")
            try await run("reader.open")
            guard session.reader?.readyDocument != nil else { throw CommandError("reader_not_ready") }
            fixture.mode = .offline
            try await run("reader.progress.record", fraction: 0.42)
            try await run("reader.tags.set", tags: [" native ", "offline"])
            try await run("reader.complete")
            guard results.suffix(3).allSatisfy({ $0.status == "local_pending" }) else {
                throw CommandError("offline_not_queued")
            }
            await library.reload(query: LibraryQuery())
            guard library.items.isEmpty else { throw CommandError("optimistic_completion_not_hidden") }
            fixture.mode = name == "reader-rollback" ? .reject : .online
            let flushed = await session.execute(NativeCommand(name: "sync.flush"))
            results.append(flushed)
            if name == "reader-rollback" {
                guard flushed.status == "failed", library.items.map(\.id) == ["article-1"],
                    library.items.first?.tags.isEmpty == true, session.reader?.isFinished == false,
                    session.reader?.tags.isEmpty == true
                else { throw CommandError("rollback_failed") }
            } else {
                guard flushed.status == "completed", library.items.isEmpty,
                    fixture.bookmark.isFinished, fixture.bookmark.progress?.fraction == 0.42,
                    fixture.bookmark.tags.map(\.name) == ["native", "offline"]
                else { throw CommandError("reconnect_failed") }
            }
            return try JSONEncoder().encode(results)
        }
    }

    private final class ScenarioServer: @unchecked Sendable {
        enum Mode { case online, offline, reject }
        private let lock = NSLock()
        private var storedMode = Mode.online
        var mode: Mode {
            get { lock.withLock { storedMode } }
            set { lock.withLock { storedMode = newValue } }
        }
        var bookmark = Bookmark(
            id: "article-1", itemId: "item-1", title: "Native fixture",
            thumbnailUrl: nil, canonicalUrl: URL(string: "https://example.com/article")!,
            contentType: .article,
            provider: .web, creator: "Fixture", creatorImageUrl: nil, creatorId: nil, publisher: nil,
            summary: nil, duration: nil, publishedAt: nil, wordCount: 100, readingTimeMinutes: 1,
            state: "BOOKMARKED", ingestedAt: "2026-09-12", bookmarkedAt: "2026-09-12",
            lastOpenedAt: nil, progress: nil, isFinished: false, finishedAt: nil, tags: [])

        func respond(_ request: URLRequest) throws -> (Int, Data) {
            try lock.withLock {
                if storedMode == .offline { throw URLError(.notConnectedToInternet) }
                let method = request.httpMethod ?? "GET"
                if storedMode == .reject && method != "GET" { return (403, Data("{}".utf8)) }
                let path = request.url!.path
                if path.hasSuffix("/article-content") {
                    return (
                        200,
                        Data(
                            #"{"content":"<p>A deterministic native article.</p>","articleBody":{"availability":"AVAILABLE","pipelineStatus":"AVAILABLE","qualityWarnings":[]}}"#
                                .utf8)
                    )
                }
                if path.hasSuffix("/progress") {
                    let body = try JSONSerialization.jsonObject(with: bodyData(request)) as! [String: Double]
                    let fraction = body["position"]!
                    bookmark.progress = BookmarkProgress(
                        position: fraction, duration: 1, percent: fraction * 100)
                    return (200, Data("{}".utf8))
                }
                if path.hasSuffix("/tags") && method == "PUT" {
                    let body =
                        try JSONSerialization.jsonObject(with: bodyData(request)) as! [String: [String]]
                    bookmark.tags = body["tags"]!.map { BookmarkTag(id: $0, name: $0) }
                    return (200, try JSONEncoder().encode(["tags": bookmark.tags]))
                }
                if method == "PATCH" {
                    let body = try JSONSerialization.jsonObject(with: bodyData(request)) as! [String: Bool]
                    bookmark.isFinished = body["isFinished"]!
                    return (200, try JSONEncoder().encode(["bookmark": bookmark]))
                }
                if path.hasSuffix("/bookmarks") {
                    return (200, try JSONEncoder().encode(["items": bookmark.isFinished ? [] : [bookmark]]))
                }
                return (200, try JSONEncoder().encode(["item": bookmark]))
            }
        }

        private func bodyData(_ request: URLRequest) -> Data {
            if let body = request.httpBody { return body }
            guard let stream = request.httpBodyStream else { return Data() }
            stream.open()
            defer { stream.close() }
            var data = Data()
            var buffer = [UInt8](repeating: 0, count: 4096)
            while stream.hasBytesAvailable {
                let count = stream.read(&buffer, maxLength: buffer.count)
                if count <= 0 { break }
                data.append(buffer, count: count)
            }
            return data
        }
    }

    private final class ScenarioProtocol: URLProtocol, @unchecked Sendable {
        static var server: ScenarioServer?
        override class func canInit(with request: URLRequest) -> Bool {
            request.url?.host == "fixture.invalid"
        }
        override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
        override func startLoading() {
            do {
                guard let server = Self.server else { throw CommandError("fixture_missing") }
                let (status, data) = try server.respond(request)
                client?.urlProtocol(
                    self,
                    didReceive: HTTPURLResponse(
                        url: request.url!, statusCode: status, httpVersion: nil, headerFields: nil)!,
                    cacheStoragePolicy: .notAllowed)
                client?.urlProtocol(self, didLoad: data)
                client?.urlProtocolDidFinishLoading(self)
            } catch { client?.urlProtocol(self, didFailWithError: error) }
        }
        override func stopLoading() {}
    }
#endif
