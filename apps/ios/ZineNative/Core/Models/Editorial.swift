import Foundation

struct EditorialTodayResponse: Codable, Hashable {
    let issue: EditorialIssue?
    let expectedEditionDate: String
    let generation: EditorialGenerationState
    let freshness: EditorialFreshness
    var presentation: EditorialPresentation
    let requestId: String
    let traceId: String
}

struct EditorialGenerationState: Codable, Hashable {
    enum Status: String, Codable, Hashable {
        case published = "PUBLISHED"
        case preparing = "PREPARING"
        case stale = "STALE"
        case unavailable = "UNAVAILABLE"
    }

    let status: Status
    let latestEditionId: String?
    let message: String?
}

struct EditorialFreshness: Codable, Hashable {
    let isCurrent: Bool
    let sourceStatus: EditorialSourceStatus?
    let warnings: [String]
}

struct EditorialSourceStatus: Codable, Hashable {
    enum InputStatus: String, Codable, Hashable {
        case complete = "COMPLETE"
        case partial = "PARTIAL"
        case unavailable = "UNAVAILABLE"
    }

    enum VerificationStatus: String, Codable, Hashable {
        case complete = "COMPLETE"
        case partial = "PARTIAL"
        case notRun = "NOT_RUN"
    }

    let xArchive: InputStatus
    let zineInbox: InputStatus
    let zineBookmarks: InputStatus
    let externalVerification: VerificationStatus

    var hasLimitedCoverage: Bool {
        xArchive != .complete || zineInbox != .complete || zineBookmarks != .complete
            || externalVerification == .partial
    }
}

struct EditorialPresentation: Codable, Hashable {
    var sources: [String: EditorialSourcePresentation]
}

struct EditorialSourcePresentation: Codable, Hashable {
    let title: String?
    let subtitle: String?
    let imageUrl: String?
    let provider: String?
    let excerpt: String?
    var zineUserItemId: String?
    let zineItemId: String?
    var isSaved: Bool
    var isFinished: Bool

    var imageURL: URL? {
        imageUrl.flatMap(URL.init(string:))
    }

    var zineProvider: Provider? {
        provider.flatMap(Provider.init(rawValue:))
    }
}

struct EditorialIssue: Codable, Hashable, Identifiable {
    let schemaVersion: Int
    let id: String
    let userId: String
    let editionDate: String
    let timezone: String
    let revision: Int
    let status: String
    let generatedAt: String
    let window: EditorialWindow
    let provenance: EditorialProvenance
    let headline: String
    let dek: String
    let briefing: [EditorialCitedText]
    let stories: [EditorialStory]
    let recommendations: [EditorialRecommendation]
    let emergingSignals: [EditorialEmergingSignal]
    let bigPicture: EditorialCitedText
    let coverageNotes: [String]
    let sources: [EditorialSource]
}

struct EditorialWindow: Codable, Hashable {
    let newContentAfter: String
    let through: String
    let comparisonAfter: String
    let previousEditionId: String?
    let fallbackWindowUsed: Bool
}

struct EditorialProvenance: Codable, Hashable {
    let xRunIds: [String]
    let sourceStatus: EditorialSourceStatus
    let warnings: [String]
}

struct EditorialCitedText: Codable, Hashable, Identifiable {
    let text: String
    let claimIds: [String]

    var id: String {
        claimIds.first ?? text
    }
}

struct EditorialStory: Codable, Hashable, Identifiable {
    enum StoryType: String, Codable, Hashable {
        case news = "NEWS"
        case conversation = "CONVERSATION"
        case trend = "TREND"
        case analysis = "ANALYSIS"
    }

    enum Lifecycle: String, Codable, Hashable {
        case emerging = "EMERGING"
        case developing = "DEVELOPING"
        case established = "ESTABLISHED"
        case fading = "FADING"
    }

    enum Momentum: String, Codable, Hashable {
        case low = "LOW"
        case medium = "MEDIUM"
        case high = "HIGH"
    }

    let id: String
    let rank: Int
    let type: StoryType
    let lifecycle: Lifecycle
    let title: String
    let lede: EditorialCitedText
    let whatHappened: EditorialCitedText
    let whyItMatters: EditorialCitedText
    let conversation: EditorialCitedText
    let editorialAnalysis: EditorialCitedText
    let importance: Int
    let momentum: Momentum
    let topics: [String]
    let sourceIds: [String]
    let claimIds: [String]
    let whyToday: EditorialCitedText?
    let representativeXVoices: [EditorialRepresentativeXVoice]?
    let zineConnections: [EditorialZineConnection]?
}

