import XCTest

@testable import ZineNative

final class BookmarkPropagationTests: XCTestCase {
  @MainActor
  func testMountedCollectionsAndCreatorMoveImmediatelyAndRestoreOnFailure() async throws {
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
}

private final class BookmarkPropagationProtocol: URLProtocol {
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
    let payload: [String: Any] = [
      "items": isCompleted ? [] : [bookmark],
      "completionMembership": ["isFinished": false, "pinnedIds": pinned ? ["bookmark"] : []],
    ]
    let response = HTTPURLResponse(
      url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!
    client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
    client?.urlProtocol(self, didLoad: try! JSONSerialization.data(withJSONObject: payload))
    client?.urlProtocolDidFinishLoading(self)
  }
  override func stopLoading() {}
}
