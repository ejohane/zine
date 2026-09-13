# Authenticated local development

Run `bun install`, then `bun run dev:worktree`. The stack selects local ports,
provisions sanitized production D1 and article bodies when state is absent,
and builds the native app against that local Worker. Sign in with Clerk through
the live `serve-sim` URL printed by startup. All bookmark changes use local data.
Clerk itself remains the real authentication service.

Use the shared agent-secrets skill: `secretsctl current`, `secretsctl metadata zine.test`,
and `secretsctl check zine.test`. Fill one field at a time using
`secretsctl copy zine.test ZINE_TEST_USER_EMAIL --ttl 20` and then
`ZINE_TEST_USER_PASSWORD`. Paste directly into the target field, clear the
clipboard immediately, and keep values out of output, screenshots, and files.
In `serve-sim`, dismiss the first keyboard introduction before entry. The AX
overlay selects elements for inspection; turn it off for native taps. If bulk
text input has no effect, use browser keyboard events with explicit Shift
combinations for symbols. Keep the `secretsctl copy`, clipboard read, and clear
in the same protected operation so the TTL cannot expire between tool calls.
Verify entry without printing values and capture screens only after login.
Do not inject login credentials into the whole dev stack. Report MFA or login
failures without falling back to fixtures or bypass.

The export selects the primary account and retains its Clerk subject by default.
The allowlisted login currently belongs to that account. For a different account,
set `ZINE_LOCAL_USER_ID=user_...` to its authenticated Clerk subject for both
refresh and startup. The Worker verifies JWTs and uses the actual subject for
ownership checks; it does not alias users. The import still scrubs email,
OAuth credentials, mailbox cursors, unsubscribe targets, and API tokens.
Provider connections remain expired. Automated tests keep synthetic identities.

## Refresh and recovery

Stop this worktree's stack, then run:

```sh
bun run data:prod:local -- --yes --include-article-bodies
bun run dev:worktree
```

Cloudflare access is required for the read-only production export/download.
The script stages the new state, backs up previous local state under
`.local-data/local-d1-backups`, then installs it. Raw exports and downloaded
bodies are deleted after success or failure unless `--keep-raw` was explicitly
requested. Production data is never modified. The refresh includes referenced
v2 and legacy reader bodies, not just D1 metadata.

Normal restarts preserve local edits. Existing state without a compatible
sanitized snapshot manifest stops startup with refresh instructions; no
unconditional overwrite or cross-worktree copying occurs. This includes old
`dev-user-001` snapshots. `dev:reset` backs up local state after checking that
this worktree's Worker is stopped; the next start provisions fresh data.

## Verification

Use a dedicated alternate simulator when another task owns the default device.
`ZINE_SIMULATOR_NAME` and `ZINE_SIMULATOR_UDID` select it. Keep each task's printed
ports and preview URL distinct. Verify the built `ZineAPIBaseURL` points to the
selected local Worker before any writes. A skip-build launch must match that URL.

Observe a real streamed frame, log in, open populated Library, bookmark detail,
and article reader, and interact through the browser's computer-use surface.
Report refresh, authentication, automated tests, build, install, launch, stream,
interaction, and visible state separately. Fixture screenshots do not satisfy
this contract.

For web, set a Clerk publishable key whose instance allows the local origin.
The production native key rejects localhost browser origins, so startup does
not substitute it for missing web configuration. Browser login requires an
approved development instance: configure `VITE_CLERK_PUBLISHABLE_KEY` in the
worktree's `apps/web/.env.local`, its matching `CLERK_JWKS_URL` for the local
Worker, and import data for that instance's actual subject using
`ZINE_LOCAL_USER_ID`. If verifying native against that same Worker, also set
its matching `ZINE_CLERK_PUBLISHABLE_KEY` in `Local.xcconfig`. Missing instance
configuration is a reported blocker; never disable auth to hide it.
Worker secrets are never copied from another worktree; inject only allowlisted
integration credentials when that integration is explicitly under test.
