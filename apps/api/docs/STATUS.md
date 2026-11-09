# Session handoff

Last reviewed: 2026-11-09 UTC. This is a handoff, not live verification. Run the startup
checks in `../AGENTS.md` and inspect current state before acting on it.

## Product direction

Zine is an API-first saving service. Erik wants to start building experiences on
it. Codex will remain the implementation/operations agent, frequently in fresh
sessions. Prioritize durable repository context, clear contracts, structured errors,
repeatable commands and reliable releases. A broad external-developer platform is
not the immediate target. A small SDK/helper is useful only where it removes real
integration friction. The existing CLI and OpenAPI already provide agent entry points.

First-party Clerk sessions and personal API tokens exist. Scoped tokens, quotas,
events/webhooks and operational controls are implemented and have isolated/runtime
and staging evidence. Production still serves the earlier release until the
production workflow below is completed. New OAuth server/consent flows remain
excluded; browser/mobile experiences still need an appropriate user session.

## Implementation and release snapshot

- The rewrite lives entirely in `apps/api` and is deployed at
  <https://api-next.myzine.app>. REST is `/v1`, MCP is `/mcp`.
- Current resource names/configuration are in `../wrangler.jsonc`. D1, R2, Queues,
  Vectorize and the Worker are separate from the original backend. Workers AI
  derives understanding and embeddings. Cron runs every five minutes.
- Subscription polls become due fifteen minutes after success; queue/provider
  delays can extend the observed interval.
- The live authenticated inspector is `/`; API reference is `/docs`; the public
  explanatory walkthrough is `/architecture`. The walkthrough is illustrative and
  does not make live requests or change the library.
- Working branch: `codex/zine-api-production`, baseline commit `ce024f0c`.
  The baseline rewrite is committed; substantial productionization work is still
  local and uncommitted. Main was fetched and has no changes beyond the branch's
  base. No PR or GitHub CI has run yet for this work.
- Production currently serves Worker version `02ecfb45-1cec-471f-ab7f-18303723c01f`
  with migrations 1–17. Local production configuration now uses the explicit
  production label; that configuration has not yet been promoted.
- Staging is <https://api-next-staging.myzine.app>, separate fresh resources in
  `wrangler.staging.jsonc`, D1 `f467b228-5f55-447b-8dbc-006edea2f727`. It served
  `785df10f-9262-4ab7-bfed-490238b111c8` for real signed-webhook evidence, with
  migrations 1–21. Newer local changes still need a reviewed staging release.
- Recovery is `zine-api-next-recovery` with D1
  `29df9a64-93a0-4ada-929e-43c057b2ead8` and fresh R2/queue/vector resources.
  See the dedicated verification config. It contains a private isolated restore,
  no live tokens/grants/webhooks, and paused subscriptions/external jobs. A search
  rebuild is actively running; inspect its checkpoint before restarting anything.
- Local release, private-backup and independent-monitor workflows now exist under
  `.github/workflows/api-next-*.yml` but are not yet published or observed in GitHub.

## Current acceptance blocker

Live Google-authorized YouTube metadata and playlist/channel pagination need an
approved usable grant/API key, or access to the key that decrypts the original
Google grant. The original application supports Google integration. Its production
Worker has an `ENCRYPTION_KEY` secret binding; the settings API exposes no value.
The inspected local key did not decrypt the existing grant. Do not describe this
as the original application's integration being absent.

Public YouTube extraction and channel-feed intake have live evidence. Their
success is separate from official authorized API acceptance. Metadata inventory
and prior investigation are in `../evidence/google-credential-availability.json`
and `google-grant-reuse.json`. Never paste keys into the handoff.

## Implemented behavior and evidence

Read the blueprint and completion audit for the full contract. Core behavior
includes durable saves, private context, lifecycle/progress, collections/synthesis,
annotations, rich contributions/corrections, six-provider integration, subscriptions,
keyword/semantic/hybrid search, strong identity reconciliation, private relationships,
export/erasure, revocable tokens, CLI/MCP adapters and job/recovery machinery.

Evidence locations:

- `verification.md`: artifact inventory and scope limits.
- `completion-audit.md`: requirement-by-requirement acceptance, including the blocker.
- `../evidence/deployment.json`: timestamped active-version/resource inspection.
- `../evidence/library-import.json` and `remote-library-import.json`: real-library
  capture/readback, separate from fresh provider extraction.
- `../evidence/identity-journeys.json`, `remote-isolation.json`, `search-quality.json`
  and `live-sources.json`: bounded live behavior checks.
- `../evidence/erasure-concurrency.json`: controlled Worker races and isolated
  real-library erasure; it is not deployed real-account deletion.
