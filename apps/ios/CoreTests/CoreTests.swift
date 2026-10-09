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

extension CoreTests {
    @MainActor
    func testSuggestionClientKeepsSuggestionsSeparateAndUsesDecisionEndpoint() async throws {
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [SuggestionProtocol.self]
        let session = URLSession(configuration: configuration)
        defer { session.invalidateAndCancel() }
        let client = APIClient(baseURL: URL(string: "https://suggestions.invalid")!, tokenProvider: { "fixture" }, session: session)
        let suggestions = try await client.tagSuggestions(id: "bookmark")
        XCTAssertEqual(suggestions.map(\.name), ["AI"])
        let accepted = try await client.decideTagSuggestion(id: "bookmark", suggestionID: "suggestion", accept: true)
        XCTAssertEqual(accepted.tags.map(\.name), ["AI"])
        XCTAssertTrue(accepted.suggestions.isEmpty)
        let dismissed = try await client.decideTagSuggestion(id: "bookmark", suggestionID: "suggestion", accept: false)
        XCTAssertTrue(dismissed.tags.isEmpty)
        XCTAssertTrue(dismissed.suggestions.isEmpty)
    }
}

private final class SuggestionProtocol: URLProtocol, @unchecked Sendable {
    override class func canInit(with request: URLRequest) -> Bool { request.url?.host == "suggestions.invalid" }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
    override func startLoading() {
        do {
            let data: Data
            if request.httpMethod == "GET", request.url?.path == "/api/v1/bookmarks/bookmark/tag-suggestions" {
                data = Data(#"{"suggestions":[{"id":"suggestion","name":"AI","confidence":0.95}]}"#.utf8)
            } else if request.httpMethod == "POST", request.url?.path == "/api/v1/bookmarks/bookmark/tag-suggestions/suggestion" {
                var body = request.httpBody ?? Data()
                if let stream = request.httpBodyStream {
                    stream.open()
                    defer { stream.close() }
                    var bytes = [UInt8](repeating: 0, count: 1024)
                    while stream.hasBytesAvailable {
                        let count = stream.read(&bytes, maxLength: bytes.count)
                        if count <= 0 { break }
                        body.append(bytes, count: count)
                    }
                }
                let json = try JSONSerialization.jsonObject(with: body) as? [String: String]
                guard let decision = json?["decision"], ["ACCEPTED", "DISMISSED"].contains(decision) else { throw APIError.invalidResponse }
                data = decision == "ACCEPTED"
                    ? Data(#"{"tags":[{"id":"tag","name":"AI"}],"suggestions":[]}"#.utf8)
                    : Data(#"{"tags":[],"suggestions":[]}"#.utf8)
            } else { throw APIError.invalidResponse }
            client?.urlProtocol(self, didReceive: HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: ["Content-Type":"application/json"])!, cacheStoragePolicy: .notAllowed)
            client?.urlProtocol(self, didLoad: data)
            client?.urlProtocolDidFinishLoading(self)
        } catch { client?.urlProtocol(self, didFailWithError: error) }
    }
    override func stopLoading() {}
}
