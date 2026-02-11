# Epic: Gmail Newsletter Subscriptions and Inbox Ingestion (MVP)

## Epic Metadata

- **Epic ID**: `GNS-EPIC`
- **Source Plan**: `docs/gmail-newsletter-subscriptions-plan.md`
- **Objective**: Deliver Gmail as a first-class source with reliable newsletter detection, inbox ingestion, management controls, and operational hardening.
- **Primary Outcomes**:
  - Users can connect Gmail and see newsletter feeds.
  - Newsletter issues appear in Inbox as article-like items.
  - Users can manage feed state (`ACTIVE`, `HIDDEN`, `UNSUBSCRIBED`) and trigger unsubscribe actions.
  - Sync is safe, idempotent, and observable.

## Epic Scope

- OAuth/provider support for Gmail.
- New newsletter/mailbox data model.
- Initial + incremental sync pipeline.
- Detection heuristics and canonical feed identity.
- Issue-to-item ingestion into existing `items` + `user_items` lifecycle.
- Newsletter management API + mobile UX.
- Scheduler, locking, metrics, and rollout controls.

## Epic Non-Goals

- Full email-body storage.
- Full email-client features.
- Guaranteed unsubscribe completion for every publisher.
- Push/watch optimization in MVP.

## Epic Success Criteria

1. Connect completion rate from Gmail connect start to connected state is trackable and healthy.
2. Detection precision for newsletter feeds is >= 95% on sampled fixtures.
3. Time-to-first-surfaced newsletter issue after connect <= 2 minutes for small inboxes.
4. Incremental sync success rate >= 99%.
5. No duplicate issue ingestion under repeated sync/retry flows.

## Epic Global Dependencies

1. Google API scopes/policy posture for Gmail read access and consent screen approvals.
2. Gmail API is enabled in each Google Cloud project (dev/staging/prod), with propagation delay accounted for.
3. Existing provider connection/token infrastructure remains stable.
4. Feature flag rollout path exists in worker/mobile.

## Epic Critical Blockers (Observed in Dev)

1. `accessNotConfigured` if Gmail API is disabled for a project.
2. `ACCESS_TOKEN_SCOPE_INSUFFICIENT` if OAuth scopes differ between auth request and callback verification.
3. D1 FK constraint failures on disconnect when delete order/cascades are not explicit.
4. Detection false positives for transactional senders (example: ride receipts).

## Epic Done Definition

- All `GNS-*` issues closed.
- End-to-end manual verification checklist passes.
- Observability dashboards/alerts in place.
- No P0/P1 regressions in YouTube/Spotify flows.

---

## Issue Dependency Graph (Execution Order)

1. `GNS-00` -> (`GNS-01`, `GNS-03`)
2. `GNS-01` + `GNS-03` -> `GNS-02`
3. `GNS-01` -> `GNS-04`
4. `GNS-03` + `GNS-04` -> `GNS-05`
5. `GNS-05` -> `GNS-06`
6. `GNS-04` -> `GNS-07`
7. `GNS-04` + `GNS-06` + `GNS-07` -> `GNS-08`
8. `GNS-05` + `GNS-06` + `GNS-08` -> `GNS-09`
9. `GNS-03` + `GNS-04` + `GNS-05` -> `GNS-15`
10. `GNS-02` + `GNS-09` + `GNS-15` -> `GNS-10`
11. `GNS-09` + `GNS-10` -> `GNS-11`
12. `GNS-05` + `GNS-06` -> `GNS-12`
13. `GNS-00` + `GNS-03` + `GNS-05` + `GNS-12` -> `GNS-13`
14. `GNS-10` + `GNS-11` + `GNS-12` + `GNS-13` -> `GNS-14`

---

## Detailed Issues

## GNS-00: Google Cloud Gmail API + OAuth Scope Preflight

