import XCTest

@testable import ZineCore

final class CoreTests: XCTestCase {
    @MainActor
    func testOfflineReconnectThroughRealStores() async throws {
        let data = try await NativeScenario.run("reader-offline")
        let results = try JSONDecoder().decode([NativeCommandResult].self, from: data)
        XCTAssertEqual(results.last?.state.pendingMutations, 0)
        XCTAssertNil(results.last?.state.pendingProgress)
    }

    @MainActor
    func testPermanentReplayFailureRestoresUnfinishedLibrary() async throws {
        let data = try await NativeScenario.run("reader-rollback")
        let results = try JSONDecoder().decode([NativeCommandResult].self, from: data)
        XCTAssertEqual(results.last?.status, "failed")
        XCTAssertEqual(results.last?.state.libraryIDs, ["article-1"])
    }
    @MainActor
    func testReaderRestartAndMissingContentRecovery() async throws {
        let data = try await NativeScenario.run("reader-recovery")
        let results = try JSONDecoder().decode([NativeCommandResult].self, from: data)
        XCTAssertTrue(
            results.contains { $0.state.readerContentSource == "cache" && $0.state.progressFraction == 0.63 })
        XCTAssertTrue(results.contains { $0.state.readerPhase == "unavailable" })
        XCTAssertEqual(results.last?.state.pendingMutations, 0)
    }

    @MainActor
    func testLibrarySearchPaginationAndUnfinishedRestoration() async throws {
        let data = try await NativeScenario.run("library-workflows")
        let results = try JSONDecoder().decode([NativeCommandResult].self, from: data)
        XCTAssertEqual(results.last?.state.libraryIDs, ["item-4"])
        XCTAssertEqual(results.last?.status, "local_pending")
    }

    @MainActor
    func testBookmarkLifecycleAndRestoreAfterOfflineArchive() async throws {
        let data = try await NativeScenario.run("bookmark-lifecycle")
        let results = try JSONDecoder().decode([NativeCommandResult].self, from: data)
        XCTAssertEqual(results.last?.state.saveStatus, "rebookmarked")
        XCTAssertTrue(results.contains { $0.status == "local_pending" })
    }

    @MainActor
    func testSyncCompletionFailuresAndResume() async throws {
        let data = try await NativeScenario.run("sync-workflows")
        let results = try JSONDecoder().decode([NativeCommandResult].self, from: data)
        XCTAssertTrue(
            results.contains { $0.state.syncJob?.itemsFound == 1 && $0.state.libraryIDs == ["article-1"] })
        XCTAssertTrue(results.contains { $0.error == "sync_wait_timed_out_job_continues" })
        XCTAssertTrue(
            results.contains {
                $0.state.syncJob?.failed == 0 && $0.state.syncJob?.errors.isEmpty == false
                    && $0.status == "failed"
            })
    }

    func testCapabilityAndExpiry() {
        let identity = BridgeIdentity(
            session: "session", capability: "secret", simulator: "sim",
            worktree: "tree", build: "build", endpoint: "http://localhost:8747",
            expiresAt: Date(timeIntervalSince1970: 100))
        let command = NativeCommand(name: "reader.complete")
        XCTAssertTrue(
            identity.accepts(
                BridgeRequest(session: "session", capability: "secret", command: command),
                now: Date(timeIntervalSince1970: 99)))
        XCTAssertFalse(
            identity.accepts(
                BridgeRequest(session: "session", capability: "wrong", command: command),
                now: Date(timeIntervalSince1970: 99)))
        XCTAssertFalse(
            identity.accepts(
                BridgeRequest(session: "other", capability: "secret", command: command),
                now: Date(timeIntervalSince1970: 99)))
        XCTAssertFalse(
            identity.accepts(
                BridgeRequest(session: "session", capability: "secret", command: command),
                now: Date(timeIntervalSince1970: 100)))
    }

    func testTagReplacementValidation() throws {
        XCTAssertEqual(
            try ReaderTagNames.validate([" Native  code ", "native code", "offline"]),
            ["Native code", "offline"])
        XCTAssertThrowsError(try ReaderTagNames.validate([""]))
        XCTAssertThrowsError(try ReaderTagNames.validate([String(repeating: "a", count: 33)]))
        XCTAssertThrowsError(try ReaderTagNames.validate((0..<21).map(String.init)))
    }

    @MainActor
    func testUnknownCommandsAndBoundedEvents() async {
        let client = APIClient(baseURL: URL(string: "https://fixture.invalid")!, tokenProvider: { "fixture" })
        let session = NativeCommandSession(client: client)
        let unknown = await session.execute(NativeCommand(name: "unknown"))
        XCTAssertEqual(unknown.status, "failed")
        for _ in 0..<100 { _ = await session.execute(NativeCommand(name: "state.get")) }
        XCTAssertEqual(session.events.count, 128)
        XCTAssertEqual(Set(session.events.map(\.revision)).count, 128)
        let unsupported = await session.execute(NativeCommand(version: 2, name: "state.get"))
        XCTAssertEqual(unsupported.error, "unsupported_version")
    }
}
