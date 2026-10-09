import Foundation
import XCTest
@testable import ZineCore

private final class PublicationTestProtocol: URLProtocol {
    static var handler: ((URLRequest) throws -> (Int, Data))?
    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
    override func startLoading() {
        do {
            let (status, bytes) = try Self.handler!(request)
            let response = HTTPURLResponse(url: request.url!, statusCode: status, httpVersion: nil, headerFields: ["Content-Type": "application/json"])!
            client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
            client?.urlProtocol(self, didLoad: bytes); client?.urlProtocolDidFinishLoading(self)
        } catch { client?.urlProtocol(self, didFailWithError: error) }
    }
    override func stopLoading() {}
}

final class PublicationTests: XCTestCase {
    func testPushEnvironmentFollowsSigningProfileOverBuildConfiguration() throws {
        let plist = try PropertyListSerialization.data(fromPropertyList: ["Entitlements": ["aps-environment": "development"]], format: .xml, options: 0)
        let profile = Data([0x30, 0x82, 0xFF]) + plist + Data([0xFF, 0x00])
        XCTAssertEqual(PublicationPushEnvironment.resolve(profile: profile, configured: "production"), "sandbox")
        XCTAssertEqual(PublicationPushEnvironment.resolve(profile: nil, configured: "production"), "production")
        XCTAssertEqual(PublicationPushEnvironment.resolve(profile: nil, configured: "development"), "sandbox")
        XCTAssertNil(PublicationPushEnvironment.resolve(profile: nil, configured: nil))
        XCTAssertNil(PublicationPushEnvironment.resolve(profile: Data("invalid".utf8), configured: "production"))
    }
    func testVerificationLinksStayInTheirSelectedEnvironment() {
        let id = "01J00000000000000000000002"
        let host = "publications-test.myzine.app"
        XCTAssertEqual(PublicationLinks.validatedHost(host), host)
        for value in ["attacker.test", "myzine.app.evil.test", "myzine.app/path", "user@myzine.app", "myzine.app:443", "myzine.app?query"] {
            XCTAssertEqual(PublicationLinks.validatedHost(value), "myzine.app")
        }
        XCTAssertEqual(PublicationDestination.parse(URL(string: "https://\(host)/i/\(id)")!, publicHost: host), .issue(id))
        XCTAssertNil(PublicationDestination.parse(URL(string: "https://myzine.app/i/\(id)")!, publicHost: host))
        XCTAssertNil(PublicationDestination.parse(URL(string: "https://\(host)/i/\(id)")!))
    }
    func testAssetURLsResolveAgainstSelectedAPI() {
        let base = URL(string: "http://localhost:8785")!
        XCTAssertEqual(publicationAssetURL("/api/v1/publication-assets/cover", baseURL: base)?.absoluteString,
                       "http://localhost:8785/api/v1/publication-assets/cover")
        XCTAssertEqual(publicationAssetURL("https://cdn.example/cover.jpg", baseURL: base)?.absoluteString,
                       "https://cdn.example/cover.jpg")
        XCTAssertNil(publicationAssetURL(nil, baseURL: base))
        XCTAssertNil(publicationAssetURL("file:///tmp/cover.jpg", baseURL: base))
    }
    private func fixture(_ name: String) throws -> Data {
        let root = URL(fileURLWithPath: #filePath).deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
        let bytes = try Data(contentsOf: root.appendingPathComponent("packages/shared/src/fixtures/publications/v1.json"))
        let json = try JSONSerialization.jsonObject(with: bytes) as! [String: Any]
        return try JSONSerialization.data(withJSONObject: json[name]!)
    }
    private func client(token: @escaping APIClient.TokenProvider = { "fixture-token" }) -> APIClient {
        let config = URLSessionConfiguration.ephemeral; config.protocolClasses = [PublicationTestProtocol.self]
        return APIClient(baseURL: URL(string: "https://local.example")!, tokenProvider: token, session: URLSession(configuration: config))
    }
    func testPrivateCoverUsesOnlyFixedAuthenticatedOwnerRoute() async throws {
        let assetID = "01J00000000000000000000002"
        let imageBytes = Data([0xFF, 0xD8, 0xFF])
        PublicationTestProtocol.handler = { request in
            XCTAssertEqual(request.url?.absoluteString, "https://local.example/api/v1/me/publication-assets/\(assetID)")
            XCTAssertEqual(request.value(forHTTPHeaderField: "Authorization"), "Bearer fixture-token")
            XCTAssertEqual(request.value(forHTTPHeaderField: "Accept"), "image/*")
            return (200, imageBytes)
        }
        let actual = try await client().ownPublicationCover(assetID)
        XCTAssertEqual(actual, imageBytes)
        PublicationTestProtocol.handler = { _ in XCTFail("Invalid asset must not make a request"); return (200, imageBytes) }
        do { _ = try await client().ownPublicationCover("https://external.example/cover"); XCTFail("Expected invalid asset") }
        catch { XCTAssertTrue(error is APIError) }
    }
    func testActualFoundationFixturesDecodeAndWeeklyRules() throws {
        let publicIssue = try JSONDecoder().decode(PersonalIssue.self, from: fixture("publicIssue"))
        XCTAssertTrue(publicIssue.isPublished); XCTAssertTrue(publicIssue.canAddSelections)
        let weekly = try JSONDecoder().decode(PersonalIssue.self, from: fixture("weeklyIssue"))
        XCTAssertFalse(weekly.canAddSelections)
        XCTAssertEqual(weekly.publication.editor.displayName, "Example Editor")
        let draft = try JSONDecoder().decode(PersonalIssue.self, from: fixture("ownerDraft"))
        XCTAssertFalse(draft.isPublished); XCTAssertTrue(draft.canAddSelections)
    }
    func testLinksRejectOtherHostsMalformedIDsAndCredentials() {
        let id = "01J00000000000000000000002"
        XCTAssertEqual(PublicationDestination.parse(URL(string: "https://myzine.app/i/\(id)")!), .issue(id))
        XCTAssertEqual(PublicationDestination.parse(URL(string: "https://www.myzine.app/p/\(id)")!), .publication(id))
        for raw in ["http://myzine.app/i/\(id)", "https://myzine.app.evil.test/i/\(id)", "https://attacker@myzine.app/i/\(id)", "https://myzine.app/i/invalid", "https://myzine.app/i/\(id)/extra", "https://myzine.app:444/i/\(id)"] {
            XCTAssertNil(PublicationDestination.parse(URL(string: raw)!))
        }
        for _ in 0..<20 {
            let generated = publicationID()
            XCTAssertEqual(generated.count, 26)
            XCTAssertNotNil(PublicationDestination.parse(URL(string: "https://myzine.app/i/\(generated)")!))
        }
    }
    func testAnonymousReadNeverRequestsTokenAndMutationUsesReplayHeader() async throws {
        let issueBytes = try fixture("publicIssue")
        PublicationTestProtocol.handler = { request in
            XCTAssertNil(request.value(forHTTPHeaderField: "Authorization"))
            return (200, Data("{\"issue\":".utf8) + issueBytes + Data("}".utf8))
        }
        let anonymous = client(token: { XCTFail("Anonymous read requested token"); throw APIError.missingSession })
        _ = try await anonymous.personalIssue("01J00000000000000000000002")
        PublicationTestProtocol.handler = { request in
            XCTAssertEqual(request.value(forHTTPHeaderField: "Authorization"), "Bearer fixture-token")
            XCTAssertEqual(request.value(forHTTPHeaderField: "Idempotency-Key"), "same-intent")
            return (409, Data("{\"error\":\"Conflict\",\"code\":\"REVISION_CONFLICT\",\"details\":{\"currentRevision\":9}}".utf8))
        }
        do {
            _ = try await client().mutatePersonalIssue("01J00000000000000000000002", revision: 3, operations: [["type": .string("setPresentation"), "introduction": .null]], key: "same-intent")
            XCTFail("Expected revision conflict")
        } catch let error as PublicationRequestError {
            XCTAssertTrue(error.isConflict); XCTAssertEqual(error.details?["currentRevision"], .integer(9))
        }
    }
    @MainActor func testDraftRelaunchRetainsLocalEditsAndConflictWithoutOverwriting() async throws {
        var remote = try JSONDecoder().decode(PersonalIssue.self, from: fixture("ownerDraft"))
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: root) }
        func envelope(_ issue: PersonalIssue) throws -> Data { Data("{\"issue\":".utf8) + (try JSONEncoder().encode(issue)) + Data("}".utf8) }
        PublicationTestProtocol.handler = { _ in (200, try envelope(remote)) }
        let store = IssueEditorStore(id: remote.id, client: client(), userID: "editor-a", cacheRoot: root)
        await store.load()
        store.edit(["type": .string("setPresentation"), "title": .string("My local title")]) { $0.title = "My local title" }
        remote.revision += 1; remote.title = "Another device"
        let restored = IssueEditorStore(id: remote.id, client: client(), userID: "editor-a", cacheRoot: root)
        await restored.load()
        XCTAssertEqual(restored.issue?.title, "My local title")
        XCTAssertEqual(restored.conflict?.title, "Another device")
        XCTAssertTrue(restored.hasLocalEdits)
        restored.useServerCopy()
        XCTAssertEqual(restored.issue?.title, "Another device"); XCTAssertFalse(restored.hasLocalEdits)
        let foreign = PublicationDraftCache(userID: "editor-b", baseURL: URL(string: "https://local.example")!, root: root)
        XCTAssertNil(foreign.load(remote.id))
    }
    @MainActor func testUncertainMutationReplaysSameKeyAfterRelaunch() async throws {
        let draft = try JSONDecoder().decode(PersonalIssue.self, from: fixture("ownerDraft"))
        let data = Data("{\"issue\":".utf8) + (try JSONEncoder().encode(draft)) + Data("}".utf8)
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: root) }
        var attemptedKey: String?
        PublicationTestProtocol.handler = { request in
            if request.httpMethod == "PATCH" { attemptedKey = request.value(forHTTPHeaderField: "Idempotency-Key"); throw URLError(.networkConnectionLost) }
            return (200, data)
        }
        let store = IssueEditorStore(id: draft.id, client: client(), userID: "editor", cacheRoot: root)
        await store.load(); store.edit(["type": .string("setPresentation"), "title": .string("Saved")]) { $0.title = "Saved" }; await store.save()
        XCTAssertNotNil(attemptedKey)
        PublicationTestProtocol.handler = { request in
            if request.httpMethod == "PATCH" { XCTAssertEqual(request.value(forHTTPHeaderField: "Idempotency-Key"), attemptedKey) }
            return (200, data)
        }
        let restored = IssueEditorStore(id: draft.id, client: client(), userID: "editor", cacheRoot: root)
        await restored.load(); XCTAssertFalse(restored.hasLocalEdits)
    }
}