- **Type**: Enablement
- **Summary**: Validate Google Cloud project/API/scope prerequisites before feature implementation and QA.
- **Why**: Avoids blocked engineering/test cycles from environment-level misconfiguration.
- **Primary Files**:
  - `docs/gmail-newsletter-subscriptions-plan.md`
  - `apps/mobile/app.config.ts` (or equivalent OAuth config source)
  - worker environment configuration for OAuth client settings

### Requirements

1. Enable Gmail API in all target Google Cloud projects (dev/staging/prod).
2. Confirm OAuth consent + test users are configured for development.
3. Confirm required scopes are explicitly requested and documented (`gmail.readonly` baseline).
4. Validate redirect URIs and callback origins used by mobile/worker.
5. Add a short preflight checklist for future environments.

### Acceptance Criteria

1. OAuth callback no longer fails with `accessNotConfigured`.
2. OAuth callback/token verification no longer fails with insufficient scope for profile lookup.
3. Preflight checklist exists and is referenced by implementation tickets.

### Dependencies

- None.

### Blockers/Risks

- Google project policy review delays or API enablement propagation lag.

### Verification

- Manual connect smoke test in dev environment.
- Run preflight checklist against staging configuration before rollout.

## GNS-01: Add `GMAIL` to Shared Provider Domain and Provider-Extensible Surfaces

- **Type**: Foundation
- **Summary**: Add `GMAIL` to shared enums/schemas and remove hard-coded provider assumptions in shared/mobile/worker interfaces.
- **Why**: Every subsequent issue depends on provider domain correctness.
- **Primary Files**:
  - `packages/shared/src/types/domain.ts`
  - `packages/shared/src/schemas/index.ts`
  - provider switch sites in worker/mobile that currently assume YouTube/Spotify only.

### Requirements

1. `GMAIL` is accepted in provider schemas/types used by tRPC inputs and shared contracts.
2. Existing provider lists are updated to be extensible without breaking compatibility.
3. No regressions to existing providers.

### Acceptance Criteria

1. Typecheck passes across monorepo.
2. Existing provider-related tests pass.
3. New tests assert `GMAIL` is accepted where appropriate.

### Dependencies

- None.

### Blockers/Risks

- Hidden hard-coded provider switches causing runtime branches to reject `GMAIL`.

### Verification

- `bun run typecheck`
- targeted router validation tests for provider inputs.

---

## GNS-02: Gmail OAuth Support in Mobile Connect Flows

- **Type**: Feature
- **Summary**: Implement Gmail connection flow from subscriptions UI using existing PKCE/state/callback patterns.
- **Why**: User entrypoint for feature.
- **Primary Files**:
  - `apps/mobile/lib/oauth.ts`
  - `apps/mobile/app/subscriptions/index.tsx`
  - `apps/mobile/app/subscriptions/[provider].tsx`
  - `apps/mobile/app/subscriptions/connect/gmail.tsx`

### Requirements

1. Gmail appears as provider card in subscriptions surfaces.
2. Connect flow uses PKCE + state registration and callback mutation.
3. UX communicates read-only data access and control points.
4. Error states are actionable (scope missing, API disabled, callback failure).

### Acceptance Criteria

1. User can start Gmail connect from Subscriptions.
2. Successful auth marks Gmail connected in UI.
3. Failure paths show specific error messaging.
4. Existing YouTube/Spotify connect UX remains unchanged.

### Dependencies

- `GNS-00`, `GNS-01`, `GNS-03`

### Blockers/Risks

- Misconfigured OAuth env vars/redirect URIs or stale consent scope configuration.

### Verification

- Mobile manual connect/disconnect flows.
- `apps/mobile` tests for OAuth error handling.

---

## GNS-03: Worker Gmail Auth/Token Refresh Integration

- **Type**: Feature
- **Summary**: Extend worker auth/token refresh providers to support Gmail lifecycle.
- **Why**: Sync jobs and callback mailbox setup require stable token handling.
- **Primary Files**:
  - `apps/worker/src/lib/auth.ts`
  - `apps/worker/src/lib/token-refresh.ts`
  - `apps/worker/src/trpc/routers/connections.ts`

