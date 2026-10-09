import Foundation

struct PublicationDraftRecord: Codable {
    var issue: PersonalIssue
    var baselineRevision: Int
    var operations: [PublicationOperation]
    var requestKey: String?
    var requestCount: Int?
}
struct PublicationDraftCache {
    let directory: URL
    init(userID: String, baseURL: URL, root: URL? = nil) {
        let root = root ?? FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        // A reversible namespace is safe here; it is a local path, not a public identity.
        let namespace = Data("\(baseURL.absoluteString)|\(userID)".utf8).base64EncodedString()
            .replacingOccurrences(of: "/", with: "_").replacingOccurrences(of: "+", with: "-")
        directory = root.appendingPathComponent("PublicationDrafts/\(namespace)", isDirectory: true)
    }
    func load(_ id: String) -> PublicationDraftRecord? {
        guard let bytes = try? Data(contentsOf: file(id)) else { return nil }
        return try? JSONDecoder().decode(PublicationDraftRecord.self, from: bytes)
    }
    func save(_ record: PublicationDraftRecord) throws {
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        let data = try JSONEncoder().encode(record)
        #if os(iOS)
        try data.write(to: file(record.issue.id), options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
        #else
        try data.write(to: file(record.issue.id), options: .atomic)
        #endif
    }
    func remove(_ id: String) { try? FileManager.default.removeItem(at: file(id)) }
    private func file(_ id: String) -> URL { directory.appendingPathComponent(Data(id.utf8).base64EncodedString().replacingOccurrences(of: "/", with: "_") + ".json") }
}
