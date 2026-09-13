# Native CLI developer quickstart

Use `zine-native` to develop and test Zine's native business logic from the
terminal. SwiftPM compiles the app's canonical Swift sources into `ZineCore`;
the CLI invokes the same stores, API client, caches, and mutation outbox.

## Choose a verification mode

| Mode                         | Use it for                                                                                             | Requirements and limits                                                                                   |
| ---------------------------- | ------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------- |
| Headless tests and scenarios | Fast regression checks for reader recovery, Library queries, bookmark lifecycle, and sync-job handling | macOS 14+ and a Swift 5.10+ toolchain; isolated fixtures, no Simulator, Worker, login, or production data |
| Remote Simulator commands    | Real app stores, navigation, persistence, and authenticated local API integration                      | Running Debug Simulator app with the bridge explicitly enabled and a local loopback Worker                |
| Live UI interaction          | Gestures, rendering, keyboard input, navigation presentation, and visible recovery                     | Live `serve-sim` frame, Browser computer-use interaction, and an observed final state                     |

Headless runs do not fetch live account data or prove external-provider ingestion.
They do not render SwiftUI or WebKit. Remote commands do not prove that a user
gesture works. The CLI is a developer tool, not a production account CLI.

## Everyday headless loop

Run from the repository root on macOS with the Swift toolchain selected
(`swift --version`) and the repository's Bun version (`bun@1.3.4`).
The native package itself needs no Bun dependency install, credentials, or
local-data provisioning. Bun provides convenient wrappers around SwiftPM:

```sh
bun run test:native:core
bun run native:agent scenario run all
```

The direct equivalents are `swift test --package-path apps/ios` and
`swift run --package-path apps/ios zine-native scenario run all`.

1. Change the canonical native implementation, not a duplicate in the harness.
2. Add or adjust a regression assertion for the behavior being changed.
3. Iterate with a focused test or scenario:

   ```sh
   swift test --package-path apps/ios --filter CoreTests.testReaderRestartAndMissingContentRecovery
   bun run native:agent scenario run reader-recovery
   ```

4. Run both complete commands above before publishing. Apply the repository's
   other checks to the affected code. These commands are separate from the root
   `bun run test` Worker/web suite.
5. For changes affecting app integration, lifecycle, navigation, or UI, also
   run applicable Xcode tests and the live workflow below. Headless-only
   regression work does not require launching the local stack.

See [workflow coverage](native-agent-workflows.md#regression-suite) for the six
scenario names and assertions. Each scenario creates isolated persistence and
controlled HTTP responses. The complete CLI suite runs scenarios serially.

CLI stdout is JSON; Swift/Bun build diagnostics may appear on stderr. For an
artifact, redirect stdout to a file under gitignored `.local-data/`:

```sh
mkdir -p .local-data/native-cli
bun run native:agent scenario run all > .local-data/native-cli/scenarios.json
```

A single scenario returns an array of command results; `all` returns an object
keyed by scenario name. An assertion failure exits 1. An expected rejected
command can appear inside a passing scenario, so inspect scenario assertions
and the process exit status rather than requiring every nested status to succeed.
Ordinary failed remote commands exit 1. Avoid pipelines that hide that exit code.

## Switch to the running app

Follow [authenticated local setup](local-development.md) and the repository's
local-development skill. Choose an available Simulator UUID with
`xcrun simctl list devices available`; use a dedicated device when another task
owns the default one. Replace the placeholders below with that device's UUID
and name:

```sh
SIMCTL_CHILD_ZINE_AGENT_BRIDGE=1 \
ZINE_DEV_HOST=localhost \
ZINE_SIMULATOR_UDID=SIMULATOR_UUID \
ZINE_SIMULATOR_NAME='SIMULATOR_NAME' \
bun run dev:worktree
```

Open the exact printed `serve-sim` URL in the Codex in-app Browser, confirm a
live frame, and sign in through native Clerk. In another terminal:

```sh
bun run native:agent remote SIMULATOR_UUID identity
bun run native:agent remote SIMULATOR_UUID library.open --expect-session SESSION
bun run native:agent remote SIMULATOR_UUID state.get --expect-session SESSION
```

Use the session returned by `identity` only after checking its worktree, build,
Simulator, endpoint, and expiry. Requests must be serial. The bridge expires
after 15 minutes; relaunch with bridge activation and inspect the fresh identity
before continuing. `app.restart` returns a new identity and session. A timeout
can mean an unknown mutation outcome: inspect state before retrying.

Remote commands can mutate the authenticated local dataset. Use disposable
bookmarks where possible and clean them up after testing. Local URL saves can
fetch public metadata; sync jobs depend on configured providers. The async sync
workflow currently covers YouTube/Spotify jobs, not RSS/Gmail/X ingestion.

Use [the command reference](native-agent-workflows.md#live-commands) and
[the result/transport contract](native-agent-experiment.md#version-1-contract)
for arguments, delivery states, timeout recovery, and scope. Inspect the relevant
visible UI after actual taps/scrolling before claiming UI verification. Stop only
this task's dev stack and preview when finished, unless keeping a session open
was requested.

If identity is missing, check the installed Debug Simulator build, bridge launch
environment, signed-in app state, and HTTP loopback API target. Production,
Tailscale, physical-device, and Release targets cannot enable this bridge.

## Add a command or regression scenario

Paths below are relative to `apps/ios`:

1. Keep business behavior in canonical stores/services under `ZineNative`.
   `Package.swift` selects shared source files explicitly; update its source
   selection when introducing a shared file outside an included directory.
   Inject platform-specific effects instead of importing SwiftUI into the core.
2. For a command, extend `Core/Automation/NativeCommandSession.swift` under
   `ZineNative`, including argument validation, actual completion boundaries,
   state, and delivery receipts. Add argument parsing to `NativeCLI.swift` when
   needed. Wire live stores/navigation callbacks in the app composition or
   relevant view; do not create a second live store just for commands.
3. For a scenario, follow a focused file such as
   `ZineNative/Core/Automation/ReaderRecoveryScenario.swift`: isolated temporary
   storage, controlled transport, canonical stores, and assertions on observable
   outcomes. Cover meaningful failure/recovery paths and clean up fixture state.
4. Register a new scenario in `NativeScenario.run` and the `scenario run all`
   list/usage in `NativeCLI.swift`. Add a regression test in
   `CoreTests/CoreTests.swift`. Keep shared fixture transport runs serial.
5. Run the focused test/scenario, then both full headless commands. For new live
   wiring, verify the real app with remote commands plus the relevant UI journey.
   When changing bridge guards, also verify a Release build excludes the bridge.
6. Update the command reference and coverage table with inputs, completion
   boundary, offline/rejection behavior, and verification limits.

Record automated assertions, remote command results, native build/install/launch,
and live UI observations separately. Prior verification notes in the experiment
documents are historical evidence, not proof that a new change has passed.
