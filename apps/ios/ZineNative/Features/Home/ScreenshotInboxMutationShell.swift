#if DEBUG
import SwiftUI

/// Disposable transport/cache fixtures exercising the real authenticated shell,
/// Home and Inbox stores. No Clerk session or production request is used.
struct ScreenshotInboxMutationShell: View {
    @State private var revision = 0

    var body: some View {
        let _ = revision
        AuthenticatedAppView(
            configuration: .current, userID: "inbox-mutation-fixture",
            userCreatedAt: .distantPast, userEmail: nil,
            initialSession: Self.makeSession()
        )
        .safeAreaInset(edge: .top) {
            Button("Rebuild shell") { revision += 1 }
                .accessibilityIdentifier("fixture-rebuild-shell")
        }
    }

    private static func makeSession() -> AuthenticatedAppSession {
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [InboxMutationFixtureProtocol.self]
        return AuthenticatedAppSession(
            baseURL: URL(string: "https://fixture.invalid")!,
            userID: "inbox-mutation-fixture", tokenProvider: { "fixture" },
            transport: URLSession(configuration: configuration),
            baseDirectory: FileManager.default.temporaryDirectory.appending(path: UUID().uuidString)
        )
    }
}

private final class InboxMutationFixtureProtocol: URLProtocol, @unchecked Sendable {
    private static let lock = NSLock()
    private static var archived = Set<String>()
    private static let bookmarks: [Bookmark] = (1...2).map { index in
        Bookmark(
            id: "fixture-show-\(index)", itemId: "fixture-item-\(index)",
            title: "Inbox regression show \(index)", thumbnailUrl: nil,
            canonicalUrl: URL(string: "https://fixture.invalid/show/\(index)")!,
            contentType: .podcast, provider: .spotify, creator: "Fixture podcast",
            creatorImageUrl: nil, creatorId: nil, publisher: nil, summary: nil,
            duration: 1800, publishedAt: nil, wordCount: nil, readingTimeMinutes: nil,
            state: "INBOX", ingestedAt: "2026-10-08T10:00:00Z", bookmarkedAt: nil,
            lastOpenedAt: nil, progress: nil, isFinished: false, finishedAt: nil, tags: [])
    }
    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
    override func startLoading() {
        let data: Data = Self.lock.withLock {
            let path = request.url!.path
            if request.httpMethod == "POST", path.hasSuffix("/archive") {
                Self.archived.insert(request.url!.pathComponents.dropLast().last!)
                return Data("{}".utf8)
            }
            if path == "/api/v1/inbox" {
                struct Page: Encodable { let items: [Bookmark]; let nextCursor: String? = nil }
                return try! JSONEncoder().encode(Page(items: Self.bookmarks.filter { !Self.archived.contains($0.id) }))
            }
            if path == "/api/v1/home" {
                return try! JSONEncoder().encode(HomeResponse(
                    recentBookmarks: [], jumpBackIn: [],
                    byContentType: HomeContentTypeSections(videos: [], podcasts: [], articles: []),
                    customCollections: [], sectionOrder: [], requestId: nil, traceId: nil))
            }
            if path == "/api/v1/tags" { return Data(#"{"tags":[]}"#.utf8) }
            return Data(#"{"items":[],"nextCursor":null}"#.utf8)
        }
        client?.urlProtocol(self, didReceive: HTTPURLResponse(url: request.url!, statusCode: 200,
                                                            httpVersion: nil, headerFields: nil)!, cacheStoragePolicy: .notAllowed)
        client?.urlProtocol(self, didLoad: data)
        client?.urlProtocolDidFinishLoading(self)
    }
    override func stopLoading() {}
}
#endif
