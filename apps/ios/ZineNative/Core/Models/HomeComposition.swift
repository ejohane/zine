import Foundation

/// Agent-authored arrangement only. All card content comes from real account-owned items.
struct HomeComposition: Codable, Hashable {
    struct Section: Codable, Hashable, Identifiable {
        enum Layout: String, Codable { case single, horizontal, twoColumn = "two_column", vertical }
        enum Card: String, Codable { case featured, landscape, cover, compact, tile, row, grid }
        let id: String
        var title: String? = nil
        let layout: Layout
        let card: Card
        let itemIds: [String]
    }
    let version: Int
    let sections: [Section]

    init(version: Int = 1, sections: [Section]) {
        self.version = version
        self.sections = sections
    }
    private enum CodingKeys: String, CodingKey { case version, sections }
    init(from decoder: Decoder) throws {
        if let container = try? decoder.container(keyedBy: CodingKeys.self),
           let decodedVersion = try? container.decode(Int.self, forKey: .version),
           let decodedSections = try? container.decode([Section].self, forKey: .sections) {
            version = decodedVersion
            sections = decodedSections
        } else {
            version = 0
            sections = []
        }
    }
    var isValid: Bool {
        guard version == 1, sections.count <= 12,
              Set(sections.map(\.id)).count == sections.count,
              sections.reduce(0, { $0 + $1.itemIds.count }) <= 100 else { return false }
        return sections.allSatisfy { s in
            !s.id.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && s.id.count <= 128
            && (s.title.map { !$0.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && $0.count <= 60 && !$0.contains("\n") && !$0.contains("\r") } ?? true)
            && (1...20).contains(s.itemIds.count)
            && s.itemIds.allSatisfy { !$0.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && $0.count <= 128 }
            && Set(s.itemIds).count == s.itemIds.count
            && (s.layout != .single || s.itemIds.count == 1)
            && (![.landscape, .cover].contains(s.card) || s.layout == .horizontal)
            && (s.card != .grid || s.layout == .twoColumn)
            && (s.card != .featured || s.layout == .single)
            && (s.card != .row || s.layout == .vertical)
            && (s.card != .tile || [.twoColumn, .vertical].contains(s.layout))
            && (s.card != .compact || [.horizontal, .vertical].contains(s.layout))
        }
    }

    func resolve(items: [HomeItem], hiddenIDs: Set<String> = []) -> [HomeComposedSection] {
        guard isValid else { return [] }
        let byID = Dictionary(items.map { ($0.id, $0) }, uniquingKeysWith: { first, _ in first })
        return sections.compactMap { section in
            let visible = section.itemIds.compactMap { hiddenIDs.contains($0) ? nil : byID[$0] }
                .filter { section.card != .featured || $0.contentType == .article }
            return visible.isEmpty ? nil : HomeComposedSection(section: section, items: visible)
        }
    }
}

struct HomeComposedSection: Identifiable {
    let section: HomeComposition.Section
    let items: [HomeItem]
    var id: String { section.id }
}

struct HomeCompositionResult: Codable {
    let composition: HomeComposition
    let compositionItems: [HomeItem]?
    let valid: Bool?
    let unavailableItemIds: [String]?
    let incompatibleItemIds: [String]?
    let published: Bool?
    let verified: Bool?
}
