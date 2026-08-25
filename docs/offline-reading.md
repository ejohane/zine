# Offline article reading

Zine automatically keeps a bounded, text-first copy of unfinished readable articles on the
authenticated user's iPhone. There is no offline mode or required download action.

## Synchronization contract

- On authenticated launch and each foreground transition, the native app reads up to 250 of the
  user's newest unfinished bookmarks through the Clerk-authenticated `/api/v1` REST boundary.
- Every Web or RSS article that opens in the Zine reader is checked and stored locally. A successful
  check remains fresh for 24 hours; unavailable bodies are also backed off for 24 hours.
- Library metadata, readable article bodies, and thumbnail/avatar images are refreshed
  opportunistically. The metadata and article stores use complete file protection, are excluded
  from device backups, and are isolated by Clerk user ID.
- Article bodies use one protected file per bookmark plus a small manifest. This keeps progress
  writes and individual body refreshes from rewriting the complete offline corpus.
- Signing out removes the user's offline Library metadata, article documents, refresh manifest,
  pending progress, pending bookmark mutations, and cached tag names from the device.

The synchronizer is foreground-opportunistic. iOS does not guarantee that it will finish after the
app is suspended or terminated, and this phase does not add `BGTaskScheduler` or a manual download
queue.

## Offline behavior

- Library shows its last complete local snapshot when the network request fails.
- The reader presents a cached readable body immediately and preserves it when revalidation fails.
- Reading progress is written locally first. A failed API write remains in a last-write-wins outbox
  and is replayed on the next foreground synchronization.
- Completion, tags, and archive/removal are also local-first. They update the visible Library,
  detail, reader, and cached Home state immediately, survive app termination, and replay in order
  on the next foreground synchronization.
- Repeating an offline completion or tag change keeps only the newest value for that property.
  Archive/removal supersedes other pending changes for the same bookmark. A transient connection or
  server failure keeps the mutation queued; a permanent API rejection removes it and restores the
  visible state through the existing mutation error handling.
- Tag names seen while online are cached per account so the tag editor remains useful offline. A new
  tag created offline is available immediately and receives its server identity after replay.
- Adding a new bookmark, inbox triage, collection changes, subscription settings, external links,
  and Open Original remain online operations.
- Inline article images still use their normalized remote URLs. Thumbnails and creator images use
  the app image cache, but inline media is not guaranteed offline.
- Substack remains an external-reader provider and is not downloaded by this feature.

## Verification

Completion requires a cold-launch airplane-mode journey, not only unit tests:

1. Launch signed in while the configured API is reachable and allow foreground synchronization to
   finish.
2. Open Library and a readable Web or RSS article.
3. Terminate the app and make the configured API unreachable.
4. Relaunch, open Library, and reopen the same article from the cached snapshot.
5. Change reading position while offline, relaunch offline, and confirm the local position returns.
6. While still offline, change completion and tags, terminate and relaunch, and confirm those values
   remain visible. Verify archive/removal with a disposable bookmark when destructive testing is
   appropriate.
7. Restore connectivity, foreground the app, and confirm queued progress and bookmark mutations
   reach the API without the refreshed server response briefly restoring stale values.
