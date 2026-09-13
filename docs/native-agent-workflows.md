# Native CLI workflow coverage

Start with [the developer quickstart](native-cli-development.md) for everyday setup,
development, and adding coverage.

The `zine-native` developer CLI shares Zine's canonical native sources. It runs
controlled scenarios on macOS and sends commands to the explicitly enabled local
Simulator bridge. See [setup and transport](native-agent-experiment.md).

## Regression suite

```sh
bun run test:native:core
bun run native:agent scenario run all
```

The suite runs, sequentially with fresh isolated persistence:

| Scenario             | Assertions                                                                                                                                                                           |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `reader-offline`     | Offline progress, tags, completion, then successful replay.                                                                                                                          |
| `reader-rollback`    | Permanent tag/completion rejection restores reader and Library.                                                                                                                      |
| `reader-recovery`    | Fresh cache/outbox/store instances recover pending progress and tags; readable cache survives offline/unreadable refresh; uncached failure and unavailable content recover on retry. |
| `library-workflows`  | Search/filter combinations, pagination, end-of-list, stale-page exclusion during query changes, empty results, mark unfinished, and cached offline results.                          |
| `bookmark-lifecycle` | URL validation, duplicate save, article-body status, detail tag persistence, rejected archive, offline archive, restore, and re-save.                                                |
| `sync-workflows`     | Job creation, new item visibility after completion, no new items, partial failure, disconnected providers, timeout, resume without creating a duplicate, and missing job.            |

A scenario succeeds only when its assertions pass. Some recorded commands are
expected to fail (for example, a deliberately rejected mutation). A successful
scenario process therefore does not mean every command in its JSON is successful.

## Live commands

Every command below uses the same prefix:

```sh
bun run native:agent remote SIMULATOR_UUID COMMAND --expect-session SESSION
```

Inspect `identity` first. Verify the worktree, build, Simulator, local API endpoint,
and expiry. Keep requests serial. `state.get` returns the current structured state;
`events.get` returns the bounded event history. Ordinary failed commands exit 1.

### Reader recovery

- `reader.retry [--id BOOKMARK_ID]`: reload the active reader, including failed or
  unavailable states, through the same store used by the UI's retry action.
- `app.restart`: terminate and relaunch the installed Simulator app, retain its
  persistence, and wait for a new bridge identity with the same build/worktree/API.
  The result is an identity, not a command-state envelope. Use its new session ID
  for subsequent commands, then reopen the bookmark and reader normally.
- Reader state includes `readerPhase`, `readerContentSource` (`cache` or `network`),
  `readerError`, `progressFraction`, tags, completion, and pending writes.

The deterministic restart scenario recreates in-memory objects over persisted
files. The live restart command performs a real app-process restart. Neither
implicitly restores navigation; reopen using `bookmark.open` then `reader.open`.
Progress recording is still a persistence command, not a scroll gesture.

### Library

```sh
# Full query replacement; search and isFinished are required JSON fields.
bun run native:agent remote SIMULATOR_UUID library.query --expect-session SESSION \
  --query '{"search":"thick","isFinished":false,"contentType":"ARTICLE"}'
```

- `library.query --query JSON`: replace the query and wait for the native view's
  matching reload to finish. Nonempty search selects the actual Search tab.
  Optional `provider` and `contentType` use the native uppercase enum values.
- `library.open`: open Library and reset to the default unfinished query.
- `library.next`: wait for existing loading, then request the next page. At the
  end of the list it completes without adding items. The UI can also auto-load.
- `library.finished.set --id ID --finished true|false`: update a currently listed
  item using the native API/outbox and reconcile the displayed list.
- `bookmark.open --id ID`: open any supported content type's native detail.

State exposes `libraryQuery`, `libraryItems`, `libraryIDs`, `libraryNextCursor`,
`libraryLoading`, `librarySource`, and `libraryError`. An offline cached query
returns `local_pending`; failure without cached results returns `failed`.

### Bookmark lifecycle

- `bookmark.save --url URL`: save a valid HTTP(S) URL through the existing native
  API client. Inspect `savedBookmarkID` and `saveStatus` (`created`,
  `already_bookmarked`, or `rebookmarked`). Saving does not change navigation.
- `bookmark.open --id ID`, then `bookmark.get`: open and refresh the active detail.
- `bookmark.content.status`: inspect the active bookmark's article-body pipeline
  status in `articleBody`; this does not request extraction or claim readability.
- `bookmark.tags.set --tags '["tag"]'`: replace the active detail's tags.
- `bookmark.archive`: archive the active detail through the same action as its
  bookmark button. Reports `server_committed` or `local_pending`.
- `bookmark.restore`: re-save an archived active detail. It requires connectivity;
  successful restoration supersedes an older queued archive.

Detail mutations accept an optional `--id` assertion. `detail` reports the actual
visible bookmark state. The detail tag button now opens the same editor used by
the reader. Removal uses the existing recoverable archive model; this CLI does
not introduce permanent deletion. URL save can fetch public metadata through the
local Worker, so it is not a fully offline operation.

### Sync jobs

- `sync.start`: create or attach to a job through `/api/v1/sync-jobs` and return its
  initial status. `accepted` means it is still running.
- `sync.active`: discover the server's active job.
- `sync.status [--job ID]`: inspect a specific or last-known job.
- `sync.wait [--job ID] [--timeout SECONDS]`: poll until terminal, up to 40 seconds.
  Timeout returns a failure with the job ID; the backend job continues. Repeat
  `sync.wait --job ID` to resume observation without starting another job.
- On terminal status/wait, reload the registered Library using its current query.
- `sync.flush` remains separate: replay local progress and bookmark mutations.

`syncJob` contains counts, progress, item count, and provider errors. A completed
job with nonzero failures **or any errors** returns failure, including the
backend's zero-subscription/disconnected-provider case. Items may arrive in Inbox
instead of Library when a subscription does not auto-bookmark; `itemsFound` is not
a promise that every item was saved.

These async jobs currently cover the backend's YouTube/Spotify subscription job
system. RSS, Gmail, and X have separate provider-specific endpoints and are not
silently represented as part of that job.

## Verification of this extension

Implementation proceeded reader → Library → bookmark lifecycle → sync, with a
live pass before advancing to each next workflow.

- Desktop: all six scenarios and 19 tests (including shared persistence tests) pass.
- Native: 32 focused reader/cache/outbox tests pass; Debug builds install and launch on
  `iPhone 17 — Zine Agent` using `dev:worktree`.
- Browser: live `serve-sim` frames plus real taps and scrolling verified restored
  article position after process restart, Search result navigation, empty search,
  filters, detail tag editing, archive, re-save, and Library interaction after sync.
- Live commands: video query returned 30 loaded items and pagination returned 60
  unique IDs; a real scroll restored at approximately 55% after app restart;
  URL save returned `created`, then archive/re-save returned `rebookmarked`.
- Backend: 315 focused sync-service and REST tests pass.
- Repository lint, formatting, typecheck, and build pass. Release Simulator build
  passes and contains none of the bridge activation/mailbox markers.
- Local sync: the sanitized connections produced `YOUTUBE not connected` and
  `SPOTIFY not connected`; CLI reported failure and retained the real job ID.
  Successful provider ingestion, partial failures, and timeout/resume were tested
  with controlled responses, not live external-provider credentials.

The bridge remains Debug-Simulator-only, opt-in, loopback-only, capability-scoped,
and expiring. The CLI does not read installed-app caches or export app credentials.
