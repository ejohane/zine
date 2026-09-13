#if os(macOS)
    import Foundation

    @MainActor
    enum SyncWorkflowScenario {
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
                session: transport)
            let session = NativeCommandSession(client: client)
            session.library = LibraryStore(
                client: client, cache: LibraryCache(userID: "fixture", baseDirectory: directory))
            await session.library?.reload(query: LibraryQuery())
            guard session.library?.items.isEmpty == true else { throw CommandError("sync_fixture_not_empty") }
            var results: [NativeCommandResult] = []
            func run(_ command: NativeCommand) async -> NativeCommandResult {
                let result = await session.execute(command)
                results.append(result)
                return result
            }
            let started = await run(NativeCommand(name: "sync.start"))
            guard started.status == "accepted", started.state.syncJobID == "fixture-job" else {
                throw CommandError("sync_start_failed")
            }
            let finished = await run(NativeCommand(name: "sync.wait"))
            guard finished.status == "completed", finished.state.syncJob?.itemsFound == 1,
                finished.state.libraryIDs == ["article-1"]
            else { throw CommandError("sync_new_item_missing") }
            let inactive = await run(NativeCommand(name: "sync.active"))
            guard inactive.state.syncJobID == nil else { throw CommandError("completed_job_still_active") }
            for mode in ["empty", "partial", "expired"] {
                server.syncMode = mode
                _ = await run(NativeCommand(name: "sync.start"))
                let terminal = await run(NativeCommand(name: "sync.wait"))
                guard terminal.status == (mode == "empty" ? "completed" : "failed"),
                    terminal.state.syncJob?.itemsFound == 0
                else { throw CommandError("sync_" + mode + "_incorrect") }
            }
            server.syncMode = "timeout"
            _ = await run(NativeCommand(name: "sync.start"))
            let timeout = await run(NativeCommand(name: "sync.wait", timeout: 0))
            guard timeout.error == "sync_wait_timed_out_job_continues",
                timeout.state.syncJobID == "fixture-job"
            else { throw CommandError("sync_timeout_lost_job") }
            let starts = server.syncStarts
            server.syncMode = "success"
            let resumed = await run(NativeCommand(name: "sync.wait", jobID: "fixture-job"))
            guard resumed.status == "completed", server.syncStarts == starts else {
                throw CommandError("sync_resume_started_duplicate")
            }
            let missing = await run(NativeCommand(name: "sync.status", jobID: "missing"))
            guard missing.status == "failed" else { throw CommandError("missing_job_succeeded") }
            return try JSONEncoder().encode(results)
        }
    }
#endif
