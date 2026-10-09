import Foundation

struct PersonalPublicationActivity: Codable, Identifiable {
    var id: String
    var publicationId: String
    var type: String
    var publicationName: String
    var issueIds: [String]
    var selectionIds: [String]
    var createdAt: String
    var readAt: String?
    var available: Bool
    var destination: PublicationDestination { issueIds.count == 1 ? .issue(issueIds[0]) : .publication(publicationId) }
}
struct PublicationActivityPage: Decodable { var activities: [PersonalPublicationActivity]; var nextCursor: String? }
struct PersonalDiscoveryReference: Codable, Identifiable {
    var id: String
    var publicationId: String
    var issueId: String
    var selectionId: String
    var publicationName: String
    var issueTitle: String
    var editorName: String
    var commentary: String?
    var savedAt: String
    var available: Bool
}
struct DiscoveryReferencesEnvelope: Decodable { var discoveryReferences: [PersonalDiscoveryReference] }
struct PublicationSelectionSave: Decodable {
    var itemId: String
    var userItemId: String
    var status: String
    var discoveryReferences: [PersonalDiscoveryReference]
}
struct PublicationVisitEnvelope: Decodable {
    struct Visit: Decodable { var lastSeenRevision: Int? }
    var visit: Visit
}
struct PersonalWeeklyRecap: Codable, Identifiable {
    struct Evidence: Codable { var kind: String; var source: String; var observedAt: String; var legacy: Bool }
    struct Candidate: Codable, Identifiable {
        var id: String
        var itemId: String
        var savedBookmarkId: String?
        var originalUrl: String?
        var originalURL: URL? {
            guard let originalUrl, let url = URL(string: originalUrl),
                  ["https", "http"].contains(url.scheme?.lowercased() ?? ""), url.host != nil else { return nil }
            return url
        }
        var title: String
        var creatorName: String?
        var contentType: String
        var provider: String
        var artworkUrl: String?
        var evidence: [Evidence]
        var publicationEligibility: String
        var canSelect: Bool { savedBookmarkId != nil && publicationEligibility == "CHECK_ON_SELECTION" }
    }
    struct Coverage: Codable { var state: String; var reliableSince: String; var limitations: [String] }
    struct Highlight: Codable { var label: String; var count: Int }
    var id: String
    var weekStart: String
    var timezone: String
    var startAt: String
    var endAt: String
    var generatedAt: String
    var coverage: Coverage
    var candidates: [Candidate]
    var highlights: [Highlight]
    var selectedCandidateIds: [String]
    var issueId: String?
}
struct WeeklyRecapEnvelope: Decodable { var recap: PersonalWeeklyRecap }
struct WeeklyRecapPage: Decodable { var recaps: [PersonalWeeklyRecap]; var nextCursor: String? }
struct WeeklyRecapPreferencesEnvelope: Decodable {
    struct Preferences: Decodable { var timezone: String; var pendingTimezone: String?; var pendingEffectiveAt: String?; var trackingStartedAt: String }
    var preferences: Preferences
}
