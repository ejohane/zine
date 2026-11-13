import Foundation

// Independent wire-shaped DTOs. Verified against apps/api's current response
// schemas by scripts/validate-api-preview.ts; no Worker code ships in this app.
struct APIPage<Element: Codable & Equatable>: Codable, Equatable {
    var items: [Element]
    var nextCursor: String?
}
struct APIItem: Codable, Equatable, Identifiable {
    let id: String
    var status: String
    var archived: Bool
    var content: APIContent
    var context: [APIContext]
    var tags: [String]
    var collectionIds: [String]
    var progress: APIProgress
    var enrichment: APIEnrichment
}
struct APIContent: Codable, Equatable {
    let id: String
    let url: String
    let platform: String
    let type: String
    var title: String?
    var description: String?
    var summary: String?
    var topics: [String]?
    var durationSeconds: Double?
}
struct APIContext: Codable, Equatable, Identifiable {
    var id: String
    var text: String
    var origin: String
    var contributor: String?
}
struct APIProgress: Codable, Equatable {
    var position: Double?
    var unit: String?
    var completedAt: String?
}
struct APIEnrichment: Codable, Equatable {
    var fields: [String: APIField]
    var components: [APIComponent]
}
struct APIField: Codable, Equatable {
    var contributionId: String
    var category: String
    var provenance: APIProvenance
}
struct APIProvenance: Codable, Equatable {
    var method: String
    var description: String?
    var coverage: String?
    var sourceCoverage: String?
}
struct APIComponent: Codable, Equatable, Identifiable {
    var component: String
    var status: String
    var reasonCode: String?
    var id: String { component }
}
struct APIAnnotation: Codable, Equatable, Identifiable {
    var id: String
    var kind: String
    var text: String?
    var anchor: APIAnchor?
}
struct APIAnchor: Codable, Equatable {
    var type: String
    var exact: String?
    var startSeconds: Double?
    var endSeconds: Double?
}
struct APICollection: Codable, Equatable, Identifiable {
    var id: String
    var name: String
    var description: String?
    var notes: [APICollectionNote]?
}
struct APICollectionNote: Codable, Equatable, Identifiable {
    var id: String
    var text: String
    var itemIds: [String]
}
struct APISource: Codable, Equatable, Identifiable {
    var id: String
    var name: String?
    var url: String
}
struct APISubscription: Codable, Equatable, Identifiable {
    var id: String
    var sourceId: String
    var routeId: String
    var autoSave: Bool
    var status: String
    var initialized: Bool
    var lastErrorCode: String?
    var nextPollAt: String
}
struct APIDetail: Codable, Equatable {
    struct Annotations: Codable, Equatable { var annotations: [APIAnnotation] }
    struct Relationships: Codable, Equatable { var relationships: [APIRelationship] }
    var annotations: Annotations
    var relationships: Relationships
    var material: APIMaterial?
}
struct APIRelationship: Codable, Equatable, Identifiable {
    struct Target: Codable, Equatable { var itemId: String?; var url: String }
    var id: String
    var kind: String
    var target: Target
}
struct APIMaterial: Codable, Equatable {
    struct Value: Codable, Equatable {
        var text: String?
        var coverage: String?
        var segments: [Segment]?
    }
    struct Segment: Codable, Equatable {
        var startSeconds: Double?
        var endSeconds: Double?
        var text: String
    }
    var field: String
    var value: Value
    var provenance: APIProvenance
}
struct APIMatch: Codable, Equatable {
    var field: String
    var excerpt: String
    var matchedBy: [String]?
    var startSeconds: Double?
}
struct APISearchItem: Codable, Equatable {
    var id: String
    var matches: [APIMatch]
}
struct APIOrderedItem: Codable, Equatable {
    var position: Double
    var item: APIItem
}
struct APIFixtures: Decodable {
    struct Collections: Decodable { var collections: [APICollection] }
    struct Sources: Decodable { var sources: [APISource] }
    struct Subscriptions: Decodable { var subscriptions: [APISubscription] }
    struct Search: Decodable { var query: String; var response: APIPage<APISearchItem> }
    var itemList: APIPage<APIItem>
    var collectionList: Collections
    var sourceList: Sources
    var subscriptionList: Subscriptions
    var details: [String: APIDetail]
    var searches: [Search]
    var orderedCollections: [String: APIPage<APIOrderedItem>]

    static let bundled: APIFixtures = {
        do {
            let url = Bundle.main.url(forResource: "APIPreview", withExtension: "json")!
            return try JSONDecoder().decode(APIFixtures.self, from: Data(contentsOf: url))
        } catch { fatalError("Invalid bundled API preview: \(error)") }
    }()
}

enum LibraryScope: String, CaseIterable, Identifiable {
    case saved = "All saves", received = "Inbox", archived = "Archive", dismissed = "Dismissed"
    var id: Self { self }
    func includes(_ item: SavedContent) -> Bool {
        switch self {
        case .saved: (item.api?.status ?? "saved") == "saved"
        case .received: item.api?.status == "received"
        case .archived: (item.api?.status ?? "saved") == "saved" && item.api?.archived == true
        case .dismissed: item.api?.status == "dismissed"
        }
    }
}

enum SearchMode: String, CaseIterable, Identifiable {
    case keyword = "Words", semantic = "Meaning", hybrid = "Both"
    var id: Self { self }
}
struct PreviewSearchHit: Identifiable {
    var item: SavedContent
    var evidence: [APIMatch]
    var id: UUID { item.id }
}

extension SavedContent {
    var apiID: String { api?.id ?? id.uuidString }
    var progressFraction: Double? {
        guard let progress = api?.progress, let position = progress.position else { return nil }
        if progress.unit == "fraction" { return min(1, max(0, position)) }
        guard progress.unit == "seconds", let total = api?.content.durationSeconds, total > 0 else { return nil }
        return min(1, max(0, position / total))
    }
    var resumeLabel: String {
        if let progress = api?.progress, progress.unit == "seconds", let position = progress.position {
            return "Resume at \(Self.timestamp(position))"
        }
        return "\(Int((progressFraction ?? 0) * 100))% read"
    }
    static func timestamp(_ seconds: Double) -> String {
        let value = max(0, Int(seconds))
        return String(format: "%d:%02d", value / 60, value % 60)
    }
}
