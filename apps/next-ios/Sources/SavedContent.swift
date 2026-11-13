import Foundation
import Observation

// This is a local product model, not a proposed backend contract.
enum ContentSection: String, CaseIterable, Identifiable, Codable {
    case home = "Home", podcasts = "Podcasts", articles = "Articles", videos = "Videos", posts = "Posts"
    var id: Self { self }
    var symbol: String {
        switch self {
        case .home: "house.fill"
        case .podcasts: "headphones"
        case .articles: "doc.text"
        case .videos: "play.rectangle"
        case .posts: "text.bubble"
        }
    }
    var headline: String {
        switch self {
        case .home: "Follow your curiosity"
        case .podcasts: "Let a conversation unfold"
        case .articles: "Stay with a good story"
        case .videos: "See something differently"
        case .posts: "A thought worth keeping"
        }
    }
}

struct SavedContent: Identifiable, Codable, Equatable {
    let id: UUID
    let section: ContentSection
    let title: String
    let author: String
    let note: String
    let body: String
    let duration: String
    let image: String?
    let thread: String
    var url: URL? = nil
    var isSample: Bool = true
    var isFinished: Bool = false
    var api: APIItem? = nil

    init(id: UUID = UUID(), section: ContentSection, title: String, author: String,
         note: String, body: String, duration: String, image: String? = nil, thread: String,
         url: URL? = nil, isSample: Bool = true, isFinished: Bool = false) {
        self.id = id; self.section = section; self.title = title; self.author = author
        self.note = note; self.body = body; self.duration = duration; self.image = image
        self.thread = thread; self.url = url; self.isSample = isSample; self.isFinished = isFinished
    }
}

@MainActor @Observable
final class SavedSpace {
    private(set) var items: [SavedContent]
    private let fileURL: URL?
    private var preservesUnreadableFile = false
    var storageError: String?

    init(fileURL: URL? = nil, ephemeral: Bool = false) {
        self.fileURL = ephemeral ? nil : fileURL ?? URL.documentsDirectory.appendingPathComponent("saved-space-v1.json")
        if let file = self.fileURL, FileManager.default.fileExists(atPath: file.path) {
            do {
                let stored = try JSONDecoder().decode([SavedContent].self, from: Data(contentsOf: file))
                items = SampleStories.replacingSamples(in: stored)
            }
            catch {
                items = SampleStories.items
                preservesUnreadableFile = true
                storageError = "Your local collection couldn’t be read. Sample stories are shown; your saved file is preserved."
            }
        } else { items = SampleStories.items }
    }

    func contents(in section: ContentSection, thread: String? = nil,
                  scope: LibraryScope = .saved, collectionID: String? = nil) -> [SavedContent] {
        items.filter { scope.includes($0) && (section == .home || $0.section == section)
            && (thread == nil || $0.thread == thread)
            && (collectionID == nil || $0.api?.collectionIds.contains(collectionID!) == true) }
    }

    func save(urlText: String, title: String, section: ContentSection, contextText: String = "", tags: [String] = []) throws {
        guard let url = URL(string: urlText.trimmingCharacters(in: .whitespacesAndNewlines)),
              ["http", "https"].contains(url.scheme?.lowercased() ?? ""),
              let host = url.host, !host.isEmpty else { throw SaveError.invalidURL }
        if let existing = items.first(where: { $0.url == url }) {
            setStatus("saved", for: existing.id)
            addContext(contextText, to: existing.id)
            updateAPI(existing.id) { $0.tags = Array(Set($0.tags + tags.filter { !$0.isEmpty })).sorted() }
            return
        }
        items.insert(SavedContent(section: section == .home ? .articles : section,
                                  title: title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? host : title,
                                  author: host, note: "A link you want to come back to.", body: "",
                                  duration: "Saved just now", thread: "Your discoveries", url: url, isSample: false), at: 0)
        let id = items[0].id
        addContext(contextText, to: id)
        updateAPI(id) { $0.tags = Array(Set(tags.filter { !$0.isEmpty })).sorted() }
        persist()
    }

    func toggleFinished(_ id: UUID) {
        guard let index = items.firstIndex(where: { $0.id == id }) else { return }
        var item = items[index]
        item.isFinished.toggle()
        item.api?.progress.completedAt = item.isFinished ? ISO8601DateFormatter().string(from: Date()) : nil
        items[index] = item
        persist()
    }

    var collections: [APICollection] { APIFixtures.bundled.collectionList.collections }
    var resumeItems: [SavedContent] {
        contents(in: .home).filter { !$0.isFinished && ($0.progressFraction ?? 0) > 0 && ($0.progressFraction ?? 0) < 1 }
    }