### Requirements

1. Gmail token exchange and refresh are supported.
2. Token revocation on disconnect is best-effort and non-blocking.
3. Callback flow fails safely with clear user-facing errors.

### Acceptance Criteria

1. OAuth callback persists Gmail provider connection on success.
2. Refresh path works for expiring Gmail tokens.
3. Disconnect revokes token (best effort) and cleans local state.

### Dependencies

- `GNS-00`, `GNS-01`

### Blockers/Risks

- Scope mismatches or disabled Gmail API causing callback/mailbox verification failures.

### Verification

- Worker router tests for callback/disconnect.
- Manual callback and reconnect path.

---

## GNS-04: Database Migrations for Mailbox and Newsletter Tables

- **Type**: Data Model
- **Summary**: Add and verify mailbox/newsletter tables and indexes used by Gmail ingestion.
- **Why**: Core persistence layer.
- **Primary Files**:
  - `apps/worker/src/db/schema.ts`
  - `apps/worker/src/db/migrations/*`
  - `apps/worker/src/db/migrations/meta/_journal.json`

### Requirements

1. Add/validate tables:
   - `gmail_mailboxes`
   - `newsletter_feeds`
   - `newsletter_feed_messages`
   - `newsletter_unsubscribe_events`
2. Include required uniqueness and performance indexes.
3. Migration is forward-safe in worktree/dev DBs.
4. Define FK cascading rules or explicit delete ordering to support disconnect cleanup.

### Acceptance Criteria

1. Migration applies without FK errors in local dev DB.
2. Schema aligns with plan doc columns/indexes.
3. Rollback/reseed flows remain operable (`dev:reset` + `dev:worktree`).
4. Disconnect cleanup path can execute without FK constraint failures.

### Dependencies

- `GNS-01`

### Blockers/Risks

- FK delete order mismatches and migration drift.

### Verification

- Run migrations on fresh + existing local DB state.
- Typecheck and targeted DB integration tests.

---

## GNS-05: Mailbox Lifecycle + Initial Bootstrap Sync

- **Type**: Feature
- **Summary**: Implement mailbox record lifecycle and first-run bounded sync.
- **Why**: First content experience after connect.
- **Primary Files**:
  - `apps/worker/src/newsletters/gmail.ts`
  - `apps/worker/src/trpc/routers/connections.ts`

### Requirements

1. Upsert `gmail_mailboxes` on first callback/sync.
2. Initial sync pulls bounded recent window (e.g., last 30 days).
3. Sync status fields are updated (`RUNNING`/`SUCCESS`/`ERROR`).
4. Safe lock behavior prevents duplicate mailbox sync runs.

### Acceptance Criteria

1. Newly connected user gets mailbox row + initial sync attempt.
2. Sync status and last error fields reflect run outcome.
3. Duplicate concurrent sync attempts are prevented.

### Dependencies

- `GNS-03`, `GNS-04`

### Blockers/Risks

- Gmail API quotas/rate limits.

### Verification

- Worker sync tests and manual sync run after connect.

---

## GNS-06: Incremental Sync + Stale Cursor Recovery

- **Type**: Feature
- **Summary**: Implement delta sync via Gmail `historyId` with bounded backfill fallback.
- **Why**: Required for reliability and scale.
- **Primary Files**:
  - `apps/worker/src/newsletters/gmail.ts`
  - scheduler integration files under `apps/worker/src/sync`/`apps/worker/src/polling`

### Requirements

1. Use saved mailbox `history_id` for incremental fetch.
2. Detect stale cursor and fallback to bounded initial recovery.
3. Persist new `history_id` after successful run.
4. Preserve idempotency across retries.

### Acceptance Criteria

1. Incremental runs ingest only deltas under normal conditions.
2. 404 stale history fallback recovers without silent data loss.
3. Re-running same delta does not duplicate items.

### Dependencies

