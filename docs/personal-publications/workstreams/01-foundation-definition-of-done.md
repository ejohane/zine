# Publishing foundation: definition of done

Approved scope: product-spec.md, contracts.md, and 01-foundation-handoff.md in this
planning package. This definition covers the entire Foundation workstream, not only
its first schema/fixture task. Implementation happens in the same d0b4 worktree.

## Completion standard

Foundation is done when real persisted REST operations let an authenticated editor
create their one publication, assemble an issue from saved eligible content, publish
explicitly, and expose only the approved public projection to anonymous readers.
The dependent workstreams receive stable executable contracts and durable events.
Passing fixture/schema tests alone does not establish workstream completion.

## Required deliverables and evidence

1. **Executable contracts.** Export shared validated inputs, owner/public resources,
   typed section/selection operations, errors, pagination, subscription preferences,
   and event contracts. Provide versioned JSON fixtures for native/web/other streams
   and update the actual REST OpenAPI specification. Demonstrate valid/invalid and
   private-field-negative cases in meaningful tests.
2. **Persistent domain and migrations.** Add correctly ordered D1 migrations,
   constraints/indexes and services for publications, issues, sections, selections,
   assets, subscriptions, mutation replay and durable events/outbox. Demonstrate
   migration application to clean and existing local data, uniqueness and rollback.
   Never use runtime schema creation as a substitute for migrations.
3. **Authenticated composition.** Implement owner publication/issue CRUD, explicit
   safe editor identity, presentation, sections, ordering, saved-selection references,
   commentary, and revision conflicts through the accepted REST boundary. Test actual
   routes for owner, other-user, anonymous and unsupported-token access. Names and
   presentation changes preserve permanent IDs/links.
4. **Publishing lifecycle.** Explicit publication validates title/selections/public
   eligibility and atomically persists publication state plus one durable event.
   Weekly issues reject new selections/replacements afterward while allowing agreed
   corrections; independent additions remain allowed. Test retries, conflicting
   keys, stale concurrent edits, rollback and mixed addition/removal operations in
   real local D1 where persistence guarantees matter.
5. **Public reading boundary.** Implement anonymous publication/archive/issue APIs,
   draft/unavailable behavior and strict public allowlists. Test provider eligibility,
   publish-time revalidation, private email/feed/signed-link exclusion, paywalled
   public destinations, original attribution and known-unavailable originals. No raw
   provider metadata, library state, bodies, consumption history or subscriber list
   appears publicly.
6. **Covers and assets.** Implement bounded owner uploads, safe decoding/metadata
   stripping/re-encoding, asset ownership checks, private draft bytes and sanitized
   public derivatives with fallback. Document necessary local/hosted capabilities.
   Test malformed/oversized/foreign assets and removal behavior. An unavailable image
   capability is a reported incomplete item, not permission to omit cover support.
7. **Subscriptions.** Persist one-way publication subscriptions, list/read/mute/end
   operations, owner-only subscriber pagination, generation changes on resubscribe,
   and no self-subscription. Test isolation and generation behavior. Sending
   notifications and APNs belong to Delivery, not Foundation.
8. **Integration seams.** Deliver immutable event identities and a total durable
   event cursor/high-water mark for digest cutoffs, first-publication revisions,
   outbox replay behavior, and subscription-generation semantics. Provide a tested
   weekly-create service accepting a server-resolved closed window and explicit saved
   selections, enforcing one issue per window. Do not build Wrapped generation or
   its UI to prove this adapter. Provide availability/tombstone and canonical-item
   seams for provenance without implementing Delivery's save/reference feature.
9. **Deletion and retention.** Integrate owner/account deletion safely with existing
   cleanup. Remove public access/content/assets and operational sensitive data while
   preserving required unavailable IDs. Prove another reader's existing canonical
   bookmark survives. Supply an executable deletion contract/fixture for later
   reader-owned references; do not claim provenance runtime verification before that
   stream exists.
10. **Checks and local integration.** Run meaningful focused schema, Worker route,
    D1 lifecycle/concurrency, eligibility and deletion tests plus applicable repo
    lint/format/typecheck/test/build gates. Exercise the real local persisted REST
    flow, not mocks alone. Follow zine-local-development for the required existing
    native smoke path and direct Simulator observation; report auth/data/API target,
    checks, build/install/launch, interactions and observed state separately. This
    workstream adds no publication UI, so do not claim its UI was verified. Any
    unavailable verification is explicitly incomplete/blocked rather than passed.
11. **Reviewable handoff.** Record changed paths, migrations, stable routes/schemas,
    fixtures, exact checks/results and remaining external dependencies. Reconcile
    each item above with evidence in a completion report. Other streams can begin
    integration without reverse-engineering storage or inventing duplicate contracts.

## Scope boundaries

Do not implement publication SwiftUI/web pages, Wrapped generation/history UI,
notification fanout/digests/APNs, or reader provenance storage/UI. Foundation owns
central migrations/registration but need not implement another stream's tables before
its contracts are ready. Use a tested seam and document that ownership accurately.

No production verification writes, PR/merge/deployment or messages to other people
are part of this assignment. Do not start other workstreams. Preserve unrelated edits
in the shared worktree. Begin with schemas/fixtures, then carry the entire Foundation
scope above through implementation and verification rather than stopping after that
first slice. If external prerequisites block an item, finish remaining authorized
work and report precisely what prevents full completion.
