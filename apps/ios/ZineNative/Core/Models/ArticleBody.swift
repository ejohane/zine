import Foundation

enum ArticleBodyAvailability: String, Codable {
    case pending = "PENDING"
    case available = "AVAILABLE"
    case degraded = "DEGRADED"
    case unavailable = "UNAVAILABLE"
}

enum ArticleBodyPipelineStatus: String, Codable {
    case notRequested = "NOT_REQUESTED"
    case legacy = "LEGACY"
    case pending = "PENDING"
    case processing = "PROCESSING"
    case available = "AVAILABLE"
    case degraded = "DEGRADED"
    case unavailable = "UNAVAILABLE"
}

struct ArticleBodyStatus: Codable, Equatable {
    let availability: ArticleBodyAvailability
    let pipelineStatus: ArticleBodyPipelineStatus
    let schemaVersion: Int?
    let extractorVersion: Int?
    let sourceKind: String?
    let contentHash: String?
    let wordCount: Int?
    let readingTimeMinutes: Int?
    let qualityScore: Double?
    let qualityWarnings: [String]
    let lastErrorCode: String?
    let updatedAt: String?

    var isReadable: Bool {
        availability == .available || availability == .degraded
    }

    var isPreparing: Bool {
        availability == .pending || pipelineStatus == .pending || pipelineStatus == .processing
    }
}

struct ArticleContentRequestResult: Codable, Equatable {
    let queued: Bool
    let reason: String?
}

struct ArticleContentResponse: Codable, Equatable {
    let content: String?
    let articleBody: ArticleBodyStatus
    let request: ArticleContentRequestResult?
    let requestId: String?
    let traceId: String?

    var readableContent: String? {
        guard articleBody.isReadable,
              let content,
              !content.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
        else { return nil }
        return content
    }
}

struct ArticleReaderMetadata: Equatable {
    let bookmarkID: String
    let title: String
    let creator: String
    let canonicalURL: URL
    let readingTimeMinutes: Int?
    let initialProgress: BookmarkProgress?
    let isFinished: Bool
}

struct ArticleReaderDocument: Equatable {
    let metadata: ArticleReaderMetadata
    let response: ArticleContentResponse

    var contentHash: String {
        response.articleBody.contentHash ?? "legacy:\(metadata.bookmarkID)"
    }

    var isDegraded: Bool {
        response.articleBody.availability == .degraded
    }
}