- `GNS-05`

### Blockers/Risks

- Edge cases around history window expiration.

### Verification

- Integration tests for incremental + stale cursor scenarios.

---

## GNS-07: Newsletter Detection Heuristics and Canonical Feed Identity

- **Type**: Feature
- **Summary**: Build and tune scoring logic + canonical key generation for high precision.
- **Why**: Quality gate preventing inbox spam/noise.
- **Primary Files**:
  - `apps/worker/src/newsletters/gmail.ts`
  - test fixtures under `apps/worker/src/newsletters/*.test.ts`

### Requirements

1. Weighted signals from `List-*` headers, sender, subject, unsubscribe metadata.
2. Transactional/promo patterns are penalized/excluded.
3. Canonical key fallback order:
   - `List-Id`
   - unsubscribe target
   - sender address
4. Feed visibility gate avoids structural-header-only false positives.
5. Newly detected feeds default to `UNSUBSCRIBED` (explicit opt-in model).

### Acceptance Criteria

1. Fixture precision target >= 95% for high-confidence newsletters.
2. Known transactional samples (e.g., receipts/notifications) are excluded.
3. Canonical keys remain stable for recurring senders.
4. New feeds are `UNSUBSCRIBED` until user explicitly activates them.

### Dependencies

- `GNS-04`

### Blockers/Risks

- Long-tail newsletter formats and transactional false positives (example: Uber receipts).

### Verification

- Unit tests with positive/negative fixtures.
- Manual spot checks in seeded inbox data.

---

## GNS-08: Issue-to-Item Mapping and Idempotent Inbox Ingestion

- **Type**: Feature
- **Summary**: Map eligible newsletter messages to canonical items + user inbox records.
- **Why**: Core value delivery.
- **Primary Files**:
  - `apps/worker/src/newsletters/gmail.ts`
  - `apps/worker/src/trpc/routers/items.ts` (consumption checks)

### Requirements

1. For eligible messages, create `items` with:
   - `contentType=ARTICLE`, `provider=GMAIL`
   - deterministic `providerId`
   - title/summary/canonicalUrl mapping rules
2. Insert `user_items` with `state=INBOX`.
3. Record mapping in `newsletter_feed_messages`.
4. Idempotency via unique keys and conflict handling.
5. Respect feed status gating (feeds default to `UNSUBSCRIBED`; only `ACTIVE` ingests).

### Acceptance Criteria

1. Only `ACTIVE` feeds generate inbox items; `HIDDEN`/`UNSUBSCRIBED` do not ingest new items.
2. Duplicate sync/retry does not create duplicate `items` or `user_items`.
3. Item opens using article behavior and mapped URL.

### Dependencies

- `GNS-04`, `GNS-06`, `GNS-07`

### Blockers/Risks

- URL quality when snippet lacks reliable primary link.

### Verification

- Integration tests for idempotency and status gating.
- Manual inbox rendering checks.

---

## GNS-09: Newsletter Management Router (`subscriptions.newsletters.*`)

- **Type**: API
- **Summary**: Add list/status/unsubscribe/sync/stats endpoints.
- **Why**: Required for user control and UI composition.
- **Primary Files**:
  - `apps/worker/src/trpc/routers/newsletters.ts`
  - `apps/worker/src/trpc/router.ts` (wiring)

### Requirements

1. Implement procedures:
   - `list`
   - `updateStatus`
   - `unsubscribe`
   - `syncNow`
   - `stats`
2. Procedure auth/ownership checks enforced.
3. `unsubscribe` records event rows with method and status.
4. `list` supports search/status/pagination.
5. `updateStatus` enforces explicit state transitions and never auto-activates newly detected feeds.

### Acceptance Criteria

1. Endpoints return deterministic schema contracts.
2. Unauthorized or cross-user access is rejected.
3. Unsubscribe event rows are always written.
4. Newly detected feeds are returned as `UNSUBSCRIBED` unless explicitly activated.

