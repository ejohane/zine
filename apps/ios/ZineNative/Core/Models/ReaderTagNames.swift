import Foundation

/// Same replacement validation for the tag sheet and command callers.
enum ReaderTagNames {
    static func validate(_ names: [String]) throws -> [String] {
        var seen = Set<String>()
        let normalized = names.map {
            $0.components(separatedBy: .whitespacesAndNewlines).filter { !$0.isEmpty }.joined(separator: " ")
        }
        guard normalized.allSatisfy({ !$0.isEmpty && $0.count <= 32 }) else {
            throw APIError.server(
                status: 400, message: "Tags must contain 1–32 characters.", code: "INVALID_TAG")
        }
        let unique = normalized.filter { seen.insert($0.lowercased()).inserted }
        guard unique.count <= 20 else {
            throw APIError.server(status: 400, message: "Use at most 20 tags.", code: "TOO_MANY_TAGS")
        }
        return unique
    }
}
