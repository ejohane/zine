import Foundation

struct DailyFeedResponse: Decodable, Hashable {
    let schemaVersion: Int
    let variant: DailyFeedVariant
    let date: String
    let timezone: String
    let frozenAt: String?
    let freshness: DailyFeedFreshness
    let coverage: DailyFeedCoverage
    let sources: [DailyFeedSource]
    let conversations: [DailyConversation]
    let topicClusters: [DailyTopicCluster]?
    let threadUnits: [DailyThreadUnit]?
    let overview: DailyOverviewMetadata?
    let overviewSections: [DailyOverviewSection]?
    let clustering: DailyTopicClustering?
    let posts: [DailyPost]
    let sections: DailyFeedSections?
    let inputs: DailyFeedInputs?
    let requestId: String
    let traceId: String
}

struct DailyOverviewMetadata: Decodable, Hashable {
    let version: String
    let status: String
    let model: String?
    let frozen: Bool
    let inputFingerprint: String
    let warnings: [String]
}

struct DailyOverviewSection: Decodable, Hashable, Identifiable {
    let id: String
    let title: String
    let summary: String
    let source: String
    let representativePostIds: [String]
    let favoriteThreadUnitIds: [String]
    let supportingThreadUnitIds: [String]
    let authorKeys: [String]
    let favoriteConversationCount: Int
    let supportingConversationCount: Int
    let latestActivityAt: String?
    let coverageWarnings: [String]
}

struct DailyFeedVariant: Decodable, Hashable {
    enum Mode: String, Decodable, Hashable {
        case review = "REVIEW"
    }

    let id: String
    let mode: Mode
}

enum DailyCoverageStatus: String, Decodable, Hashable {
    case complete = "COMPLETE"
    case partial = "PARTIAL"
    case unavailable = "UNAVAILABLE"
}

struct DailyFeedFreshness: Decodable, Hashable {
    let isCurrent: Bool
    let status: DailyCoverageStatus
    let warnings: [String]
}

struct DailyFeedCoverage: Decodable, Hashable {
    enum SelectionStatus: String, Decodable, Hashable {
        case complete = "COMPLETE"
        case stale = "STALE"
        case fallback = "FALLBACK"
        case missing = "MISSING"
    }

    let status: DailyCoverageStatus
    let archiveStatus: DailyCoverageStatus
    let selectionStatus: SelectionStatus
    let runId: String?
    let requestedCount: Int
    let collectedCount: Int
    let message: String
    let collectionMode: String?
    let windowHours: Int?
    let safetyLimit: Int?
    let terminationReason: String?
}

struct DailyFeedSource: Decodable, Hashable, Identifiable {
    enum SourceType: String, Decodable, Hashable {
        case favorites = "FAVORITES"
        case list = "LIST"
        case following = "FOLLOWING"
        case followingFallback = "FOLLOWING_FALLBACK"
    }

    let id: String
    let type: SourceType
    let name: String
    let selected: Bool
    let capturedAt: String?
    let authorCount: Int
    let status: DailyCoverageStatus?
    let snapshotId: String?
    let runId: String?
    let unresolvedCount: Int?
    let failureReason: String?
}

struct DailyConversation: Decodable, Hashable, Identifiable {
    enum EvidenceType: String, Decodable, Hashable {
        case directRelationship = "DIRECT_RELATIONSHIP"
        case sharedLink = "SHARED_LINK"
        case topicSimilarity = "TOPIC_SIMILARITY"
    }

    let id: String
    let evidenceType: EvidenceType
    let label: String
    let evidence: String
    let postIds: [String]
    let authors: [String]
    let relationshipTypes: [String]
    let favoritePostIds: [String]?
    let contextPostIds: [String]?
    let favoriteAuthors: [String]?
    let latestActivityAt: String?
    let coverageWarnings: [String]?
}

struct DailyTopicClustering: Decodable, Hashable {
    let version: String
    let method: String
    let semanticStatus: String
    let embeddingModel: String?
    let maxTopics: Int
    let minimumFavoriteAuthors: Int
    let candidateLimit: Int
    let semanticUnitLimit: Int
}

struct DailyTopicSignal: Decodable, Hashable, Identifiable {
    let type: String
    let value: String
    let threadUnitIds: [String]

    var id: String { "\(type):\(value)" }
}

struct DailyTopicCluster: Decodable, Hashable, Identifiable {
    let id: String
    let label: String
    let labelSource: String
    let labelTerms: [String]
    let evidence: String
    let evidenceSignals: [DailyTopicSignal]
    let threadUnitIds: [String]
    let favoriteThreadUnitIds: [String]
    let supportingThreadUnitIds: [String]
    let postIds: [String]
    let favoritePostIds: [String]
    let contextPostIds: [String]
    let favoriteAuthors: [String]
    let supportingAuthors: [String]
    let score: Int
    let latestActivityAt: String?
    let coverageWarnings: [String]
}

struct DailyThreadUnit: Decodable, Hashable, Identifiable {
    let id: String
    let conversationId: String?
    let rootPostId: String
    let postIds: [String]
    let favoritePostIds: [String]
    let followingPostIds: [String]
    let contextPostIds: [String]
    let authorKeys: [String]
    let favoriteAuthorKeys: [String]
    let authors: [String]
    let favoriteAuthors: [String]
    let relationshipTypes: [String]
    let structureStatus: String
    let latestActivityAt: String?
    let firstSourcePosition: Int?
    let coverageWarnings: [String]

