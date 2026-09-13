import Foundation

/// Local-only text location. Hash + quote protect against applying an old DOM index to new content.
struct ArticleReadingPosition: Codable, Equatable {
    let contentHash: String
    let nodeIndex: Int
    let offset: Int
    let quote: String
    let viewportY: Double
    let fraction: Double
}