- `../evidence/repository-checks.json`: recorded checks and runtime versions. The
  architecture guide has separate interaction/delivery evidence in
  `architecture-guide.json`; do not extrapolate a previous suite count to new code.

Browser use was disabled during walkthrough verification. DOM interactions, static
checks and HTTP delivery passed; visual browser review was not observed. Recheck
current tool availability rather than assuming that limitation is permanent.
Private `.local-data` inputs are not committed and are not required for isolated
fixture tests. Never fabricate unavailable original-library artifacts.

## Active production work

Erik authorized completing all discussed productionization work except OAuth.
Follow [productionization.md](productionization.md) for the acceptance requirements,
current work order and proof. This supersedes the earlier planning-only wording.

New OAuth flows/consent and Google-authorized acceptance are excluded from this
production task. Preserve existing Clerk verification. Scoped PATs, operational
controls, client helpers, events/webhooks, staging/release/recovery and live proof
are included. The original Google acceptance issue remains a separately deferred
item; it must not silently block this authorized non-OAuth work.

The goal tool rejected creating a replacement while the older goal remained
unfinished. Erik said replacing it is unnecessary and can be a TODO. Track the
work in the repository and continue; do not mark the older objective complete to
work around the tracker.

## Productionization checkpoint: 2026-11-09 around 04:50 UTC

Completed evidence (inspect timestamps and exact scopes):

- `production-controls-live.json`: real Clerk + staging scopes/revocation,
  exactly-once context under idempotent save retry, keyword readback, production
  isolation, 25-call burst with exactly 20 allowed/five limited and another caller
  unaffected. The lower caller cap is intentional in staging.
- `webhooks-live.json`: separate Cloudflare receiver verified HMAC, returned 503,
  then accepted identical delivery/body on the scheduled retry five minutes later.
  Configuration propagation initially caused an invalid-signature attempt; the
  verifier now waits for its exact read secret to become active before sending.
- `operations-live.json`: actual staging fault injection opens/deduplicates/resolves
  a durable backlog alert. No real provider/library/production mutation.
- `backup-latest.json`: private content-addressed R2 archive, downloaded again to
  verify its hash; 30-day backup lifecycle configured.
- `recovery-restore.json`: native point-in-time production snapshot restored into
  fresh resources, 491 items/5,473 contributions, all 21 authoritative table hashes
  matching, foreign keys valid, and all 299 objects written/read back with matching
  hashes. This is a full data-restore receipt, not index/search acceptance.

Important recovery findings were fixed: omit completed-job artifact references
from backup; import parent tables before children across D1 processing batches;
use individual count queries because D1 limits compound SELECTs; and seed vector
request revisions above the source revisions to avoid historical job-ID collisions.
`test/recovery.test.ts` uses a synthetic SQLite snapshot restored into actual D1
and verifies private text, FTS, credential scrubbing and successful scheduling
past old job IDs. The active recovery was repaired only in its derived revision
state using `repair-recovery-index.ts`; no source/production state was modified.

The 128-test Node 22 suite passed before the new recovery regression and owner
retention migration. Run the current complete suite before release; do not repeat
128 as the final count. Latest focused recovery/event checks passed, as did types.
Migrations 22 (release ledger) and 23 (owner-specific replay retention) are local
additions; recovery is being updated to these, staging/production are not yet.

Active long-lived processes (do not silently restart/duplicate):

- `secretsctl run zine.test -- bun run scripts/soak.ts 45`, PTY session `48684`.
  Started `2026-11-09T04:33:29Z`, expected through about `05:18:29Z`.
  Private checkpoint `.local-data/soak-progress.json`; final public artifact is
  `evidence/production-soak.json`. It only reads production and closes its real
  Clerk session at the end. At the last check it had zero failed observations.
- `secretsctl run zine.test -- bun run scripts/verify-recovery-live.ts`, PTY session
  `9359`, started around 04:40 UTC, waits up to 30 minutes for indexing, then tests
  12 known retrieval cases and retained material. Check
  `.local-data/recovery-index-progress.json` and `.local-data/recovery-live.log`.
  Its second owner is a controlled read-only PAT bootstrap in the isolated DB;
  cleanup revokes that probe. Source snapshot had one real owner, so do not claim
  another real Clerk identity was tested.

Next actions:

1. Finish the active recovery/search proof; explicit one-second queue batch timeout
   is being deployed to recovery to reduce single-job batching delay, while keeping
   provider cooldowns and global AI serialization intact. Check its deploy log and
   actual queue settings. Do not clear quotas/cooldowns to accelerate acceptance.
2. Review/package remaining source, generated architecture guide, proof artifacts
   and runbooks. Run current API checks and root gates; ensure no private backup,
   credentials, raw library files or build artifacts are staged (repo is PUBLIC).