    var isThread: Bool { postIds.count > 1 }
}

struct DailyFeedSections: Decodable, Hashable {
    let favoritePostIds: [String]
    let followingPostIds: [String]
    let favoriteThreadUnitIds: [String]?
    let followingThreadUnitIds: [String]?
}

struct DailyFeedInputs: Decodable, Hashable {
    let favorites: DailyFeedInputRun?
    let following: DailyFeedInputRun?
    let membership: DailyFeedMembershipInput?
}

struct DailyFeedInputRun: Decodable, Hashable {
    let runId: String
    let sourceId: String
    let sourceName: String
    let sourceUrl: String?
    let status: String
    let requestedCount: Int
    let collectedCount: Int
    let collectionPolicy: DailyCollectionPolicy?
    let terminationReason: String?
    let windowCoverage: DailyWindowCoverage?
    let contextCoverage: DailyContextCoverage?
    let frozenAt: String?
}

struct DailyCollectionPolicy: Decodable, Hashable {
    let mode: String
    let windowHours: Int?
    let cutoffAt: String?
    let boundaryEvidenceRequired: Int?
}

struct DailyWindowCoverage: Decodable, Hashable {
    let outsideWindow: Int
    let missingPublishedAt: Int
    let boundaryEvidenceRequired: Int
    let boundaryReached: Bool
}

struct DailyContextCoverage: Decodable, Hashable {
    let budget: Int
    let attempted: Int
    let completed: Int
    let truncated: Int
    let failed: Int
    let warnings: [String]
}

struct DailyFeedMembershipInput: Decodable, Hashable {
    let snapshotId: String?
    let runId: String?
    let sourceId: String
    let capturedAt: String?
    let status: DailyCoverageStatus
    let resolvedCount: Int
    let unresolvedCount: Int
    let failureReason: String?
}

struct DailyPost: Decodable, Hashable, Identifiable {
    let id: String
    let url: String
    let text: String
    let publishedAt: String?
    let observedAt: String?
    let kind: String
    let conversationId: String?
    let structure: DailyPostStructure?
    let author: DailyAuthor
    let media: [DailyPostMedia]
    let links: [DailyPostLink]
    let metrics: DailyPostMetrics
    let relationships: [DailyPostRelationship]
    let presentation: String
    let repostedBy: DailyAuthor?
    let sourceIds: [String]
    let sourcePosition: Int?

    var postURL: URL? { URL(string: url) }

    var effectiveDate: Date? {
        let value = publishedAt ?? observedAt
        return value.flatMap { try? Date($0, strategy: .iso8601) }
    }
}

struct DailyPostStructure: Decodable, Hashable {
    let status: String
    let source: String
    let observedAt: String?
}

struct DailyAuthor: Decodable, Hashable {
    let key: String
    let username: String
    let name: String
    let profileUrl: String?
    let profileImageUrl: String?
    let verified: Bool?

    var profileURL: URL? { profileUrl.flatMap(URL.init(string:)) }
    var profileImageURL: URL? { profileImageUrl.flatMap(URL.init(string:)) }
}

struct DailyPostMedia: Decodable, Hashable, Identifiable {
    let type: String
    let url: String
    let previewUrl: String?
    let altText: String?
    let width: Int?
    let height: Int?
    let durationMs: Int?

    var id: String { "\(type):\(url)" }
    var displayURL: URL? { URL(string: previewUrl ?? url) }
}

struct DailyPostLink: Decodable, Hashable, Identifiable {
    let url: String
    let normalizedUrl: String
    let displayUrl: String?
    let redirectUrl: String?
    let source: String
    let card: DailyPostLinkCard?

    var id: String { normalizedUrl }
    var destinationURL: URL? { URL(string: normalizedUrl) ?? URL(string: url) }
}

struct DailyPostLinkCard: Decodable, Hashable {
    let title: String?
    let description: String?
    let domain: String?
    let imageUrl: String?
}

struct DailyPostMetrics: Decodable, Hashable {
    let replies: Int?
    let reposts: Int?
    let likes: Int?
    let views: Int?
    let bookmarks: Int?
}

struct DailyPostRelationship: Decodable, Hashable, Identifiable {
    let type: String
    let tweetId: String
    let url: String?
    let evidenceSource: String?
    let target: DailyRelatedPost?

    var id: String { "\(type):\(tweetId)" }
}

struct DailyRelatedPost: Decodable, Hashable {
    let tweetId: String
    let text: String
    let url: String
    let author: DailyAuthor
}

enum DailyAuthorRange: String, Codable, Hashable, CaseIterable, Identifiable {
    case today = "TODAY"
    case week = "WEEK"

    var id: String { rawValue }

    var title: String {
        switch self {
        case .today: "Today"
        case .week: "Past week"
        }
    }
}

struct DailyAuthorActivityResponse: Decodable, Hashable {
    let schemaVersion: Int
    let variant: DailyFeedVariant
    let date: String
    let range: DailyAuthorRange
    let startDate: String
    let timezone: String
    let author: DailyAuthor?
    let coverage: DailyAuthorCoverage
    let posts: [DailyPost]
    let requestId: String
    let traceId: String
}

struct DailyAuthorCoverage: Decodable, Hashable {
    let status: DailyCoverageStatus
    let runIds: [String]
    let warnings: [String]
}
