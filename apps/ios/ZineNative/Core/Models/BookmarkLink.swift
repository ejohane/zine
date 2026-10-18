import Foundation

/// Bookmark destinations only. Authentication callbacks are handled separately.
enum BookmarkLink {
    static func bookmarkID(from url: URL) -> String? {
        guard let components = URLComponents(url: url, resolvingAgainstBaseURL: false),
              components.user == nil, components.password == nil, components.port == nil,
              components.query == nil, components.fragment == nil else { return nil }
        let parts = components.path.split(separator: "/", omittingEmptySubsequences: false)
        let id: String
        switch components.scheme?.lowercased() {
        case "https":
            guard ["myzine.app", "www.myzine.app"].contains(components.host?.lowercased() ?? ""),
                  parts.count == 3, parts[0].isEmpty, parts[1] == "item" else { return nil }
            id = String(parts[2])
        case "zine":
            guard components.host == "item", parts.count == 2, parts[0].isEmpty else { return nil }
            id = String(parts[1])
        default:
            return nil
        }
        guard !id.isEmpty, id.utf8.count <= 128,
              id.utf8.allSatisfy({ (48...57).contains($0) || (65...90).contains($0) || (97...122).contains($0) || $0 == 45 || $0 == 95 }) else { return nil }
        return id
    }
}

struct BookmarkLinkRequest: Identifiable, Equatable {
    let id = UUID()
    let bookmarkID: String
}
