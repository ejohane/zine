import Foundation
import Observation

/// Shared by copies of one authenticated API client. Preserve field patches across
/// cached/in-flight loads; never replace unrelated progress, tags, or metadata.
@MainActor
@Observable
final class BookmarkMutationState {
  struct Patch {
    var isFinished: Bool
    var finishedAt: String?
    var state: String
  }
  struct Transaction {
    let id: String
    let version: Int
    let previous: Patch
  }
  private struct Entry {
    var patch: Patch
    var version: Int
    var intentVersion: Int
    var pending: Bool
  }
  @ObservationIgnored private var knownStates: [String: Patch] = [:]
  private var entries: [String: Entry] = [:]
  private(set) var revision = 0
  nonisolated init() {}

  func begin(_ bookmark: Bookmark, finished: Bool? = nil, state: String? = nil) throws
    -> Transaction
  {
    try begin(
      id: bookmark.id,
      previous: Patch(
        isFinished: bookmark.isFinished, finishedAt: bookmark.finishedAt, state: bookmark.state),
      finished: finished, state: state)
  }

  func begin(id: String, previous fallback: Patch, finished: Bool? = nil, state: String? = nil)
    throws -> Transaction
  {
    guard entries[id]?.pending != true else { throw CommandError("bookmark_mutation_in_progress") }
    let previous = entries[id]?.patch ?? knownStates[id] ?? fallback
    var patch = previous
    if let finished {
      patch.isFinished = finished
      patch.finishedAt = finished ? Date().formatted(.iso8601) : nil
      if finished { patch.state = "BOOKMARKED" }
    }
    if let state { patch.state = state }
    revision += 1
    entries[id] = Entry(patch: patch, version: revision, intentVersion: revision, pending: true)
    return Transaction(id: id, version: revision, previous: previous)
  }

  func commit(_ transaction: Transaction, isFinished: Bool? = nil, finishedAt: String? = nil) {
    guard var entry = entries[transaction.id], entry.version == transaction.version else { return }
    revision += 1
    entry.version = revision
    entry.intentVersion = revision
    entry.pending = false
    if let isFinished {
      entry.patch.isFinished = isFinished
      entry.patch.finishedAt = isFinished ? finishedAt : nil
    }
    entries[transaction.id] = entry
  }

  func rollback(_ transaction: Transaction) {
    guard entries[transaction.id]?.version == transaction.version else { return }
    revision += 1
    entries[transaction.id] = Entry(patch: transaction.previous, version: revision, intentVersion: revision, pending: false)
  }

  /// A read started after the last commit can reconcile external changes. Older
  /// responses and reads overlapping a save cannot overwrite local intent.
  func reconcile(_ bookmarks: [Bookmark], startedAt: Int) {
    for bookmark in bookmarks {
      if entries[bookmark.id] == nil {
        knownStates[bookmark.id] = Patch(
          isFinished: bookmark.isFinished, finishedAt: bookmark.finishedAt, state: bookmark.state)
      }
      guard let entry = entries[bookmark.id], !entry.pending, entry.version <= startedAt else {
        continue
      }
      let patch = Patch(
        isFinished: bookmark.isFinished, finishedAt: bookmark.finishedAt, state: bookmark.state)
      guard
        patch.isFinished != entry.patch.isFinished || patch.finishedAt != entry.patch.finishedAt
          || patch.state != entry.patch.state
      else { continue }
      revision += 1
      entries[bookmark.id] = Entry(patch: patch, version: revision, intentVersion: entry.intentVersion, pending: false)
    }
  }

  func patch(for id: String) -> Patch? { entries[id]?.patch }
  func isPending(id: String) -> Bool { entries[id]?.pending == true }

  func overlay(_ bookmark: Bookmark) -> Bookmark {
    guard let patch = entries[bookmark.id]?.patch else { return bookmark }
    var result = bookmark
    result.isFinished = patch.isFinished
    result.finishedAt = patch.finishedAt
    result.state = patch.state
    return result
  }

  func overlay(_ bookmarks: [Bookmark]) -> [Bookmark] { bookmarks.map { overlay($0) } }

  func includesInCollection(id: String, membership: CollectionCompletionMembership?) -> Bool {
    guard let patch = entries[id]?.patch else { return true }
    return patch.state == "BOOKMARKED"
      && (membership?.includes(id: id, isFinished: patch.isFinished) ?? true)
  }

  func shouldRetain(id: String, after readRevision: Int) -> Bool {
    guard let entry = entries[id] else { return false }
    return entry.pending || entry.intentVersion > readRevision
  }

  var changedIDs: Set<String> { Set(entries.keys) }

  var hiddenUnfinishedIDs: Set<String> {
    Set(
      entries.compactMap { id, entry in
        entry.patch.isFinished || entry.patch.state != "BOOKMARKED" ? id : nil
      })
  }
}

/// Query-local membership fences. Keep restoration snapshots without treating a
/// field patch as permanent proof that a row belongs in a refreshed page.
struct BookmarkMembershipSnapshot {
  private var omissions: [String: Int] = [:]
  private var queuedIDs: Set<String> = []

  mutating func accept(previousIDs: [String], receivedIDs: [String], startedAt: Int,
                       queuedIDs: Set<String>) {
    self.queuedIDs = queuedIDs
    let received = Set(receivedIDs)
    for id in previousIDs where !received.contains(id) { omissions[id] = startedAt }
    for id in received { omissions.removeValue(forKey: id) }
  }

  mutating func includeReturned(_ ids: [String]) {
    for id in ids { omissions.removeValue(forKey: id) }
  }

  @MainActor func includes(_ id: String, state: BookmarkMutationState) -> Bool {
    guard let revision = omissions[id] else { return true }
    return queuedIDs.contains(id) || state.shouldRetain(id: id, after: revision)
  }
}
