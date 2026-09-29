#if DEBUG
import SwiftUI

struct ScreenshotLibraryView: View {
    @State private var titleCollapseProgress: CGFloat = 0

    var body: some View {
        NavigationStack {
            ScreenshotLibraryContentView(
                onTitleCollapseProgressChanged: { titleCollapseProgress = $0 }
            )
            .toolbar {
                ToolbarItem(placement: .principal) {
                    CollapsedListTitle(
                        title: "Library",
                        progress: titleCollapseProgress
                    )
                }
            }
        }
    }
}

struct ScreenshotLibraryContentView: View {
    private let client: APIClient = {
        let configuration = URLSessionConfiguration.ephemeral
        if ProcessInfo.processInfo.arguments.contains("-screenshot-reader-routing-fixtures") {
            configuration.protocolClasses = [ReaderRoutingFixtureURLProtocol.self]
        }
        return APIClient(
            baseURL: URL(string: "https://example.invalid")!,
            tokenProvider: { "screenshot-fixture" },
            session: URLSession(configuration: configuration),
            articleBodyCache: ArticleBodyCache(userID: "reader-links-context-fixture")
        )
    }()
    @State private var contentType: ContentType?
    @State private var titleCollapseProgress: CGFloat = 0
    @Namespace private var bookmarkTransition

    var onTitleCollapseProgressChanged: (CGFloat) -> Void = { _ in }

    private var bookmarks: [Bookmark] {
        let items = ProcessInfo.processInfo.arguments.contains("-screenshot-reader-routing-fixtures")
            ? ScreenshotFixtures.readerRoutingBookmarks : ScreenshotFixtures.bookmarks
        guard let contentType else { return items }
        return items.filter { $0.contentType == contentType }
    }

    var body: some View {
        ScrollViewReader { proxy in
            List {
            CollapsingListTitle(
                title: "Library",
                progress: titleCollapseProgress
            )

            Section {
                ForEach(0..<(bookmarks.count * 3), id: \.self) { index in
                    let bookmark = bookmarks[index % bookmarks.count]
                    let route = ScreenshotLibraryRoute(bookmark: bookmark, sourceID: index)
                    NavigationLink(value: route) {
                        BookmarkRow(bookmark: bookmark)
                    }
                    .id(index)
                    .listRowInsets(EdgeInsets(top: 6, leading: 18, bottom: 6, trailing: 14))
                    .listRowBackground(ZineTheme.canvas)
                    .listRowSeparator(.hidden)
                    .matchedTransitionSource(id: route.sourceID, in: bookmarkTransition)
                }
            } header: {
                ContentTypeFilterBar(selection: $contentType)
                    .textCase(nil)
                    .listRowInsets(EdgeInsets())
            }
            }
            .listStyle(.plain)
            .scrollContentBackground(.hidden)
            .background(ZineTheme.canvas)
            .onScrollGeometryChange(for: CGFloat.self) { geometry in
                let offset = geometry.contentOffset.y + geometry.contentInsets.top
                return CollapsingListTitle.collapseProgress(scrollOffset: offset)
            } action: { _, progress in
                titleCollapseProgress = progress
                onTitleCollapseProgressChanged(progress)
            }
            .task {
                if ProcessInfo.processInfo.arguments.contains("-screenshot-scrolled-fixture") {
                    try? await Task.sleep(for: .milliseconds(300))
                    proxy.scrollTo(5, anchor: .top)
                }
            }
        }
        .navigationTitle("")
        .navigationBarTitleDisplayMode(.inline)
        .contentTypeFilterChrome()
        .navigationDestination(for: ScreenshotLibraryRoute.self) { route in
            BookmarkDetailView(bookmark: route.bookmark, client: client) { _ in }
                .navigationTransition(
                    .zoom(sourceID: route.sourceID, in: bookmarkTransition)
                )
                .zinePushedDestinationChrome()
        }
        .zineScreenChrome()
    }
}

private struct ScreenshotLibraryRoute: Hashable {
    let bookmark: Bookmark
    let sourceID: Int
}

struct ScreenshotBookmarkDetailView: View {
    private let client = APIClient(
        baseURL: URL(string: "https://example.invalid")!,
        tokenProvider: { "screenshot-fixture" }
    )

