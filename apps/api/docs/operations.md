# Operating the independent API

Start with STATUS.md, `bun run doctor`, and git status. All commands here run from
`apps/api`. The original Worker/native `/api/v1` service is a separate system.
Consult productionization.md for acceptance status; an available command is not
proof it has run successfully.

## Deployments

| Environment             | Worker                   | Configuration                          |
| ----------------------- | ------------------------ | -------------------------------------- |
| Production              | `zine-api-next`          | `wrangler.jsonc`                       |
| Staging                 | `zine-api-next-staging`  | `wrangler.staging.jsonc`               |
| Isolated recovery proof | `zine-api-next-recovery` | `verification/wrangler.recovery.jsonc` |

Each owns separate D1, retained-material R2, queue/DLQ and Vectorize resources.
Provider credentials may be reused, but never legacy runtime bindings. The private
backup bucket and separate webhook-proof receiver are administrative resources.

The API release workflow verifies lint, types, tests and dry-run build, then
releases the exact source to staging. Main pushes stage automatically. An explicit
production workflow dispatch stages and promotes that same commit. It runs only
from main and takes a native D1/referenced-R2 backup first. Release and backup
workflows serialize their control-plane work.

```sh
gh workflow run api-next-release.yml --repo ejohane/zine --ref main -f environment=production
```

The underlying commands require a clean reviewed checkout and the existing
Cloudflare credential:

```sh
bun run scripts/release.ts staging
bun run scripts/release.ts production
```

Release checks reject unrelated bindings, unknown remote migrations and changes to
recorded migration checksums. The first ledger initialization establishes a
reviewed baseline for migrations already applied before the ledger existed.
Health reports `releaseSha` and the actual Worker `deploymentId`. A private release
manifest records the predeployment backup receipt, bindings, migrations, prior
versions and readiness checks in
`zine-api-next-backups/releases/{environment}/{sha}/{version}.json`. Manifests do
not establish provider behavior; run the appropriate authenticated acceptance too.

## Rollback

```sh
bun run scripts/rollback.ts staging EXPLICIT_WORKER_VERSION_UUID
```