    func addContext(_ text: String, to id: UUID) {
        let text = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else { return }
        updateAPI(id) { $0.context.append(APIContext(id: UUID().uuidString, text: text, origin: "explicit", contributor: "you")) }
    }

    func setProgress(_ fraction: Double, for id: UUID) {
        updateAPI(id) { item in
            let fraction = min(1, max(0, fraction))
            item.progress.position = item.progress.unit == "seconds" ? fraction * (item.content.durationSeconds ?? 0) : fraction
            if item.progress.unit != "seconds" { item.progress.unit = "fraction" }
        }
    }

    func setStatus(_ status: String, for id: UUID) {
        guard ["saved", "received", "dismissed"].contains(status) else { return }
        updateAPI(id) { item in
            item.status = status
            if status == "saved" { item.archived = false }
        }
    }

    func toggleArchive(_ id: UUID) { updateAPI(id) { $0.archived.toggle() } }

    func toggleCollection(_ collectionID: String, for id: UUID) {
        guard collections.contains(where: { $0.id == collectionID }) else { return }
        updateAPI(id) { item in
            if item.collectionIds.contains(collectionID) { item.collectionIds.removeAll { $0 == collectionID } }
            else { item.collectionIds.append(collectionID) }
        }
    }

    private func updateAPI(_ id: UUID, mutation: (inout APIItem) -> Void) {
        guard let index = items.firstIndex(where: { $0.id == id }) else { return }
        if items[index].api == nil {
            let item = items[index]
            let type = item.section == .podcasts ? "podcast_episode" : item.section == .videos ? "video" : item.section == .posts ? "post" : "article"
            items[index].api = APIItem(id: item.id.uuidString, status: "saved", archived: false,
                content: APIContent(id: item.id.uuidString, url: item.url?.absoluteString ?? "", platform: "web", type: type, title: item.title),
                context: [], tags: [], collectionIds: [], progress: APIProgress(),
                enrichment: APIEnrichment(fields: [:], components: [APIComponent(component: "metadata", status: "pending")]))
        }
        var api = items[index].api!
        mutation(&api)
        items[index].api = api
        persist()
    }

    func collectionItems(_ id: String) -> [SavedContent] {
        let positions = Dictionary((APIFixtures.bundled.orderedCollections[id]?.items ?? []).map { ($0.item.id, $0.position) }, uniquingKeysWith: { first, _ in first })
        return contents(in: .home, collectionID: id).sorted {
            let left = positions[$0.apiID] ?? .greatestFiniteMagnitude
            let right = positions[$1.apiID] ?? .greatestFiniteMagnitude
            return left == right ? $0.id.uuidString < $1.id.uuidString : left < right
        }
    }

    /// Keyword matching is local. Meaning matches are explicitly scripted fixtures,
    /// never a simulated claim that an embedding or model ran on this device.
    func search(_ query: String, mode: SearchMode) -> [PreviewSearchHit] {
        let query = query.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !query.isEmpty else { return [] }
        let candidates = contents(in: .home)
        let scripted = APIFixtures.bundled.searches.first { $0.query.caseInsensitiveCompare(query) == .orderedSame }
        return candidates.compactMap { item in
            var evidence: [APIMatch] = []
            if mode != .semantic {
                let fields = [("title", item.title), ("creator", item.author)]
                    + (item.api?.context.map { ("context", $0.text) } ?? [])
                    + [("tags", item.api?.tags.joined(separator: ", ") ?? "")]
                evidence += fields.filter { $0.1.localizedCaseInsensitiveContains(query) }
                    .map { APIMatch(field: $0.0, excerpt: $0.1, matchedBy: ["keyword"]) }
            }
            if mode != .keyword, let match = scripted?.response.items.first(where: { $0.id == item.apiID }) {
                evidence += match.matches
            }
            return evidence.isEmpty ? nil : PreviewSearchHit(item: item, evidence: evidence)
        }
    }

    private func persist() {
        guard let fileURL else { return }
        // Preserve an unreadable existing file until the user can recover it.
        guard !preservesUnreadableFile else { return }
        do {
            try JSONEncoder().encode(items).write(to: fileURL, options: .atomic)
            storageError = nil
        }
        catch { storageError = "Your changes are available for this session, but couldn’t be saved on this device." }
    }

    enum SaveError: LocalizedError {
        case invalidURL, duplicate
        var errorDescription: String? {
            switch self {
            case .invalidURL: "Enter a complete http or https link."
            case .duplicate: "That link is already in your space."
            }
        }
    }
}
