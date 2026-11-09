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

| ID  | Deliverable                                                       | Required evidence                                                                                                                                                      | Status      |
| --- | ----------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| P1  | Source-controlled rewrite, reviewed release and passing GitHub CI | Scoped commits/PR, required check results, merge/release source SHA                                                                                                    | In progress |
| P2  | Separate staging and explicit production configuration            | Actual Worker/D1/R2/queue/vector bindings; isolation checks; no legacy bindings                                                                                        | Pending     |
| P3  | Repeatable migration/deploy/rollback                              | Automated workflow, immutable release manifest, migration validation, observed staging deployment and rollback/readback                                                | Pending     |
| P4  | Database and retained-material recovery                           | Private backup manifest; actual restore into isolated new resources; record/artifact integrity and another-owner isolation; no real-account erasure                    | Pending     |
| P5  | Search-index rebuilding                                           | Actual index rebuild from restored authoritative material and verified keyword/semantic/hybrid retrieval                                                               | Pending     |
| P6  | Operational visibility and alerts                                 | Queue age, subscription freshness, component failures, usage and release status; durable alert lifecycle; injected failure observed and resolved                       | Pending     |
| P7  | Caller and resource usage controls                                | Scoped request limits, enrichment and AI ceilings, retry/reset behavior, multi-caller fairness and live boundary checks                                                | Pending     |
| P8  | Scoped revocable personal tokens                                  | Read/write/subscription/operations capabilities, no scope escalation, revocation, expiry, owner isolation, existing session behavior                                   | Pending     |
| P9  | Agent-friendly typed client/CLI and reference experiences         | Runnable save/retrieve/search/subscription flows with safe retries, pagination, async status and structured errors against the live service                            | Pending     |
| P10 | Durable events and signed webhook delivery                        | Transactional event records, paginated replay, delivery signatures, retry/idempotency, cancellation/erasure fencing and observed receiver behavior                     | Pending     |
| P11 | Sustained operation and burst checks                              | Timestamped real-provider and real-library observations across scheduled polling cycles, bounded multi-owner bursts, no duplicate/lost durable saves, backlogs recover | Pending     |
| P12 | Fresh-session operations and final audit                          | Agent guide, doctor, runbooks, exact commands and artifacts, current source/deployment identities; every requirement inspected                                         | In progress |

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