struct EditorialRepresentativeXVoice: Codable, Hashable, Identifiable {
    let sourceId: String
    let name: String
    let handle: String?
    let contribution: String

    var id: String { sourceId }
}

struct EditorialZineConnection: Codable, Hashable, Identifiable {
    enum Relationship: String, Codable, Hashable {
        case exactSource = "EXACT_SOURCE"
        case savedContext = "SAVED_CONTEXT"
        case unfinishedContext = "UNFINISHED_CONTEXT"
        case creatorMatch = "CREATOR_MATCH"
        case topicMatch = "TOPIC_MATCH"
        case previouslyFinished = "PREVIOUSLY_FINISHED"
    }

    let sourceId: String
    let relationship: Relationship
    let reason: String

    var id: String { sourceId }
}

struct EditorialRecommendation: Codable, Hashable, Identifiable {
    enum Format: String, Codable, Hashable {
        case read = "READ"
        case watch = "WATCH"
        case listen = "LISTEN"
        case explore = "EXPLORE"

        var title: String { rawValue.capitalized }

        var systemImage: String {
            switch self {
            case .read: "doc.text"
            case .watch: "play.rectangle"
            case .listen: "headphones"
            case .explore: "safari"
            }
        }
    }

    enum Priority: String, Codable, Hashable {
        case must = "MUST"
        case worthwhile = "WORTHWHILE"
        case skim = "SKIM"
        case contextOnly = "CONTEXT_ONLY"

        var title: String {
            switch self {
            case .must: "Must"
            case .worthwhile: "Worthwhile"
            case .skim: "Skim"
            case .contextOnly: "Context"
            }
        }
    }

    let id: String
    let sourceId: String
    let relatedStoryIds: [String]
    let format: Format
    let priority: Priority
    let title: String
    let reason: String
    let estimatedMinutes: Int?
    let isOriginalSource: Bool
    let alreadyConsumed: Bool
}

struct EditorialEmergingSignal: Codable, Hashable, Identifiable {
    enum Momentum: String, Codable, Hashable {
        case early = "EARLY"
        case rising = "RISING"
        case accelerating = "ACCELERATING"
    }

    let id: String
    let title: String
    let summary: EditorialCitedText
    let whyWatch: EditorialCitedText
    let momentum: Momentum
    let sourceIds: [String]
    let claimIds: [String]
}

struct EditorialSource: Codable, Hashable, Identifiable {
    enum Origin: String, Codable, Hashable {
        case x = "X"
        case zine = "ZINE"
        case external = "EXTERNAL"
    }

    enum Role: String, Codable, Hashable {
        case primary = "PRIMARY"
        case reporting = "REPORTING"
        case analysis = "ANALYSIS"
        case commentary = "COMMENTARY"
        case reaction = "REACTION"
        case counterpoint = "COUNTERPOINT"
        case verification = "VERIFICATION"
    }

    let id: String
    let origin: Origin
    let role: Role
    let canonicalUrl: URL
    let title: String?
    let creator: String?
    let publisher: String?
    let publishedAt: String?
    let xTweetId: String?
    let zineItemId: String?
    let zineUserItemId: String?
    let contentType: String
    let userState: String?
}

enum EditorialFeedbackTargetType: String, Codable {
    case edition = "EDITION"
    case story = "STORY"
    case recommendation = "RECOMMENDATION"
    case source = "SOURCE"
}

enum EditorialFeedbackEventType: String, Codable {
    case impression = "IMPRESSION"
    case opened = "OPENED"
    case saved = "SAVED"
    case finished = "FINISHED"
    case dismissed = "DISMISSED"
    case moreLikeThis = "MORE_LIKE_THIS"
    case lessLikeThis = "LESS_LIKE_THIS"
    case alreadyKnew = "ALREADY_KNEW"
}

struct EditorialFeedbackRequest: Codable {
    let clientEventId: String
    let editionId: String
    let targetType: EditorialFeedbackTargetType
    let targetId: String
    let eventType: EditorialFeedbackEventType
    let occurredAt: String?
}

struct EditorialFeedbackResponse: Decodable {
    let accepted: Bool
    let duplicate: Bool
    let eventId: String
    let requestId: String
    let traceId: String
}

struct EditorialBookmarkSaveResult: Decodable {
    struct BookmarkResult: Decodable {
        let itemId: String
        let userItemId: String
        let status: String
    }

    let bookmark: BookmarkResult
}
