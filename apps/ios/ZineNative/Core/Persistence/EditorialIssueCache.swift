import Foundation

struct EditorialIssueCacheEntry: Codable, Hashable {
    let response: EditorialTodayResponse
    let savedAt: Date
}

private struct EditorialIssueCachePointer: Codable {
    let editionDate: String
    let revision: Int
}

actor EditorialIssueCache {
    private let rootURL: URL

    init(userID: String, baseDirectory: URL? = nil) {
        let root = baseDirectory ?? FileManager.default.urls(
            for: .applicationSupportDirectory,
            in: .userDomainMask
        )[0]
        let safeUserID = userID.addingPercentEncoding(withAllowedCharacters: .alphanumerics)
            ?? "unknown-user"
        rootURL = root
            .appending(path: "ZineNative/Editorial", directoryHint: .isDirectory)
            .appending(path: safeUserID, directoryHint: .isDirectory)
    }

    func loadLatest() -> EditorialIssueCacheEntry? {
        guard let pointerData = try? Data(contentsOf: pointerURL),
              let pointer = try? JSONDecoder().decode(
                  EditorialIssueCachePointer.self,
                  from: pointerData
              ),
              let data = try? Data(contentsOf: editionURL(
                  date: pointer.editionDate,
                  revision: pointer.revision
              ))
        else { return nil }

        return try? JSONDecoder().decode(EditorialIssueCacheEntry.self, from: data)
    }

    func save(_ response: EditorialTodayResponse, at savedAt: Date = Date()) {
        guard let issue = response.issue else { return }

        let entryURL = editionURL(date: issue.editionDate, revision: issue.revision)
        let entry = EditorialIssueCacheEntry(response: response, savedAt: savedAt)
        let pointer = EditorialIssueCachePointer(
            editionDate: issue.editionDate,
            revision: issue.revision
        )

        do {
            try FileManager.default.createDirectory(
                at: entryURL.deletingLastPathComponent(),
                withIntermediateDirectories: true
            )

            if !FileManager.default.fileExists(atPath: entryURL.path),
               let data = try? JSONEncoder().encode(entry)
            {
                try data.write(to: entryURL, options: .atomic)
            }

            if let pointerData = try? JSONEncoder().encode(pointer) {
                try pointerData.write(to: pointerURL, options: .atomic)
            }
        } catch {
            // Today remains network-backed; cache failures must not block reading.
        }
    }

    private var pointerURL: URL {
        rootURL.appending(path: "latest.json")
    }

    private func editionURL(date: String, revision: Int) -> URL {
        let safeDate = date.filter { $0.isNumber || $0 == "-" }
        return rootURL
            .appending(path: safeDate, directoryHint: .isDirectory)
            .appending(path: "r\(max(1, revision)).json")
    }
}