    private var colorScheme: ColorScheme {
        ProcessInfo.processInfo.arguments.contains("-screenshot-light-mode") ? .light : .dark
    }

    var body: some View {
        NavigationStack {
            BookmarkDetailView(
                bookmark: ProcessInfo.processInfo.arguments.contains("-screenshot-bookmark-detail-fixture-youtube")
                    ? ScreenshotFixtures.bookmarks[2]
                    : ScreenshotFixtures.bookmarks[0],
                client: client,
                onUpdate: { _ in }
            )
        }
        .environment(\.colorScheme, colorScheme)
        .preferredColorScheme(colorScheme)
    }
}

private enum ScreenshotFixtures {
    static let bookmarks: [Bookmark] = [
        make(
            id: "1",
            title: "True sight (Prompt responsibly)",
            creator: "Notes On Work - by Caleb Porzio",
            provider: .spotify,
            contentType: .podcast,
            thumbnailUrl: URL(
                string: "https://i.scdn.co/image/ab6765630000ba8a116b917b6fbd4a810de9a368"
            ),
            duration: 2_846,
            creatorImageUrl: URL(string: "https://i.scdn.co/image/ab6765630000ba8a116b917b6fbd4a810de9a368"),
            canonicalUrl: URL(string: "https://open.spotify.com/episode/5GfE3SOjEXEQZNUpFG4T61"),
            summary: "A conversation about building software with taste, making room for careful thought, and using AI without losing your own point of view."
        ),
        make(
            id: "2",
            title: "In defense of not understanding your codebase",
            creator: "Sean Goedecke",
            provider: .rss,
            contentType: .article,
            readingTime: 7,
            summary: "Why productive software work rarely requires holding an entire system in your head."
        ),
        make(
            id: "3",
            title: "The Craziest Coding Contest Ever",
            creator: "The PrimeTime",
            provider: .youtube,
            contentType: .video,
            thumbnailUrl: URL(string: "https://i.ytimg.com/vi/-BhcQURVjJg/hqdefault.jpg"),
            duration: 1_962,
            creatorImageUrl: URL(string: "https://yt3.ggpht.com/Eu_xR4JfLlrruwj1lrmfDiOpe8GARBs8M0hgQ6NsGhQ0qC8S-po9HEHw1W21sPN2BHO6EHXrSwM=s800-c-k-c0x00ffffff-no-rj"),
            canonicalUrl: URL(string: "https://www.youtube.com/watch?v=-BhcQURVjJg"),
            summary: "A creative coding competition that turns technical problem solving into something worth watching."
        ),
        make(
            id: "4",
            title: "Never Twice the Same Color",
            creator: "Two’s Complement",
            provider: .spotify,
            contentType: .podcast,
            duration: 2_652,
            summary: "A discussion about product design, systems, and the details that shape software."
        ),
        make(
            id: "5",
            title: "The End of Determinism: What’s Left for Engineers When AI Writes the Code",
            creator: "Tom Enden",
            provider: .web,
            contentType: .article,
            readingTime: 11,
            summary: "A reflection on engineering judgment in a world of generated software."
        ),
    ]

    static let readerRoutingBookmarks: [Bookmark] = [
        make(
            id: "routing-substack", title: "Substack article routing", creator: "Reader Test",
            provider: .substack, contentType: .article, readingTime: 3,
            canonicalUrl: URL(string: "https://reader-test.substack.com/p/article")!,
            summary: "Synthetic Substack article for verifying the native reader destination."
        ),
        make(
            id: "routing-custom", title: "Custom-domain Substack article", creator: "Reader Test",
            provider: .substack, contentType: .article, readingTime: 3,
            canonicalUrl: URL(string: "https://newsletter.example.com/p/article")!,
            summary: "Identified by SUBSTACK metadata on a custom domain."
        ),
        make(
            id: "routing-web", title: "Regular web article routing", creator: "Reader Test",
            provider: .web, contentType: .article, readingTime: 3,
            summary: "Synthetic regular article for verifying the existing reader destination."
        ),
    ]

