---
name: zine-local-development
description: Run and visually verify Zine in a local worktree with the repo-owned dev stack, canonical native iOS app, and computer use directly in Apple Simulator. Use for every Zine request to implement, run, test, verify, debug, inspect, or visually review local runtime behavior, including prompts phrased only as "test it", "verify it", "run locally", or "check the UI".
---

# Zine Local Development

Choose the verification mode for the claim being tested. Use the headless loop
for native business-logic iteration, then the worktree-safe stack for live native
integration and UI verification. Direct Simulator interaction and visible observation are required
when claiming UI behavior works.

## Headless native development

Follow `docs/native-cli-development.md`. From the repository root, run
`bun run test:native:core` and `bun run native:agent scenario run all`. These
compile canonical native sources on macOS with isolated transport/persistence
fixtures; they require no Simulator, Worker, Clerk login, or production data.
Run a focused scenario during edits and the full suite before publishing.

Headless-only regression work does not require starting the live stack below.
For changes affecting app integration, lifecycle, navigation, or UI, also use
the live workflow and focused Xcode tests as applicable. The remote CLI controls
the actual Debug Simulator app; it is not headless coverage. Keep fixture
assertions, remote command results, and observed UI behavior separate.

## Required live workflow

1. Work from the repository root and install dependencies with `bun install`
   when `node_modules` is missing or stale.
2. Use real Clerk login with the shared `agent-secrets` skill and the allowlisted
   Zine credentials. Never use screenshot fixtures or auth bypass as manual
   runtime evidence. See `docs/local-development.md`: first startup provisions
   sanitized D1/R2 only when no state exists; existing state is preserved.
   For an explicit refresh stop this worktree's Worker, run
   `bun run data:prod:local -- --yes --include-article-bodies`, then restart.
   Preserve the authenticated account ID (or set `ZINE_LOCAL_USER_ID` to the
   actual alternate Clerk subject). Never copy live OAuth tokens.
3. For Simulator development, start with `ZINE_DEV_HOST=localhost bun run dev:worktree`. This command owns the
   worker, web, API proxy, and native build/install/launch lifecycle. It opens the
   selected device in Apple Simulator. Coordinate device ownership with other
   active tasks; use a dedicated alternate when needed.
4. Use the native computer-use tool to select the Apple Simulator app and read
   its returned documentation before interacting. Confirm the selected device
   is `iPhone 17 — Zine` or the explicitly chosen alternate, and the foreground
   app is `Zine Native` with bundle `app.zine.native`. If multiple device windows
   are open, select the correct one from the current window inventory.
5. Exercise the relevant user journey directly in Simulator with computer use:
   taps, swipes, typing, and navigation. Follow the tool's current API rather
   than assuming older names. See `docs/local-development.md` for secure native
   credential entry. For Clerk fields exposed as `(settable)`, prefer the native
   `setValue` action with a fresh element index; this works for the email and
   secure password fields. Verify actual input and an enabled Continue control
   before submitting. Keep credential-bearing accessibility state private and return only boolean
   checks or filtered control metadata. Generic typing/paste success alone is
   insufficient.
6. Inspect fresh visible state after each material interaction. Capture a
   screenshot for the final relevant state and for each appearance or screen
   variant required by the task.
7. Run focused automated tests and repository gates appropriate to the change.
   Automated tests complement the interactive pass; they do not replace it.

## Verification contract

Do not call native UI behavior verified from build output, unit tests,
`simctl`, logs, installation, launch, or a static Simulator screenshot alone. Verification requires computer
use directly in the Simulator app and visible observation of the relevant behavior.

Report these states separately:

- authenticated login and actual Clerk subject
- sanitized local D1/R2 provisioning or reuse, and confirmed local API target
- automated tests and checks
- native build
- simulator install
- app launch
- direct Simulator computer-use interaction performed
- final UI state visibly observed

For worker or shared-code changes that can affect the native client, include a
native smoke path through this workflow. For strictly web-only behavior, use
the local web URL in the Codex Browser for the relevant flow; the default
`dev:worktree` Simulator startup may remain a smoke check but is not proof of
web behavior.

## Lifecycle and exceptions

- Keep `dev:worktree` and the Simulator app alive when the user wants an ongoing
  development session. Otherwise stop its orchestrator and confirm that the
  Worker, web, archive, and proxy (if used) ports are released. The Simulator
  can remain open for inspection.
  `scripts/dev-processes.sh` handles SIGINT/SIGTERM/SIGHUP and stops tracked
  Bun/Turbo descendants even without a TTY. Do not use blanket process-name
  kills or interfere with another task's services.
- Use `ZINE_SKIP_IOS_BUILD=1 bun run dev:worktree` only when an already
  installed native build is intentionally sufficient. Startup must confirm both the app and share extension
  installed API URLs match the selected local Worker.
- Use `ZINE_SIMULATOR_NAME` or `ZINE_SIMULATOR_UDID` for an explicit alternate
  Simulator. If the host cannot run Apple Simulator or native computer use is
  unavailable, run the remaining checks and report UI verification as blocked.
- The production native Clerk key works in native sign-in and rejects localhost web origins. Report web
  verification as blocked until an approved local-origin Clerk instance,
  matching Worker JWKS, and corresponding data identity are configured.
  Never substitute auth bypass.
- Use the physical-device deployment workflow instead when the user asks for
  proof on their iPhone; simulator proof is not device proof.
