# API session handoff

Last reviewed: 2026-11-09 UTC. This file records observed state, not a substitute
for current checks. Read `../AGENTS.md`, inspect git status, then run `bun run doctor`.

## Direction and scope

Zine is an API-first saving service. Platforms host original media; Zine owns
references, metadata, private context, accessible retained text and derived
understanding with provenance. Erik owns the product; Codex is the ongoing agent
across fresh sessions. Keep contracts, reproducible verification and operational
context in the repository. A public developer marketplace is outside this milestone.

Erik authorized completing [productionization.md](productionization.md), excluding
new OAuth/consent/registration and Google-authorized live acceptance. Preserve
existing Clerk sessions. The original native `/api/v1` service remains separate;
no mobile integration or legacy migration was performed.

The older goal-control objective still includes Google acceptance. Erik said its
replacement is unnecessary and may be a TODO. Do not falsely complete that older
objective; track this authorized non-OAuth work here.

## Release checkpoint

- Main includes the rewrite/production controls through PR [#466](https://github.com/ejohane/zine/pull/466)
  and the Linux backup compatibility fix through PR [#467](https://github.com/ejohane/zine/pull/467).
- Reviewed source: `627b63d439f1bcb781026901b754ebf363b4e373`.
- Linux private backup [42572985940](https://github.com/ejohane/zine/actions/runs/42572985940)
  passed. The earlier production attempt stopped before migrations/deployment:
  GitHub SQLite 3.45 lacked `unistr()`, which D1 native exports use. Workflows now
  install checksum-verified official SQLite 3.54.1 and check the capability first.
  No Cloudflare credential changes were needed.
- Full production release [42573335811](https://github.com/ejohane/zine/actions/runs/42573335811)
  succeeded. Production serves Worker `23b9f152-39a0-4450-b0fd-1da9e746e130`,
  source `627b63d439f1bcb781026901b754ebf363b4e373`, migrations 1–23.
  The duplicate automatic staging-only run was intentionally cancelled before
  staging; the full workflow verified, staged, backed up and promoted the source.
- Actual production REST/MCP concurrency acceptance passed with cleanup. The
  scoped GitHub monitor token is configured; GitHub monitoring passed after the
  first natural cron heartbeat. The 30-minute exact-release observer completed with 30
  healthy authenticated observations, zero failures and successful scheduled
  Spotify/Substack/YouTube/RSS poll advances (`production-soak.json`).
- Staging-origin Clerk configuration was corrected in merged PR #468: staging
  originally accepted only production-origin sessions. At the origin-boundary probe, staging deployment
  `d1759e4a-a1d0-4bd4-9278-e660f44c5bfa` served source
  `b40fd5af5e4a76357dd62769390b3697558aa380`. Real Clerk staging-origin
  acceptance and production rejection both passed (`staging-origin-live.json`).
  Production's trusted origins remain restricted. Later main pushes automatically
  stage documentation/helper updates; inspect staging `/health` for its latest
  stamp. Browser rendering is distinct.

## Resources and behavior

Production is <https://api-next.myzine.app>; staging is
<https://api-next-staging.myzine.app>. REST `/v1`; MCP `/mcp`; authenticated
Inspector `/`; reference `/docs`; OpenAPI `/openapi.json`; explanatory guide
`/architecture`. The architecture guide is illustrative, with no live mutations.

Each environment owns its Worker, D1, R2, queue/DLQ and Vectorize index. See the
production/staging Wrangler configs and [operations.md](operations.md). Recovery
uses `verification/wrangler.recovery.jsonc`, D1
`29df9a64-93a0-4ada-929e-43c057b2ead8`, and independent resources. It contains a
private restored copy, no live grants/tokens/webhooks, paused subscriptions and a
completed vector rebuild. No recovery verifier remains running.

Cron runs every five minutes; subscription polls become due fifteen minutes after
success. Queue/provider delays can extend the interval. Saves and explicit context
are durable before asynchronous extraction/understanding/indexing finish.

Implemented controls: eight scoped revocable PAT capabilities; atomic caller/owner
request and resource ceilings; shared cron heartbeat and durable owner alerts;
transactional events with 30-day replay; signed at-least-once webhooks with leases,
backoff and erasure fencing; thin TypeScript client and CLI; staging/release,
checksum-ledger migration, private backup, restore, index rebuild and rollback.

## Proof and reproducible entry points

Read [verification.md](verification.md) for the full ledger and scopes. Receipts
under `../evidence/` contain hashes/counts/assertions, not raw library content.

- `production-controls-live.json`: real Clerk/staging scopes, revocation,
  idempotent save, production isolation, 25-call burst (20 accepted/five limited)
  with retry headers and another caller unaffected.
- `operations-live.json`: actual staging injected backlog opens/deduplicates/
  resolves an alert without changing production or provider state.
- `webhooks-live.json`: independent Cloudflare receiver verifies HMAC, returns 503,
  then receives the same delivery/body on the scheduled retry five minutes later.
- `production-live.json`: exact released-source REST/MCP; 15 concurrent save
  requests yield six durable references with no lost/duplicate retry captures,
  pagination, keyword retrieval, independent archive/completion, six created events
  replayed, read/write scope boundaries; all controlled references/tokens cleaned.
- `production-search-live.json`: all 12 real-library search cases rank the expected
  result first on the actual new production version.
- `production-ops-live.json` and `monitor-live.json`: natural successful cron, no
  critical queue/cron condition, no dirty index revisions; actual GitHub runner
  monitoring with its scoped PAT. Historical failed jobs and source errors remain
  visible as noncritical conditions.
- `rollback-policy-live.json`: actual production read-only preflight rejects the
  pre-scope version 02ec before deployment and accepts the current tagged release's
  matching private manifest. Six policy tests cover invalid tags/receipt identities
  and missing scope migration. Production rollback must retain migrations 18–23
  and their policy floor; use forward repair until a compatible older release exists.
- `rollback-live.json`: actual staging rollback/forward promotion, exact-version
  readback and retained context; all 23 migrations remain current.
- `backup-latest.json`: private R2 archive with full round-trip hash readback;
  30-day backup retention, public bucket access disabled.
- `recovery-restore.json`: 491 items, 5,473 contributions, 21 authoritative table
  hashes after documented isolated subscription/lease overlays, valid foreign keys,
  all 299 retained objects copied/read back with matching hashes.
- `recovery-search-live.json`: all 491 owner items rebuilt, zero pending revisions,
  455 saved items read, 12 keyword/semantic/hybrid checks rank the expected result
  first, three retained-material API readbacks. Primary real Clerk; another-owner
  denial uses a controlled isolated PAT, not a second real Clerk login.
- `production-checks.json`: 130 Node 22 API tests across 28 files; scoped auth/export,
  atomic quotas, lifecycle/erasure races, signed retry/leases/retention, recovery
  and client retry cases. Controlled upstream tests do not prove provider access.

Read scripts before running mutating probes. These require the approved login
profile (see shared agent-secrets skill), and close real Clerk sessions:

```sh
secretsctl run zine.test -- bun run scripts/verify-production-live.ts EXACT_RELEASE_SHA
secretsctl run zine.test -- bun run scripts/configure-monitor.ts
gh workflow run api-next-monitor.yml --repo ejohane/zine
secretsctl run zine.test -- bun run scripts/soak.ts 30 EXACT_RELEASE_SHA
```

The first writes/removes unique controlled verification references and revokes its
scoped PATs. Monitor configuration sends an ops-read-only token to GitHub through
stdin and revokes older named monitor tokens. The soak is read-only. Check current
processes/private progress before starting another observer.

## Limits and deferred work

- New OAuth and Google-authorized metadata/pagination acceptance are deferred.
  The original app supports Google integration; its encrypted grant could not be
  reused with approved available keys. Do not claim that integration is absent.
- X currently reports upstream `provider_http_402`; no provider-plan/billing
  changes were made. The earlier public YouTube feed 404 recovered: YouTube, Spotify,
  Substack and both RSS subscriptions advanced during the new production observation.
  Saves remain durable and inaccessible source failures are explicit.
- Captions/paywalls/inaccessible pages can prevent rich extraction. Imported
  metadata or accepted jobs do not prove extracted content or a full transcript.
- Browser visual verification of the Inspector/architecture guide was unavailable
  earlier. DOM interaction and delivery receipts are separate from visual review.
  No native/UI verification is claimed for this API-only task.
- Private inputs/snapshots/logs live in ignored `.local-data/`; another checkout
  may not have them. Do not fabricate original-library artifacts. Backups and
  credential values must never enter this PUBLIC repository.

## Final audit and next action

All P1–P12 productionization requirements were inspected against their receipts;
see [productionization.md](productionization.md). The proof package is in PR #469.
The original source/controls PR #466, Linux backup fix #467 and staging-origin fix
#468 are merged. Inspect its actual merge/check state when starting a fresh session; production
release identity above is independent of later documentation-only main commits.
There are no local observers or development servers left running. Cloudflare's
staging/recovery/proof resources remain for reproducible operation; retained data
and credentials remain private. `doctor-production.json` records a clean Node 22
startup check; its public-health scope is separate from authenticated evidence.

For a new experience, start with `client/README.md`, `docs/usage.md`, OpenAPI and the
existing CLI. Use the actual production `releaseSha`, preserve save idempotency
keys across retries, and handle asynchronous processing and explicit source errors.
Configure any new web origin deliberately; use scoped PATs for trusted agents.

Remaining decisions: OAuth/Google-authorized live acceptance and X account/provider
access are deferred. Goal-control cleanup is an administrative TODO. GitHub monitor
and daily backup workflows are active; their executable paths were observed via
manual dispatch. Natural GitHub scheduled-trigger execution is not claimed by
those receipts. Continue observing normal scheduled runs through routine operations.

## Creator artwork rollout pending

Item responses now have an optional `content.creatorImageUrl` independent of
`content.thumbnail`. Provider ingestion can supply publisher, show, or channel
artwork. The Next web cards prefer the new field and retain their initials
fallback.

The owner-scoped legacy artwork dry run matched 425 of 455 production saves
without ambiguous matches or writes. The live contract still lacks the field.
After the reviewed API release, rerun the dry run, apply the owner-scoped
backfill, and verify the returned artwork and rendered Next cards. The backfill
command defaults to read-only. Use `--apply 5` for the first batch and check the
returned artwork before proceeding with a larger batch. It accepts a private JSON export of
`{url, imageUrl}` records. Keep the export out of source control.
