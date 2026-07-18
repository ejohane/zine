import Foundation
import Observation

@MainActor
@Observable
final class BookmarkShareStore {
    static let maximumTagCount = 20
    static let maximumTagLength = 32

    enum Phase: Equatable {
        case loadingLink
        case loadingPreview
        case ready
        case saving
        case saved
        case failed
    }

    private(set) var phase: Phase = .loadingLink
    private(set) var url: URL?
    private(set) var preview: BookmarkSharePreview?
    private(set) var saveStatus: BookmarkShareSaveStatus?
    private(set) var errorMessage: String?
    private(set) var availableTags: [BookmarkShareTag] = []
    private(set) var selectedTags: [String] = []
    private(set) var isLoadingTags = false
    private(set) var tagsErrorMessage: String?

    private let loadURL: () async throws -> URL
    private let client: BookmarkShareClient

    init(
        loadURL: @escaping () async throws -> URL,
        client: BookmarkShareClient
    ) {
        self.loadURL = loadURL
        self.client = client
    }

    func load() async {
        guard phase == .loadingLink else { return }

        do {
            let sharedURL = try await loadURL()
            guard Self.isSupported(sharedURL) else {
                throw BookmarkShareError.unsupportedURL
            }
            url = sharedURL
            await loadPreviewAndTags()
        } catch is CancellationError {
            return
        } catch {
            fail(with: error)
        }
    }

    func retry() async {
        errorMessage = nil
        if url == nil {
            phase = .loadingLink
            await load()
        } else {
            await loadPreviewAndTags()
        }
    }

    func tags(matching query: String) -> [BookmarkShareTag] {
        let queryKey = Self.tagKey(query)
        guard !queryKey.isEmpty else { return availableTags }
        return availableTags.filter { Self.tagKey($0.name).contains(queryKey) }
    }

    func isTagSelected(_ name: String) -> Bool {
        let key = Self.tagKey(name)
        return selectedTags.contains { Self.tagKey($0) == key }
    }

    func canCreateTag(named name: String) -> Bool {
        let normalizedName = Self.normalizedTagName(name)
        guard !normalizedName.isEmpty, normalizedName.count <= Self.maximumTagLength else {
            return false
        }
        let key = Self.tagKey(normalizedName)
        return !availableTags.contains { Self.tagKey($0.name) == key }
    }

    @discardableResult
    func selectTag(named name: String) -> Bool {
        let normalizedName = Self.normalizedTagName(name)
        guard !normalizedName.isEmpty,
              normalizedName.count <= Self.maximumTagLength
        else {
            return false
        }

        let key = Self.tagKey(normalizedName)
        if isTagSelected(normalizedName) {
            return true
        }
        guard selectedTags.count < Self.maximumTagCount else { return false }

        let canonicalName = availableTags.first { Self.tagKey($0.name) == key }?.name
            ?? normalizedName
        selectedTags.append(canonicalName)

        if !availableTags.contains(where: { Self.tagKey($0.name) == key }) {
            availableTags.append(
                BookmarkShareTag(id: "local-\(key)", name: canonicalName)
            )
        }
        return true
    }

    func toggleTag(named name: String) {
        let key = Self.tagKey(name)
        if isTagSelected(name) {
            selectedTags.removeAll { Self.tagKey($0) == key }
        } else {
            _ = selectTag(named: name)
        }
    }

    func retryTags() async {
        await loadTags()
    }

    @discardableResult
    func save() async -> Bool {
        guard phase == .ready, let url else { return false }

        phase = .saving
        errorMessage = nil

        do {
            let result = try await client.save(url, selectedTags)
            saveStatus = result.status
            preview = result.item
            phase = .saved
            return true
        } catch is CancellationError {
            phase = .ready
            return false
        } catch {
            fail(with: error)
            return false
        }
    }

    private func loadPreviewAndTags() async {
        guard let url else { return }

        phase = .loadingPreview
        errorMessage = nil
        isLoadingTags = true
        tagsErrorMessage = nil

        let client = self.client
        let tagsTask = Task {
            try await client.listTags()
        }

        do {
            preview = try await client.preview(url)
            phase = .ready
        } catch is CancellationError {
            tagsTask.cancel()
            isLoadingTags = false
            return
        } catch {
            tagsTask.cancel()
            isLoadingTags = false
            fail(with: error)
            return
        }

        do {
            mergeAvailableTags(try await tagsTask.value)
        } catch is CancellationError {
            isLoadingTags = false
            return
        } catch {
            tagsErrorMessage = "Couldn’t load your tags. You can still add one manually."
        }
        isLoadingTags = false
    }

    private func loadTags() async {
        isLoadingTags = true
        tagsErrorMessage = nil

        do {
            mergeAvailableTags(try await client.listTags())
        } catch is CancellationError {
            isLoadingTags = false
            return
        } catch {
            tagsErrorMessage = "Couldn’t load your tags. You can still add one manually."
        }
        isLoadingTags = false
    }

    private func mergeAvailableTags(_ tags: [BookmarkShareTag]) {
        let selected = selectedTags.map {
            BookmarkShareTag(id: "local-\(Self.tagKey($0))", name: $0)
        }
        availableTags = Self.uniqueTags(tags + selected)
    }

    private func fail(with error: Error) {
        errorMessage = (error as? LocalizedError)?.errorDescription ?? error.localizedDescription
        phase = .failed
    }

    private static func isSupported(_ url: URL) -> Bool {
        guard let scheme = url.scheme?.lowercased() else { return false }
        return scheme == "http" || scheme == "https"
    }

    static func normalizedTagName(_ value: String) -> String {
        value
            .components(separatedBy: .whitespacesAndNewlines)
            .filter { !$0.isEmpty }
            .joined(separator: " ")
    }

    private static func tagKey(_ value: String) -> String {
        normalizedTagName(value).lowercased()
    }

    private static func uniqueTags(_ tags: [BookmarkShareTag]) -> [BookmarkShareTag] {
        var seen = Set<String>()
        return tags.filter { seen.insert(tagKey($0.name)).inserted }
    }
}
