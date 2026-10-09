# Workstream 1: publishing foundation

## Assignment

Implement the shared publication/issue domain and public-safe REST boundary from
product-spec.md and contracts.md. You own central migrations, shared schema exports,
OpenAPI registration, auth/ownership, and durable publication events. Coordinate
migration and DTO contributions from Wrapped and delivery before applying them.

## Deliverables

- One publication per owner, editable presentation, stable public identity/links.
- Private issue CRUD, section/order operations, selection metadata snapshots and
  public eligibility checks, weekly window association, optimistic concurrency.
- Explicit atomic/idempotent publishing; weekly addition restriction and independent
  addition events; corrections and removals without notifications.
- Anonymous publication/archive/issue projections and protected owner views.
- Publication subscription storage and owner-only subscriber access, distinct from
  provider subscriptions; backend contract for subscription preferences.
- Cover storage/validation and unavailable-destination/tombstone policy coordinated
  with public sharing and attribution.
- Executable schemas, public/private fixtures, decoder examples, API docs, meaningful
  migration/auth/lifecycle tests and event handoff.

## Boundaries

No SwiftUI, web rendering, recap ranking, APNs delivery, or notification scheduling.
Do not expose stored reader bodies or raw provider metadata. Do not change Today
editorial editions into personal issues. Reuse existing canonical items/bookmark
services where valid; preserve reader ownership.

## Acceptance

A second user cannot edit or read a draft. Anonymous payloads contain only allowlisted
public data. Duplicate create/publish retries have one result/event. Stale revisions
conflict. Publishing revalidates every selection. New additions to a published weekly
issue are rejected; independent additions advance revision and persist one event.
Naming changes preserve links; disappearance never destroys readers' bookmarks.

## Handoff

Deliver versioned fixtures/routes, migration ownership map, event identities, public
eligibility matrix, validation limits, and tests. Unblock native/public integration
with a manually publishable issue before recap or notification delivery is complete.
