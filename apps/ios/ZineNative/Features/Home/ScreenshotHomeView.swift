#if DEBUG
import SwiftUI

struct ScreenshotHomeTabShell: View {
    @State private var selectedTab = 0
    @State private var navigationPath: NavigationPath
    @Namespace private var navigationTransition

    init() {
        var initialPath = NavigationPath()
        if ProcessInfo.processInfo.arguments.contains("-screenshot-home-pushed-fixture") {
            initialPath.append(
                HomeNavigationRoute.articleReader(
                    ScreenshotHomeFixtures.featuredArticle,
                    sectionID: "featured"
                )
            )
        }
        _navigationPath = State(initialValue: initialPath)
    }

    var body: some View {
        NavigationStack(path: $navigationPath) {
            TabView(selection: $selectedTab) {
                Tab("Home", systemImage: "house", value: 0) {
                    ScreenshotHomeView(
                        density: .compact,
                        bookmarkTransition: navigationTransition
                    )
                }

                Tab("Library", systemImage: "books.vertical", value: 1) {
                    ScreenshotLibraryContentView()
                }

                Tab("Settings", systemImage: "gearshape", value: 2) {
                    Text("Settings")
                        .navigationTitle("Settings")
                        .zineScreenChrome()
                }

                Tab("Search", systemImage: "magnifyingglass", value: 3) {
                    Text("Search")
                        .navigationTitle("Search")
                        .zineScreenChrome()
                }
            }
            .zineTabShellChrome()
            .environment(\.zineTabNavigationActions, navigationActions)
            .navigationDestination(for: HomeNavigationRoute.self) { route in
                fixtureDestination(for: route)
                    .navigationTransition(
                        .zoom(sourceID: route.sourceID, in: navigationTransition)
                    )
            }
            .navigationDestination(for: HomeSectionRoute.self) { route in
                ScreenshotHomeSectionListView(route: route)
            }
        }
    }

    private var navigationActions: ZineTabNavigationActions {
        ZineTabNavigationActions(
            home: { navigationPath.append($0) },
            homeSection: { navigationPath.append($0) }
        )
    }

    @ViewBuilder
    private func fixtureDestination(for route: HomeNavigationRoute) -> some View {
        switch route.destination {
        case .item(let item):
            Text(item.title)
                .navigationTitle(item.title)
        case .bookmark(let bookmark):
            Text(bookmark.title)
                .navigationTitle(bookmark.title)
        case .articleReader(let item):
            fixtureArticleReader(for: item)
        }
    }

    private func fixtureArticleReader(for item: HomeItem) -> some View {
        let metadata = ArticleReaderMetadata(
            bookmarkID: item.id,
            title: item.title,
            creator: item.creator,
            creatorImageURL: item.creatorImageUrl,
            canonicalURL: item.canonicalUrl,
            readingTimeMinutes: item.readingTimeMinutes,
            initialProgress: item.progress,
            isFinished: false,
            tags: []
        )
        let response = ArticleContentResponse(
            content: """
            <p>The next generation of tools will be shaped less by universal workflows and more by software that learns the context, taste, and intent of one person.</p>
            <h2>Software that adapts to one person</h2>
            <p>Personal agents change how interfaces should expose context, decisions, and useful next steps. The best tools will make that relationship understandable without making the machinery feel heavy.</p>
            """,
            articleBody: ArticleBodyStatus(
                availability: .available,
                pipelineStatus: .available,
                schemaVersion: 1,
                extractorVersion: 1,
                sourceKind: "PUBLIC_WEB",
                contentHash: "home-featured-article-fixture",
                wordCount: 820,
                readingTimeMinutes: item.readingTimeMinutes,
                qualityScore: 0.98,
                qualityWarnings: [],
                lastErrorCode: nil,
                updatedAt: "2026-08-14T12:00:00Z"
            ),
            request: nil,
            requestId: "home-fixture-request",
            traceId: "home-fixture-trace"
        )

        return ArticleReaderView(
            metadata: metadata,
            client: APIClient(
                baseURL: URL(string: "https://api.myzine.app")!,
                tokenProvider: { "fixture-token" }
            ),
            initialPhase: .ready(ArticleReaderDocument(metadata: metadata, response: response)),
            loadsOnAppear: false
        )
    }
}

struct ScreenshotHomeView: View {
    var density: HomeLayoutDensity = .standard
    let bookmarkTransition: Namespace.ID

