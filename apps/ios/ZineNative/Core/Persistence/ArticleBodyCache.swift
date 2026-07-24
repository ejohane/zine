import Foundation

private struct CachedArticleBody: Codable {
    let response: ArticleContentResponse
    let savedAt: Date
}

actor ArticleBodyCache {
    private static let maximumDocuments = 50

    private let fileURL: URL
    private var documents: [String: CachedArticleBody]?

    init(userID: String, baseDirectory: URL? = nil) {
        let root = baseDirectory ?? FileManager.default.urls(
            for: .applicationSupportDirectory,
            in: .userDomainMask
        )[0]
        let safeUserID = userID.addingPercentEncoding(withAllowedCharacters: .alphanumerics)
            ?? "unknown-user"
        fileURL = root
            .appending(path: "ZineNative/Articles", directoryHint: .isDirectory)
            .appending(path: "\(safeUserID).json")
    }

    func load(bookmarkID: String) -> ArticleContentResponse? {
        loadDocumentsIfNeeded()
        return documents?[bookmarkID]?.response
    }

    func save(_ response: ArticleContentResponse, bookmarkID: String) {
        guard response.readableContent != nil else { return }
        loadDocumentsIfNeeded()
        documents?[bookmarkID] = CachedArticleBody(response: response, savedAt: Date())
        pruneDocuments()
        persistDocuments()
    }

    private func loadDocumentsIfNeeded() {
        guard documents == nil else { return }
        guard let data = try? Data(contentsOf: fileURL),
              let decoded = try? JSONDecoder().decode([String: CachedArticleBody].self, from: data)
        else {
            documents = [:]
            return
        }
        documents = decoded
    }

    private func pruneDocuments() {
        guard let documents, documents.count > Self.maximumDocuments else { return }
        let retainedKeys = documents
            .sorted { $0.value.savedAt > $1.value.savedAt }
            .prefix(Self.maximumDocuments)
            .map(\.key)
        self.documents = documents.filter { retainedKeys.contains($0.key) }
    }

    private func persistDocuments() {
        guard let documents,
              let data = try? JSONEncoder().encode(documents)
        else { return }

        do {
            try FileManager.default.createDirectory(
                at: fileURL.deletingLastPathComponent(),
                withIntermediateDirectories: true
            )
            try data.write(to: fileURL, options: [.atomic, .completeFileProtection])
        } catch {
            // The cache is an optimization; the authenticated API remains the source of truth.
        }
    }
}
