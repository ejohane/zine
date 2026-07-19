#if DEBUG
import SwiftUI

struct ScreenshotHomeView: View {
    @Namespace private var bookmarkTransition

    var body: some View {
        NavigationStack {
            ScrollView {
                LazyVStack(spacing: 30) {
                    ForEach(ScreenshotHomeFixtures.sections) { section in
                        HomeDashboardSectionView(
                            section: section,
                            transitionNamespace: bookmarkTransition
                        )
                    }
                }
                .padding(.vertical, 10)
                .padding(.bottom, 24)
            }
            .navigationTitle("Home")
            .navigationDestination(for: HomeNavigationRoute.self) { route in
                fixtureDestination(for: route)
                    .navigationTransition(
                        .zoom(sourceID: route.sourceID, in: bookmarkTransition)
                    )
            }
            .navigationDestination(for: HomeSectionRoute.self) { route in
                List(ScreenshotHomeFixtures.openedBookmarks) { bookmark in
                    BookmarkRow(bookmark: bookmark)
                }
                .listStyle(.plain)
                .navigationTitle(route.title)
            }
        }
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
}
#endif