    var body: some View {
        ScrollView {
            LazyVStack(spacing: density.sectionSpacing) {
                ForEach(density.visibleSections(from: ScreenshotHomeFixtures.sections)) { section in
                    HomeDashboardSectionView(
                        section: section,
                        density: density,
                        transitionNamespace: bookmarkTransition
                    )
                }
            }
            .padding(.vertical, density == .compact ? 6 : 10)
            .padding(.bottom, density == .compact ? 16 : 24)
        }
        .navigationTitle("Home")
        .navigationBarTitleDisplayMode(density == .compact ? .inline : .automatic)
        .zineScreenChrome()
    }
}

private struct ScreenshotHomeSectionListView: View {
    let route: HomeSectionRoute

    @State private var contentType: ContentType?
    @State private var titleCollapseProgress: CGFloat = 0

    init(route: HomeSectionRoute) {
        self.route = route
        _contentType = State(initialValue: route.initialContentTypeFilter)
    }

    private var bookmarks: [Bookmark] {
        guard let contentType else { return ScreenshotHomeFixtures.openedBookmarks }
        return ScreenshotHomeFixtures.openedBookmarks.filter { $0.contentType == contentType }
    }

    private var showsLoadingState: Bool {
        ProcessInfo.processInfo.arguments.contains("-screenshot-filtered-list-loading-fixture")
    }

    var body: some View {
        List {
            CollapsingListTitle(
                title: route.title,
                progress: titleCollapseProgress,
                background: ZineTheme.surface
            )

            Section {
                if showsLoadingState {
                    FilteredListLoadingRow(
                        label: "Loading \(route.title.lowercased())…",
                        background: ZineTheme.surface
                    )
                } else {
                    ForEach(bookmarks) { bookmark in
                        BookmarkRow(bookmark: bookmark)
                            .listRowBackground(ZineTheme.surface)
                    }
                }
            } header: {
                ContentTypeFilterBar(
                    selection: $contentType,
                    background: ZineTheme.surface
                )
                    .textCase(nil)
                    .listRowInsets(EdgeInsets())
            }
        }
        .listStyle(.plain)
        .scrollContentBackground(.hidden)
        .background(ZineTheme.surface)
        .onScrollGeometryChange(for: CGFloat.self) { geometry in
            let offset = geometry.contentOffset.y + geometry.contentInsets.top
            return CollapsingListTitle.collapseProgress(scrollOffset: offset)
        } action: { _, progress in
            titleCollapseProgress = progress
        }
        .navigationTitle("")
        .navigationBarTitleDisplayMode(.inline)
        .contentTypeFilterChrome(background: ZineTheme.surface)
        .toolbarBackground(ZineTheme.surface, for: .tabBar)
        .toolbar(.visible, for: .navigationBar)
        .toolbar {
            ToolbarItem(placement: .principal) {
                CollapsedListTitle(
                    title: route.title,
                    progress: titleCollapseProgress
                )
            }
        }
    }
}

private enum ScreenshotHomeFixtures {
    static let openedBookmarks = [
        bookmark(id: "opened-1", title: "Building products that feel inevitable", creator: "Lenny’s Podcast"),
        bookmark(id: "opened-2", title: "The hidden systems behind great teams", creator: "Acquired"),
        bookmark(id: "opened-3", title: "A practical guide to product intuition", creator: "Every"),
    ]

    static let featuredArticle = homeItem(
        id: "featured-article",
        title: "Designing software for a world of personal agents",
        creator: "Maggie Appleton",
        creatorImageUrl: URL(string: "https://i.pravatar.cc/96?img=47"),
        summary: "The next generation of tools will be shaped less by universal workflows and more by software that learns the context, taste, and intent of one person.",
        minutes: 8,
        bookmarkedAt: Date.now.formatted(.iso8601)
    )

