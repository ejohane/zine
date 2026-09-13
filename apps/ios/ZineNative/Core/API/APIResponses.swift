import Foundation

struct PaginatedBookmarksResponse: Decodable {
    let items: [Bookmark]
    let nextCursor: String?
}

struct BookmarkResponse: Decodable {
    let item: Bookmark
}

struct BookmarkSubscriptionSettingsResponse: Decodable {
    let subscription: BookmarkSubscriptionSettings?
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

struct BookmarkTagsResponse: Decodable {
    let tags: [BookmarkTag]
}

// Receipts describe this request, independently of concurrent outbox replay.
enum NativeMutationDelivery: String {
    case serverCommitted = "server_committed"
    case localPending = "local_pending"
}

struct NativeMutationReceipt<Value> {
    let value: Value
    let delivery: NativeMutationDelivery
}
