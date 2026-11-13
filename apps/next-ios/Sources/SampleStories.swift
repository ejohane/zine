import Foundation

enum SampleStories {
    /// A local metadata snapshot, not a connection to the old Zine backend.
    static let items: [SavedContent] = {
        guard let url = Bundle.main.url(forResource: "DevSamples", withExtension: "json"),
              let data = try? Data(contentsOf: url),
              let items = try? JSONDecoder().decode([SavedContent].self, from: data) else {
            assertionFailure("Missing or invalid bundled development samples")
            return []
        }
        return items.map { item in
            var item = item
            item.api = APIFixtures.bundled.itemList.items.first { $0.content.url == item.url?.absoluteString }
            item.isFinished = item.api?.progress.completedAt != nil
            return item
        }
    }()

    static func replacingSamples(in stored: [SavedContent]) -> [SavedContent] {
        let prior = Dictionary(stored.filter(\.isSample).map { ($0.id, $0) }, uniquingKeysWith: { first, _ in first })
        return stored.filter { !$0.isSample } + items.map { item in
            var refreshed = item
            if let old = prior[item.id] {
                refreshed.isFinished = old.isFinished
                if let api = old.api { refreshed.api = api }
                refreshed.api?.progress.completedAt = old.isFinished ? (old.api?.progress.completedAt ?? "2026-11-09T12:00:00.000Z") : nil
            }
            return refreshed
        }
    }
}
