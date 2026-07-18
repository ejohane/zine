import Foundation

struct BookmarkShareTag: Decodable, Equatable, Identifiable, Sendable {
    let id: String
    let name: String
}

struct BookmarkSharePreview: Decodable, Equatable, Sendable {
    let provider: String
    let contentType: String
    let title: String
    let creator: String
    let creatorImageUrl: String?
    let thumbnailUrl: String?
    let canonicalUrl: String
    let duration: Int?
    let description: String?
    let siteName: String?
    let readingTimeMinutes: Int?

    var thumbnailURL: URL? {
        thumbnailUrl.flatMap(URL.init(string:))
    }

    var sourceLabel: String {
        if let siteName, !siteName.isEmpty {
            return siteName
        }

        if let host = URL(string: canonicalUrl)?.host(percentEncoded: false) {
            return host.replacing(/^www\./, with: "")
        }

        return provider.replacingOccurrences(of: "_", with: " ").capitalized
    }

    var contentTypeLabel: String {
        contentType.replacingOccurrences(of: "_", with: " ").capitalized
    }

    var lengthLabel: String? {
        if let duration, duration > 0 {
            let hours = duration / 3600
            let minutes = (duration % 3600) / 60
            if hours > 0 {
                return minutes > 0 ? "\(hours) hr \(minutes) min" : "\(hours) hr"
            }
            return "\(max(1, minutes)) min"
        }

        if let readingTimeMinutes, readingTimeMinutes > 0 {
            return "\(readingTimeMinutes) min read"
        }

        return nil
    }
}

enum BookmarkShareSaveStatus: String, Decodable, Equatable, Sendable {
    case created
    case alreadyBookmarked = "already_bookmarked"
    case rebookmarked

    var confirmationTitle: String {
        switch self {
        case .created:
            "Saved to Zine"
        case .alreadyBookmarked:
            "Already in your library"
        case .rebookmarked:
            "Added back to your library"
        }
    }
}

struct BookmarkShareSaveResult: Equatable, Sendable {
    let status: BookmarkShareSaveStatus
    let itemID: String
    let userItemID: String
    let item: BookmarkSharePreview
}

enum BookmarkShareError: LocalizedError, Equatable, Sendable {
    case invalidConfiguration
    case invalidResponse
    case noSharedURL
    case signedOut
    case unsupportedURL
    case server(status: Int, message: String)

    var errorDescription: String? {
        switch self {
        case .invalidConfiguration:
            "Zine’s share extension isn’t configured correctly."
        case .invalidResponse:
            "Zine returned an unreadable response. Please try again."
        case .noSharedURL:
            "This item doesn’t contain a link Zine can save."
        case .signedOut:
            "Open Zine and sign in, then try sharing this link again."
        case .unsupportedURL:
            "Zine couldn’t create a preview for this link."
        case let .server(_, message):
            message
        }
    }
}
