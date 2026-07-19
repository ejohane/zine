import Foundation

struct HomeCacheSnapshot: Codable, Equatable {
    let home: HomeResponse?
    let inboxItems: [Bookmark]
    let savedAt: Date
}

actor HomeCache {
    private let fileURL: URL
    private var snapshot: HomeCacheSnapshot?
    private var didLoad = false

    init(userID: String, baseDirectory: URL? = nil) {
        let root = baseDirectory ?? FileManager.default.urls(
            for: .applicationSupportDirectory,
            in: .userDomainMask
        )[0]
        let safeUserID = userID.addingPercentEncoding(withAllowedCharacters: .alphanumerics)
            ?? "unknown-user"
        fileURL = root
            .appending(path: "ZineNative/Home", directoryHint: .isDirectory)
            .appending(path: "\(safeUserID).json")
    }

    func load() -> HomeCacheSnapshot? {
        loadIfNeeded()
        return snapshot
    }

    func save(home: HomeResponse?, inboxItems: [Bookmark]) {
        loadIfNeeded()
        snapshot = HomeCacheSnapshot(
            home: home,
            inboxItems: Array(inboxItems.prefix(4)),
            savedAt: Date()
        )
        persist()
    }

    private func loadIfNeeded() {
        guard !didLoad else { return }
        didLoad = true
        guard let data = try? Data(contentsOf: fileURL) else { return }
        snapshot = try? JSONDecoder().decode(HomeCacheSnapshot.self, from: data)
    }

    private func persist() {
        guard let snapshot,
              let data = try? JSONEncoder().encode(snapshot)
        else { return }

        do {
            try FileManager.default.createDirectory(
                at: fileURL.deletingLastPathComponent(),
                withIntermediateDirectories: true
            )
            try data.write(to: fileURL, options: .atomic)
        } catch {
            // Home remains network-backed; this cache only improves launch behavior.
        }
    }
}
