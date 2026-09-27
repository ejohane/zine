# Authenticated local development

This is the startup, sign-in, and troubleshooting guide for the supported native
app (`apps/ios/ZineNative.xcodeproj`, scheme `ZineNative`, bundle `app.zine.native`).
Clerk remains the real authentication service; the app's API requests and bookmark
changes use this worktree's local Worker and sanitized data.

## Choose a development mode

- **Headless business logic:** run `bun run test:native:core` and
  `bun run native:agent scenario run all`. These use isolated fixtures and need
  no Simulator, Worker, login, or production data.
- **Native integration and UI:** start the stack below and use computer use
  directly in Apple Simulator. This is the normal manual verification flow.
- **Optional Debug command bridge:** follow [the native CLI quickstart](native-cli-development.md#switch-to-the-running-app).
  It requires explicit activation and a localhost Worker. It does not enter
  credentials or replace manual gesture/rendering verification.

## Start the native development stack

From the repository root, with Bun 1.3.4, Node 22, macOS, and Xcode available:

```sh
bun install
ZINE_DEV_HOST=localhost bun run dev:worktree
```

Startup selects available service ports, provisions sanitized production D1 and
article bodies if local state is absent, starts the services, builds and installs
the Debug native app, and opens the selected device in Apple Simulator. Initial
provisioning requires Cloudflare access and can take several minutes. Existing
compatible state and local edits are reused on subsequent starts.

The default device is `iPhone 17 — Zine`. It must already exist in
`xcrun simctl list devices available`. Use `ZINE_SIMULATOR_UDID` or
`ZINE_SIMULATOR_NAME` for a dedicated alternate when another task owns it.
`localhost` is the simplest Simulator setup and is required for the optional
Debug bridge. Without the host override, startup prefers Tailscale when available
and starts an API proxy for access from a physical device. This API proxy forwards
HTTP requests to the local Worker.

Read the printed API URL and confirm startup reports matching installed API
URLs for both the app and share extension before making any changes. The launch
script supplies the local API URL and host-scoped HTTP allowance as build
settings. The checked-in native Clerk configuration works for this native flow;
no `Local.xcconfig` or development Clerk instance is required.

To intentionally reuse a suitable installed build, add `ZINE_SKIP_IOS_BUILD=1`.
Startup rejects a build whose app or extension API differs from the selected URL.
Against an already running local stack, `ZINE_LOCAL_API_URL=<printed-api-url>
bun run ios:simulator` builds/installs/launches the app without starting services
or provisioning data. It does not replace `dev:worktree` for initial setup.

## Sign in directly in Apple Simulator

1. Read the shared `agent-secrets` skill. Run `secretsctl current`,
   `secretsctl metadata zine.test`, and `secretsctl check zine.test` to confirm the
   allowlisted Bitwarden profile and credential names without retrieving values.
2. Select the Apple Simulator app with the native computer-use tool and read its
   current documentation. Confirm the correct device window and foreground Zine
   app. Dismiss any first-run keyboard introduction and focus the email field.
3. Inspect the fresh native accessibility tree. Clerk's focused email field is
   exposed as a `(settable)` text field. Use its current element index with the
   native `setValue` action. Generic `typeText` left the field empty and `paste`
   timed out in the verified direct Simulator run; an attempted action is not
   proof that input reached iOS.
4. Retrieve the email with
   `secretsctl copy zine.test ZINE_TEST_USER_EMAIL --ttl 20`. In the same protected
   computer-use operation, read the clipboard into a temporary variable, clear
   the clipboard immediately, pass that value to `setValue`, and discard it.
   Do not split copying and reading across tool calls where the TTL can expire.
5. Inspect the resulting field state privately and report only whether entry
   matched and Continue is enabled. Click Continue, then refresh the native
   accessibility tree to locate the `(settable)` secure password field.
6. Repeat the protected transfer using
   `secretsctl copy zine.test ZINE_TEST_USER_PASSWORD --ttl 20` and the secure
   field's fresh index. Confirm Continue is enabled and submit. The same native
   `setValue` procedure was verified for both fields on 2026-09-27.
7. Confirm Zine leaves the Clerk screen and displays the authenticated app.
   Then confirm Home or Library loads local content. Authentication success and
   successful local API access are separate observations.

Keep credential values out of tool output, screenshots, files, and logs. Native
accessibility output can contain the email: inspect credential-bearing state with
output disabled and return only boolean checks or filtered control metadata.
Capture screenshots only after login. Never inject login credentials into the
whole development stack. Report MFA, provider rejection, or unavailable native
field controls without substituting fixtures or authentication bypass.

The export preserves the primary account's Clerk subject by default, matching
the allowlisted login. For an actual alternate account, set
`ZINE_LOCAL_USER_ID=user_...` consistently for refresh and startup. Obtain that
subject from the authenticated account. The Worker verifies JWTs and uses the
actual subject for ownership; it never aliases arbitrary users. Imported provider
connections have redacted credentials and remain expired, so account login does
not establish live provider-sync readiness.

## Verify and debug the running app

Use direct Simulator computer use for the relevant user journey and inspect the
visible result after each material interaction. For reader changes, exercise
populated Library → bookmark detail → article reader. Headless assertions,
remote commands, builds, installation, launch, and static screenshots are
separate evidence; they do not establish that gestures or rendering work.

| Symptom                                                                                          | Check or next action                                                                                                                                                                                                                                                                                                                       |
| ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Input action succeeds but a login field remains empty                                            | Reinspect the native field and use its exposed `setValue` action with a fresh index. Keep credential-bearing output private.                                                                                                                                                                                                               |
| Clerk reports an invalid credential or requests MFA                                              | Report the actual authentication response; do not treat it as a local Worker failure or bypass auth.                                                                                                                                                                                                                                       |
| Signed-in Home/Library says it cannot connect                                                    | Confirm the local Worker is running and the installed API matches its printed URL. Signing in does not start the backend.                                                                                                                                                                                                                  |
| Library is empty                                                                                 | Compare the authenticated Clerk subject with local D1 `users` and `user_items`; do not point at production or disable auth.                                                                                                                                                                                                                |
| Startup reports incompatible or missing snapshot state                                           | Stop this worktree's stack and use the explicit refresh below. Existing state is preserved for recovery.                                                                                                                                                                                                                                   |
| Snapshot import fails with `duplicate column name: last_opened_at` or another migration conflict | The imported schema and migration ledger disagree; this happens before login. Preserve staged state and logs, inspect actual schema and migration history, and reconcile only verified applied changes locally. Do not blindly mark pending migrations applied. Repeating sign-in or the same export will not resolve the schema conflict. |
| Debug bridge identity is missing                                                                 | Check signed-in state, Debug Simulator build, explicit bridge activation, localhost API, and session expiry using the CLI quickstart.                                                                                                                                                                                                      |

Prefer the [observability skill](../.codex/skills/zine-observability/SKILL.md) and
repo diagnostics for Worker/API failures. Report authentication, local data,
API target, automated checks, build, install, launch, computer-use interactions,
and visible final state separately.

## Refresh and cleanup

Stop this worktree's stack, then explicitly refresh:

```sh
bun run data:prod:local -- --yes --include-article-bodies
ZINE_DEV_HOST=localhost bun run dev:worktree
```

The script stages sanitized D1 and referenced v2/legacy article bodies, backs up
previous local Wrangler state under `.local-data/local-d1-backups`, then installs
it. It refuses to replace state while this worktree's Worker runs. Production
exports/downloads are read-only. Raw exports and temporary article downloads are
deleted after success or failure unless `--keep-raw` was explicitly requested;
remove retained raw artifacts after short-lived debugging. Sanitized SQL remains
under gitignored `.local-data/`.

The normal stack requires a compatible snapshot with article bodies. Imports
without `--include-article-bodies`, old `dev-user-001` snapshots, wrong subjects,
and unrecognized state need explicit refresh. `dev:reset` backs up existing local
state after checking the Worker is stopped; the next start provisions anew.
Startup never unconditionally refreshes or copies another worktree's state.

Keep the stack alive for an ongoing development session. Otherwise stop its
orchestrator and confirm its Worker, web, archive, and API-proxy ports are released.
SIGINT, SIGTERM, and SIGHUP stop only this invocation's tracked Bun/Turbo service
subtree, native build, and API proxy, including non-TTY sessions. Do not use
blanket process-name kills. Apple Simulator and its signed-in app session can
remain open; local network access requires restarting the stack.

## Web authentication is a separate setup

The production native Clerk key works in the native app but rejects localhost
browser origins. Web manual verification needs an approved local-origin Clerk
instance: configure `VITE_CLERK_PUBLISHABLE_KEY` in this worktree's
`apps/web/.env.local`, its matching `CLERK_JWKS_URL` for the local Worker, and a
snapshot owned by that instance's actual subject via `ZINE_LOCAL_USER_ID`.
The native app must use a matching `ZINE_CLERK_PUBLISHABLE_KEY` in
`apps/ios/Configuration/Local.xcconfig` if it shares that differently configured
Worker. Missing web configuration blocks web login; it does not establish a
native login failure.

Worker secrets are never copied from another worktree. Inject allowlisted
integration credentials only for the integration under test. Auth bypass remains
restricted to isolated automated tests (`ENVIRONMENT=test`,
`TEST_AUTH_BYPASS=true`, or mocked localhost web smoke tests with
`VITE_TEST_AUTH_BYPASS=true`), never manual native or web verification.
