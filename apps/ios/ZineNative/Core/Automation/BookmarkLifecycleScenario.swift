#if os(macOS)
    import Foundation

    @MainActor
    enum BookmarkLifecycleScenario {
        static func run() async throws -> Data {
            let directory = FileManager.default.temporaryDirectory.appending(path: UUID().uuidString)
            defer { try? FileManager.default.removeItem(at: directory) }
            let server = ScenarioServer()
            server.bookmark.state = "ARCHIVED"
            ScenarioProtocol.server = server
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
                bookmarkMutationOutbox: OfflineBookmarkMutationOutbox(
                    userID: "fixture", baseDirectory: directory))
            let session = NativeCommandSession(client: client)
            session.route = "bookmark"
            session.bookmarkID = "article-1"
            var detail = server.bookmark
            session.detailBookmark = { detail }
            session.refreshDetail = { detail = try await client.getBookmark(id: "article-1") }
            session.setDetailTags = { tags in
                let receipt = try await client.setTagsWithReceipt(id: detail.id, tags: tags, bookmark: detail)
                detail.tags = receipt.value
                return receipt
            }
            session.setDetailBookmarked = { saved in
                let delivery: NativeMutationDelivery
                if saved {
                    try await client.bookmarkItem(id: detail.id)
                    delivery = .serverCommitted
                } else {
                    delivery = try await client.archiveBookmarkWithReceipt(id: detail.id, bookmark: detail)
                }
                detail.state = saved ? "BOOKMARKED" : "ARCHIVED"
                return delivery
            }
            var results: [NativeCommandResult] = []
            func run(_ command: NativeCommand) async -> NativeCommandResult {
                let result = await session.execute(command)
                results.append(result)
                return result
            }
            let invalid = await run(NativeCommand(name: "bookmark.save", url: "file:///tmp/not-a-url"))
            guard invalid.status == "failed" else { throw CommandError("invalid_url_accepted") }
            let saved = await run(NativeCommand(name: "bookmark.save", url: "https://example.com/article"))
            let duplicate = await run(
                NativeCommand(name: "bookmark.save", url: "https://example.com/article"))
            guard saved.state.savedBookmarkID == duplicate.state.savedBookmarkID,
                duplicate.state.saveStatus == "already_bookmarked"
            else { throw CommandError("duplicate_save_failed") }
            _ = await run(NativeCommand(name: "bookmark.get"))
            let body = await run(NativeCommand(name: "bookmark.content.status"))
            guard body.state.articleBody?.isReadable == true else {
                throw CommandError("article_status_missing")
            }
            _ = await run(NativeCommand(name: "bookmark.tags.set", tags: [" lifecycle "]))
            let refreshed = await run(NativeCommand(name: "bookmark.get"))
            guard refreshed.state.detail?.tags.map(\.name) == ["lifecycle"] else {
                throw CommandError("tags_not_persisted")
            }
            server.mode = .reject
            let rejected = await run(NativeCommand(name: "bookmark.archive"))
            guard rejected.status == "failed", detail.state == "BOOKMARKED" else {
                throw CommandError("archive_rejection_failed")
            }
            server.mode = .offline
            let pending = await run(NativeCommand(name: "bookmark.archive"))
            guard pending.status == "local_pending" else { throw CommandError("archive_not_queued") }
            server.mode = .online
            _ = await run(NativeCommand(name: "bookmark.restore"))
            let flushed = await run(NativeCommand(name: "sync.flush"))
            guard flushed.state.pendingMutations == 0, server.bookmark.state == "BOOKMARKED" else {
                throw CommandError("restore_replayed_stale_archive")
            }
            _ = await run(NativeCommand(name: "bookmark.archive"))
            guard server.bookmark.state == "ARCHIVED" else { throw CommandError("archive_failed") }
            let reSaved = await run(NativeCommand(name: "bookmark.save", url: "https://example.com/article"))
            guard reSaved.state.saveStatus == "rebookmarked" else { throw CommandError("resave_failed") }
            return try JSONEncoder().encode(results)
        }
    }
#endif
