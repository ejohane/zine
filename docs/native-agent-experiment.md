# Native agent experiment 1

This experiment exposes the existing native Library and reader business logic to a
macOS command line and to a deliberately enabled local Simulator session. It covers
Library → bookmark detail → reader → progress → replace tags → complete → reload
unfinished Library. It is not a general app automation API or a migration framework.

## Run deterministic coverage

From the repository root:

```sh
bun run test:native:core
bun run native:agent scenario run reader-offline
bun run native:agent scenario run reader-rollback
```

The scenarios use the actual APIClient, LibraryStore, ArticleReaderStore,
ArticleBodyCache, LibraryCache, and OfflineBookmarkMutationOutbox, with URLProtocol
fixtures and a fresh temporary persistence directory per run. They do not use an
installed app's cache or an HTTP-only reimplementation of native behavior.
`reader-rollback` succeeds as a scenario when its final command reports the expected
permanent rejection and the unfinished Library and reader reconcile correctly.

SwiftPM compiles an explicit selection of the canonical iOS source files as
`ZineCore`; Xcode compiles those same files into `ZineNative`. There are no copied
business-logic sources. This deliberately avoids making all app models public or
moving the whole app into packages. SwiftUI, WebKit, Clerk, image loading, and
platform lifecycle remain in the iOS composition. Library image prefetching is an
injected effect, supplied by the normal UI.

## Run against the visible app

Use the authenticated local setup described in [local-development.md](local-development.md).
Use a dedicated simulator if another task is using the default one. The bridge
requires an HTTP loopback Worker; Tailscale and production endpoints are rejected.

```sh
SIMCTL_CHILD_ZINE_AGENT_BRIDGE=1 \
ZINE_DEV_HOST=localhost \
ZINE_SIMULATOR_UDID=<simulator-uuid> \
ZINE_SIMULATOR_NAME='iPhone 17 — Zine Agent' \
bun run dev:worktree
```

Open the exact serve-sim URL printed by the command. Sign in through the normal
native Clerk screen with the allowlisted account. The local dataset retains the
real Clerk subject and sanitizes provider credentials. No interactive auth bypass
or exported app token is used. The startup checks the installed app's API URL.

Inspect identity first:

```sh
bun run native:agent remote <simulator-uuid> identity
```

Check its `worktree`, `simulator`, executable SHA-256 `build`, `endpoint`, and expiry.
Every subsequent remote command requires the returned session ID:

```sh
bun run native:agent remote <simulator-uuid> library.open --expect-session <session>
bun run native:agent remote <simulator-uuid> bookmark.open --id <bookmark-id> --expect-session <session>
bun run native:agent remote <simulator-uuid> reader.open --id <bookmark-id> --expect-session <session>
bun run native:agent remote <simulator-uuid> reader.progress.record --fraction 0.42 --expect-session <session>
bun run native:agent remote <simulator-uuid> reader.tags.set --tags '["native", "reading"]' --expect-session <session>
bun run native:agent remote <simulator-uuid> reader.complete --expect-session <session>
bun run native:agent remote <simulator-uuid> sync.flush --expect-session <session>
bun run native:agent remote <simulator-uuid> library.open --expect-session <session>
```

`state.get` and `events.get` return the current snapshot and bounded event window.
An optional `--id` on reader mutations asserts which active reader is intended.
No command retrieves app credentials. The CLI accesses only the simulator mailbox,
never cache/outbox files. Keep commands serial; a client lock rejects overlapping
CLI processes, and the app rejects concurrent command execution.

## Version 1 contract

Results contain `version`, a generated `requestID`, monotonic session `revision`,
`status`, `state`, up to 128 `events`, and an optional `error`. Each event has its
revision, request ID, command/action name, and status. Native observed store changes
use request ID `ui`. Revisions order observed command lifecycle and relevant store
changes; they are not a server database version or a complete analytics stream.
Poll `events.get` to follow changes; discard already-seen revisions. Older events
are evicted. A new session resets revisions.

| Command                  | Completion boundary                                                                                                                                                                                                    |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `library.open`           | Select Library, reset its filters, pop destinations, await unfinished reload/cache save. Cached fallback may be shown when offline.                                                                                    |
| `bookmark.open`          | Fetch the bookmark through the native client, push actual detail, await registered detail navigation.                                                                                                                  |
| `reader.open`            | Requires the selected bookmark; invokes its actual reader presentation and awaits ready article content, or fails on terminal load/unavailable/timeout.                                                                |
| `reader.progress.record` | Validate finite fraction in 0…1, stage locally, await the real ordered progress write/retry, call the same parent progress callback. This is not a scroll gesture.                                                     |
| `reader.tags.set`        | Replace the complete tag set through the reader store; normalize whitespace and case-insensitive duplicates, validate 20 tags/32 characters, await native API/outbox handling, update visible tags.                    |
| `reader.complete`        | Complete an unfinished active reader via the same optimistic operation and parent callbacks as its button. Already finished is an error, not a toggle.                                                                 |
| `sync.flush`             | Await one ordered progress/outbox replay pass, reload unfinished Library, reconcile the active reader if fetch succeeds, report retained work or permanent rejection. Always waits; no separate `--wait` is necessary. |

