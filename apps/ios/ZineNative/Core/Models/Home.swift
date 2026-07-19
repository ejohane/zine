import Foundation

struct HomeItem: Codable, Hashable, Identifiable {
    let id: String
    let itemId: String
    let title: String
    let thumbnailUrl: URL?
    let canonicalUrl: URL
    let contentType: ContentType
    let provider: Provider
    let creator: String
    let creatorImageUrl: URL?
    let creatorId: String?
    let publisher: String?
    let summary: String?
    let duration: Int?
    let publishedAt: String?
    let readingTimeMinutes: Int?
    let bookmarkedAt: String?
    let lastOpenedAt: String?
    let progress: BookmarkProgress?

    init(bookmark: Bookmark, openedAt: Date) {
        id = bookmark.id
        itemId = bookmark.itemId
        title = bookmark.title
        thumbnailUrl = bookmark.thumbnailUrl
        canonicalUrl = bookmark.canonicalUrl
        contentType = bookmark.contentType
        provider = bookmark.provider
        creator = bookmark.creator
        creatorImageUrl = bookmark.creatorImageUrl
        creatorId = bookmark.creatorId
        publisher = bookmark.publisher
        summary = bookmark.summary
        duration = bookmark.duration
        publishedAt = bookmark.publishedAt
        readingTimeMinutes = bookmark.readingTimeMinutes
        bookmarkedAt = bookmark.bookmarkedAt
        lastOpenedAt = openedAt.formatted(.iso8601)
        progress = bookmark.progress
    }

    init(
        id: String,
        itemId: String,
        title: String,
        thumbnailUrl: URL?,
        canonicalUrl: URL,
        contentType: ContentType,
        provider: Provider,
        creator: String,
        creatorImageUrl: URL?,
        creatorId: String?,
        publisher: String?,
        summary: String?,
        duration: Int?,
        publishedAt: String?,
        readingTimeMinutes: Int?,
        bookmarkedAt: String?,
        lastOpenedAt: String?,
        progress: BookmarkProgress?
    ) {
        self.id = id
        self.itemId = itemId
        self.title = title
        self.thumbnailUrl = thumbnailUrl
        self.canonicalUrl = canonicalUrl
        self.contentType = contentType
        self.provider = provider
        self.creator = creator
        self.creatorImageUrl = creatorImageUrl
        self.creatorId = creatorId
        self.publisher = publisher
        self.summary = summary
        self.duration = duration
        self.publishedAt = publishedAt
        self.readingTimeMinutes = readingTimeMinutes
        self.bookmarkedAt = bookmarkedAt
        self.lastOpenedAt = lastOpenedAt
        self.progress = progress
    }

    var consumptionLabel: String? {
        if let readingTimeMinutes {
            return "\(readingTimeMinutes) min read"
        }
        guard let duration else { return nil }
        let minutes = max(1, duration / 60)
        if minutes < 60 { return "\(minutes) min" }
        return "\(minutes / 60) hr \(minutes % 60) min"
    }

    var isQuickWin: Bool {
        if let readingTimeMinutes {
            return readingTimeMinutes > 0 && readingTimeMinutes <= 10
        }
        if let duration {
            return duration > 0 && duration <= 10 * 60
        }
        return false
    }
}

enum HomeCollectionLayout: String, Codable, Hashable {
    case stackRail = "STACK_RAIL"
    case coverRail = "COVER_RAIL"
    case rowGrid = "ROW_GRID"
    case compactList = "COMPACT_LIST"
}

struct HomeCollection: Codable, Hashable, Identifiable {
    let collectionId: String
    let title: String
    let layout: HomeCollectionLayout
    let position: Int
    let count: Int
    let items: [HomeItem]

    var id: String { collectionId }
}

enum HomeSectionKind: String, Codable, Hashable {
    case builtIn = "BUILT_IN"
    case collection = "COLLECTION"
}

enum HomeBuiltInSection: String, Codable, Hashable {
    case jumpBackIn = "JUMP_BACK_IN"
    case recentlyBookmarked = "RECENTLY_BOOKMARKED"
    case inbox = "INBOX"
    case podcasts = "PODCASTS"
    case articles = "ARTICLES"
    case videos = "VIDEOS"
}

struct HomeLayoutSection: Codable, Hashable {
    let kind: HomeSectionKind
    let builtInSection: HomeBuiltInSection?
    let collectionId: String?
}

struct HomeContentTypeSections: Codable, Hashable {
    let videos: [HomeItem]
    let podcasts: [HomeItem]
    let articles: [HomeItem]
}

struct HomeResponse: Codable, Hashable {
    let recentBookmarks: [HomeItem]
    let jumpBackIn: [HomeItem]
    let byContentType: HomeContentTypeSections
    let customCollections: [HomeCollection]
    let sectionOrder: [HomeLayoutSection]
    let requestId: String?
    let traceId: String?
}
