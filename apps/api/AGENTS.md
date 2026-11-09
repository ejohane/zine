# Zine API: start here

This is the independent API-first rewrite. Erik is the product owner; Codex is
expected to implement and operate it across many fresh sessions. Optimize for
reproducible agent work and continuity in this repository. A public developer
portal or elaborate SDK is not the immediate production milestone.

## Starting a session

1. Read `docs/STATUS.md` for the last reviewed handoff and outstanding work.
2. Run `git status --short` and inspect the current checkout. Preserve existing
   edits; the rewrite may still be uncommitted. Do not assume a named branch.
3. From `apps/api`, run `bun run doctor`. It performs local/public HTTP checks,
   not a deployment or authenticated/provider verification. Inspect its coverage.
4. Read `docs/blueprint.md` and the source relevant to the task. For usage, read
   `docs/usage.md`; for proof, read `docs/verification.md` and artifact timestamps.
5. Continue the user's requested work. Check current code and deployed state before
   treating a handoff, historical test count or old artifact as current evidence.

## Boundaries

- This package deliberately owns `/v1`, fresh Cloudflare resources and its own
  schema. The legacy native `/api/v1` boundary is a separate system. Do not migrate
  existing clients or reuse old runtime code, databases, queues or buckets as a
  side effect. Existing accounts/credentials may be reused within authorization.
- Platforms host original media. Zine owns references, private context, metadata,
  accessible retained text and derived understanding with provenance.
- Preserve the implemented privacy, idempotency, lifecycle, alias, subscription and
  generation-fencing invariants in the blueprint. Do not make tests pass by
  weakening auth, bypassing owner checks, overriding provider cooldowns or inventing
  inaccessible source material.
- Google authorization remains a distinct live acceptance item; public YouTube
  success or fixture API responses do not establish authorized pagination.
- Private snapshots/logs/exports live in ignored `.local-data/` and may not exist in
  another checkout. Public evidence belongs in `evidence/`, with scope and hashes,
  never raw credentials or private library content.
- Use the shared `agent-secrets` skill for credentials. Profile metadata and key
  names are safe to inspect; secret values do not belong in chat, logs, arguments
  or repo files. Do not assume an inherited legacy token authenticates this API.

## Working and verifying

Use Bun 1.3.4 and Node 22. `bun run test`, `typecheck`, `lint` and `build` are package
commands. The build is a Wrangler dry run. Focus checks on the changed behavior;
run required broader gates before release. Root instructions and applicable skills
still apply. No mobile verification is required for API-only work unless the user
explicitly includes mobile integration.

`wrangler.jsonc` is the resource/configuration source of truth. `bun run deploy`
mutates the rewrite Worker; remote migrations mutate its database. Before a release,
inspect the target, check migrations, complete applicable checks and preserve
recovery evidence. Do not call a successful upload proof of application behavior.

Useful existing commands, run from `apps/api`:

- `bun run doctor`: bounded startup check; no credentials needed.
- `bun run scripts/verify-deployment.ts`: inspect active Cloudflare version/bindings
  with the configured Cloudflare credential; writes a sanitized local artifact.
- `bun run cli help`: save/get/list/search and generic REST request syntax.
- `secretsctl run zine.test -- bun run cli list --limit 5`: authenticated live read
  after checking the approved profile; creates/closes a real Clerk session.
- `bun run scripts/write-architecture.ts`: regenerate the standalone guide from
  its renderer. Verify hosted/standalone equivalence when publishing it.

Some historical verification scripts require private input files or deliberately
mutate test data. Read them before use. Do not run every script as a generic check.

## Ending a session

Update `docs/STATUS.md` when decisions, release state, blockers or next actions
change. Link evidence instead of copying large logs. Record what changed, checks
actually completed, live vs fixture coverage, exact deployed version when relevant,
and any process that remains running. Leave a specific next action. Do not claim
production readiness or goal completion from stale artifacts or intent.