Select a reviewed version belonging to that Worker. The command verifies actual
serving-version readback. It follows [Cloudflare rollback semantics](https://developers.cloudflare.com/workers/versions-and-deployments/rollbacks/)
and restores code/configuration only: **D1, R2, queues and
vectors remain current**. Prefer additive migrations and a forward fix. Never
assume a Worker rollback reverses data changes. `verify-rollback-live.ts VERSION`
uses staging only to check controlled context readback across rollback and forward
promotion; read the script and ensure the current staging release is reviewed.

## Backup and recovery

```sh
bun run scripts/backup.ts production
```

The daily GitHub backup workflow and every production release run this command.
Local operators need SQLite 3.50 or newer because native D1 dumps use `unistr()`.
The workflows install official SQLite 3.54.1 with its published SHA3-256 checksum;
the backup checks this capability before starting a native export.
It uses [Cloudflare's native point-in-time export](https://developers.cloudflare.com/api/resources/d1/subresources/database/methods/export/)
with `sqlite3_cli_only` so FTS does not
prevent the snapshot. The source database is briefly unavailable during native
export. SQLite verifies the downloaded snapshot; immutable retained objects and
active checkpoints referenced by it are copied separately. A missing referenced
object fails the backup. Completed-job checkpoints and unreferenced garbage are
excluded. Data removed during capture remains subject to the existing cleanup
quarantine; a backup that outlives that protection must fail on missing objects.

The private, content-addressed archive is uploaded to R2 and downloaded again for
hash verification. `evidence/backup-latest.json` is a sanitized receipt, suitable
for GitHub artifacts. **Never upload `.local-data` or the raw archive to GitHub.**
The R2 lifecycle rule expires `backups/` after 30 days. These recovery copies can
retain erased data until expiration and are restricted to operator access.

To retrieve a backup, use its exact private key from the receipt with Wrangler R2
object get, verify its SHA-256 against the key/receipt, and extract into a new
mode-700 ignored directory. The archive contains `database.sql`, `database.sqlite`,
`snapshot-metadata.json`, `manifest.json` and `objects/`. Private files must be
mode 600. Inspect archive paths before extracting. The SQL is a SQLite CLI dump,
not a file to import directly into D1.

Provision fresh recovery resources and update the dedicated recovery config; apply
current migrations before restoring. The restore refuses any staging/production
target or a nonempty recovery database:

```sh
bunx wrangler@4.158.0 d1 migrations apply DB --remote --config verification/wrangler.recovery.jsonc
bun run scripts/restore.ts .local-data/backups/EXACT_BACKUP_DIRECTORY
```

Restore inserts parent tables before dependent tables, restores triggers, rebuilds
FTS and starts vector revisions above their original values. Resetting those
revisions to one can collide with historical job IDs and strand rebuild work; the
recovery regression explicitly exercises that failure.

An isolated restore removes token hashes, encrypted grants and webhooks; pauses
subscriptions and external jobs; and omits derived vector state, search sessions,
understanding work and operational state. Authoritative library material remains.
The receipt compares full values for 21 authoritative tables, validates foreign
keys and reads every restored retained object back from R2 to compare its hash.

Encryption keys and provider secrets are not inside these data backups. A surviving
production Worker retains its secret bindings when pointed at a recovered DB.
A complete secret-store loss requires separately recovering app secrets and
reconnecting grants; this milestone does not claim OAuth/grant disaster recovery.
An isolated recovery Worker intentionally uses no restored live grants.

Deploy the recovery Worker only after credential/external-work checks pass. Index
rebuilding uses `/v1/ops/index/rebuild`; observe `/v1/ops/status.indexing` until dirty
revisions clear. Rebuild from authoritative material into a fresh Vectorize index
with the `itemId` string metadata index. `verify-recovery-live.ts` exercises actual
Cloudflare AI/vector retrieval and retained material with real Clerk; its secondary
owner probe is explicitly a controlled PAT bootstrap, not another Clerk login.

## Monitoring and incidents

See production-controls.md for scoped credentials, usage ceilings and durable
owner alerts. The service records cron completion/failure and checks owner backlogs
in bounded rotating batches. `/v1/ops/status` includes usage, queue age, subscription
freshness and indexing progress; `/v1/ops/alerts` retains open/resolved state.
Operational alert changes also produce signed webhook events.

A separate GitHub scheduled monitor checks public health and authenticated status
every 15 minutes. It fails on stalled queues or stale/failed cron, while normal
unavailable source material remains visible without being treated as an outage.
GitHub scheduling and its configured account notifications apply; no external
email/Slack destination was invented or configured.

Configure or rotate its one-year read-only operations PAT through the approved
login profile; the script sends the raw value only to GitHub's secret input and
revokes previous tokens with this exact system name after replacement:

```sh
secretsctl run zine.test -- bun run scripts/configure-monitor.ts
gh workflow run api-next-monitor.yml --repo ejohane/zine
```

The monitor warns within 14 days of recorded expiry. Maintain the GitHub secret and
expiry variable; never embed the PAT in a client app, command argument or doc.
For a new incident, record the serving version, run the scoped status/check routes,
inspect job error categories and due times, and correlate request IDs with Worker
observability. Honor quotas/cooldowns; do not reset them to make a probe pass.
Only retry failed owned jobs after identifying the cause. Keep raw diagnostics
private, and add a reproducible regression for a real invariant failure.

## Verify the released API

Use the exact `releaseSha` from public `/health` and the successful production
workflow. The following helpers authenticate with real Clerk through the approved
profile and do not bypass owner/capability checks:

```sh
secretsctl run zine.test -- bun run scripts/verify-production-live.ts EXACT_RELEASE_SHA
secretsctl run zine.test -- bun run scripts/verify-production-ops.ts EXACT_RELEASE_SHA
secretsctl run zine.test -- bun run scripts/verify-search-quality.ts EXACT_RELEASE_SHA
secretsctl run zine.test -- bun run scripts/soak.ts 30 EXACT_RELEASE_SHA
secretsctl run zine.test -- bun run scripts/verify-staging-origin.ts
```

The save/MCP probe creates unique controlled references and revokes its temporary
scoped tokens after cleanup. The operational probe and soak do not mutate library
or scheduling state. Search verification needs the private original-library mapping;
its absence in a fresh checkout is an explicit missing input, not permission to
invent expected results. Keep a single soak running and inspect its private
checkpoint before starting another. Tests and public receipts document the actual
bounded cases rather than claiming future uptime or universal correctness.

Each new browser experience needs its own approved CORS origin and signed Clerk
party in the target environment. Staging explicitly accepts its own origin while
production rejects staging-origin sessions. Trusted servers/agents can instead use
appropriately scoped PATs. Never broaden origin checks to compensate for a login
configuration failure. New OAuth client authorization remains a separate task.