    static let sections: [HomeDashboardSection] = [
        .jumpBackIn([
            homeItem(
                id: "resume",
                title: "Building products that feel inevitable",
                creator: "Lenny’s Podcast",
                contentType: .podcast,
                provider: .spotify,
                duration: 3_420,
                minutes: nil,
                progress: BookmarkProgress(position: 1_368, duration: 3_420, percent: 40)
            ),
            homeItem(
                id: "resume-2",
                title: "The hidden systems behind great teams",
                creator: "Acquired",
                contentType: .podcast,
                provider: .spotify,
                duration: 4_200,
                minutes: nil,
                progress: BookmarkProgress(position: 840, duration: 4_200, percent: 20)
            ),
            homeItem(
                id: "resume-3",
                title: "A practical guide to product intuition",
                creator: "Every",
                progress: BookmarkProgress(position: 3, duration: 12, percent: 25)
            ),
            homeItem(
                id: "resume-4",
                title: "Why small tools can have enormous leverage",
                creator: "Works in Progress",
                progress: BookmarkProgress(position: 5, duration: 18, percent: 28)
            ),
            homeItem(
                id: "resume-5",
                title: "The craft of making software feel calm",
                creator: "Dense Discovery",
                progress: BookmarkProgress(position: 4, duration: 10, percent: 40)
            ),
            homeItem(
                id: "resume-6",
                title: "Building an enduring creative practice",
                creator: "The New Yorker",
                progress: BookmarkProgress(position: 6, duration: 15, percent: 40)
            ),
        ]),
        .featuredArticle(featuredArticle),
        .inbox([
            bookmark(id: "inbox-1", title: "What comes after the app?", creator: "Stratechery"),
            bookmark(id: "inbox-2", title: "Designing tools for thought", creator: "Maggie Appleton"),
            bookmark(id: "inbox-3", title: "The quiet craft of good software", creator: "Thorsten Ball"),
        ]),
        .quickWins([
            homeItem(id: "quick-1", title: "Make room for better ideas", creator: "Dense Discovery"),
            homeItem(id: "quick-2", title: "Small teams, sharp tools", creator: "Linear"),
            homeItem(id: "quick-3", title: "A field guide to curiosity", creator: "Works in Progress"),
            homeItem(id: "quick-4", title: "Notes on taste", creator: "Every"),
        ]),
        .recentlySaved([
            featuredArticle,
            homeItem(
                id: "resume",
                title: "Building products that feel inevitable",
                creator: "Lenny’s Podcast",
                contentType: .podcast,
                provider: .spotify,
                duration: 3_420,
                minutes: nil,
                progress: BookmarkProgress(position: 1_368, duration: 3_420, percent: 40)
            ),
            homeItem(id: "saved-2", title: "How great products compound", creator: "A Smart Bear"),
            homeItem(id: "saved-3", title: "Interfaces for invisible systems", creator: "Rachel Been"),
        ]),
        .podcasts([
            homeItem(
                id: "podcast-1",
                title: "The culture of building",
                creator: "Acquired",
                contentType: .podcast,
                provider: .spotify,
                duration: 4_200,
                minutes: nil
            ),
            homeItem(
                id: "podcast-2",
                title: "Tools, taste, and technology",
                creator: "Decoder",
                contentType: .podcast,
                provider: .spotify,
                duration: 2_800,
                minutes: nil
            ),
        ]),
    ]

    private static func homeItem(
        id: String,
        title: String,
        creator: String,
        creatorImageUrl: URL? = nil,
        summary: String? = nil,
        contentType: ContentType = .article,
        provider: Provider = .rss,
        duration: Int? = nil,
        minutes: Int? = 7,
        bookmarkedAt: String = "2026-07-18T12:00:00Z",
        progress: BookmarkProgress? = nil
    ) -> HomeItem {
        HomeItem(
            id: id,
            itemId: "item-\(id)",
            title: title,
            thumbnailUrl: nil,
            canonicalUrl: URL(string: "https://example.com/\(id)")!,
            contentType: contentType,
            provider: provider,
            creator: creator,
            creatorImageUrl: creatorImageUrl,
            creatorId: nil,
            publisher: nil,
            summary: summary,
            duration: duration,
            publishedAt: "2026-07-18T12:00:00Z",
            readingTimeMinutes: minutes,
            bookmarkedAt: bookmarkedAt,
            lastOpenedAt: progress == nil ? nil : "2026-07-18T18:00:00Z",
            progress: progress
        )
    }

    private static func bookmark(id: String, title: String, creator: String) -> Bookmark {
        Bookmark(
            id: id,
            itemId: "item-\(id)",
            title: title,
            thumbnailUrl: nil,
            canonicalUrl: URL(string: "https://example.com/\(id)")!,
            contentType: .article,
            provider: .rss,
            creator: creator,
            creatorImageUrl: nil,
            creatorId: nil,
            publisher: nil,
            summary: nil,
            duration: nil,
            publishedAt: "2026-07-18T12:00:00Z",
            wordCount: nil,
            readingTimeMinutes: 6,
            state: "INBOX",
            ingestedAt: "2026-07-18T12:00:00Z",
            bookmarkedAt: nil,
            lastOpenedAt: nil,
            progress: nil,
            isFinished: false,
            finishedAt: nil,
            tags: []
        )
    }

}
#endif