    private static func make(
        id: String,
        title: String,
        creator: String,
        provider: Provider,
        contentType: ContentType,
        thumbnailUrl: URL? = nil,
        duration: Int? = nil,
        creatorImageUrl: URL? = nil,
        readingTime: Int? = nil,
        canonicalUrl: URL? = nil,
        summary: String
    ) -> Bookmark {
        Bookmark(
            id: id,
            itemId: "item_\(id)",
            title: title,
            thumbnailUrl: thumbnailUrl,
            canonicalUrl: canonicalUrl ?? URL(string: "https://example.com/items/\(id)")!,
            contentType: contentType,
            provider: provider,
            creator: creator,
            creatorImageUrl: creatorImageUrl,
            creatorId: nil,
            publisher: creator,
            summary: summary,
            duration: duration,
            publishedAt: "2026-07-11T12:00:00Z",
            wordCount: nil,
            readingTimeMinutes: readingTime,
            state: "BOOKMARKED",
            ingestedAt: "2026-07-11T12:00:00Z",
            bookmarkedAt: "2026-07-11T12:00:00Z",
            lastOpenedAt: nil,
            progress: nil,
            isFinished: false,
            finishedAt: nil,
            tags: id == "1" ? [BookmarkTag(id: "tag_1", name: "software")] : []
        )
    }
}

private final class ReaderRoutingFixtureURLProtocol: URLProtocol, @unchecked Sendable {
    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }

    override func startLoading() {
        let path = request.url?.path ?? ""
        let isArticle = path.hasSuffix("/article-content")
        let paragraphs = (1...18).map { index in
            "<h2>Passage \(index)</h2><p>This is synthetic reading content for testing the native reader. A quiet interface gives the article room to breathe. The text stays readable while controls appear only when they are useful. Changing the typeface should keep this passage in view, even when the lines wrap differently.</p>"
        }.joined()
        let article = "<p>This synthetic article was opened through Library and bookmark detail.</p><p><a href='https://example.com/reader-link'>Open the example source</a></p><p>For more on this topic, <a href='https://example.org/research'>read the supporting research</a> and <a href='https://example.com/reader-link'>revisit the source</a>.</p><p><a href='https://example.com/photo.jpg'>Full-size image</a></p>" + paragraphs
        let body: [String: Any]
        if isArticle {
            body = [
                "content": article,
                "articleBody": [
                    "availability": "AVAILABLE", "pipelineStatus": "AVAILABLE", "schemaVersion": 1,
                    "extractorVersion": 1, "sourceKind": "PUBLIC_WEB", "contentHash": "reader-experience-fixture-v1",
                    "wordCount": 1000, "readingTimeMinutes": 5, "qualityScore": 1, "qualityWarnings": [],
                ],
                "requestId": "routing-fixture", "traceId": "routing-fixture",
            ]
        } else if path.hasSuffix("/bookmarks"), request.httpMethod == "POST" {
            body = ["bookmark": ["itemId": "fixture-saved-item", "userItemId": "fixture-saved-bookmark", "status": "saved"]]
        } else if path.hasSuffix("/tags") {
            body = ["success": true, "tags": [["id": "fixture-design", "name": "Design"]]]
        } else if request.httpMethod == "PATCH" {
            let requested = Self.requestBody(request)?["isFinished"] as? Bool ?? true
            body = ["bookmark": ["id": path.components(separatedBy: "/").last ?? "fixture", "itemId": "fixture-item", "isFinished": requested]]
        } else {
            body = [:]
        }
        let response = HTTPURLResponse(
            url: request.url!, statusCode: 200,
            httpVersion: nil, headerFields: ["Content-Type": "application/json"]
        )!
        client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
        client?.urlProtocol(self, didLoad: (try? JSONSerialization.data(withJSONObject: body)) ?? Data())
        client?.urlProtocolDidFinishLoading(self)
    }

    private static func requestBody(_ request: URLRequest) -> [String: Any]? {
        var data = request.httpBody ?? Data()
        if let stream = request.httpBodyStream {
            stream.open()
            defer { stream.close() }
            var buffer = [UInt8](repeating: 0, count: 1024)
            while stream.hasBytesAvailable {
                let count = stream.read(&buffer, maxLength: buffer.count)
                guard count > 0 else { break }
                data.append(buffer, count: count)
            }
        }
        return (try? JSONSerialization.jsonObject(with: data)) as? [String: Any]
    }

    override func stopLoading() {}
}
#endif