`accepted` is emitted before execution. `server_committed` means that mutation's
HTTP response succeeded, using a receipt from the actual request rather than
inferring success from an empty outbox. `local_pending` means native offline
handling retained work. `failed` includes validation, navigation, and permanent
rejection. `completed` is used for navigation, snapshots, and a replay pass with no
retained work/rejections; it is not a mutation receipt. Reader tags/progress fields
are meaningful while a reader is attached. Library IDs describe the current loaded
page, not the entire account.

The CLI waits up to 60 seconds. A timeout means **outcome unknown**: inspect state
before deciding what to do. Commands are not a durable, deduplicated job queue.
The existing progress cache retains failed progress writes for later retry, including
permanent HTTP rejection; the permanent rollback scenario asserts tags and completion.
This experiment does not change that existing progress policy.
The flush boundary does not wait for unrelated Home requests, image prefetching,
article warmup, or every SwiftUI task. UI gestures may run concurrently with a
command, so callers should avoid editing the same reader at the same time.

## Remote boundary

The transport is a simulator-container mailbox polled by the live app on the main
actor. It is compiled only under `DEBUG && targetEnvironment(simulator)`, explicitly
enabled with the launch environment above, and scoped to a 15-minute capability,
simulator UUID, build hash, source worktree, API endpoint, and fresh session UUID.
The containing directory has mode 0700. Requests are bounded to 64 KiB. Identity
output omits the capability. There is no network listener or physical-device bridge.
Relaunching changes the capability/session; expiry or task cancellation disables
processing. Close the preview and stop its scoped dev processes after verification.

The UI registers its existing LibraryStore and ArticleReaderStore instances and
navigation/action closures in NativeCommandSession. Commands never instantiate a
second live reader or read/write its persistence files from macOS. Headless fixture
composition creates its own isolated stores, with the same dispatcher.

## Evidence and limits

On 2026-09-12 in worktree 703a:

- 15 desktop tests passed: 5 command/scenario tests, 7 existing outbox tests, 3 cache tests.
- 29 focused iOS tests passed with parallel simulator cloning disabled. An initial
  clone-based run failed because XCTest could not find its cloned device.
- Debug build, Simulator install, and launch passed. Installed API was verified as
  `http://localhost:8747`; unauthenticated requests returned 401.
- Real Clerk login and local sanitized D1/R2 were exercised. The copied stopped
  authentication-task dataset contains 4,261 user items and 582 local article bodies.
- Bridge Library/detail/reader commands, progress 0.42, tag replacement, completion,
  flush, and unfinished reload passed against the authenticated local Worker.
- The live serve-sim frame showed the actual reader; a physical-style pointer swipe
  moved WebKit content, and a back swipe revealed the changed tag and completion
  checkmark on detail. Reloaded Library visibly omitted the completed article.
- Reopening the reader returned progress 0.42 and the saved tag/completion state.
- On the final Debug build, a real tap selected Podcasts; `library.open` reset the
  visible filter to All and restored the full unfinished page.
- Offline/reconnect and permanent-failure rollback were verified deterministically
  on desktop, not by disabling the live simulator's network.
- Release Simulator build passed. Executable inspection found none of
  `ZINE_AGENT_BRIDGE`, `SimulatorCommandBridge`, or the mailbox filenames.
- Five local-data/process preparation tests, six auth middleware tests, and Worker lint/typecheck passed.

Warm executable scenario runs took approximately 0.70 seconds (offline/reconnect)
and 0.56 seconds (rejection), including the existing 500 ms progress retry. The
15-test desktop suite executes in about 1.1 seconds after build. The serial iOS
29-test run used about 17 seconds of XCTest launch/execution overhead in the first
successful sample; test bodies took about 0.8 seconds. Live commands took roughly
0.8–2.1 seconds including `simctl` discovery and real network work. These are different
coverage levels, not an assertion that UI or network checks can run in milliseconds.

Raw command results and streamed screenshot evidence are retained locally in
`.local-data/native-agent-evidence/`. No merge, production deployment, phone install,
full application parity review, or broad benchmark was performed.

## Coordinated dependencies

The authenticated-development task supplied the startup/data/process-cleanup scripts, Worker auth
middleware and bindings, Worker dev environment flag, and Turbo environment wiring
used for the local integration. Its selected uncommitted snapshot was copied from
worktree 1e87 after that task verified native login/data and stopped its services.
These prerequisite changes are present in this worktree; review them as that task's
work rather than attributing them to the CLI implementation. Its web-login changes
are separate. The reader redesign task's ongoing chrome/fonts/passage-anchor changes
were not copied; merging the two reader/store changes needs deliberate review later.

## Context

Shopify describes desktop-headless native business logic and remote simulator
commands in [Back to native](https://shopify.engineering/back-to-native), and
structured app events/state plus command-based debugging in
[Shop app migration](https://shopify.engineering/shop-app-migration).
Those posts motivate this experiment. They do not publish transport/module
implementation details; the mailbox and source-target design are Zine's own
narrowly scoped choices.
