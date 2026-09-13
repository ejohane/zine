#if os(macOS)
    import Foundation

    @MainActor
    enum ReaderRecoveryScenario {
        static func run() async throws -> Data {
            let directory = FileManager.default.temporaryDirectory.appending(path: UUID().uuidString)
            defer { try? FileManager.default.removeItem(at: directory) }
            let server = ScenarioServer()
            ScenarioProtocol.server = server
            let configuration = URLSessionConfiguration.ephemeral
            configuration.protocolClasses = [ScenarioProtocol.self]
            let transport = URLSession(configuration: configuration)
            defer {
                transport.invalidateAndCancel()
                ScenarioProtocol.server = nil
            }
            func client(_ userID: String = "fixture") -> APIClient {
                APIClient(
                    baseURL: URL(string: "https://fixture.invalid")!, tokenProvider: { "fixture" },
                    session: transport,
                    articleBodyCache: ArticleBodyCache(userID: userID, baseDirectory: directory),
                    bookmarkMutationOutbox: OfflineBookmarkMutationOutbox(
                        userID: userID, baseDirectory: directory))
            }
            func session(_ client: APIClient, bookmark: Bookmark) -> NativeCommandSession {
                let session = NativeCommandSession(client: client)
                session.bookmarkID = bookmark.id
                session.route = "reader"
                session.reader = ArticleReaderStore(
                    metadata: ArticleReaderMetadata(
                        bookmarkID: bookmark.id, title: bookmark.title, creator: bookmark.creator,
                        creatorImageURL: nil, canonicalURL: bookmark.canonicalUrl, readingTimeMinutes: 1,
                        initialProgress: bookmark.progress, isFinished: bookmark.isFinished,
                        tags: bookmark.tags), client: client)
                return session
            }
            var results: [NativeCommandResult] = []
            let first = session(client(), bookmark: server.bookmark)
            results.append(await first.execute(NativeCommand(name: "reader.retry")))
            server.mode = .offline
            results.append(await first.execute(NativeCommand(name: "reader.progress.record", fraction: 0.63)))
            results.append(await first.execute(NativeCommand(name: "reader.tags.set", tags: ["recovered"])))
            // Fresh cache/outbox actors and reader simulate process memory being lost.
            let restoredClient = client()
            let restoredBookmark = await restoredClient.overlayLibraryBookmarks(
                [server.bookmark], query: LibraryQuery()
            ).first!
            let restored = session(restoredClient, bookmark: restoredBookmark)
            let cached = await restored.execute(NativeCommand(name: "reader.retry"))
            results.append(cached)
            guard cached.state.readerContentSource == "cache", cached.state.readerReady,
                cached.state.progressFraction == 0.63, cached.state.tags == ["recovered"],
                cached.state.pendingProgress == 0.63
            else { throw CommandError("restart_recovery_failed") }
            server.mode = .missing
            let retained = await restored.execute(NativeCommand(name: "reader.retry"))
            results.append(retained)
            guard retained.state.readerReady, retained.state.readerContentSource == "cache" else {
                throw CommandError("refresh_discarded_readable_cache")
            }
            // An uncached article must expose failure, then unavailable, then recovery.
            let uncached = session(client("uncached"), bookmark: server.bookmark)
            server.mode = .offline
            let failed = await uncached.execute(NativeCommand(name: "reader.retry"))
            results.append(failed)
            guard failed.status == "failed", failed.state.readerPhase == "failed" else {
                throw CommandError("missing_offline_failure")
            }
            server.mode = .missing
            let unavailable = await uncached.execute(NativeCommand(name: "reader.retry"))
            results.append(unavailable)
            guard unavailable.status == "failed", unavailable.state.readerPhase == "unavailable" else {
                throw CommandError("missing_unavailable_state")
            }
            server.mode = .online
            let recovered = await uncached.execute(NativeCommand(name: "reader.retry"))
            results.append(recovered)
            guard recovered.state.readerReady, recovered.state.readerContentSource == "network" else {
                throw CommandError("retry_failed")
            }
            let flushed = await restored.execute(NativeCommand(name: "sync.flush"))
            results.append(flushed)
            guard flushed.status == "completed", flushed.state.pendingProgress == nil,
                flushed.state.pendingMutations == 0, server.bookmark.progress?.fraction == 0.63,
                server.bookmark.tags.map(\.name) == ["recovered"]
            else { throw CommandError("restored_replay_failed") }
            return try JSONEncoder().encode(results)
        }
    }
#endif
