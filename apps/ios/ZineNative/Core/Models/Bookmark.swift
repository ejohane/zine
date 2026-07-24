import Foundation

enum ContentType: String, Codable, CaseIterable, Identifiable {
    case video = "VIDEO"
    case podcast = "PODCAST"
    case article = "ARTICLE"
    case post = "POST"

    var id: String { rawValue }

    var title: String { rawValue.capitalized }

    var systemImage: String {
        switch self {
        case .video: "play.rectangle"
        case .podcast: "waveform"
        case .article: "doc.text"
        case .post: "text.bubble"
        }
    }
}

enum Provider: String, Codable, CaseIterable, Identifiable {
    case youtube = "YOUTUBE"
    case spotify = "SPOTIFY"
    case gmail = "GMAIL"
    case rss = "RSS"
    case substack = "SUBSTACK"
    case web = "WEB"
    case x = "X"

    var id: String { rawValue }

    var title: String {
        switch self {
        case .youtube: "YouTube"
        case .spotify: "Spotify"
        case .gmail: "Gmail"
        case .rss: "RSS"
        case .substack: "Substack"
        case .web: "Web"
        case .x: "X"
        }
    }
}

struct BookmarkTag: Codable, Hashable, Identifiable {
    let id: String
    let name: String
}

struct BookmarkProgress: Codable, Hashable {
    let position: Double
    let duration: Double
    let percent: Double
}

struct Bookmark: Codable, Hashable, Identifiable {
    let id: String
    let itemId: String
    let title: String
    let thumbnailUrl: URL?
    let canonicalUrl: URL
    let contentType: ContentType
    let provider: Provider
    let creator: String
    let creatorImageUrl: URL?
    let creatorId: String?
    let publisher: String?
    let summary: String?
    let duration: Int?
    let publishedAt: String?
    let wordCount: Int?
    let readingTimeMinutes: Int?
    let state: String
    let ingestedAt: String
    let bookmarkedAt: String?
    let lastOpenedAt: String?
    var progress: BookmarkProgress?
    var isFinished: Bool
    var finishedAt: String?
    let tags: [BookmarkTag]

    var consumptionLabel: String? {
        if let readingTimeMinutes {
            return "\(readingTimeMinutes) min read"
        }
        guard let duration else { return nil }
        let minutes = max(1, duration / 60)
        if minutes < 60 { return "\(minutes) min" }
        return "\(minutes / 60) hr \(minutes % 60) min"
    }
}
