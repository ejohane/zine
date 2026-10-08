import XCTest
@testable import ZineCore

final class HomeInboxMutationTests: XCTestCase {
 @MainActor func testArchiveSurvivesCachedRefreshAndOverlappingOmissionRollback() async throws {
  let root = FileManager.default.temporaryDirectory.appending(path: UUID().uuidString)
  defer { try? FileManager.default.removeItem(at: root) }
  let config = URLSessionConfiguration.ephemeral
  config.protocolClasses = [HomeInboxProtocol.self]
  let session = URLSession(configuration: config)
  defer { session.invalidateAndCancel() }
  let old = APIClient(baseURL: URL(string: "https://fixture.invalid")!, tokenProvider: { "fixture" }, session: session)
  let recreated = APIClient(baseURL: old.baseURL, tokenProvider: { "fixture" }, session: session)
  var item = ScenarioServer().bookmark
  item.state = "INBOX"
  let cache = HomeCache(userID: "fixture", baseDirectory: root)
  await cache.save(home: nil, inboxItems: [item])
  let home = HomeStore(client: old, cache: cache)
  await home.reload() // GET fails intentionally: reproduce cache fallback.
  func ids() -> [String] { home.sections.flatMap { if case .inbox(let rows) = $0 { return rows.map(\.id) }; return [] } }
  XCTAssertEqual(ids(), [item.id])
  XCTAssertFalse(old.bookmarkState === recreated.bookmarkState)
  try await recreated.archiveInboxItem(id: item.id, bookmark: item)
  XCTAssertEqual(recreated.bookmarkState.overlay(item).state, "ARCHIVED")
  XCTAssertEqual(ids(), [item.id], "Different client leaves Home stale")
  try await old.archiveInboxItem(id: item.id, bookmark: item)
  XCTAssertEqual(ids(), [], "Same client immediately hides Home row")
  XCTAssertTrue(home.inboxPreviewItems.isEmpty)
  await home.reload()
  XCTAssertEqual(ids(), [], "Shared overlay survives stale HomeCache and failed refresh")
  let readStartedBeforeCommit = old.bookmarkState.revision - 1
  old.bookmarkState.reconcile([item], startedAt: readStartedBeforeCommit)
  XCTAssertEqual(ids(), [], "Older read cannot resurrect committed archive")
  old.bookmarkState.reconcile([item], startedAt: old.bookmarkState.revision)
  XCTAssertEqual(ids(), [item.id], "Post-commit stale data is accepted as fresh")
  let failedArchive = try old.bookmarkState.begin(item, state: "ARCHIVED")
  HomeInboxProtocol.emptyInbox = true
  await home.reload()
  old.bookmarkState.rollback(failedArchive)
  XCTAssertEqual(old.bookmarkState.overlay(item).state, "INBOX")
  XCTAssertEqual(ids(), [item.id], "Rollback restores retained preview after overlapping omission")
  XCTAssertEqual(home.inboxPreviewItems.map(\.id), [item.id])
  HomeInboxProtocol.emptyInbox = false
 }
 @MainActor func testSupersededInboxResponseCannotRestorePreviewOrCache() async throws {
  let root = FileManager.default.temporaryDirectory.appending(path: UUID().uuidString)
  defer { try? FileManager.default.removeItem(at: root) }
  let config = URLSessionConfiguration.ephemeral
  config.protocolClasses = [HomeInboxProtocol.self]
  let session = URLSession(configuration: config)
  defer { session.invalidateAndCancel() }
  let client = APIClient(baseURL: URL(string: "https://fixture.invalid")!, tokenProvider: { "fixture" }, session: session)
  let cache = HomeCache(userID: "race", baseDirectory: root)
  let home = HomeStore(client: client, cache: cache)
  HomeInboxProtocol.holdNextInbox = true
  let earlier = Task { await home.reload() }
  for _ in 0..<1000 {
   if HomeInboxProtocol.held != nil { break }
   try await Task.sleep(for: .milliseconds(1))
  }
  let held = try XCTUnwrap(HomeInboxProtocol.held)
  HomeInboxProtocol.emptyInbox = true
  await home.reload()
  var stale = ScenarioServer().bookmark
  stale.state = "INBOX"
  held.finish(try JSONEncoder().encode(InboxPageFixture(items: [stale])))
  await earlier.value
  XCTAssertTrue(home.inboxPreviewItems.isEmpty)
  let saved = await cache.load()
  XCTAssertEqual(saved?.inboxItems, [])
  HomeInboxProtocol.held = nil
  HomeInboxProtocol.emptyInbox = false
 }
}
final class HomeInboxProtocol: URLProtocol, @unchecked Sendable {
 private static let lock = NSLock()
 private static var storedEmptyInbox = false
 private static var storedHoldNextInbox = false
 private static var storedHeld: HomeInboxProtocol?
 static var emptyInbox: Bool {
  get { lock.withLock { storedEmptyInbox } }
  set { lock.withLock { storedEmptyInbox = newValue } }
 }
 static var holdNextInbox: Bool {
  get { lock.withLock { storedHoldNextInbox } }
  set { lock.withLock { storedHoldNextInbox = newValue } }
 }
 static var held: HomeInboxProtocol? {
  get { lock.withLock { storedHeld } }
  set { lock.withLock { storedHeld = newValue } }
 }
 override class func canInit(with request: URLRequest) -> Bool { true }
 override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
 override func startLoading() {
  if request.httpMethod != "POST" { XCTAssertEqual(request.cachePolicy, .reloadIgnoringLocalCacheData) }
  if Self.holdNextInbox && request.url!.path == "/api/v1/inbox" {
   Self.holdNextInbox = false
   Self.held = self
   return
  }
  if Self.emptyInbox && request.url!.path == "/api/v1/inbox" {
   client?.urlProtocol(self, didReceive: HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!, cacheStoragePolicy: .notAllowed)
   client?.urlProtocol(self, didLoad: Data(#"{"items":[],"nextCursor":null}"#.utf8))
   client?.urlProtocolDidFinishLoading(self)
  } else if request.httpMethod == "POST" {
   client?.urlProtocol(self, didReceive: HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!, cacheStoragePolicy: .notAllowed)
   client?.urlProtocol(self, didLoad: Data("{}".utf8))
   client?.urlProtocolDidFinishLoading(self)
  } else { client?.urlProtocol(self, didFailWithError: URLError(.notConnectedToInternet)) }
 }
 func finish(_ data: Data) {
  client?.urlProtocol(self, didReceive: HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!, cacheStoragePolicy: .notAllowed)
  client?.urlProtocol(self, didLoad: data)
  client?.urlProtocolDidFinishLoading(self)
 }
 override func stopLoading() {}
}

private struct InboxPageFixture: Encodable { let items: [Bookmark]; let nextCursor: String? = nil }
