// Standalone decoding example for the Foundation v1 contract fixture.
// Run: swift PublicationFixtureDecoder.swift /absolute/path/to/v1.json
import Foundation
struct Publication: Decodable { let id: String; let displayName: String; let editor: Editor }
struct Editor: Decodable { let displayName: String }
struct Selection: Decodable {
    let id: String
    let title: String
    let originalUrl: URL
    let commentary: String?
    let firstPublishedRevision: Int?
}
struct Section: Decodable { let id: String; let heading: String?; let selections: [Selection] }
struct Issue: Decodable {
    let id: String
    let publication: Publication
    let kind: String
    let title: String
    let revision: Int
    let publishedAt: String?
    let sections: [Section]
}
struct OwnerDraft: Decodable { let status: String; let weeklyWindowId: String? }
struct Fixtures: Decodable {
    let version: Int
    let publicIssue: Issue
    let weeklyIssue: Issue
    let ownerDraft: OwnerDraft
}
let fixture = try JSONDecoder().decode(Fixtures.self, from: Data(contentsOf: URL(fileURLWithPath: CommandLine.arguments[1])))
precondition(fixture.version == 1 && fixture.publicIssue.kind == "INDEPENDENT")
precondition(fixture.weeklyIssue.kind == "WEEKLY" && fixture.ownerDraft.status == "DRAFT")
print("Decoded publication v1 public, weekly and draft contracts")
