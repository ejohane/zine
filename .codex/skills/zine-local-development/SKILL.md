---
name: zine-local-development
description: Run and visually verify Zine in a local worktree with the repo-owned dev stack, canonical native iOS app, serve-sim, and Codex Browser computer use. Use for every Zine request to implement, run, test, verify, debug, inspect, or visually review local runtime behavior, including prompts phrased only as "test it", "verify it", "run locally", or "check the UI".
---

# Zine Local Development

Use the worktree-safe stack and treat interactive browser-visible proof as part
of local verification, not as an optional follow-up.

## Required workflow

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
3. Start local development with `bun run dev:worktree`. This command owns the
   worker, web, proxy, native build/install/launch, and `serve-sim` lifecycle.
   Coordinate shared simulator ownership with other active tasks; use a
   dedicated alternate when needed. Do not start an additional preview for
   the same simulator.
4. Read the exact `serve-sim` preview URL from terminal output. It normally
   starts at `http://localhost:3200`, but another port may be selected when that
   port is occupied.
5. Use the available in-app Browser computer-use tool; read its returned
   documentation before browser interactions. Open or reload the exact preview URL in the Codex in-app Browser.
6. Confirm all of these before interacting:
   - The page reports `iPhone 17 — Zine` or the explicitly selected simulator.
   - The stream is live and renders a real device frame.
   - The foreground app is `Zine Native` with bundle `app.zine.native`.
7. Exercise the relevant user journey through the available Browser computer-use
   API for taps, swipes, typing, and navigation inside the streamed simulator.
   Follow its current returned documentation rather than assuming older API
   names. Use DOM/Playwright inspection for surrounding `serve-sim` controls.
   See `docs/local-development.md` for the verified secure keyboard-entry
   procedure; AX overlay inspection and event counters alone do not prove
   that native input took effect.
8. Inspect fresh visible state after each material interaction. Capture a
   screenshot for the final relevant state and for each appearance or screen
   variant required by the task.
9. Run focused automated tests and repository gates appropriate to the change.
   Automated tests complement the interactive pass; they do not replace it.

## Verification contract

Do not call local native behavior verified from build output, unit tests,
`simctl`, logs, installation, launch, a loaded preview page, or a static
simulator screenshot alone. Verification requires an actual streamed frame and
Browser computer-use interaction with the relevant behavior.

Report these states separately:

- authenticated login and actual Clerk subject
- sanitized local D1/R2 provisioning or reuse, and confirmed local API target
- automated tests and checks
- native build
- simulator install
- app launch
- live `serve-sim` frame
- computer-use interaction performed
- final UI state visibly observed

For worker or shared-code changes that can affect the native client, include a
native smoke path through this workflow. For strictly web-only behavior, use
the local web URL in the Codex Browser for the relevant flow; the default
`dev:worktree` simulator startup may remain a smoke check but is not proof of
web behavior.

## Lifecycle and exceptions

- Keep `dev:worktree` and the preview tab alive when the user wants an ongoing
  development session. Otherwise stop its orchestrator and confirm that the
  Worker, web, archive, proxy (if used), and preview ports are released.
  `scripts/dev-processes.sh` handles SIGINT/SIGTERM/SIGHUP and stops tracked
  Bun/Turbo descendants even without a TTY. Do not use blanket process-name
  kills or interfere with another task's services.
- Use `ZINE_SKIP_IOS_BUILD=1 bun run dev:worktree` only when an already
  installed native build is intentionally sufficient. Startup must confirm its
  installed API URL matches the selected local Worker.
- Use `ZINE_SERVE_SIM=0 bun run dev:worktree` only when the user explicitly
  opts out or the host cannot run Apple Simulator. State the missing UI proof
  plainly in that case.
- Use `ZINE_SIMULATOR_NAME` or `ZINE_SIMULATOR_UDID` for an explicit alternate
  simulator. Never use an unscoped `serve-sim --kill`.
- The production native Clerk key rejects localhost web origins. Report web
  verification as blocked until an approved local-origin Clerk instance,
  matching Worker JWKS, and corresponding data identity are configured.
  Never substitute auth bypass.
- Use the physical-device deployment workflow instead when the user asks for
  proof on their iPhone; simulator proof is not device proof.