extension PublicationTests {
    func testAuthenticationIntentExpiresAndPreservesExplicitSaveIdentity() throws {
        let now = Date(timeIntervalSince1970: 1_000_000)
        let intent = PublicationPendingIntent(action: .save(issueID: "issue", selectionID: "selection"), now: now, key: "explicit-intent")
        XCTAssertTrue(intent.isValid(now: now.addingTimeInterval(60)))
        XCTAssertFalse(intent.isValid(now: now.addingTimeInterval(901)))
        XCTAssertFalse(intent.isValid(now: now.addingTimeInterval(-1)))
        let restored = try JSONDecoder().decode(PublicationPendingIntent.self, from: JSONEncoder().encode(intent))
        XCTAssertEqual(restored.action, .save(issueID: "issue", selectionID: "selection"))
        XCTAssertEqual(restored.key, "explicit-intent")
    }
}

extension PublicationTests {
    @MainActor func testTypingCoalescesUnsentFieldsAndPreservesExplicitNull() async throws {
        let draft = try JSONDecoder().decode(PersonalIssue.self, from: fixture("ownerDraft"))
        let data = Data("{\"issue\":".utf8) + (try JSONEncoder().encode(draft)) + Data("}".utf8)
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: root) }
        PublicationTestProtocol.handler = { _ in (200, data) }
        let store = IssueEditorStore(id: draft.id, client: client(), userID: "editor", cacheRoot: root)
        await store.load()
        for title in ["A", "An", "An issue"] {
            store.edit(["type": .string("setPresentation"), "title": .string(title)]) { $0.title = title }
        }
        store.edit(["type": .string("setPresentation"), "introduction": .null]) { $0.introduction = nil }
        let cache = PublicationDraftCache(userID: "editor", baseURL: URL(string: "https://local.example")!, root: root)
        let cached = try XCTUnwrap(cache.load(draft.id))
        XCTAssertEqual(cached.operations.count, 1)
        XCTAssertEqual(cached.operations[0]["title"], .string("An issue"))
        XCTAssertEqual(cached.operations[0]["introduction"], .null)
    }
    @MainActor func testRejectedUnsavedAdditionCanBeRemovedWithoutLosingOtherEdits() async throws {
        let draft = try JSONDecoder().decode(PersonalIssue.self, from: fixture("ownerDraft"))
        let data = Data("{\"issue\":".utf8) + (try JSONEncoder().encode(draft)) + Data("}".utf8)
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: root) }
        PublicationTestProtocol.handler = { _ in (200, data) }
        let store = IssueEditorStore(id: draft.id, client: client(), userID: "editor", cacheRoot: root)
        await store.load()
        store.edit(["type": .string("setPresentation"), "title": .string("Keep my title")]) { $0.title = "Keep my title" }
        store.edit(["type": .string("addSelection"), "selectionId": .string("local-selection"), "sectionId": .string(draft.sections[0].id), "bookmarkId": .string("private-bookmark")]) { _ in }
        PublicationTestProtocol.handler = { _ in (422, Data("{\"error\":\"Private source\",\"code\":\"INELIGIBLE_SELECTIONS\"}".utf8)) }
        await store.save()
        XCTAssertTrue(store.rejectedEdits)
        XCTAssertNil(store.conflict)
        store.edit(["type": .string("removeSelection"), "selectionId": .string("local-selection")]) { _ in }
        XCTAssertFalse(store.rejectedEdits)
        let cache = PublicationDraftCache(userID: "editor", baseURL: URL(string: "https://local.example")!, root: root)
        let cached = try XCTUnwrap(cache.load(draft.id))
        XCTAssertEqual(cached.operations.count, 1)
        XCTAssertEqual(cached.operations[0]["title"], .string("Keep my title"))
        XCTAssertNil(cached.requestKey)
    }
    func testEligibilityErrorsGiveActionablePublicSourceAdvice() {
        let e = PublicationRequestError(status: 422, message: "INELIGIBLE_SELECTIONS", code: "INELIGIBLE_SELECTIONS", details: ["reason": .string("PRIVATE_SOURCE")])
        XCTAssertTrue(e.localizedDescription.contains("public edition"))
    }
}

