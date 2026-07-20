#if DEBUG
import SwiftUI

struct ScreenshotLibraryView: View {
    private let client = APIClient(
        baseURL: URL(string: "https://example.invalid")!,
        tokenProvider: { "screenshot-fixture" }
    )

    var body: some View {
        NavigationStack {
            List(ScreenshotFixtures.bookmarks) { bookmark in
                NavigationLink(value: bookmark) {
                    BookmarkRow(bookmark: bookmark)
                }
                .listRowInsets(EdgeInsets(top: 6, leading: 18, bottom: 6, trailing: 14))
                .listRowSeparator(.hidden)
            }
            .listStyle(.plain)
            .navigationTitle("Library")
            .searchable(text: .constant(""), prompt: "Search your library")
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button {} label: {
                        Label("Filter", systemImage: "line.3.horizontal.decrease.circle")
                    }
                }
            }
            .navigationDestination(for: Bookmark.self) { bookmark in
                BookmarkDetailView(bookmark: bookmark, client: client) { _ in }
            }
        }
    }
}

struct ScreenshotBookmarkDetailView: View {
    private let client = APIClient(
        baseURL: URL(string: "https://example.invalid")!,
        tokenProvider: { "screenshot-fixture" }
    )

    var body: some View {
        NavigationStack {
            BookmarkDetailView(
                bookmark: ScreenshotFixtures.bookmarks[0],
                client: client,
                onUpdate: { _ in }
            )
        }
        .environment(\.colorScheme, .dark)
        .preferredColorScheme(.dark)
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
            summary: "A conversation about building, taste, and using AI without losing the thread."
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
            title: "Why AI Agents Don’t Actually Understand You",
            creator: "Latent Space",
            provider: .youtube,
            contentType: .video,
            duration: 2_846,
            summary: "A conversation about models, intent, and what today’s agents still miss."
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

    private static func make(
        id: String,
        title: String,
        creator: String,
        provider: Provider,
        contentType: ContentType,
        thumbnailUrl: URL? = nil,
        duration: Int? = nil,
        readingTime: Int? = nil,
        summary: String
    ) -> Bookmark {
        Bookmark(
            id: id,
            itemId: "item_\(id)",
            title: title,
            thumbnailUrl: thumbnailUrl,
            canonicalUrl: URL(string: "https://example.com/items/\(id)")!,
            contentType: contentType,
            provider: provider,
            creator: creator,
            creatorImageUrl: nil,
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
#endif