3. Commit, publish a ready scoped PR, watch/fix CI and merge when ready. Apply the
   create-pr workflow already read for this task. No source push has happened yet.
4. Observe staging release of the exact merged source, then use
   `verify-rollback-live.ts 785df10f-9262-4ab7-bfed-490238b111c8` to prove real
   rollback/readback/forward promotion. Run production workflow only after staging.
5. After production promotion, configure the scoped monitor via
   `configure-monitor.ts`; dispatch/observe its GitHub workflow and backup/release
   workflows. Run authenticated production checks and bounded save bursts with
   cleanup. Observe the soak result and confirm real provider polling advances.
6. Complete P1–P12 with current evidence, release SHA/version and limitations;
   update this handoff. The old goal-control cleanup remains merely a TODO.

Runbooks: `production-controls.md`, `events.md`, `operations.md`; typed helper:
`client/index.ts`. The standalone walkthrough must be regenerated after final
OpenAPI changes. Browser use was disabled earlier; no new visual-browser claim.

### Subsequent review notes

The current source has 23 migrations. Exported event/webhook/subscription sections
now use their corresponding scopes instead of widening library-read privileges.
The newest focused 15 authorization/usage/operations tests pass; the last full
Node-22 run was 129 tests before the additional portability-scope regression (so
expect 130 in the final source). A temporary public-feed fallback experiment and
its two tests were removed: YouTube's documented XML topic returned an empty
generic feed, which cannot establish channel intake. Do not cite the experimental
131-test count as the final suite or claim that fallback was shipped.

The production observer found X `provider_http_402` and a transient public YouTube
feed `source_not_found` despite prior successful polls. Spotify, Substack and RSS
show actual scheduled advances; health/authenticated library observations have no
failures so far. Record provider degradation in the final audit. No billing change
or OAuth work was authorized or performed. `verify-youtube-feed-live.ts` is a
repeatable staging probe but has not passed under the current feed condition.

Recovery index progress is now past 200 processed items. The original verifier's
30-minute deadline may expire while its legitimate backfill continues. If it exits,
confirm cleanup, then run `verify-recovery-live.ts --resume` (now a 60-minute wait)
without queueing another full revision. Do not run two simultaneous verifiers.

## Release checkpoint: 2026-11-09 around 06:10 UTC

The rewrite and production controls merged in PR #466 after all 13 applicable
checks passed. Main source is `afb3a32e9dcdce5104f1a2c65df32ff1294e0baf`.
The post-merge automatic staging workflow succeeded. Production promotion run
`42569440806` and standalone backup run `42570675380` stopped at backup **before
production migrations/deployment**: Ubuntu installed SQLite 3.45.1, while the D1
native dump uses `unistr()` (introduced in SQLite 3.50). Production still has the
old 17-migration/version snapshot; do not claim it has been promoted.

Current branch `codex/zine-api-production-proof` starts from merged main and fixes
that portability issue. It adds the official SQLite 3.54.1 Linux tool installer,
verified against SQLite's published SHA3-256, and backup preflight checks before
export. The workflow changes have not yet been pushed/observed. No Cloudflare
credential changes were needed or made; a repeat local backup at 06:02 succeeded
with all 491 records/299 retained objects, confirming this runner compatibility
issue. The private download's signed URL is now suppressed on network errors.

Completed recovery/search acceptance is in `recovery-search-live.json`: 491 owner
items rebuilt, no pending index revisions, 455 saved items read with real Clerk,
all 12 keyword/semantic/hybrid cases ranked the expected original reference first,
and three retained-material API readbacks passed. The first 30-minute verifier
timed out during legitimate backfill; its resumed run completed at 05:39 UTC with
probe token/session cleanup. No recovery verifier remains running.

The 45-minute observer completed at 05:18 UTC: 46 healthy authenticated library
reads, Spotify/Substack/RSS scheduled advances, with X HTTP 402 and YouTube public
feed 404 separately observed. `production-soak.json` identifies the old serving
version; it is not proof of the upcoming production release. `rollback-live.json`
records successful staging rollback/forward promotion and retained context with
all 23 migrations preserved.

Next: push/review the SQLite fix and accompanying proof/helper; manually run the
private-backup workflow on that branch to verify Linux operation before merging.
Then retry the full production release from the fixed main. Run
`verify-production-live.ts EXACT_RELEASE_SHA` for controlled concurrent saves,
scopes, pagination, completion/archive, events and real MCP checks with cleanup.
Configure/observe the scoped monitor, run a post-release observer, and complete the
acceptance audit/updated deployment receipt. Keep upstream provider limitations
explicit; OAuth and the old goal-control cleanup remain deferred.
