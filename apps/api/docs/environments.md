# Local development and branch previews (Zine Next)

How to run `apps/api` + `apps/next-web` with realistic data without touching production.
Set up 2026-11-15 ([PR #477](https://github.com/ejohane/zine/pull/477)). For the legacy
`apps/worker` + native app flow, see the root `AGENTS.md` instead; that is a separate system.

## The one rule

Production is only ever **read**, and only through the nightly private backup
(`zine-api-next-backups`, written by `.github/workflows/api-next-backup.yml`). Local copies and
previews are cleaned copies of that backup with their own resources. Never point local work,
scripts, tests or agents at production resources to get realistic data.

What cleaning removes (`scripts/restore-sql.py` skip list, reused by both copies): API tokens,
provider connections, webhooks and deliveries, semantic index state, understanding runs,
operational state. Queued work is cancelled and subscriptions are paused. Previews additionally
drop event history, job history, legacy import records and idempotency keys
(`scripts/preview-sql.py`). `test/local-restore.test.ts` proves both.

## Local development

From `apps/api` (needs `CLOUDFLARE_API_TOKEN` in the shell, only to read the backup):

```sh
bun run local:pull    # newest backup → .local-data/dev (110 MB download, ~10 s once cached)
bun run local:dev     # local API on :8890 (wrangler.local.jsonc)
bun run local:reset   # back to the pristine copy in about a second (stop local:dev first)
bun run local:token   # the local API token, for curl or agents
```

Then `bun run --cwd apps/next-web dev` and open http://localhost:5194/next/. The Vite dev server
forwards `/v1` to :8890 and adds the local token, so there is no Clerk sign-in locally; that code
exists only in the dev server and `import.meta.env.DEV` branches, never in a build.

- `wrangler.local.jsonc` has no production database, bucket, AI, vector index, routes, schedules or
  provider secrets. Semantic search and provider ingestion don't work locally; keyword search does.
- The local token belongs to the account with the most saves in the backup (Erik's).
- **Phone over Tailscale:** the dev server listens on all interfaces and allows `*.ts.net`
  hosts: `http://<mac>.<tailnet>.ts.net:5194/next/` (or the Tailscale IP). Anyone on the tailnet
  is signed in as that account, on the local copy only. Over plain `http` the page isn't a secure
  context, so saving a new link fails (`crypto.randomUUID`); browsing works.
  `tailscale serve --bg 5194` would give private `https` (changes the Mac's Tailscale config).

Why rows are copied file-to-file (`scripts/local-restore.py`) instead of through `wrangler d1
execute`: local D1 rejects statements over ~100 KB (`SQLITE_TOOBIG`), and some retained texts are
larger once hex-encoded. Miniflare stores the local D1 at
`.local-data/dev/state/v3/d1/miniflare-D1DatabaseObject/<64-hex>.sqlite`.

## Branch previews

One preview = `https://next-<slug>.myzine.app/next/`, where slug is the branch name lowercased,
non-alphanumerics → `-`, max 20 chars (`next-home-redesign` → `next-next-home-redesign`).

| Resource                                      | Name                           |
| --------------------------------------------- | ------------------------------ |
| API Worker (custom domain, creates DNS + TLS) | `zine-api-next-pv-<slug>`      |
| Web Worker (route `<host>/next*`)             | `zine-next-web-pv-<slug>`      |
| D1 / R2 bucket                                | `zine-api-next-pv-<slug>`      |
| Queue (+ consumer)                            | `zine-api-next-pv-<slug>-jobs` |

No AI, vector index, cron or provider secrets; search is keyword-only. Sign in with the normal
Zine account (production Clerk, preview origin as authorized party). Production rejects preview
sessions and preview tokens.

**Using them**

- PR label `preview` → deploy; each push redeploys. Removing the label or closing the PR destroys
  it. Daily sweep destroys previews older than 7 days (runs from `main`). At most 3 exist; a new
  one replaces the oldest. Workflow: `.github/workflows/next-preview.yml`; it comments the URL.
- From `apps/api` with `CLOUDFLARE_API_TOKEN` (build `apps/next-web` first):
  `bun run preview deploy|destroy <branch>`, `bun run preview list`, `bun run preview sweep`.
- **Data loads once** (first deploy) and survives redeploys, so preview edits persist. For fresh
  data: `destroy`, then `deploy`.
- **Agents:** `bun run preview token <branch>` mints a fresh API token for that preview (the
  account with the most saves, 7-day expiry) by writing its hash straight into the preview's D1,
  and prints it. It needs only `CLOUDFLARE_API_TOKEN`, which anyone able to reach the preview's
  data already holds, so there is no shared preview secret. Each call adds a token; tokens die
  with the preview.

**Lessons from building it** (all handled in `scripts/preview.ts`; keep them if you change it)

- D1 statements must stay under 100 KB, so preview SQL is plain-quoted (hex only for strings with
  NUL bytes). Largest statement today is ~50 KB.
- R2 REST uploads return 429 when bursty; uploads run 4 at a time, honour `Retry-After`, and resume:
  a `.preview/loaded` marker records completion and `.preview/backup` pins the backup the rows
  came from, so a retried deploy never mixes two backups.
- Teardown order is forced by Cloudflare: web Worker → queue consumer → API Worker → queue →
  emptied bucket → D1. Teardown fails loudly on anything but 404/429.
- New custom domains take a minute or more for DNS/TLS; deploy waits up to 15 minutes for
  `/health`. (The legacy `apps/web` preview workflow has a 5-minute wait that can time out on DNS;
  re-running it is enough.)

**Cost** (Workers Paid, within included usage): per preview ~166k rows written once, ~95 MB of
SQL, ~15 MB of files. Max 3 at once, 7-day expiry.

## Troubleshooting

- Tests fail with `EADDRNOTAVAIL` connecting to 127.0.0.1: macOS ran out of ephemeral ports
  (check `netstat -an -p tcp | grep -c TIME_WAIT`; ~16k means exhausted). Back-to-back large test
  suites (API, worker, pre-push) open thousands of short connections that linger ~30 s. Wait a
  minute and re-run. The dev servers were checked and don't leak.
- `bun run format:check` (pre-push) scans every file in the checkout, including untracked ones;
  add stray local folders to `.prettierignore` rather than skipping the hook.
- `local:pull` says no backup: run the "API private backup" workflow.
