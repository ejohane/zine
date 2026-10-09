import XCTest

@testable import ZineCore

final class BookmarkMutationTests: XCTestCase {
  @MainActor
  func testCompletionRollbackAndCrossViewMembershipBeforeReturningFromDetail() async throws {
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
    let client = APIClient(
      baseURL: URL(string: "https://fixture.invalid")!, tokenProvider: { "fixture" },
      session: transport)
    let library = LibraryStore(
      client: client, cache: LibraryCache(userID: "library", baseDirectory: directory))
    let search = LibraryStore(
      client: client, cache: LibraryCache(userID: "search", baseDirectory: directory))
    await library.reload(query: LibraryQuery())
    await search.reload(query: LibraryQuery(includesFinished: true))
    let bookmark = try XCTUnwrap(library.items.first)
    let reader = ArticleReaderStore(metadata: ArticleReaderMetadata(bookmarkID: bookmark.id, title: bookmark.title, creator: bookmark.creator, creatorImageURL: nil, canonicalURL: bookmark.canonicalUrl, readingTimeMinutes: 1, initialProgress: nil, isFinished: false, tags: []), client: client)

    // Hold the mutation open: destinations remain mounted under a pushed detail.
    let transaction = try client.bookmarkState.begin(bookmark, finished: true)
    XCTAssertTrue(library.items.isEmpty)
    XCTAssertEqual(search.items.first?.isFinished, true)
    XCTAssertTrue(reader.isFinished)
    client.bookmarkState.rollback(transaction)
    XCTAssertFalse(reader.isFinished)
    XCTAssertEqual(library.items.map(\.id), [bookmark.id])
    XCTAssertEqual(search.items.first?.isFinished, false)

    _ = try await client.setFinished(id: bookmark.id, isFinished: true, bookmark: bookmark)
    XCTAssertTrue(library.items.isEmpty)
    XCTAssertEqual(search.items.first?.isFinished, true)
    await library.reload(query: LibraryQuery())
    XCTAssertTrue(library.items.isEmpty)
    _ = try await client.setFinished(id: bookmark.id, isFinished: false, bookmark: bookmark)
    XCTAssertEqual(library.items.map(\.id), [bookmark.id])
    XCTAssertEqual(search.items.first?.isFinished, false)

    server.mode = .reject
    do {
      _ = try await client.setFinished(id: bookmark.id, isFinished: true, bookmark: bookmark)
      XCTFail("Expected rejected save")
    } catch {}
    XCTAssertEqual(library.items.map(\.id), [bookmark.id])
    XCTAssertEqual(search.items.first?.isFinished, false)
    do {
      try await client.archiveBookmark(id: bookmark.id, bookmark: bookmark)
      XCTFail("Expected rejected archive")
    } catch {}
    XCTAssertEqual(search.items.map(\.id), [bookmark.id])
    server.mode = .online
    try await client.archiveBookmark(id: bookmark.id, bookmark: bookmark)
    XCTAssertTrue(library.items.isEmpty)
    XCTAssertTrue(search.items.isEmpty)
    try await client.bookmarkItem(id: bookmark.id, bookmark: bookmark)
    XCTAssertEqual(library.items.map(\.id), [bookmark.id])
  }

  @MainActor
  func testReaderRollbackUsesKnownInboxState() throws {
    let state = BookmarkMutationState()
    var bookmark = ScenarioServer().bookmark
    bookmark.state = "INBOX"
    state.reconcile([bookmark], startedAt: state.revision)
    let transaction = try state.begin(id: bookmark.id, previous: .init(isFinished: false, finishedAt: nil, state: "BOOKMARKED"), finished: true)
    XCTAssertEqual(state.overlay(bookmark).state, "BOOKMARKED")
    state.rollback(transaction)
    XCTAssertEqual(state.overlay(bookmark).state, "INBOX")
  }

  @MainActor
  func testCustomCollectionCompletionRulesAndPinOverrides() throws {
    let state = BookmarkMutationState()
    let bookmark = ScenarioServer().bookmark
    let unfinished = CollectionCompletionMembership(isFinished: false, pinnedIds: [])
    let all = CollectionCompletionMembership(isFinished: nil, pinnedIds: [])
    let pinned = CollectionCompletionMembership(isFinished: false, pinnedIds: [bookmark.id])
    let transaction = try state.begin(bookmark, finished: true)
    XCTAssertFalse(state.includesInCollection(id: bookmark.id, membership: unfinished))
    XCTAssertTrue(state.includesInCollection(id: bookmark.id, membership: all))
    XCTAssertTrue(state.includesInCollection(id: bookmark.id, membership: pinned))
    state.rollback(transaction)
    XCTAssertTrue(state.includesInCollection(id: bookmark.id, membership: unfinished))
    let archive = try state.begin(bookmark, state: "ARCHIVED")
    XCTAssertFalse(state.includesInCollection(id: bookmark.id, membership: pinned))
    state.rollback(archive)
    XCTAssertTrue(state.includesInCollection(id: bookmark.id, membership: pinned))
  }

  @MainActor
  func testOlderLoadsAndTransactionsCannotOverwriteNewerIntent() throws {
    let state = BookmarkMutationState()
    let bookmark = ScenarioServer().bookmark
    let transaction = try state.begin(bookmark, finished: true)
    let overlappingRead = state.revision
    XCTAssertThrowsError(try state.begin(bookmark, finished: false))
    state.commit(transaction)
    state.reconcile([bookmark], startedAt: overlappingRead)
    XCTAssertTrue(state.overlay(bookmark).isFinished)
    let next = try state.begin(bookmark, finished: false)
    state.commit(next)
    state.rollback(transaction)
    XCTAssertFalse(state.overlay(bookmark).isFinished)
    var external = bookmark
    external.isFinished = true
    state.reconcile([external], startedAt: state.revision)
    XCTAssertTrue(state.overlay(bookmark).isFinished)
    var changedMetadata = bookmark
    changedMetadata.tags = [BookmarkTag(id: "tag", name: "Keep")]
    XCTAssertEqual(state.overlay(changedMetadata).tags, changedMetadata.tags)
  }
}
