# Workstream assignment register

Assigned October 8, 2026. Erik approved the technical contracts before assignment.

## Integration owner

The parent Codex agent owns shared contract review, migration/file coordination,
end-to-end integration, and evidence across all five streams. Product decisions
remain settled. No separate user-facing chats or pull requests are created by this
assignment pass.

## Assignment scope

All five initial handoffs are complete and reviewed against the current checkout.
The assignment was to produce implementation-ready handoffs. Each
handoff identifies actual file ownership, interfaces, dependencies, acceptance checks,
and the next bounded coding task. Only handoff documents are edited in this pass;
application implementation, deployment, and shipment are subsequent work.

This avoids assigning overlapping central files before the owners have inspected
the existing code. Technical baseline approval is recorded in contracts.md.

## Roster

| Workstream               | Assigned agent task                | First handoff                                                      | Dependencies                                                   |
| ------------------------ | ---------------------------------- | ------------------------------------------------------------------ | -------------------------------------------------------------- |
| Publishing foundation    | `publication_foundation`           | [Foundation handoff](workstreams/01-foundation-handoff.md)         | Own shared contract details and migration allocation           |
| Native creation/reading  | `publication_native`               | [Native handoff](workstreams/02-native-handoff.md)                 | Foundation DTOs; Wrapped and delivery UI adapters              |
| Public sharing           | `publication_public_sharing`       | [Sharing handoff](workstreams/03-public-sharing-handoff.md)        | Public projections; native links; save/subscription APIs       |
| Weekly Wrapped           | `publication_wrapped`              | [Wrapped handoff](workstreams/04-wrapped-handoff.md)               | Historical evidence; foundation draft adapter; native UI       |
| Delivery and attribution | `publication_delivery_attribution` | [Delivery handoff](workstreams/05-delivery-attribution-handoff.md) | Foundation events/subscriptions; native activity/provenance UI |

Three agents can run alongside the integration owner. Foundation, native, and public
sharing run first; Wrapped and delivery start as slots free up. This is a staffing
sequence, not a release-scope reduction.

## File coordination

- Foundation: central D1 schema/migrations, shared schemas, publication domain REST,
  OpenAPI registration, public projections and immutable publication events.
- Native: all SwiftUI screens and navigation integration, native API DTOs and app
  link/auth routing. Other agents supply adapters and requirements, not competing
  changes to the app shell.
- Public sharing: public web rendering, issue/publication URLs, preview metadata,
  web auth continuation and hosting association files. Coordinate Worker entrypoint
  and shared route changes with foundation/integration owner.
- Wrapped: private recap/evidence domain and tests. Propose shared schema/migration
  additions through foundation; deliver recap presentation requirements to native.
- Delivery: publication activity/scheduling/push and discovery provenance. Propose
  central schema and bookmark route changes through foundation; deliver native UI
  requirements through native owner.

## Handoff acceptance

Every owner returns changed paths, code evidence, interface decisions, dependencies,
checks performed, external prerequisites, and a concrete first implementation task.
The integration owner reviews these for contradictory routes, storage ownership,
private-data leakage, lifecycle changes, and a complete first-release scope before
coding assignments proceed.

## First coding wave after handoff review

1. Foundation produces executable shared schemas and versioned public/private,
   lifecycle, eligibility, and error fixtures; other streams consume this single source.
2. Native implements headless DTO/client/link/intent plumbing against those fixtures.
3. Public sharing implements isolated public renderer/metadata and route fixtures.
4. Wrapped implements durable SAVED evidence first, then repairs open tracking and
   builds private evidence/calendar/snapshot contracts with fixtures.
5. Delivery implements pure digest planning and provenance contract fixtures before
   scheduler/APNs and central save/storage integration.

Core storage and API integration follow the schema handoff. Public URLs are reserved
as `/p/:publicationId` and `/i/:issueId` on the existing public host, pending release
configuration. Native owns anonymous-reader routing and pending action continuation.

## Confirmed integration findings

- Current recap service already has previous Sunday-to-Sunday calendar logic; reuse
  it after tests and evidence audit, rather than assuming the historical plan is current.
- Existing users store no safe public editor name; store explicit public presentation
  and never use email as a fallback. Publication authorization must be explicit.
- Native link handling is Clerk-only and associated domains are webcredentials-only;
  anonymous native reader, applinks and pending-action routing are real work.
- Production web hosting is asset-only; server-generated preview HTML needs a dynamic
  entrypoint. Existing preview configuration targets production and must not receive
  verification writes.
- Existing health-alert notification uniqueness is unsuitable for publication events.
  APNs installation lifecycle and native capability are new integration work.
- Account deletion requires coordinated tombstones and reference cleanup before user
  deletion; another reader's saved bookmark and attribution must survive.

## Integration review result

All five owners completed their first handoff. Shared boundaries agree on native
SwiftUI ownership, foundation registration/migrations, public ID URLs, explicit
publication, private recaps, one publication subscription, and reader-owned provenance.
No runtime files, migrations, capabilities or deployments changed in this pass.

Executable contract work must include these cross-stream details:

- A total durable publication-event cursor/high-water mark for digest cutoffs,
  independent of queue dispatch order; foundation and delivery agree before SQL lands.
- Consistent owner errors (privacy-preserving 404 for foreign resources), mutation
  idempotency headers, client section/selection IDs, and public/private JSON fixtures.
- Subscription generations so resubscription never revives old deliveries.
- Coordinated cover asset APIs/public derivatives, separate from stored reader bodies.
- Calendar-window identity and deployment-based evidence coverage, including SAVED
  events, rereads of finished content, and partial legacy history.
- Reader-owned attribution snapshots and deletion ordering shared by foundation and
  delivery; no destructive cascade from editor-owned issues to reader bookmarks.

No product decision needs reopening for these tasks. Runtime verification and physical
phone sharing/push evidence remain future acceptance work, not completed checks.