extension PublicationTests {
    func testDeliveryAndWrappedExecutableFixturesDecodeWithoutPreselection() throws {
        let root = URL(fileURLWithPath: #filePath).deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
        func bytes(_ folder: String, _ key: String) throws -> Data {
            let data = try Data(contentsOf: root.appendingPathComponent("packages/shared/src/fixtures/\(folder)/v1.json"))
            let object = try JSONSerialization.jsonObject(with: data) as! [String: Any]
            return try JSONSerialization.data(withJSONObject: object[key]!)
        }
        let activity = try JSONDecoder().decode(PersonalPublicationActivity.self, from: bytes("publication-delivery", "activity"))
        XCTAssertEqual(activity.destination, .issue(activity.issueIds[0]))
        let reference = try JSONDecoder().decode(PersonalDiscoveryReference.self, from: bytes("publication-delivery", "reference"))
        XCTAssertTrue(reference.available); XCTAssertNotNil(reference.commentary)
        let recap = try JSONDecoder().decode(PersonalWeeklyRecap.self, from: bytes("weekly-recaps", "mixed"))
        XCTAssertEqual(recap.selectedCandidateIds, [])
        XCTAssertEqual(recap.coverage.state, "PARTIAL")
        var candidate = try XCTUnwrap(recap.candidates.first)
        candidate.savedBookmarkId = nil
        candidate.originalUrl = "https://example.com/original"
        let restored = try JSONDecoder().decode(PersonalWeeklyRecap.Candidate.self, from: JSONEncoder().encode(candidate))
        XCTAssertEqual(restored.originalURL?.absoluteString, "https://example.com/original")
        XCTAssertFalse(restored.canSelect, "An original link does not make unsaved content selectable")
        candidate.savedBookmarkId = "saved-after-refresh"
        candidate.publicationEligibility = "CHECK_ON_SELECTION"
        XCTAssertTrue(candidate.canSelect)
        candidate.originalUrl = "file:///private/item"
        XCTAssertNil(candidate.originalURL)
        XCTAssertFalse(recap.candidates.flatMap(\.evidence).contains { $0.kind == "CONSUMED" })
    }
}

extension PublicationTests {
    @MainActor func testTypingDuringInflightSaveRetainsNewerLocalWork() async throws {
        var draft = try JSONDecoder().decode(PersonalIssue.self, from: fixture("ownerDraft"))
        let initial = Data("{\"issue\":".utf8) + (try JSONEncoder().encode(draft)) + Data("}".utf8)
        draft.revision += 1; draft.title = "First edit"
        let committed = Data("{\"issue\":".utf8) + (try JSONEncoder().encode(draft)) + Data("}".utf8)
        let received = expectation(description: "PATCH started")
        let release = DispatchSemaphore(value: 0)
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: root) }
        PublicationTestProtocol.handler = { request in
            if request.httpMethod == "PATCH" { received.fulfill(); _ = release.wait(timeout: .now() + 5); return (200, committed) }
            return (200, initial)
        }
        let store = IssueEditorStore(id: draft.id, client: client(), userID: "editor", cacheRoot: root)
        await store.load()
        store.edit(["type": .string("setPresentation"), "title": .string("First edit")]) { $0.title = "First edit" }
        let task = Task { await store.save() }
        await fulfillment(of: [received], timeout: 5)
        store.edit(["type": .string("setPresentation"), "title": .string("Newer edit")]) { $0.title = "Newer edit" }
        release.signal(); await task.value
        XCTAssertEqual(store.issue?.title, "Newer edit")
        XCTAssertEqual(store.issue?.revision, draft.revision)
        XCTAssertTrue(store.hasLocalEdits)
    }
}
