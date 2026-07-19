import Foundation

struct PaginatedBookmarksResponse: Decodable {
    let items: [Bookmark]
    let nextCursor: String?
}

struct BookmarkResponse: Decodable {
    let item: Bookmark
}

struct CreatorResponse: Decodable {
    let creator: CreatorProfile
}

struct CreatorLatestContentResponse: Decodable {
    let items: [CreatorContentItem]
    let provider: Provider
    let reason: String?
}

struct FinishedStateResponse: Decodable {
    struct FinishedBookmark: Decodable {
        let id: String
        let itemId: String
        let isFinished: Bool
        let finishedAt: String?
    }

    let bookmark: FinishedBookmark
}
