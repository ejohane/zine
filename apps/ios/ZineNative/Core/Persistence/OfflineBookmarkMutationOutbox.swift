import Foundation

enum OfflineBookmarkMutationKind: String, Codable, Equatable {
    case finished
    case tags
    case archive
}

struct OfflineBookmarkMutation: Codable, Equatable, Identifiable {
    let id: UUID
    let sequence: Int
    let createdAt: String
    let bookmarkID: String
    let kind: OfflineBookmarkMutationKind
    let isFinished: Bool?
    let tags: [String]?
    let bookmark: Bookmark?
}

private struct OfflineBookmarkMutationEnvelope: Codable {
    var nextSequence: Int
    var mutations: [OfflineBookmarkMutation]
    var knownTags: [BookmarkTag]
}

actor OfflineBookmarkMutationOutbox {
    private let fileURL: URL
    private var envelope: OfflineBookmarkMutationEnvelope?

    init(userID: String, baseDirectory: URL? = nil) {
        let root = baseDirectory ?? FileManager.default.urls(
            for: .applicationSupportDirectory,
            in: .userDomainMask
        )[0]
        let safeUserID = userID.addingPercentEncoding(withAllowedCharacters: .alphanumerics)
            ?? "unknown-user"
        fileURL = root
            .appending(path: "ZineNative/OfflineMutations", directoryHint: .isDirectory)
            .appending(path: "\(safeUserID).json")
    }

    func stageFinished(
        bookmarkID: String,
        isFinished: Bool,
        bookmark: Bookmark? = nil
    ) -> OfflineBookmarkMutation {
        loadIfNeeded()
        remove(bookmarkID: bookmarkID, kind: .finished)
        let mutation = makeMutation(
            bookmarkID: bookmarkID,
            kind: .finished,
            isFinished: isFinished,
            bookmark: bookmark
        )
        envelope?.mutations.append(mutation)
        persist()
        return mutation
    }

    func stageTags(
        bookmarkID: String,
        tags: [String],
        bookmark: Bookmark? = nil
    ) -> OfflineBookmarkMutation {
        loadIfNeeded()
        remove(bookmarkID: bookmarkID, kind: .tags)
        let mutation = makeMutation(
            bookmarkID: bookmarkID,
            kind: .tags,
            tags: tags,
            bookmark: bookmark
        )
        envelope?.mutations.append(mutation)
        mergeKnownTags(Self.localTags(for: tags))
        persist()
        return mutation
    }

    func stageArchive(
        bookmarkID: String,
        bookmark: Bookmark? = nil
    ) -> OfflineBookmarkMutation {
        loadIfNeeded()
        envelope?.mutations.removeAll { $0.bookmarkID == bookmarkID }
        let mutation = makeMutation(
            bookmarkID: bookmarkID,
            kind: .archive,
            bookmark: bookmark
        )
        envelope?.mutations.append(mutation)
        persist()
        return mutation
    }

    func pendingMutations() -> [OfflineBookmarkMutation] {
        loadIfNeeded()
        return (envelope?.mutations ?? []).sorted { $0.sequence < $1.sequence }
    }

    func remove(_ mutation: OfflineBookmarkMutation) {
        loadIfNeeded()
        envelope?.mutations.removeAll { $0.id == mutation.id }
        persist()
    }

    func cacheKnownTags(_ tags: [BookmarkTag]) {
        loadIfNeeded()
        mergeKnownTags(tags)
        persist()
    }

    func knownTags() -> [BookmarkTag] {
        loadIfNeeded()
        return envelope?.knownTags ?? []
    }

    func overlay(_ bookmark: Bookmark) -> Bookmark? {
        loadIfNeeded()
        return overlayLoaded(bookmark)
    }

    func overlay(_ bookmarks: [Bookmark], matching query: LibraryQuery) -> [Bookmark] {
        loadIfNeeded()
        var result = bookmarks.compactMap(overlayLoaded).filter { Self.matches($0, query: query) }
        var existingIDs = Set(result.map(\.id))

        for mutation in (envelope?.mutations ?? []).sorted(by: { $0.sequence < $1.sequence }) {
            guard let bookmark = mutation.bookmark,
                  !existingIDs.contains(bookmark.id),
                  let candidate = overlayLoaded(bookmark),
                  Self.matches(candidate, query: query)
            else { continue }
            result.insert(candidate, at: 0)
            existingIDs.insert(candidate.id)
        }

        return result
    }

    func hiddenHomeItemIDs() -> Set<String> {
        loadIfNeeded()
        return Set((envelope?.mutations ?? []).compactMap { mutation in
            switch mutation.kind {
            case .archive:
                mutation.bookmarkID
            case .finished where mutation.isFinished == true:
                mutation.bookmarkID
            case .finished, .tags:
                nil
            }
        })
    }

    func removeAll() {
        envelope = OfflineBookmarkMutationEnvelope(
            nextSequence: 0,
            mutations: [],
            knownTags: []
        )
        try? FileManager.default.removeItem(at: fileURL)
    }

    private func loadIfNeeded() {
        guard envelope == nil else { return }
        guard let data = try? Data(contentsOf: fileURL),
              let decoded = try? JSONDecoder().decode(
                  OfflineBookmarkMutationEnvelope.self,
                  from: data
              )
        else {
            envelope = OfflineBookmarkMutationEnvelope(
                nextSequence: 0,
                mutations: [],
                knownTags: []
            )
            return
        }
        envelope = decoded
    }

    private func makeMutation(
        bookmarkID: String,
        kind: OfflineBookmarkMutationKind,
        isFinished: Bool? = nil,
        tags: [String]? = nil,
        bookmark: Bookmark? = nil
    ) -> OfflineBookmarkMutation {
        let sequence = envelope?.nextSequence ?? 0
        envelope?.nextSequence = sequence + 1
        return OfflineBookmarkMutation(
            id: UUID(),
            sequence: sequence,
            createdAt: Date().formatted(.iso8601),
            bookmarkID: bookmarkID,
            kind: kind,
            isFinished: isFinished,
            tags: tags,
            bookmark: bookmark
        )
    }

    private func remove(bookmarkID: String, kind: OfflineBookmarkMutationKind) {
        envelope?.mutations.removeAll {
            $0.bookmarkID == bookmarkID && $0.kind == kind
        }
    }

    private func mergeKnownTags(_ tags: [BookmarkTag]) {
        var byName: [String: BookmarkTag] = [:]
        for tag in envelope?.knownTags ?? [] {
            byName[Self.tagKey(tag.name)] = tag
        }
        for tag in tags {
            byName[Self.tagKey(tag.name)] = tag
        }
        envelope?.knownTags = byName.values.sorted {
            $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending
        }
    }

    private func overlayLoaded(_ bookmark: Bookmark) -> Bookmark? {
        var result = bookmark
        for mutation in (envelope?.mutations ?? [])
            .filter({ $0.bookmarkID == bookmark.id })
            .sorted(by: { $0.sequence < $1.sequence })
        {
            switch mutation.kind {
            case .finished:
                guard let isFinished = mutation.isFinished else { continue }
                result.isFinished = isFinished
                result.finishedAt = isFinished ? mutation.createdAt : nil
            case .tags:
                result.tags = Self.localTags(for: mutation.tags ?? [])
            case .archive:
                return nil
            }
        }
        return result
    }

    private func persist() {
        guard let envelope,
              let data = try? JSONEncoder().encode(envelope)
        else { return }

        do {
            try FileManager.default.createDirectory(
                at: fileURL.deletingLastPathComponent(),
                withIntermediateDirectories: true
            )
            try data.write(to: fileURL, options: [.atomic, .completeFileProtection])
            var resourceValues = URLResourceValues()
            resourceValues.isExcludedFromBackup = true
            var storedFileURL = fileURL
            try? storedFileURL.setResourceValues(resourceValues)
        } catch {
            // Mutations remain reflected in memory for this process; a later write may succeed.
        }
    }

    static func localTags(for names: [String]) -> [BookmarkTag] {
        names.map { name in
            let safeName = name.addingPercentEncoding(withAllowedCharacters: .alphanumerics)
                ?? UUID().uuidString
            return BookmarkTag(id: "offline-\(safeName)", name: name)
        }
    }

    private static func tagKey(_ value: String) -> String {
        value.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
    }

    private static func matches(_ bookmark: Bookmark, query: LibraryQuery) -> Bool {
        guard bookmark.isFinished == query.isFinished else { return false }
        if let provider = query.provider, bookmark.provider != provider { return false }
        if let contentType = query.contentType, bookmark.contentType != contentType { return false }
        let search = query.search.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !search.isEmpty else { return true }
        return bookmark.title.localizedCaseInsensitiveContains(search)
            || bookmark.creator.localizedCaseInsensitiveContains(search)
    }
}
