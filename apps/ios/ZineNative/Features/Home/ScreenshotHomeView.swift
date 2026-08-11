#if DEBUG
import SwiftUI

struct ScreenshotHomeTabShell: View {
    @State private var selectedTab = 0

    var body: some View {
        TabView(selection: $selectedTab) {
            Tab("Home", systemImage: "house", value: 0) {
                ScreenshotHomeView(density: .compact)
            }

            Tab("Library", systemImage: "books.vertical", value: 1) {
                ScreenshotLibraryView()
            }

            Tab("Settings", systemImage: "gearshape", value: 2) {
                NavigationStack {
                    Text("Settings")
                        .navigationTitle("Settings")
                }
                .zineScreenChrome()
            }

            Tab("Search", systemImage: "magnifyingglass", value: 3) {
                NavigationStack {
                    Text("Search")
                        .navigationTitle("Search")
                }
                .zineScreenChrome()
            }
        }
        .zineTabShellChrome()
    }
}

struct ScreenshotHomeView: View {
    var density: HomeLayoutDensity = .standard

    @Namespace private var bookmarkTransition
    @State private var navigationPath = NavigationPath()

    var body: some View {
        NavigationStack(path: $navigationPath) {
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
            .navigationDestination(for: HomeNavigationRoute.self) { route in
                fixtureDestination(for: route)
                    .navigationTransition(
                        .zoom(sourceID: route.sourceID, in: bookmarkTransition)
                    )
            }
            .navigationDestination(for: HomeSectionRoute.self) { route in
                ScreenshotHomeSectionListView(route: route)
            }
            .navigationDestination(for: PeopleDailyRoute.self) { _ in
                Text("Today topic")
                    .navigationTitle("Conversations")
            }
        }
        .zineScreenChrome()
        .restoreTabBarWhenNavigationIsAtRoot(navigationPath.isEmpty)
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
        }
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

    var body: some View {
        List {
            CollapsingListTitle(
                title: route.title,
                progress: titleCollapseProgress
            )

            Section {
                ForEach(bookmarks) { bookmark in
                    BookmarkRow(bookmark: bookmark)
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
        }
        .navigationTitle("")
        .navigationBarTitleDisplayMode(.inline)
        .contentTypeFilterChrome()
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
        .todayTopic(todayTopic(
            id: "agents",
            title: "How people are reaching agents remotely",
            summary: "Private networks and small custom apps are making agents available away from the desk.",
            authors: ["Dan", "Ken", "Joel"],
            favoriteCount: 4,
            nearbyCount: 1
        )),
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
        .todayTopic(todayTopic(
            id: "open-weights",
            title: "Open weights and access",
            summary: "People compare who benefits when powerful models become easier to use.",
            authors: ["Alice", "Bob", "Carol"],
            favoriteCount: 3,
            nearbyCount: 2
        )),
        .recentlySaved([
            homeItem(id: "saved-1", title: "The future of personal software", creator: "Ink & Switch"),
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
        contentType: ContentType = .article,
        provider: Provider = .rss,
        duration: Int? = nil,
        minutes: Int? = 7,
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
            creatorImageUrl: nil,
            creatorId: nil,
            publisher: nil,
            summary: nil,
            duration: duration,
            publishedAt: "2026-07-18T12:00:00Z",
            readingTimeMinutes: minutes,
            bookmarkedAt: "2026-07-18T12:00:00Z",
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

    private static func todayTopic(
        id: String,
        title: String,
        summary: String,
        authors: [String],
        favoriteCount: Int,
        nearbyCount: Int
    ) -> HomeTodayTopic {
        let dailyAuthors = authors.map { name in
            DailyAuthor(
                key: name.lowercased(),
                username: name.lowercased(),
                name: name,
                profileUrl: nil,
                profileImageUrl: nil,
                verified: nil
            )
        }
        return HomeTodayTopic(
            section: DailyOverviewSection(
                id: id,
                title: title,
                summary: summary,
                source: "GENERATED",
                representativePostIds: [],
                favoriteThreadUnitIds: (0..<favoriteCount).map { "favorite-\(id)-\($0)" },
                supportingThreadUnitIds: (0..<nearbyCount).map { "nearby-\(id)-\($0)" },
                authorKeys: dailyAuthors.map(\.key),
                favoriteConversationCount: favoriteCount,
                supportingConversationCount: nearbyCount,
                latestActivityAt: "2026-07-28T12:00:00Z",
                coverageWarnings: []
            ),
            authors: dailyAuthors,
            date: "2026-07-28",
            timezone: "America/Chicago",
            freshnessStatus: .complete,
            isShowingCachedEdition: false
        )
    }
}
#endif
