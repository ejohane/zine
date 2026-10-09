# Delivery, parallel work, and integration

Status: workstreams assigned to agents on October 8, 2026. Initial assignments
produce implementation-ready handoffs; runtime implementation has not started.
See [assignment register](assignments.md).

## Ownership

Assign one integration owner across five workstreams. That owner resolves shared
contract changes, owns the end-to-end fixtures and release evidence, and keeps the
agreed first-release scope intact. Each stream owns its implementation and meaningful
tests. Assign task owners when implementation is authorized; do not create competing
schemas, route registries, migrations, or navigation shells independently.

Foundation owns central schema/migration allocation, shared DTO/OpenAPI registration,
and publication lifecycle. Wrapped and delivery propose additions through this owner.
Native owns app navigation and all SwiftUI composition. Public sharing owns anonymous
HTML and link metadata. Delivery owns publication activity, scheduling, push, and
provenance integration; split its delivery and provenance tasks internally if staffing
permits while retaining one contract owner.

## Gate 0: freeze contracts before integration merges

- Review technical proposals in contracts: post-publication corrections/removal,
  one weekly issue per window, validation limits, cover handling, deletion tombstones,
  morning time, timezone change rules, and save snapshot behavior.
- Produce executable shared schemas, public/private fixtures, operation/error shapes,
  schema migration plan, and Swift decoder fixtures.
- Audit consumption writers, original-link eligibility, current auth routing,
  APNs/signing capability, and public web hosting/association-file support.
- Reserve public URL shape and domain configuration; identify required credentials
  through the approved secret workflow without exposing values.

Product decisions are settled. These are bounded technical-design tasks; escalate
only discoveries that would change an agreed user behavior.

## Parallel start and dependencies

| Stream               | Can start immediately                                    | Requires contract freeze              | Integration dependency                             |
| -------------------- | -------------------------------------------------------- | ------------------------------------- | -------------------------------------------------- |
| Foundation           | Storage/auth/lifecycle design and fixtures               | Shared API and entity implementation  | None                                               |
| Native               | Screen flows and fixture-driven editor/reader            | REST wiring and Swift DTOs            | Foundation; delivery and Wrapped adapters          |
| Public sharing       | Anonymous layouts and preview HTML fixtures              | Live public projections and URLs      | Foundation; native handoff; save/subscription APIs |
| Wrapped              | Evidence audit, calendar math, private recap UX fixtures | Recap REST and ordinary-draft adapter | Foundation; native recap UI                        |
| Delivery/attribution | Scheduling/APNs audit and provenance design              | Event/subscription/save contracts     | Foundation events; native activity and save UI     |

Fixture work can proceed in parallel before backend completion; it is not live
integration verification. Native UI edits are coordinated through one native owner.
Shared edits are serialized or reviewed by their owner before merge. Each stream
handoff includes changed paths, contract version, migrations, checks, integration
instructions, evidence and remaining blockers.

## Integration milestones

### A. First complete sharing loop

Owner creates publication and independent draft from saved eligible content, orders
sections, adds commentary, publishes, and shares to iMessage. Anonymous recipient
opens readable web issue, opens original, signs in to save/subscribe, resumes intended
action, and sees a single Library bookmark with attribution. Installed-app link opens
the same issue. Repeat publish/save requests prove idempotency.

### B. Ongoing publication relationship

Weekly and independent publication events reach subscribers. Independent additions
across multiple issues form one daily digest per publication. Mute, unsubscribe,
retries, denied push permission, and invalid tokens behave correctly. Reader sees
new additions since last presented revision. Existing bookmark gains a second
provenance reference without overwriting notes.

### C. Weekly ritual

At Sunday boundary private recap appears for closed week. Activity includes a saved
item, older reopened bookmark, verified completion, and an external open labeled
only as open. Nothing is preselected. Editor chooses candidates, adds older saved
content, edits and explicitly publishes. No new selections can be added afterward.
Skipped weeks remain private; delayed publication works; DST boundaries are correct.

### D. First-release verification

All previous milestones pass together on the same integrated revision. Stages A–C
are development milestones, not permission to release a reduced feature. Reconcile
all agreed decisions against product-spec.md and document evidence for each.

## Acceptance evidence matrix

| Requirement                               | Required evidence                                                                                   |
| ----------------------------------------- | --------------------------------------------------------------------------------------------------- |
| One publication and protected ownership   | Database uniqueness and owner/non-owner REST integration checks                                     |
| Draft privacy and public-safe content     | Anonymous/other-user negative checks; private-source and DTO fixtures                               |
| Publishing lifecycle and correction rules | Transition/conflict/idempotency tests and live native editor journey                                |
| Public reading and iMessage sharing       | Anonymous real web journey; actual iMessage preview/link on phone                                   |
| Native links and auth continuation        | Installed-app and logged-out/logged-in journey with observed destination                            |
| Subscriptions and delivery                | Recipient isolation, duplicate retry, mute/unsubscribe, DST batching tests; device push observation |
| Discovery attribution                     | Save new/existing/multiple-source/tombstone checks and observed Library detail                      |
| Weekly evidence and privacy               | Boundary/source/coverage tests, actual writer audit, private recap-to-public issue journey          |
| Covers and presentation                   | Real uploaded/fallback artwork on web/native/preview; accessibility and light/dark native review    |

## Verification workflow for implementation

Use the repo's zine-local-development skill for runtime work. Begin native logic with
`bun run test:native:core` and focused deterministic scenarios. For live integration
use `bun run dev:worktree`, authenticated local data, and direct computer use in Apple
Simulator. Never point verification writes to production or substitute auth bypass
for manual login. Coordinate Simulator ownership and stop only this session's services.

Native UI changes must follow DESIGN_SYSTEM.md and ZineTheme. Public web/shared UI
changes follow docs/web/design-system.md and docs/web/testing.md, with required
package tests, web lint/typecheck, and Storybook build where applicable. Worker changes
need focused auth/lifecycle/event tests and applicable CI parity. Complete repository
lint/format/typecheck/test/build gates before committing as required by the repo.

Record automated checks, build, install, launch, direct interactions, and observed UI
as separate states. Real iMessage preview, universal link routing, and APNs delivery
require physical-device evidence; browser metadata fixtures or Simulator launch do
not establish them. After significant native changes, build/install/launch on Erik's
available iPhone and report each state separately. Record blocked external capabilities
without claiming release readiness. PR/merge/deployment require the later shipping scope.
