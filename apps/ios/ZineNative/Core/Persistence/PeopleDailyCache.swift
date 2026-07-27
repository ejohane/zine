import Foundation

struct PeopleDailyCacheEntry: Codable, Hashable {
    let response: PeopleDailyOverviewResponse
    let savedAt: Date
}

actor PeopleDailyCache {
    private let fileURL: URL

    init(userID: String, baseDirectory: URL? = nil) {
        let root = baseDirectory ?? FileManager.default.urls(
            for: .applicationSupportDirectory,
            in: .userDomainMask
        )[0]
        let safeUserID = userID.addingPercentEncoding(withAllowedCharacters: .alphanumerics)
            ?? "unknown-user"
        fileURL = root
            .appending(path: "ZineNative/PeopleDaily", directoryHint: .isDirectory)
            .appending(path: safeUserID, directoryHint: .isDirectory)
            .appending(path: "latest.json")
    }

    func loadLatest() -> PeopleDailyCacheEntry? {
        guard let data = try? Data(contentsOf: fileURL) else { return nil }
        return try? JSONDecoder().decode(PeopleDailyCacheEntry.self, from: data)
    }

    func save(_ response: PeopleDailyOverviewResponse, at savedAt: Date = Date()) {
        do {
            try FileManager.default.createDirectory(
                at: fileURL.deletingLastPathComponent(),
                withIntermediateDirectories: true
            )
            let data = try JSONEncoder().encode(PeopleDailyCacheEntry(
                response: response,
                savedAt: savedAt
            ))
            try data.write(to: fileURL, options: .atomic)
        } catch {
            // Today remains network-backed; cache failures must not block reading.
        }
    }
}
