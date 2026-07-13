import Foundation

struct LibraryCacheSnapshot: Codable, Equatable {
    let items: [Bookmark]
    let nextCursor: String?
    let savedAt: Date
}

actor LibraryCache {
    private static let maximumSnapshots = 12

    private let fileURL: URL
    private var snapshots: [String: LibraryCacheSnapshot]?

    init(userID: String, baseDirectory: URL? = nil) {
        let root = baseDirectory ?? FileManager.default.urls(
            for: .applicationSupportDirectory,
            in: .userDomainMask
        )[0]
        let safeUserID = userID.addingPercentEncoding(withAllowedCharacters: .alphanumerics)
            ?? "unknown-user"
        fileURL = root
            .appending(path: "ZineNative/Library", directoryHint: .isDirectory)
            .appending(path: "\(safeUserID).json")
    }

    func load(query: LibraryQuery) -> LibraryCacheSnapshot? {
        loadSnapshotsIfNeeded()
        return snapshots?[query.cacheKey]
    }

    func save(items: [Bookmark], nextCursor: String?, query: LibraryQuery) {
        loadSnapshotsIfNeeded()
        snapshots?[query.cacheKey] = LibraryCacheSnapshot(
            items: items,
            nextCursor: nextCursor,
            savedAt: Date()
        )
        pruneSnapshots()
        persistSnapshots()
    }

    private func loadSnapshotsIfNeeded() {
        guard snapshots == nil else { return }
        guard let data = try? Data(contentsOf: fileURL),
              let decoded = try? JSONDecoder().decode(
                  [String: LibraryCacheSnapshot].self,
                  from: data
              )
        else {
            snapshots = [:]
            return
        }
        snapshots = decoded
    }

    private func pruneSnapshots() {
        guard let snapshots, snapshots.count > Self.maximumSnapshots else { return }
        let retainedKeys = snapshots
            .sorted { $0.value.savedAt > $1.value.savedAt }
            .prefix(Self.maximumSnapshots)
            .map(\.key)
        self.snapshots = snapshots.filter { retainedKeys.contains($0.key) }
    }

    private func persistSnapshots() {
        guard let snapshots,
              let data = try? JSONEncoder().encode(snapshots)
        else { return }

        do {
            try FileManager.default.createDirectory(
                at: fileURL.deletingLastPathComponent(),
                withIntermediateDirectories: true
            )
            try data.write(to: fileURL, options: .atomic)
        } catch {
            // The cache is an optimization; network loading remains the source of truth.
        }
    }
}
