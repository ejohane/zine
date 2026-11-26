# Audit: Zine Next subscriptions state (2026-11-26)

Read-only audit. Nothing in production was changed, no write API was called, and no
application code was touched. **Do not merge this file's PR.**

All times are shown in America/Chicago (CST, UTC-6) with the UTC original in parentheses.

## 1. Executive summary

**The two questions asked — "what am I subscribed to?" and "what is actually being saved?" —
could not be answered from live data.** This session had no credential that can read the Zine
Next production database or call the authenticated API (details in section 5). No production
row was read, so this report contains **no current list of subscriptions and no list of saved
items**. Nothing below is guessed; every production fact is tied to a named, dated source.

What could be established without credentials:

| Question                                 | Answer                                                                                                                                                                                                                                             | Evidence                                                                |
| ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| Is the Zine Next API up right now?       | Yes. `/health` returned `ok`, release `926442e` (PR #480).                                                                                                                                                                                         | Public `GET /health`, Nov 26 10:51 CST (16:51 UTC)                      |
| Is the polling scheduler (cron) running? | It was healthy at the last check: no stalled queue, no stale or failed cron.                                                                                                                                                                       | Monitor workflow run, Nov 26 08:16 CST (14:16 UTC)                      |
| Has the scheduler had trouble recently?  | Yes, once in the visible window: the queue was stalled and cron was stale on the evening of Nov 24. It had recovered by the next check the following morning. Polling was delayed for some part of that ~17 hour gap; the exact length is unknown. | Monitor run 45540916431, Nov 24 21:34 CST                               |
| How many subscriptions should exist?     | About 98 rows are expected: 6 that existed on Nov 9 plus 92 copied from classic Zine on Nov 11 (84 active, 8 inactive). This is from repository records, not a current count.                                                                      | `apps/api/evidence/production-ops-live.json`, `apps/api/docs/STATUS.md` |
| Was anything known to be erroring?       | On Nov 9 the one X subscription was failing with `provider_http_402` (X's API answered "payment required"). Whether that is still true is unknown.                                                                                                 | `apps/api/evidence/production-ops-live.json`                            |
| Is anything being saved regularly?       | **Not verified.** The code would deliver new entries within roughly 15–20 minutes of a source publishing, but no delivery was observed in this audit.                                                                                              | —                                                                       |

Three things worth knowing before reading the live data yourself:

1. **Most subscription arrivals probably do not land in the library.** A subscription only
   saves automatically when its `auto_save` flag is on. Otherwise new entries arrive with
   status `received`, which the web app shows under **Inbox**, not in the library. The 92
   migrated subscriptions copied this flag from classic Zine's "auto bookmark" setting. If
   the library looks quiet, check Inbox first.
2. **The Zine Next web app has no screen that lists your subscriptions.** The live app
   (`apps/next-web/src/LiveApp.tsx`) never calls `/v1/subscriptions`. The "following" screen
   in `apps/next-web/src/App.tsx` is a prototype that renders fixed sample data, not your
   account. Today the real list is only available through the API or the database.
3. **The health monitor does not watch subscriptions.** It fails only on a stalled queue or a
   stale/failed cron. A subscription that errors on every poll, or one that has not polled
   for days, does not turn the monitor red.

## 2. Subscriptions by platform

**Current list: not available** (no production read access). The table below is the last
state recorded in the repository and is 15–17 days old. Source names and URLs are not
recorded there, so none are shown.

| Platform              | Recorded state                                                                                                                                                                                                                                                  | As of                                         | Source                                      |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- | ------------------------------------------- |
| YouTube               | 1 active, last success Nov 9 00:50:09 CST (06:50:09 UTC), no error                                                                                                                                                                                              | Nov 9 01:07 CST (07:07 UTC)                   | `evidence/production-ops-live.json`         |
| Spotify               | 1 active, last success Nov 9 00:55:07 CST (06:55:07 UTC), no error                                                                                                                                                                                              | same                                          | same                                        |
| RSS                   | 2 active, last success Nov 9 00:50:10 and 00:50:11 CST (06:50 UTC), no error                                                                                                                                                                                    | same                                          | same                                        |
| Substack              | 1 active, last success Nov 9 00:50:07 CST (06:50:07 UTC), no error                                                                                                                                                                                              | same                                          | same                                        |
| X                     | 1 active, **erroring**: `provider_http_402`, last success Nov 8 18:06:28 CST (Nov 9 00:06:28 UTC)                                                                                                                                                               | same                                          | same                                        |
| YouTube, Spotify, RSS | 92 more routes copied from classic Zine (YouTube channels, Spotify shows, RSS feeds): 84 active, 8 inactive (2 you had unsubscribed, 6 already erroring in classic Zine). Split by platform is not recorded. Migrated RSS feeds are stored with platform `web`. | Nov 11 (snapshot began 12:00 CST / 18:00 UTC) | `docs/STATUS.md` "Legacy library migration" |
| Gmail newsletters     | 8 active newsletter definitions in classic Zine were **not** carried over. Zine Next has no newsletter route yet; they need a connector and new mailbox consent.                                                                                                | Nov 11                                        | same                                        |
| Web (plain sites)     | A website is only followed through a feed it publishes. New ones are stored as `rss`; feeds migrated from classic Zine are stored as `web`.                                                                                                                     | —                                             | `apps/api/src/subscriptions.ts`             |

Status values that exist in Zine Next: only `active` and `unsubscribed`. There is no
paused, muted or disabled state. "Erroring" means `last_error_code` is set; the
subscription stays active and keeps being retried.

## 3. What has been saved recently

**Not available.** Titles, URLs, timestamps and 7/30-day counts per subscription all live
in the production database (`save_occurrences`, `personal_items`, `contributions`) and
could not be read. The queries in section 6 produce exactly this table.

The only delivery evidence in the repository is from the release soak on Nov 9,
00:37–01:07 CST (06:37–07:07 UTC): in 30 minutes the scheduler advanced one YouTube,
one Spotify, one Substack and two RSS subscriptions (`evidence/production-soak.json`).
That shows polls completing, not new items arriving.

## 4. Broken, erroring or stale

| Finding                                                                | Evidence                                                                                                                                                                                                                          | Current status                                     |
| ---------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| X subscription failing with `provider_http_402`                        | `evidence/production-ops-live.json`, Nov 9 01:07 CST                                                                                                                                                                              | Unknown                                            |
| Scheduler outage: `queue_stalled` and `cron_stale` both open           | Monitor run [45540916431](https://github.com/ejohane/zine/actions/runs/45540916431), Nov 24 21:34:44 CST (Nov 25 03:34:44 UTC). Previous passing run Nov 24 14:18 CST (20:18 UTC); next passing run Nov 25 07:24 CST (13:24 UTC). | Recovered; passing since, last at Nov 26 08:16 CST |
| YouTube Shorts were delivered as ordinary videos until today           | Fix is PR #479. The monitor reported release `2522d69` (PR #476) at Nov 26 08:16 CST; `/health` reported `926442e` (includes #479) at 10:51 CST. So the fix went live this morning.                                               | Fixed going forward                                |
| Shorts already delivered are still in the account                      | `docs/STATUS.md`: the cleanup script `scripts/remove-subscribed-shorts.ts` "has not been run"                                                                                                                                     | Open, per the handoff note                         |
| 130 failed jobs on Nov 9 (all job kinds, mostly older item extraction) | `evidence/production-ops-live.json`                                                                                                                                                                                               | Unknown; not specific to subscriptions             |
| Monitor runs far less often than configured                            | Configured every 15 minutes; 61 runs exist in total and recent runs are 6–10 hours apart (GitHub delays scheduled workflows)                                                                                                      | Ongoing; outages shorter than that can be missed   |

## 5. What could not be verified, and why

| Missing                                                     | What it blocks                                                        | What was tried                                                                                                                            |
| ----------------------------------------------------------- | --------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `CLOUDFLARE_API_TOKEN` (and account id) with D1 read access | Every database query: subscription list, deliveries, job history      | Checked environment variable names and `~/.wrangler`, `~/.config`. None present. `wrangler` is installed but unauthenticated.             |
| A Zine API token or Clerk session for the owner's account   | `GET /v1/subscriptions`, `/v1/sources`, `/v1/items`, `/v1/ops/status` | `GET /v1/subscriptions` without credentials returned 401. `secretsctl` (the repo's credential tool) is not installed in this environment. |
| The nightly backup (`zine-api-next-backups` bucket)         | An offline copy of the same tables                                    | Needs the same Cloudflare token. The backup itself is current: last run succeeded Nov 25 12:07 CST (18:07 UTC).                           |

Consequences: the owner's account row was not identified, no subscription names or URLs
were read, and it is not known whether more than one account has subscriptions.

Two cautions for whoever runs the queries:

- The cleaned local copy (`bun run local:pull`) and branch previews **rewrite every
  subscription to `unsubscribed`** and cancel queued jobs (`scripts/restore-sql.py`).
  They are useless for judging status. Use production or the raw backup.
- A Cloudflare D1 token is not read-only. Run `SELECT` statements only.

## 6. Queries to run

From `apps/api`, with `CLOUDFLARE_API_TOKEN` set in the shell:

```sh
bunx wrangler d1 execute zine-api-next --remote --config wrangler.jsonc --json --command "<SQL>"
```

Timestamps are stored as UTC ISO strings. The owner is selected the way the repo's own
tooling does it: the account with the most saved items. Run query 0 first to confirm
there is one obvious account. Its output contains internal user IDs; keep it out of
public places.

```sql
-- 0. Accounts
SELECT owner_id, COUNT(*) AS items,
  (SELECT COUNT(*) FROM subscriptions s WHERE s.owner_id=p.owner_id) AS subscriptions
FROM personal_items p GROUP BY owner_id ORDER BY items DESC;

-- 1. Every subscription with status, poll state and delivery counts
SELECT so.platform, so.name, so.url AS source_url, r.kind AS route_kind, r.url AS route_url,
  s.status, s.auto_save, s.filters_json, s.initialized, s.created_at, s.intake_since_at,
  s.last_success_at, s.last_error_code, s.next_poll_at,
  (SELECT COUNT(*) FROM save_occurrences o WHERE o.subscription_id=s.id) AS delivered_total,
  (SELECT COUNT(*) FROM save_occurrences o WHERE o.subscription_id=s.id
     AND o.created_at >= strftime('%Y-%m-%dT%H:%M:%fZ','now','-7 days')) AS delivered_7d,
  (SELECT COUNT(*) FROM save_occurrences o WHERE o.subscription_id=s.id
     AND o.created_at >= strftime('%Y-%m-%dT%H:%M:%fZ','now','-30 days')) AS delivered_30d,
  (SELECT MAX(o.created_at) FROM save_occurrences o WHERE o.subscription_id=s.id) AS last_delivery_at
FROM subscriptions s
JOIN sources so ON so.id=s.source_id
JOIN source_routes r ON r.id=s.route_id
WHERE s.owner_id=(SELECT owner_id FROM personal_items GROUP BY owner_id ORDER BY COUNT(*) DESC LIMIT 1)
ORDER BY so.platform, so.name;

-- 2. Items delivered by subscriptions in the last 30 days
--    status 'saved' = in the library, 'received' = waiting in Inbox
SELECT so.platform, so.name AS source, o.created_at AS delivered_at, p.status, p.saved_at,
  p.decision_origin, o.input_url,
  (SELECT c.value_json FROM contributions c WHERE c.content_id=p.content_id AND c.field='title'
     ORDER BY c.priority DESC, c.created_at LIMIT 1) AS title
FROM save_occurrences o
JOIN personal_items p ON p.id=o.item_id
JOIN subscriptions s ON s.id=o.subscription_id
JOIN sources so ON so.id=s.source_id
WHERE o.route='subscription'
  AND o.owner_id=(SELECT owner_id FROM personal_items GROUP BY owner_id ORDER BY COUNT(*) DESC LIMIT 1)
  AND o.created_at >= strftime('%Y-%m-%dT%H:%M:%fZ','now','-30 days')
ORDER BY o.created_at DESC LIMIT 300;

-- 3. Active subscriptions that are erroring, overdue, or silent for 14+ days
SELECT so.platform, so.name, s.last_success_at, s.last_error_code, s.next_poll_at,
  (SELECT MAX(o.created_at) FROM save_occurrences o WHERE o.subscription_id=s.id) AS last_delivery_at
FROM subscriptions s JOIN sources so ON so.id=s.source_id
WHERE s.status='active' AND (
  s.last_error_code IS NOT NULL
  OR s.last_success_at IS NULL
  OR s.last_success_at < strftime('%Y-%m-%dT%H:%M:%fZ','now','-1 hour')
  OR s.next_poll_at   < strftime('%Y-%m-%dT%H:%M:%fZ','now','-1 hour')
  OR NOT EXISTS(SELECT 1 FROM save_occurrences o WHERE o.subscription_id=s.id
       AND o.created_at >= strftime('%Y-%m-%dT%H:%M:%fZ','now','-14 days')))
ORDER BY s.last_success_at;

-- 4. Poll job history per subscription
SELECT json_extract(payload_json,'$.subscriptionId') AS subscription_id, status, last_error_code,
  COUNT(*) AS jobs, MIN(created_at) AS first_at, MAX(updated_at) AS last_at
FROM jobs WHERE kind='sync'
GROUP BY 1,2,3 ORDER BY last_at DESC LIMIT 300;

-- 5. Scheduler heartbeat
SELECT * FROM service_checks WHERE name='cron';

-- 6. Automatic versus manual saves, last 30 days
SELECT route, contributor, COUNT(*) AS occurrences
FROM save_occurrences
WHERE created_at >= strftime('%Y-%m-%dT%H:%M:%fZ','now','-30 days')
GROUP BY route, contributor ORDER BY occurrences DESC;
```

Without Cloudflare access, the same facts are available through the API with a token
for the owner's account in `ZINE_API_TOKEN` (from `apps/api`):

```sh
bun run cli request GET '/v1/subscriptions?limit=100'
bun run cli request GET '/v1/sources?limit=100'
bun run cli request GET '/v1/items?subscriptionId=<id>&limit=100'
bun run cli request GET '/v1/ops/status'
```

## 7. Appendix: how it works

### Databases: Zine Next and classic Zine do not share one

| System                                           | Worker / config                                            | D1 binding → database                                                |
| ------------------------------------------------ | ---------------------------------------------------------- | -------------------------------------------------------------------- |
| **Zine Next production** (`api-next.myzine.app`) | `zine-api-next`, `apps/api/wrangler.jsonc`                 | `DB` → `zine-api-next` (`0e55836b-07de-426b-9977-b783b0ea6652`)      |
| Zine Next staging                                | `zine-api-next-staging`, `apps/api/wrangler.staging.jsonc` | `DB` → `zine-api-next-staging`                                       |
| Classic Zine production                          | `apps/worker/wrangler.toml`, `[env.production]`            | `DB` → `zine-db-production` (`82911dea-5a6b-411b-ab4b-4145cb0c191d`) |

Zine Next has its own D1, R2 bucket, queue and vector index. Classic data was **copied**
in on Nov 11 by one-off scripts (`apps/api/scripts/migrate-legacy-subscriptions.ts`);
nothing is shared at runtime. `STATUS.md` says the classic system "remains live", so
classic Zine still polls its own copy of the same subscriptions on its own schedule.

### Tables (`apps/api/migrations`)

| Table                   | Role                                                                                                                                                                                       |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `sources`               | One creator/feed/channel per owner: `platform` (`youtube`, `spotify`, `x`, `substack`, `rss`, and `web` for feeds migrated from classic Zine), `name`, `url`.                              |
| `source_routes`         | How a source is polled: `kind` is `feed`, `youtube_feed`, `youtube_playlist`, `spotify_show` (and other `spotify_*`), `x_account`, `x_list`.                                               |
| `subscriptions`         | `status` (`active`/`unsubscribed`), `auto_save`, `filters_json`, `initialized`, `next_poll_at`, `last_success_at`, `last_error_code`, `intake_since_at`, lease columns, feed ETag columns. |
| `subscription_seen`     | Every entry key already handled, per subscription. This is what prevents duplicates.                                                                                                       |
| `save_occurrences`      | One row per reason an item is in the account. Subscription deliveries have `route='subscription'`, `contributor='zine:subscription'` and a `subscription_id`.                              |
| `personal_items`        | The item itself: `status` (`received`, `saved`, `dismissed`, `deleted`), `saved_at`, `decision_origin` (`automatic` or `explicit`).                                                        |
| `jobs`                  | Work log. `kind='sync'` rows are subscription polls, with `status`, `attempts`, `last_error_code`.                                                                                         |
| `service_checks`        | The cron heartbeat (`name='cron'`): last start, success, failure.                                                                                                                          |
| `legacy_import_records` | Receipts for items copied from classic Zine.                                                                                                                                               |

Automatic versus manual: a subscription delivery is a `save_occurrences` row with
`route='subscription'`; a manual save has `route='explicit'`. One item can have both. If
you had already saved or dismissed something, a later subscription delivery records the
occurrence but does not change your decision.

### Polling (`apps/api/src/jobs.ts`, `apps/api/src/subscriptions.ts`)

- **Cadence.** One Cloudflare cron, every 5 minutes. Each run picks up to 50 active
  subscriptions whose `next_poll_at` has passed and queues one `sync` job each. After a
  successful poll `next_poll_at` is set 15 minutes ahead, so the real interval is 15–20
  minutes when nothing is delayed. All platforms share this one schedule.
- **Per-platform fetch.** YouTube channels use the public channel feed (`youtube_feed`) or
  the Data API for playlists; Spotify and X use their APIs; Substack, RSS and websites use
  the feed. Feeds are fetched conditionally; an unchanged feed counts as a success.
- **What becomes an item.** On the first poll only the single newest existing entry is
  delivered; everything older is marked seen. After that, an entry is delivered only if
  it is unseen, was published after the subscription's start (`intake_since_at`, else
  `created_at`), and matches `filters.types`. Shorts are skipped unless the filter names
  them. Migrated subscriptions were created already initialised with the start set to
  Nov 11, so they never backfill.
- **Saved or Inbox.** `auto_save=1` creates the item as `saved`; otherwise as `received`.
- **Idempotency.** Job IDs are derived from the subscription and the 5-minute window, a
  subscription cannot have two pending polls, a 5-minute lease guards each poll, and the
  item, occurrence and seen-marker are written in one transaction with IDs derived from
  the subscription and entry.
- **Failures.** A failed poll writes the error code to `last_error_code` and pushes
  `next_poll_at` out by a short backoff (at most one hour). Retryable errors retry the
  same job up to six attempts. The subscription is never switched off automatically, so
  a permanently broken source is re-polled indefinitely and `last_success_at` simply
  stops moving. `last_error_code` clears on the next success.
- **"Stale".** `/v1/ops/status` reports `subscriptions_stale` when an active subscription
  is more than one hour past `next_poll_at`, and counts subscriptions with an error. The
  scheduled monitor (`apps/api/scripts/monitor.ts`) ignores both.
