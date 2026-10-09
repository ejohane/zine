import Foundation

/// The signed build chooses the public host alongside its associated-domain entitlement.
enum PublicationLinks {
    static let host = validatedHost(Bundle.main.object(forInfoDictionaryKey: "ZINEPublicationHost") as? String)
    static func validatedHost(_ value: String?) -> String {
        guard let value, let url = URL(string: "https://" + value),
              url.host == value, url.user == nil, url.password == nil, url.port == nil,
              url.path.isEmpty, url.query == nil, url.fragment == nil,
              value == "myzine.app" || value.hasSuffix(".myzine.app") else { return "myzine.app" }
        return value
    }
    static func url(_ path: String) -> URL { URL(string: "https://\(host)/\(path)")! }
}

struct PersonalPublication: Codable, Hashable, Identifiable {
    struct Editor: Codable, Hashable { var displayName: String }
    var id: String
    var handle: String
    var displayName: String
    var description: String?
    var coverUrl: String?
    var editor: Editor
    var revision: Int?
    var coverAssetId: String?
    var shareURL: URL { PublicationLinks.url("p/\(id)") }
}

struct PersonalIssue: Codable, Hashable, Identifiable {
    var id: String
    var publication: PersonalPublication
    var kind: String
    var title: String
    var coverUrl: String?
    var introduction: String?
    var revision: Int
    var publishedAt: String?
    var sections: [PersonalIssueSection]
    var status: String?
    var coverAssetId: String?
    var weeklyWindowId: String?
    var isPublished: Bool { status == "PUBLISHED" || publishedAt != nil }
    var canAddSelections: Bool { !isPublished || kind == "INDEPENDENT" }
    var shareURL: URL { PublicationLinks.url("i/\(id)") }
    var selections: [PersonalIssueSelection] { sections.flatMap(\.selections) }
}
struct PersonalIssueSection: Codable, Hashable, Identifiable {
    var id: String
    var heading: String?
    var selections: [PersonalIssueSelection]
}
struct PersonalIssueSelection: Codable, Hashable, Identifiable {
    var id: String
    var contentType: String
    var title: String
    var creatorName: String
    var sourceName: String
    var originalUrl: String
    var artworkUrl: String?
    var commentary: String?
    var firstPublishedRevision: Int?
    var originalAvailability: String
    var itemId: String?
    var bookmarkId: String?
}
struct PersonalSubscription: Codable {
    var publicationId: String
    var subscribed: Bool
    var muted: Bool
    var generation: Int
    var subscribedAt: String?
}
struct PublicationEnvelope: Decodable { var publication: PersonalPublication }
struct IssueEnvelope: Decodable { var issue: PersonalIssue }
struct IssuePage: Decodable { var issues: [PersonalIssue]; var nextCursor: String? }
struct SubscriptionEnvelope: Decodable { var subscription: PersonalSubscription }
struct PublicationSubscribers: Decodable {
    struct Subscriber: Decodable, Identifiable {
        var userId: String
        var subscribedAt: String
        var id: String { userId }
    }
    var subscribers: [Subscriber]
    var nextCursor: String?
}
struct PublicationSubscriptions: Decodable { var subscriptions: [PersonalSubscription]; var nextCursor: String? }

/// JSON operations retain explicit null, unlike encodeIfPresent, which cannot clear fields.
enum PublicationValue: Codable, Equatable {
    case string(String), integer(Int), bool(Bool), null, array([PublicationValue]), object([String: PublicationValue])
    init(from decoder: Decoder) throws {
        let c = try decoder.singleValueContainer()
        if c.decodeNil() { self = .null }
        else if let v = try? c.decode(String.self) { self = .string(v) }
        else if let v = try? c.decode(Int.self) { self = .integer(v) }
        else if let v = try? c.decode(Bool.self) { self = .bool(v) }
        else if let v = try? c.decode([PublicationValue].self) { self = .array(v) }
        else { self = .object(try c.decode([String: PublicationValue].self)) }
    }
    func encode(to encoder: Encoder) throws {
        var c = encoder.singleValueContainer()
        switch self {
        case .string(let v): try c.encode(v)
        case .integer(let v): try c.encode(v)
        case .bool(let v): try c.encode(v)
        case .null: try c.encodeNil()
        case .array(let v): try c.encode(v)
        case .object(let v): try c.encode(v)
        }
    }
    var string: String? { if case .string(let v) = self { return v }; return nil }
    var integer: Int? { if case .integer(let v) = self { return v }; return nil }
    static func text(_ v: String?) -> Self { v.map(Self.string) ?? .null }
}
typealias PublicationOperation = [String: PublicationValue]

