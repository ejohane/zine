import Foundation
import XCTest
@testable import ZineCore

final class BookmarkMembershipRegressionTests: XCTestCase {
    @MainActor
    func testQueuedCompletionDoesNotEnterUnrelatedCollections() async throws {
        let directory = FileManager.default.temporaryDirectory.appending(path: UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: directory) }
        let outbox = OfflineBookmarkMutationOutbox(userID: "triage", baseDirectory: directory)
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [MembershipFixtureProtocol.self]
        let session = URLSession(configuration: configuration)
        defer { session.invalidateAndCancel() }
        MembershipFixtureProtocol.page = []
        let client = APIClient(baseURL: URL(string: "https://fixture.invalid")!, tokenProvider: { "fixture" }, session: session, bookmarkMutationOutbox: outbox)
        var bookmark = ScenarioServer().bookmark
        bookmark.tags = [BookmarkTag(id: "nature", name: "Nature")]
        let receipt = try await client.setFinishedWithReceipt(id: bookmark.id, isFinished: true, bookmark: bookmark)
        XCTAssertEqual(receipt.delivery, .localPending)
        let pendingCount = await outbox.pendingMutations().count
        XCTAssertEqual(pendingCount, 1)
        // Fixture collections require Finance, YouTube, or a different creator.
        // The canonical server response is empty: this WEB/Nature/Fixture item
        // satisfies none of those full membership rules.
        for collection in ["tag-finance", "provider-youtube", "creator-other"] {
            let response = try await client.listCollectionItems(id: collection)
            XCTAssertTrue(response.items.isEmpty)
            let membership = try XCTUnwrap(response.completionMembership)
            XCTAssertTrue(membership.includes(id: bookmark.id, isFinished: true))
            XCTAssertTrue(client.bookmarkState.includesInCollection(id: bookmark.id, membership: membership))
        }
    }

    @MainActor
    func testMembershipFencesPreservePendingNewerAndRestorationState() throws {
        let state = BookmarkMutationState()
        let bookmark = ScenarioServer().bookmark
        var snapshot = BookmarkMembershipSnapshot()
        let readRevision = state.revision
        let transaction = try state.begin(bookmark, finished: true)
        snapshot.accept(previousIDs: [bookmark.id], receivedIDs: [], startedAt: readRevision, queuedIDs: [])
        XCTAssertTrue(snapshot.includes(bookmark.id, state: state))
        state.rollback(transaction)
        XCTAssertTrue(snapshot.includes(bookmark.id, state: state))
        snapshot.accept(previousIDs: [bookmark.id], receivedIDs: [], startedAt: state.revision, queuedIDs: [])
        XCTAssertFalse(snapshot.includes(bookmark.id, state: state))
        XCTAssertNotNil(state.patch(for: bookmark.id))
        _ = try state.begin(bookmark, finished: false)
        XCTAssertTrue(snapshot.includes(bookmark.id, state: state))
    }

    @MainActor
    func testReconciliationDoesNotRestoreOmittedQueryMembership() throws {
        let state = BookmarkMutationState()
        var bookmark = ScenarioServer().bookmark
        let transaction = try state.begin(bookmark, finished: false)
        state.commit(transaction)
        var snapshot = BookmarkMembershipSnapshot()
        snapshot.accept(previousIDs: [bookmark.id], receivedIDs: [], startedAt: state.revision, queuedIDs: [])
        bookmark.isFinished = true
        state.reconcile([bookmark], startedAt: state.revision)
        XCTAssertEqual(state.patch(for: bookmark.id)?.isFinished, true)
        XCTAssertFalse(snapshot.includes(bookmark.id, state: state))
    }

    @MainActor
    func testQueuedOverlayKeepsLibraryInsertionAndPatchesKnownCollectionMembers() async throws {
        let directory = FileManager.default.temporaryDirectory.appending(path: UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: directory) }
        let outbox = OfflineBookmarkMutationOutbox(userID: "overlay", baseDirectory: directory)
        let bookmark = ScenarioServer().bookmark
        _ = await outbox.stageFinished(bookmarkID: bookmark.id, isFinished: true, bookmark: bookmark)
        let library = await outbox.overlay([], matching: LibraryQuery(includesFinished: true))
        XCTAssertEqual(library.map(\.id), [bookmark.id])
        XCTAssertEqual(library.first?.isFinished, true)
        let collection = await outbox.overlay([bookmark], matching: LibraryQuery(includesFinished: true), insertMissing: false)
        XCTAssertEqual(collection.first?.isFinished, true)
        var snapshot = BookmarkMembershipSnapshot()
        let state = BookmarkMutationState()
        snapshot.accept(previousIDs: [bookmark.id], receivedIDs: [], startedAt: state.revision, queuedIDs: [bookmark.id])
        XCTAssertTrue(snapshot.includes(bookmark.id, state: state))
        snapshot.accept(previousIDs: [bookmark.id], receivedIDs: [], startedAt: state.revision, queuedIDs: [])
        XCTAssertFalse(snapshot.includes(bookmark.id, state: state))
    }

    @MainActor
    func testAuthoritativeSameQueryRefreshRemovesCommittedAndRolledBackRows() async throws {
        for phase in ["commit", "rollback"] {
            let directory = FileManager.default.temporaryDirectory.appending(path: UUID().uuidString)
            defer { try? FileManager.default.removeItem(at: directory) }
            let configuration = URLSessionConfiguration.ephemeral
            configuration.protocolClasses = [MembershipFixtureProtocol.self]
            let session = URLSession(configuration: configuration)
            defer { session.invalidateAndCancel() }
            let client = APIClient(baseURL: URL(string: "https://fixture.invalid")!, tokenProvider: { "fixture" }, session: session)
            let bookmark = ScenarioServer().bookmark
            MembershipFixtureProtocol.page = [bookmark]
            let store = LibraryStore(client: client, cache: LibraryCache(userID: phase, baseDirectory: directory))
            let query = LibraryQuery(search: "Native")
            await store.reload(query: query)
            XCTAssertEqual(store.items.map(\.id), [bookmark.id])
            let transaction = try client.bookmarkState.begin(bookmark, finished: phase == "rollback")
            if phase == "rollback" { client.bookmarkState.rollback(transaction) }
            else { client.bookmarkState.commit(transaction, isFinished: false) }
            XCTAssertFalse(client.bookmarkState.isPending(id: bookmark.id))
            MembershipFixtureProtocol.page = []
            let authoritative = try await client.listBookmarks(query: query)
            XCTAssertTrue(authoritative.items.isEmpty)
            // Simulate authoritative removal, a title leaving the same search,
            // or a row moving off the server's first page. Same query, new read.
            await store.reload(query: query)
            await store.reload(query: query)
            XCTAssertEqual(store.dataSource, "network")
            XCTAssertNil(store.errorMessage)
            XCTAssertTrue(store.items.isEmpty)
            XCTAssertTrue(client.bookmarkState.changedIDs.contains(bookmark.id))
            await store.reload(query: LibraryQuery(search: "different"))
            XCTAssertTrue(store.items.isEmpty)
        }
    }
}

private final class MembershipFixtureProtocol: URLProtocol, @unchecked Sendable {
    static var page: [Bookmark] = []
    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
    override func startLoading() {
        if request.httpMethod == "PATCH" {
            client?.urlProtocol(self, didFailWithError: URLError(.notConnectedToInternet))
            return
        }
        do {
            let rows = try JSONSerialization.jsonObject(with: JSONEncoder().encode(Self.page))
            let payload: [String: Any] = ["items": rows, "nextCursor": NSNull(), "completionMembership": ["isFinished": NSNull(), "pinnedIds": []]]
            let response = HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!
            client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
            client?.urlProtocol(self, didLoad: try JSONSerialization.data(withJSONObject: payload))
            client?.urlProtocolDidFinishLoading(self)
        } catch { client?.urlProtocol(self, didFailWithError: error) }
    }
    override func stopLoading() {}
}
