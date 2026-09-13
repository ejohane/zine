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