### Dependencies

- `GNS-05`, `GNS-06`, `GNS-08`

### Blockers/Risks

- Unsubscribe endpoint variability and false success claims.

### Verification

- Router contract tests + integration tests.

---

## GNS-15: Disconnect Lifecycle Integrity (FK-Safe, Idempotent Cleanup)

- **Type**: Reliability/Data Integrity
- **Summary**: Make Gmail disconnect fully reliable by enforcing deterministic cleanup order/cascades and idempotent behavior.
- **Why**: Disconnect failures break user trust and can leave sync running against disconnected accounts.
- **Primary Files**:
  - `apps/worker/src/trpc/routers/connections.ts`
  - `apps/worker/src/db/schema.ts`
  - `apps/worker/src/newsletters/gmail.ts`

### Requirements

1. Disconnect cleanup sequence is FK-safe (or uses correctly defined cascades).
2. Disconnect is idempotent; repeated calls do not error.
3. Mailbox sync is halted/unscheduled on disconnect.
4. Local provider tokens/connection rows are cleaned up in the same operation.

### Acceptance Criteria

1. Disconnect does not produce D1 FK constraint errors.
2. Repeated disconnect calls return success/benign no-op behavior.
3. After disconnect, no Gmail mailbox remains eligible for sync.

### Dependencies

- `GNS-03`, `GNS-04`, `GNS-05`

### Blockers/Risks

- Hidden FK dependencies and in-flight scheduler locks during disconnect.

### Verification

- Integration test: connect -> sync -> disconnect -> reconnect.
- Manual disconnect smoke tests in simulator and worker logs.

---

## GNS-10: Gmail Subscriptions UX (List, Actions, Sync, Connection State)

- **Type**: Mobile Feature
- **Summary**: Build provider detail UX for Gmail with feed list and actions.
- **Why**: Usable management surface.
- **Primary Files**:
  - `apps/mobile/app/subscriptions/[provider].tsx`
  - `apps/mobile/hooks/*connections*`

### Requirements

1. Show Gmail connection card/status in subscriptions provider view.
2. Show newsletter feed list with search and status labels.
3. Actions:
   - Subscribe/Hide/Show (status toggle)
   - Unsubscribe (where applicable)
   - Sync now
4. Handle errors with clear alerts and rollback behavior.
5. Ensure accessible/legible button states and icon fallback behavior.
6. Feed avatar fallback chain is deterministic:
   - publication/logo image (if available)
   - sender-domain favicon (if available)
   - provider fallback image (Substack icon for substack-hosted feeds, generic mail icon otherwise)

### Acceptance Criteria

1. User can activate/deactivate feeds from list.
2. Manual sync trigger refreshes list/stats.
3. Disconnect works without FK/optimistic-cache failures.
4. UI remains readable in dark theme, including subscription CTA text contrast.
5. Avatar rendering uses fallback chain without broken images.

### Dependencies

- `GNS-02`, `GNS-09`, `GNS-15`

### Blockers/Risks

- Cache-shape inconsistencies in optimistic updates.

### Verification

- Mobile hook/component tests.
- Manual on-device/simulator walkthrough.

---

## GNS-11: Unsubscribe Execution Strategy + Event Transparency

- **Type**: Feature
- **Summary**: Implement method-priority unsubscribe behavior with explicit statusing.
- **Why**: Critical trust/control requirement.
- **Primary Files**:
  - `apps/worker/src/trpc/routers/newsletters.ts`
  - mobile surfaces showing unsubscribe results.

### Requirements

1. Method priority:
   - one-click POST
   - URL
   - mailto
2. Event row includes method, target, status, error.
3. Unknown completion is represented as `REQUESTED`, not `COMPLETED`.
4. Feed transitions to `UNSUBSCRIBED` in app state.

### Acceptance Criteria

1. Each unsubscribe attempt produces an auditable event row.
2. Error states are surfaced to user.
3. No false-positive success messaging.

### Dependencies

