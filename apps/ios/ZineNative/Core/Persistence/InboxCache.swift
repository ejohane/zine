import Foundation

struct InboxCacheSnapshot: Codable, Equatable {
    let items: [Bookmark]
    let nextCursor: String?
    let savedAt: Date
}

actor InboxCache {
    private static let maximumSnapshots = 6

    private let fileURL: URL
    private var snapshots: [String: InboxCacheSnapshot]?

    init(userID: String, baseDirectory: URL? = nil) {
        let root = baseDirectory ?? FileManager.default.urls(
            for: .applicationSupportDirectory,
            in: .userDomainMask
        )[0]
        let safeUserID = userID.addingPercentEncoding(withAllowedCharacters: .alphanumerics)
            ?? "unknown-user"
        fileURL = root
            .appending(path: "ZineNative/Inbox", directoryHint: .isDirectory)
            .appending(path: "\(safeUserID).json")
    }

    func load(query: InboxQuery) -> InboxCacheSnapshot? {
        loadSnapshotsIfNeeded()
        return snapshots?[query.cacheKey]
    }

    func saveFirstPage(items: [Bookmark], nextCursor: String?, query: InboxQuery) {
        loadSnapshotsIfNeeded()
        snapshots?[query.cacheKey] = InboxCacheSnapshot(
            items: Array(items.prefix(30)),
            nextCursor: nextCursor,
            savedAt: Date()
        )
        pruneSnapshots()
        persistSnapshots()
    }

    func remove(id: String, query: InboxQuery) {
        loadSnapshotsIfNeeded()
        guard let snapshot = snapshots?[query.cacheKey] else { return }
        snapshots?[query.cacheKey] = InboxCacheSnapshot(
            items: snapshot.items.filter { $0.id != id },
            nextCursor: snapshot.nextCursor,
            savedAt: Date()
        )
        persistSnapshots()
    }

    func restore(_ bookmark: Bookmark, at index: Int, query: InboxQuery) {
        loadSnapshotsIfNeeded()
        guard let snapshot = snapshots?[query.cacheKey],
              !snapshot.items.contains(where: { $0.id == bookmark.id })
        else { return }

        var items = snapshot.items
        items.insert(bookmark, at: min(index, items.endIndex))
        snapshots?[query.cacheKey] = InboxCacheSnapshot(
            items: Array(items.prefix(30)),
            nextCursor: snapshot.nextCursor,
            savedAt: Date()
        )
        persistSnapshots()
    }

    private func loadSnapshotsIfNeeded() {
        guard snapshots == nil else { return }
        guard let data = try? Data(contentsOf: fileURL),
              let decoded = try? JSONDecoder().decode(
                  [String: InboxCacheSnapshot].self,
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
            // Inbox remains network-backed; this cache only improves launch behavior.
        }
    }
}
