# Productionization acceptance

Authorized by Erik: complete the discussed production work, excluding OAuth.
This file is the durable work tracker for fresh sessions. The earlier goal tracker
remains blocked on Google authorization and rejected a replacement goal. Erik said
replacing that tracker is unnecessary; tracking cleanup is a TODO, not a blocker.

## Scope and release target

Productionize this independent API for Erik's agent-built experiences. Preserve the
current authenticated behavior, original-library evidence, source-hosted media
boundary and independent Cloudflare resources. Existing mobile/legacy services
remain separate. New OAuth server/consent/registration flows and Google-authorized
acceptance are excluded. Existing Clerk verification must continue working.

Scoped personal tokens, quotas, client helpers, operational visibility, recovery,
release automation, events and signed webhooks are included. A broad public
integration marketplace or developer portal is not required.

## Requirements and proof

| ID  | Deliverable                                                       | Required evidence                                                                                                                                                      | Status                                         |
| --- | ----------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| P1  | Source-controlled rewrite, reviewed release and passing GitHub CI | Scoped commits/PR, required check results, merge/release source SHA                                                                                                    | Merged; CI + production release verified       |
| P2  | Separate staging and explicit production configuration            | Actual Worker/D1/R2/queue/vector bindings; isolation checks; no legacy bindings                                                                                        | Live isolated staging/production verified      |
| P3  | Repeatable migration/deploy/rollback                              | Automated workflow, immutable release manifest, migration validation, observed staging deployment and rollback/readback                                                | Release, backup workflow + rollback verified   |
| P4  | Database and retained-material recovery                           | Private backup manifest; actual restore into isolated new resources; record/artifact integrity and another-owner isolation; no real-account erasure                    | Live restore verified                          |
| P5  | Search-index rebuilding                                           | Actual index rebuild from restored authoritative material and verified keyword/semantic/hybrid retrieval                                                               | 491 rebuilt; 12 live retrieval cases passed    |
| P6  | Operational visibility and alerts                                 | Queue age, subscription freshness, component failures, usage and release status; durable alert lifecycle; injected failure observed and resolved                       | Live alert lifecycle + GitHub monitor verified |
| P7  | Caller and resource usage controls                                | Scoped request limits, enrichment and AI ceilings, retry/reset behavior, multi-caller fairness and live boundary checks                                                | Isolated + staging verified                    |
| P8  | Scoped revocable personal tokens                                  | Read/write/subscription/operations capabilities, no scope escalation, revocation, expiry, owner isolation, existing session behavior                                   | Isolated + staging verified                    |
| P9  | Agent-friendly typed client/CLI and reference experiences         | Runnable save/retrieve/search/subscription flows with safe retries, pagination, async status and structured errors against the live service                            | Production REST/MCP/client run verified        |
| P10 | Durable events and signed webhook delivery                        | Transactional event records, paginated replay, delivery signatures, retry/idempotency, cancellation/erasure fencing and observed receiver behavior                     | Live signed retry verified in staging          |
| P11 | Sustained operation and burst checks                              | Timestamped real-provider and real-library observations across scheduled polling cycles, bounded multi-owner bursts, no duplicate/lost durable saves, backlogs recover | 30min exact release + bounded bursts verified  |
| P12 | Fresh-session operations and final audit                          | Agent guide, doctor, runbooks, exact commands and artifacts, current source/deployment identities; every requirement inspected                                         | Audited; handoff/doctor/proof complete         |

Tests establish their actual cases, not universal correctness. Separate fixture
issuer/provider/AI checks from real Clerk/provider/Cloudflare execution. Builds,
uploads, manifests and health endpoints alone do not establish these outcomes.
Raw library material, backups and credentials stay out of git and public artifacts.

## Work order

1. Preserve the working implementation on a scoped branch; establish the baseline.
2. Add scoped tokens, usage controls and operational state with real D1 tests.
3. Add durable events/webhooks and thin client/CLI/reference experiences.
4. Provision staging; implement and observe release/recovery/index rebuild paths.
5. Configure operational checks/alerts and run scheduled/burst acceptance.
6. Complete release review/CI and production promotion, then verify the exact release.
7. Re-audit this table and update STATUS.md with proof and any actual remaining work.

## Administrative TODO

- Replace/archive the older Google-blocked goal in the goal UI if useful later.
  This does not block the work and must not be accomplished by claiming the old
  OAuth-inclusive objective was completed.

## Current proof

- [Scoped credentials, atomic quotas and staging burst](../evidence/production-controls-live.json).
- [Durable alert fault and resolution](../evidence/operations-live.json).
- [Real signed webhook delivery with scheduled retry](../evidence/webhooks-live.json).
- [Private backup archive hash readback](../evidence/backup-latest.json).
- [Full isolated D1/R2 restore and authoritative hashes](../evidence/recovery-restore.json).

Production serves reviewed source `627b63d439f1bcb781026901b754ebf363b4e373`,
Worker `23b9f152-39a0-4450-b0fd-1da9e746e130`, migrations 1–23.
See STATUS.md for the exact release and observation state.

Additional proof:

- [Successful full production workflow](https://github.com/ejohane/zine/actions/runs/42573335811) and [release receipt](../evidence/production-release.json).
- [Observed Linux private-backup workflow](https://github.com/ejohane/zine/actions/runs/42572985940).
- [Rebuilt recovery search and retained-material readbacks](../evidence/recovery-search-live.json).
- [Staging rollback and forward promotion](../evidence/rollback-live.json).
- [Exact released-source REST/MCP concurrency acceptance](../evidence/production-live.json).
- [Production keyword/semantic/hybrid search](../evidence/production-search-live.json).
- [Natural cron and operational state](../evidence/production-ops-live.json).
- [Actual GitHub scoped-monitor execution](../evidence/monitor-live.json).
- [45-minute prepromotion observation](../evidence/production-soak-prepromotion.json); the [final 30-minute exact-release observation](../evidence/production-soak.json) has 30 authenticated reads, zero failures and scheduled poll advances.

Current source limit: X reports upstream `provider_http_402`; no paid provider plan
change was made. The earlier YouTube feed 404 recovered: the new production
observation records successful YouTube, Spotify, Substack and RSS poll advances.
OAuth/Google-authorized acceptance remains deferred. These conditions remain
explicit; unavailable content is never fabricated.

The active GitHub backup/monitor workflows have successful actual Linux executions
via manual dispatch. Their natural scheduled triggers have not yet been observed
in these receipts. See [GitHub metadata](../evidence/github-operations-live.json),
[monitor execution](../evidence/monitor-live.json) and the scope on each receipt.
The final audit accepts the tested executable paths and configured schedules;
ongoing future uptime is not a claim of this finite verification window.
