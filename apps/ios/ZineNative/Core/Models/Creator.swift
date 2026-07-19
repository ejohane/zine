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

