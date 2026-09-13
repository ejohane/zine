#if os(macOS)
    import Foundation

    @MainActor
    enum LibraryWorkflowScenario {
        static func run() async throws -> Data {
            let directory = FileManager.default.temporaryDirectory.appending(path: UUID().uuidString)
            defer { try? FileManager.default.removeItem(at: directory) }
            let server = ScenarioServer()
            server.catalog = try (0..<5).map { index in
                var fields =
                    try JSONSerialization.jsonObject(with: JSONEncoder().encode(server.bookmark))
                    as! [String: Any]
                fields["id"] = "item-\(index)"
                fields["title"] = index == 4 ? "Finished fixture" : "Library fixture \(index)"
                fields["isFinished"] = index == 4
                fields["contentType"] = index == 2 ? "VIDEO" : index == 3 ? "PODCAST" : "ARTICLE"
                return try JSONDecoder().decode(
                    Bookmark.self, from: JSONSerialization.data(withJSONObject: fields))
            }
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
                session: transport)
            let library = LibraryStore(
                client: client, cache: LibraryCache(userID: "fixture", baseDirectory: directory))
            let session = NativeCommandSession(client: client)
            session.library = library
            session.route = "library"
            session.queryLibrary = { query in await library.reload(query: query) }
            var results: [NativeCommandResult] = []
            func run(_ command: NativeCommand) async throws -> NativeCommandResult {
                let result = await session.execute(command)
                results.append(result)
                guard result.status != "failed" else { throw CommandError(result.error ?? "command_failed") }
                return result
            }
            let first = try await run(NativeCommand(name: "library.query", query: LibraryQuery()))
            guard first.state.libraryIDs == ["item-0", "item-1"], first.state.libraryNextCursor != nil else {
                throw CommandError("first_page_failed")
            }
            let next = try await run(NativeCommand(name: "library.next"))
            guard next.state.libraryIDs == ["item-0", "item-1", "item-2", "item-3"],
                next.state.libraryNextCursor == nil
            else { throw CommandError("pagination_failed") }
            let end = try await run(NativeCommand(name: "library.next"))
            guard end.state.libraryIDs == next.state.libraryIDs else {
                throw CommandError("pagination_duplicated")
            }
            _ = try await run(NativeCommand(name: "library.query", query: LibraryQuery()))
            server.pageDelay = 0.1
            let oldPage = Task { await session.execute(NativeCommand(name: "library.next")) }
            while !library.isLoadingMore { await Task.yield() }
            await library.reload(query: LibraryQuery(search: "fixture", contentType: .video))
            _ = await oldPage.value
            guard library.items.map(\.id) == ["item-2"] else {
                throw CommandError("stale_page_contaminated_new_query")
            }
            server.pageDelay = 0
            let filtered = try await run(
                NativeCommand(
                    name: "library.query", query: LibraryQuery(search: "fixture", contentType: .video)))
            guard filtered.state.libraryIDs == ["item-2"] else { throw CommandError("filter_failed") }
            let empty = try await run(
                NativeCommand(name: "library.query", query: LibraryQuery(search: "no matches")))
            guard empty.state.libraryIDs.isEmpty else { throw CommandError("empty_search_failed") }
            _ = try await run(NativeCommand(name: "library.query", query: LibraryQuery(isFinished: true)))
            _ = try await run(
                NativeCommand(name: "library.finished.set", bookmarkID: "item-4", isFinished: false))
            let reloaded = try await run(
                NativeCommand(name: "library.query", query: LibraryQuery(search: "Finished")))
            guard reloaded.state.libraryIDs == ["item-4"],
                reloaded.state.libraryItems.first?.isFinished == false
            else { throw CommandError("unfinished_restore_failed") }
            server.mode = .offline
            let cached = try await run(
                NativeCommand(name: "library.query", query: LibraryQuery(search: "Finished")))
            guard cached.status == "local_pending", cached.state.libraryIDs == ["item-4"] else {
                throw CommandError("library_cache_failed")
            }
            return try JSONEncoder().encode(results)
        }
    }
#endif
