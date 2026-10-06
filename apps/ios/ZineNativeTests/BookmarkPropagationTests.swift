import XCTest

@testable import ZineNative

final class BookmarkPropagationTests: XCTestCase {
  @MainActor
  func testMountedCollectionsAndCreatorMoveImmediatelyAndRestoreOnFailure() async throws {
    BookmarkPropagationProtocol.empty = false
    let configuration = URLSessionConfiguration.ephemeral
    configuration.protocolClasses = [BookmarkPropagationProtocol.self]
    let session = URLSession(configuration: configuration)
    defer { session.invalidateAndCancel() }
    let client = APIClient(
      baseURL: URL(string: "https://fixture.invalid")!, tokenProvider: { "fixture" },
      session: session)
    let recent = HomeSectionListStore(route: .recentlySaved, client: client)
    let collection = HomeSectionListStore(
      route: .collection(id: "unfinished", title: "Unfinished"), client: client)
    let pinned = HomeSectionListStore(
      route: .collection(id: "pinned", title: "Pinned"), client: client)
    let jump = JumpBackInListStore(client: client)
    let creator = CreatorStore(creatorId: "creator", client: client)
    await recent.reload()
    await collection.reload()
    await pinned.reload()
    await jump.reload()
    await creator.reload()
    let bookmark = try XCTUnwrap(recent.items.first)
    let transaction = try client.bookmarkState.begin(bookmark, finished: true)
    XCTAssertTrue(recent.items.isEmpty)
    XCTAssertTrue(collection.items.isEmpty)
    XCTAssertTrue(jump.items.isEmpty)
    XCTAssertEqual(pinned.items.first?.isFinished, true)
    XCTAssertTrue(creator.bookmarks.isEmpty)
    XCTAssertEqual(creator.completedBookmarks.first?.id, bookmark.id)
    client.bookmarkState.rollback(transaction)
    XCTAssertEqual(recent.items.map(\.id), [bookmark.id])
    XCTAssertEqual(collection.items.map(\.id), [bookmark.id])
    XCTAssertEqual(jump.items.map(\.id), [bookmark.id])
    XCTAssertEqual(creator.bookmarks.map(\.id), [bookmark.id])
    XCTAssertTrue(creator.completedBookmarks.isEmpty)
    let archive = try client.bookmarkState.begin(bookmark, state: "ARCHIVED")
    XCTAssertTrue(pinned.items.isEmpty)
    XCTAssertTrue(creator.bookmarks.isEmpty)
    client.bookmarkState.rollback(archive)
    XCTAssertEqual(pinned.items.map(\.id), [bookmark.id])
  }
  @MainActor
  func testFreshOmissionHidesSnapshotsAcrossCollectionsJumpAndCreator() async throws {
    BookmarkPropagationProtocol.empty = false
    defer { BookmarkPropagationProtocol.empty = false }
    let configuration = URLSessionConfiguration.ephemeral
    configuration.protocolClasses = [BookmarkPropagationProtocol.self]
    let session = URLSession(configuration: configuration)
    defer { session.invalidateAndCancel() }
    let client = APIClient(baseURL: URL(string: "https://fixture.invalid")!, tokenProvider: { "fixture" }, session: session)
    let directory = FileManager.default.temporaryDirectory.appending(path: UUID().uuidString)
    defer { try? FileManager.default.removeItem(at: directory) }
    let home = HomeStore(client: client, cache: HomeCache(userID: "membership", baseDirectory: directory))
    let collection = HomeSectionListStore(route: .collection(id: "all", title: "All"), client: client)
    let jump = JumpBackInListStore(client: client)
    let creator = CreatorStore(creatorId: "creator", client: client)
    await collection.reload()
    await jump.reload()
    await creator.reload()
    await home.reload()
    XCTAssertFalse(home.sections.isEmpty)
    let bookmark = try XCTUnwrap(collection.items.first)
    let transaction = try client.bookmarkState.begin(bookmark, finished: false)
    client.bookmarkState.commit(transaction)
    BookmarkPropagationProtocol.empty = true
    await collection.reload()
    await jump.reload()
    await creator.reload()
    await home.reload()
    XCTAssertFalse(home.sections.contains { section in
      if case .recentlySaved(let items) = section { return !items.isEmpty }
      return false
    })
    XCTAssertTrue(collection.items.isEmpty)
    XCTAssertTrue(jump.items.isEmpty)
    XCTAssertTrue(creator.bookmarks.isEmpty)
    XCTAssertTrue(creator.completedBookmarks.isEmpty)
    let newer = try client.bookmarkState.begin(bookmark, finished: false)
    XCTAssertEqual(collection.items.map(\.id), [bookmark.id])
    XCTAssertEqual(jump.items.map(\.id), [bookmark.id])
    XCTAssertEqual(creator.bookmarks.map(\.id), [bookmark.id])
    XCTAssertTrue(home.sections.contains { section in
      if case .recentlySaved(let items) = section { return items.contains { $0.id == bookmark.id } }
      return false
    })
    client.bookmarkState.rollback(newer)
    await collection.reload()
    await jump.reload()
    await creator.reload()
    await home.reload()
    XCTAssertFalse(home.sections.contains { section in
      if case .recentlySaved(let items) = section { return !items.isEmpty }
      return false
    })
    XCTAssertTrue(collection.items.isEmpty)
    XCTAssertTrue(jump.items.isEmpty)
    XCTAssertTrue(creator.bookmarks.isEmpty)
  }

}

private final class BookmarkPropagationProtocol: URLProtocol {
  static var empty = false
  override class func canInit(with request: URLRequest) -> Bool { true }
  override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
  override func startLoading() {
    let bookmark: [String: Any] = [
      "id": "bookmark", "itemId": "item", "title": "Fixture", "canonicalUrl": "https://example.com",
      "contentType": "ARTICLE", "provider": "WEB", "creator": "Creator", "creatorId": "creator",
      "state": "BOOKMARKED", "ingestedAt": "2026-10-06", "isFinished": false, "tags": [],
    ]
    let isCompleted =
      URLComponents(url: request.url!, resolvingAgainstBaseURL: false)?.queryItems?
      .contains { $0.name == "isFinished" && $0.value == "true" } == true
    let pinned = request.url!.path.contains("pinned")
    var payload: [String: Any] = [
      "items": isCompleted || Self.empty ? [] : [bookmark],
      "completionMembership": ["isFinished": false, "pinnedIds": pinned ? ["bookmark"] : []],
    ]
    if request.url!.path == "/api/v1/home" {
      payload = ["recentBookmarks": Self.empty ? [] : [bookmark], "jumpBackIn": [],
        "byContentType": ["videos": [], "podcasts": [], "articles": []],
        "customCollections": [], "sectionOrder": []]
    }
    let response = HTTPURLResponse(
      url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!
    client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
    client?.urlProtocol(self, didLoad: try! JSONSerialization.data(withJSONObject: payload))
    client?.urlProtocolDidFinishLoading(self)
  }
  override func stopLoading() {}
}
