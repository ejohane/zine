import Foundation
import Observation

@Observable @MainActor
final class IssueEditorStore {
    var issue: PersonalIssue?
    var error: String?
    var isSaving = false
    var conflict: PersonalIssue?
    var hasLocalEdits = false
    var rejectedEdits = false
    var saveDescription = ""
    private var baselineRevision = 0
    private var operations: [PublicationOperation] = []
    private var requestKey: String?
    private var requestCount: Int?
    private var publishKey: String?
    private let client: APIClient
    private let cache: PublicationDraftCache
    let id: String

    init(id: String, client: APIClient, userID: String, cacheRoot: URL? = nil) {
        self.id = id; self.client = client
        cache = PublicationDraftCache(userID: userID, baseURL: client.baseURL, root: cacheRoot)
    }
    func load() async {
        if let saved = cache.load(id) {
            issue = saved.issue; baselineRevision = saved.baselineRevision; operations = saved.operations
            requestKey = saved.requestKey; requestCount = saved.requestCount
            hasLocalEdits = !operations.isEmpty
        }
        do {
            let remote = try await client.personalIssue(id, owner: true)
            if hasLocalEdits {
                if requestKey != nil { await save(); return } // reconcile uncertain mutation through idempotent replay
                if remote.revision != baselineRevision { conflict = remote; saveDescription = "Review changes from another device" }
            } else { issue = remote; baselineRevision = remote.revision; saveDescription = "Saved" }
        } catch { self.error = error.localizedDescription }
    }
    func edit(_ operation: PublicationOperation, update: (inout PersonalIssue) -> Void) {
        guard var issue, conflict == nil else { return }
        guard ["DRAFT", "PUBLISHED"].contains(issue.status ?? "") else {
            error = "This issue uses an unsupported editing state. Please update Zine before changing it."; return
        }
        if operation["type"]?.string == "addSelection" && !issue.canAddSelections {
            error = "Published weekly issues cannot have new selections."; return
        }
        update(&issue); self.issue = issue
        let removedID = operation["selectionId"]?.string
        if operation["type"]?.string == "removeSelection", let removedID,
           requestKey == nil, operations.contains(where: { $0["type"]?.string == "addSelection" && $0["selectionId"]?.string == removedID }) {
            // An explicitly removed unsaved addition must not remain in the batch:
            // a private/invalid add would fail validation even if later removed.
            operations.removeAll { $0["selectionId"]?.string == removedID }
            for i in operations.indices where operations[i]["type"]?.string == "setOrder" {
                if case .array(let sections) = operations[i]["sections"] {
                    operations[i]["sections"] = .array(sections.map { value in
                        guard case .object(var section) = value, case .array(let ids) = section["selectionIds"] else { return value }
                        section["selectionIds"] = .array(ids.filter { $0.string != removedID }); return .object(section)
                    })
                }
            }
            rejectedEdits = false; error = nil; hasLocalEdits = !operations.isEmpty
            saveDescription = hasLocalEdits ? "Saved on this device" : "Saved"; persist(); return
        }
        rejectedEdits = false; error = nil
        // Coalesce only the unsent tail. Never change the body protected by a replay key.
        let protectedCount = requestCount ?? 0
        if ["setPresentation", "setCommentary", "setSectionHeading"].contains(operation["type"]?.string ?? ""),
           let index = operations.indices.last(where: { i in
               i >= protectedCount && operations[i]["type"] == operation["type"] &&
               operations[i]["selectionId"] == operation["selectionId"] && operations[i]["sectionId"] == operation["sectionId"]
           }) {
            operations[index] = operations[index].merging(operation) { _, new in new }
        } else { operations.append(operation) }
        hasLocalEdits = true
        saveDescription = "Saved on this device"
        persist()
    }
    func save(force: Bool = false) async {
        guard !isSaving, conflict == nil, (!rejectedEdits || force), let issue, !operations.isEmpty else { return }
        isSaving = true; error = nil; saveDescription = "Saving…"
        defer { isSaving = false }
        let count = requestCount ?? min(operations.count, 100)
        let key = requestKey ?? UUID().uuidString
        requestKey = key; requestCount = count; persist()
        do {
            let remote = try await client.mutatePersonalIssue(id, revision: baselineRevision, operations: Array(operations.prefix(count)), key: key)
            operations.removeFirst(min(count, operations.count)); baselineRevision = remote.revision
            requestKey = nil; requestCount = nil
            if operations.isEmpty { self.issue = remote }
            else { var local = self.issue ?? issue; local.revision = remote.revision; self.issue = local }
            hasLocalEdits = !operations.isEmpty; saveDescription = hasLocalEdits ? "Saved on this device" : "Saved"
            persist()
        } catch let e as PublicationRequestError where e.isConflict {
            conflict = try? await client.personalIssue(id, owner: true)
            error = "This issue changed on another device. Your edits are safely stored here."
            saveDescription = "Review conflict"
        } catch let e as PublicationRequestError where e.status >= 400 && e.status < 500 && e.status != 408 && e.status != 429 {
            // Preserve the rejected working copy; offer explicit recovery instead of
            // retrying a permanently invalid batch forever or silently dropping it.
            requestKey = nil; requestCount = nil; rejectedEdits = true; persist()
            self.error = e.localizedDescription; saveDescription = "Review rejected edits"
        } catch { self.error = error.localizedDescription; saveDescription = "Saved on this device · Retry sync" }
    }
    func useServerCopy() {
        guard let conflict else { return }
        issue = conflict; baselineRevision = conflict.revision; self.conflict = nil
        operations = []; requestKey = nil; requestCount = nil; hasLocalEdits = false; rejectedEdits = false; error = nil
        saveDescription = "Saved"; persist()
    }
    func applyLocalEditsToLatest() async {
        guard let conflict else { return }
        baselineRevision = conflict.revision; issue?.revision = conflict.revision; self.conflict = nil
        requestKey = nil; requestCount = nil; publishKey = nil; persist()
        await save()
    }
    func publish() async -> PersonalIssue? {
        while hasLocalEdits && conflict == nil {
            let oldCount = operations.count
            await save()
            if operations.count >= oldCount { return nil }
        }
        guard let issue, conflict == nil else { return nil }
        isSaving = true; defer { isSaving = false }
        let key = publishKey ?? UUID().uuidString; publishKey = key
        do {
            let published = try await client.publishPersonalIssue(issue, key: key)
            self.issue = published; baselineRevision = published.revision; error = nil
            cache.remove(id); saveDescription = "Published"; return published
        } catch { self.error = error.localizedDescription; return nil }
    }
    private func persist() {
        guard let issue else { return }
        do { try cache.save(.init(issue: issue, baselineRevision: baselineRevision, operations: operations, requestKey: requestKey, requestCount: requestCount)) }
        catch { self.error = "Couldn’t save edits on this device: \(error.localizedDescription)" }
    }
}
