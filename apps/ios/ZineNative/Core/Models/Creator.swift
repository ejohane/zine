import Foundation

struct CreatorProfile: Codable, Hashable, Identifiable {
    let id: String
    let name: String
    let imageUrl: URL?
    let provider: Provider
    let providerCreatorId: String
    let description: String?
    let handle: String?
    let externalUrl: URL?
    let createdAt: Int64
    let updatedAt: Int64

    var rssSourceURL: URL? {
        guard [.web, .rss, .substack].contains(provider) else { return nil }
        for candidate in [externalUrl, URL(string: providerCreatorId)] {
            if let candidate, ["http", "https"].contains(candidate.scheme?.lowercased() ?? "") {
                return candidate
            }
        }
        return nil
    }
}

struct CreatorContentItem: Codable, Hashable, Identifiable {
    let id: String
    let title: String
    let description: String?
    let thumbnailUrl: URL?
    let publishedAt: Int64
    let externalUrl: URL
    let duration: Int?
    let itemId: String?
    let isBookmarked: Bool

    var metadataLabel: String {
        var parts = [
            Date(timeIntervalSince1970: Double(publishedAt) / 1_000)
                .formatted(date: .abbreviated, time: .omitted),
        ]

        if let duration {
            let minutes = max(1, duration / 60)
            parts.append(minutes < 60 ? "\(minutes) min" : "\(minutes / 60) hr \(minutes % 60) min")
        }

        return parts.joined(separator: " · ")
    }
}