- `GNS-09`, `GNS-10`

### Blockers/Risks

- Publisher-specific unsubscribe flows can fail silently.

### Verification

- Unit tests for method selection.
- Manual tests with mocked failing/successful endpoints.

---

## GNS-12: Scheduler, Locking, and Observability Hardening

- **Type**: Reliability
- **Summary**: Add operational scheduling, lock safety, and metrics for Gmail sync.
- **Why**: Needed for production reliability targets.
- **Primary Files**:
  - scheduler/polling modules
  - newsletter sync logger/metrics instrumentation

### Requirements

1. Scheduled incremental sync for active Gmail mailboxes.
2. Mailbox-level lock to avoid duplicate workers.
3. Metrics/logs for:
   - sync duration
   - processed messages
   - ingested items
   - failures by class
4. Backoff/retry policy for transient Gmail errors.

### Acceptance Criteria

1. Dashboardable counters exist for success/error rates.
2. Repeated scheduled runs do not race or duplicate.
3. Alertable error conditions are emitted.

### Dependencies

- `GNS-05`, `GNS-06`

### Blockers/Risks

- Quota throttling and noisy retry loops.

### Verification

- Scheduler integration tests.
- Log/metric snapshots from local/staging runs.

---

## GNS-13: Security, Privacy, Compliance, and Logging Hygiene

- **Type**: Compliance/Hardening
- **Summary**: Ensure data minimization, token safety, and policy-aligned behavior.
- **Why**: Production readiness and provider policy requirements.

### Requirements

1. Tokens remain encrypted at rest (existing AES-GCM path).
2. Limit stored Gmail data to required metadata/snippet for MVP.
3. Remove/redact sensitive values from logs.
4. Validate connection revoke/disconnect behavior and mailbox cleanup.
5. Document scope usage and policy posture.

### Acceptance Criteria

1. No sensitive token/body data appears in operational logs.
2. Disconnect reliably halts sync and cleans mailbox-related state.
3. Compliance checklist sign-off completed for launch.

### Dependencies

- `GNS-00`, `GNS-03`, `GNS-05`, `GNS-12`

### Blockers/Risks

- Late policy requirements from Google review.

### Verification

- Security review checklist and targeted log inspection tests.

---

## GNS-14: End-to-End Validation, Rollout, and Launch Gate

- **Type**: Release
- **Summary**: Validate complete user/system behavior and execute phased rollout.
- **Why**: Controlled release with measurable risk.

### Requirements

1. Execute manual checklist from source plan:
   - connect
   - initial sync
   - inbox ingestion
   - feed hide/unsubscribe
   - disconnect/reconnect
2. Launch via feature flags:
   - internal
   - beta cohort
   - wider rollout
3. Define rollback criteria and on-call playbook.
4. Confirm success metrics instrumentation is queryable.

### Acceptance Criteria

1. Checklist passes in staging and production canary cohort.
2. Rollout metrics stay within threshold/error budget.
3. Rollback path is tested and documented.

### Dependencies

- `GNS-10`, `GNS-11`, `GNS-12`, `GNS-13`, `GNS-15`

### Blockers/Risks

- Unexpected edge-case regressions in existing provider flows.

### Verification

- Release report with pass/fail per acceptance criterion.

---

## Suggested Milestone Mapping

- **Milestone A (Enablement + Foundation)**: `GNS-00` to `GNS-04`
- **Milestone B (MVP Ingestion Core)**: `GNS-05` to `GNS-09`
- **Milestone C (Integrity + Management UX)**: `GNS-15`, `GNS-10`, `GNS-11`
- **Milestone D (Hardening + Launch)**: `GNS-12` to `GNS-14`

---

## Notes for Issue Tracker Import

- Each `GNS-*` issue above is intentionally self-contained and can be copied directly into Beads/Jira/Linear.
- Keep acceptance criteria as testable checklists in each ticket.
- Preserve dependency ordering to avoid blocked implementation work.