struct PublicationRequestError: LocalizedError {
    var status: Int
    var message: String
    var code: String?
    var details: [String: PublicationValue]?
    var errorDescription: String? {
        if code == "INELIGIBLE_SELECTIONS" {
            switch details?["reason"]?.string {
            case "PRIVATE_SOURCE": return "This content is private. Choose a saved public edition to include it."
            case "PRIVATE_DESTINATION": return "This link contains private access information and cannot be shared publicly."
            case "NOT_SAVED": return "Save this content to your Library before adding it to an issue."
            case "ORIGINAL_UNAVAILABLE": return "The original is unavailable. Choose another saved selection."
            default: return "This selection could not be verified for public sharing. Review it or choose another saved item."
            }
        }
        if code == "ISSUE_NOT_READY" { return "Add a title and at least one public selection, and wait for the cover to finish uploading." }
        if code == "DUPLICATE_SELECTION" { return "This item is already in the issue. Each item can appear once." }
        if code == "ISSUE_SELECTION_LOCKED" { return "Published weekly issues cannot have new selections. Make another issue instead." }
        if code == "NOT_FOUND" { return "This publication or issue is unavailable." }
        if code == "INVALID_INPUT" { return "Some changes are invalid or too long. Review the issue title, writing, and order before retrying." }
        return message
    }
    var isConflict: Bool { code == "REVISION_CONFLICT" }
}
struct PublicationErrorBody: Decodable {
    var error: String?
    var code: String?
    var details: [String: PublicationValue]?
}

enum PublicationDestination: Hashable, Identifiable, Codable {
    case mine, publication(String), issue(String), editor(String), activity, wrapped, subscriptions
    var id: String {
        switch self {
        case .mine: "mine"
        case .publication(let v): "publication-\(v)"
        case .issue(let v): "issue-\(v)"
        case .editor(let v): "editor-\(v)"
        case .activity: "activity"
        case .wrapped: "wrapped"
        case .subscriptions: "subscriptions"
        }
    }
    static func parse(_ url: URL, publicHost: String = PublicationLinks.host) -> Self? {
        let hosts = publicHost == "myzine.app" ? [publicHost, "www.myzine.app"] : [publicHost]
        guard url.scheme == "https", hosts.contains(url.host?.lowercased() ?? ""),
              url.user == nil, url.password == nil, url.port == nil else { return nil }
        let parts = url.path.split(separator: "/")
        guard parts.count == 2, parts[1].count == 26,
              parts[1].allSatisfy({ "0123456789ABCDEFGHJKMNPQRSTVWXYZ".contains($0) }) else { return nil }
        switch parts[0] { case "p": return .publication(String(parts[1])); case "i": return .issue(String(parts[1])); default: return nil }
    }
}

/// Valid client ULID: timestamp first, random UUID entropy, no identity encoded.
func publicationID(now: Date = Date()) -> String {
    let alphabet = Array("0123456789ABCDEFGHJKMNPQRSTVWXYZ")
    var time = UInt64(max(0, now.timeIntervalSince1970 * 1000))
    var prefix = Array(repeating: Character("0"), count: 10)
    for i in (0..<10).reversed() { prefix[i] = alphabet[Int(time & 31)]; time >>= 5 }
    var bytes = withUnsafeBytes(of: UUID().uuid) { Array($0) }
    bytes = Array(bytes.prefix(10))
    var bits = 0, value = 0
    var suffix = ""
    for byte in bytes {
        value = (value << 8) | Int(byte); bits += 8
        while bits >= 5 { bits -= 5; suffix.append(alphabet[(value >> bits) & 31]) }
        value &= (1 << bits) - 1
    }
    return String(prefix) + suffix
}

struct PublicationPendingIntent: Codable, Equatable {
    enum Action: Codable, Equatable { case save(issueID: String, selectionID: String), subscribe(publicationID: String) }
    var action: Action
    var createdAt: Date
    var key: String
    init(action: Action, now: Date = Date(), key: String = UUID().uuidString) {
        self.action = action; createdAt = now; self.key = key
    }
    func isValid(now: Date = Date()) -> Bool { now >= createdAt && now.timeIntervalSince(createdAt) < 15 * 60 }
}

/// Public assets may be API-relative in local and hosted environments.
func publicationAssetURL(_ value: String?, baseURL: URL) -> URL? {
    guard let value, let resolved = URL(string: value, relativeTo: baseURL)?.absoluteURL,
          let scheme = resolved.scheme?.lowercased(), ["http", "https"].contains(scheme),
          resolved.host != nil else { return nil }
    return resolved
}


/// Development signing can override a Release configuration's push entitlement.
/// Prefer the embedded signing profile; App Store apps use the signed build setting.
enum PublicationPushEnvironment {
    static func resolve(profile: Data?, configured: String?) -> String? {
        var entitlement = configured
        if let profile {
            let start = Data("<?xml".utf8), end = Data("</plist>".utf8)
            guard let lower = profile.range(of: start),
                  let upper = profile.range(of: end, in: lower.lowerBound..<profile.endIndex),
                  let plist = try? PropertyListSerialization.propertyList(from: profile.subdata(in: lower.lowerBound..<upper.upperBound), format: nil) as? [String: Any],
                  let entitlements = plist["Entitlements"] as? [String: Any],
                  let environment = entitlements["aps-environment"] as? String else { return nil }
            entitlement = environment
        }
        switch entitlement {
        case "development": return "sandbox"
        case "production": return "production"
        default: return nil
        }
    }
    static var current: String? {
        let profile = Bundle.main.url(forResource: "embedded", withExtension: "mobileprovision")
            .flatMap { try? Data(contentsOf: $0) }
        return resolve(profile: profile, configured: Bundle.main.object(forInfoDictionaryKey: "ZINEAPNSEnvironment") as? String)
    }
}
