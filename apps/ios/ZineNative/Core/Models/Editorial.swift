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

enum EditorialExperimentStatus: String, Codable, Hashable {
    case draft = "DRAFT"
    case locked = "LOCKED"
    case building = "BUILDING"
    case readyForReview = "READY_FOR_REVIEW"
    case decided = "DECIDED"
    case promoted = "PROMOTED"
    case failed = "FAILED"
    case abandoned = "ABANDONED"

    var title: String {
        switch self {
        case .draft: "Draft"
        case .locked: "Locked"
        case .building: "Building"
        case .readyForReview: "Ready for review"
        case .decided: "Decision recorded"
        case .promoted: "Promoted"
        case .failed: "Failed"
        case .abandoned: "Abandoned"
        }
    }
}

enum EditorialExperimentVariantLabel: String, Codable, Hashable, CaseIterable, Identifiable {
    case a = "A"
    case b = "B"

    var id: String { rawValue }
}

enum EditorialExperimentPreference: String, Codable, Hashable, CaseIterable, Identifiable {
    case a = "A"
    case b = "B"
    case neither = "NEITHER"

    var id: String { rawValue }

    var title: String {
        switch self {
        case .a: "A"
        case .b: "B"
        case .neither: "Neither"
        }
    }
}

struct EditorialExperimentVariant: Codable, Hashable, Identifiable {
    let id: String
    let label: EditorialExperimentVariantLabel
    let name: String
    let description: String
    let editionId: String
    let headline: String
    let qualityScore: Double
    let contentHash: String
    let createdAt: String
}

struct EditorialExperimentReview: Codable, Hashable, Identifiable {
    let id: String
    let preference: EditorialExperimentPreference
    let notes: String
    let createdAt: String
}

struct EditorialExperiment: Codable, Hashable, Identifiable {
    let id: String
    let title: String
    let editionDate: String
    let status: EditorialExperimentStatus
    let hypothesis: String
    let changeSummary: String
    let desiredOutcomes: [String]
    let guardrails: [String]
    let variants: [EditorialExperimentVariant]
    let latestReview: EditorialExperimentReview?
    let winningVariantId: String?
    let promotedEditionId: String?
    let failureMessage: String?
    let abandonmentReason: String?
    let lockedAt: String?
    let decidedAt: String?
    let promotedAt: String?
    let createdAt: String
    let updatedAt: String
    let nextAction: String

    var isReviewable: Bool {
        status == .readyForReview || status == .decided
    }
}

struct EditorialExperimentListResponse: Decodable {
    let experiments: [EditorialExperiment]
    let requestId: String
    let traceId: String
}

struct EditorialExperimentPreviewResponse: Decodable {
    let experiment: EditorialExperiment
    let variant: EditorialExperimentVariant
    let preview: EditorialTodayResponse
    let requestId: String
    let traceId: String

    var todayResponse: EditorialTodayResponse { preview }
}

struct EditorialExperimentDecisionRequest: Encodable {
    let clientEventId: String
    let preference: EditorialExperimentPreference
    let notes: String
}

struct EditorialExperimentDecisionResponse: Decodable {
    let experiment: EditorialExperiment
    let review: EditorialExperimentReview?
    let duplicate: Bool
    let requestId: String
    let traceId: String
}
