# Publishing Foundation implementation and evidence

October 8, 2026. Implemented in the shared `d0b4/zine` worktree against the
[definition of done](01-foundation-definition-of-done.md). This is local implementation
and integration evidence; it is not a deployment or complete social-feature release.

## Outcome

An editor can create one publication, compose independent issues from eligible saved
content, explicitly publish, and expose an allowlisted anonymous issue/archive.
Subscriptions, durable ordered lifecycle events and outbox intent are persisted.
Weekly creation and canonical-selection resolution are service seams for the later
Wrapped and Delivery workstreams.

The reproducible local REST smoke uses a real Clerk session, the running local Worker,
existing sanitized bookmarks and the configured image decoder/R2 storage. It creates a
disposable issue, verifies that its draft and cover are private, publishes, reads the
anonymous projection and sanitized JPEG, then deletes the issue and verifies both
public resources return 404. It leaves the existing canonical bookmark intact.

```sh
secretsctl current
secretsctl metadata zine.test
secretsctl check zine.test
secretsctl run zine.test -- bun scripts/verify-publication-foundation.ts http://localhost:8785/api/v1/
```

This script refuses non-loopback targets. Credentials and session JWTs remain in
process memory; neither authentication responses nor credential values are logged.
Clerk authentication contacts the existing Clerk instance; application mutations go
only to the selected local Worker. The default sanitized subject was confirmed.

## Definition-of-done reconciliation

| Item                         | Delivered evidence                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Executable contracts      | Shared strict Zod schemas, typed operations, owner/public DTOs, subscription/event/availability/error schemas, versioned JSON fixtures, actual REST OpenAPI 1.13.0. Shared tests reject private fields and malformed IDs and verify Unicode limits. Standalone Swift decoder reads public, weekly and draft fixtures.                                                                                                                                            |
| 2. Persistent domain         | Migration `0034_add_personal_publications.sql`, journal and Drizzle declarations. Migration application passed in isolated clean D1 tests and in the provisioned existing local snapshot. Constraints enforce one publication per owner, permanent identities, active canonical uniqueness, weekly-window uniqueness and durable event sequence.                                                                                                                 |
| 3. Authenticated composition | Clerk-only publication/issue CRUD through `/api/v1`; bookmark PATs, including whitespace variants, are rejected. Tests exercise anonymous, owner and other-user isolation, ordering, identity collisions and revision conflicts. Real local REST composition passed.                                                                                                                                                                                             |
| 4. Publishing lifecycle      | Guarded D1 batches commit the mutation replay record, state, event and outbox together. Tests cover same-key retries, conflicting keys, stale concurrent edits, forced transactional rollback, weekly addition/replacement rejection, corrections and independent additions/removals. Publish-time source guards prevent committing changed ownership/source state.                                                                                              |
| 5. Public boundary           | Anonymous publication/archive/issue reads use strict allowlists and no-store responses. Public metadata is independently fetched without source credentials; Library titles, raw metadata and bodies are not copied. Tests cover private feeds, signed links, Gmail public editions, paywalled public destinations, source privacy changes and known-dead originals.                                                                                             |
| 6. Covers                    | Bounded JPEG/PNG/WebP uploads, decoder inspection, 20 MP limit, 1200×630 JPEG re-encoding, final JPEG application/comment metadata removal, separate media bucket, owner checks and public-reference checks. Tests cover unsupported input, oversized decoded images, foreign/draft assets, metadata stripping, deletion and retry. The real local Images binding decoded a repository PNG, stored the derivative and served it publicly only after publication. |
| 7. Subscriptions             | Persistent one-way subscribe/read/mute/end, owner-only subscriber pagination and active subscription listing. Tests prove self-subscription rejection, isolation, idempotent subscribe and new generations on resubscription.                                                                                                                                                                                                                                    |
| 8. Integration seams         | Immutable event IDs, monotonic SQLite sequence/high-water mark, pending/ack/retry helpers, first-publication revisions, trusted closed-window weekly creation and canonical published-selection resolver. Tests prove delayed outbox retry retains identity and high-water survives account cleanup; weekly duplicate rejection and resolver availability are exercised.                                                                                         |
| 9. Deletion/retention        | Account deletion tombstones public identities, scrubs content, removes operational records and cover bytes before dropping owner linkage. Individual issue deletion also scrubs historic sections/selections and retires covers when no active presentation references them. Retired cover deletion retries on repeated DELETE. Another reader's canonical bookmark survives. Availability fixture/schema describes the future retained-reference boundary.      |
| 10. Checks/local integration | Automated checks below; real local persisted REST flow and direct authenticated native Library → article detail → reader interaction, with visible populated content. Publication UI does not exist in this workstream and was not claimed verified.                                                                                                                                                                                                             |
| 11. Handoff                  | This report, versioned fixtures, schema generator, local verification command, stable routes, migration and service seams.                                                                                                                                                                                                                                                                                                                                       |

## Checks

- `bun run test:worker:ci`: passed, 103 files / 2,185 tests across ten shards.
  This broad run preceded the final deletion/metadata refinements; the final focused
  suite below was rerun after those changes.
- `bun run --cwd apps/worker test:run src/publications/assets.test.ts src/publications/publications.integration.test.ts src/routes/auth.test.ts src/routes/api-v1.test.ts`:
  passed, 4 files / 336 tests. D1 and route behavior are real; the focused suite stubs
  remote Clerk verification, external public-page fetches and image-transform output.
  The separate live smoke uses actual Clerk verification, public fetching, Images and R2.
- `bun test packages/shared/test/publications.test.ts`: passed, 3 tests.
- `swift docs/personal-publications/workstreams/PublicationFixtureDecoder.swift packages/shared/src/fixtures/publications/v1.json`:
  passed.
- `bun run test:web`: passed, 89 Vitest tests and 4 preview-policy tests.
- `bun run test:native:core`: passed, 32 XCTest tests and 3 Swift Testing tests.
- `bun run native:agent scenario run all`: passed, six deterministic scenarios.
- `bun run lint`, `bun run typecheck`, `bun run build`, `bun run format:check`,
  `bun run design-system:check`: passed. Lint retains the pre-existing explicit-any
  warning in `api-v1.integration.test.ts`; no new lint errors.
- Worker `bunx wrangler deploy --dry-run --outdir /tmp/zine-foundation-worker-bundle`:
  bundled successfully without deploying.
- `scripts/verify-publication-foundation.ts`: passed against `http://localhost:8785/api/v1/`.

## Native/local evidence states

| State           | Evidence                                                                                                                                                                                                                                                                                 |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Local data      | Startup provisioned sanitized D1 for the default Clerk subject and 655 referenced reader bodies; source-provider credentials were scrubbed by the existing provisioning workflow.                                                                                                        |
| Auth            | Real Clerk native sign-in completed through protected credential entry. The separate REST login confirmed the same subject as the sanitized snapshot.                                                                                                                                    |
| API target      | Installed app and share extension both targeted `http://localhost:8785`. Debug bridge identity independently confirmed the endpoint and this worktree.                                                                                                                                   |
| Build           | Canonical `ZineNative` build succeeded through `dev:worktree`.                                                                                                                                                                                                                           |
| Install         | Installed on the dedicated `iPhone 17 — Zine Foundation`, iOS 26.2 Simulator (`908889F4-D999-4DE5-9027-1BE1C1AAD451`).                                                                                                                                                                   |
| Launch          | App launched and real authenticated Home content appeared.                                                                                                                                                                                                                               |
| Interaction     | Direct computer use opened Recently Saved and its article, then continued reading. The opt-in Debug bridge opened Library after coordinate taps did not activate the tab; direct computer use then opened `Made by mechanical means` from populated Library and tapped Continue reading. |
| Observed UI     | Populated Library, article metadata/actions, and rendered article text with reader controls were visibly observed. This establishes the existing reader smoke path, not correctness of the Library tab gesture.                                                                          |
| Publication UI  | Out of Foundation scope; not implemented or visually verified.                                                                                                                                                                                                                           |
| Physical iPhone | Not built, installed or launched for this backend/shared-contract workstream.                                                                                                                                                                                                            |

## Stable integration surface

- Private routes: `/me/publication`, `/me/publication/issues`, `/me/issues/:id`,
  `/me/issues/:id/publish`, `/me/publication/subscribers`,
  `/me/publication-subscriptions`, `/me/publication-assets` under `/api/v1`.
- Anonymous routes: `/publications/:id`, `/publications/:id/issues`, `/issues/:id`,
  `/publication-assets/:id` under `/api/v1`.
- Authenticated subscription route: `/publications/:id/subscription` (GET/PUT/PATCH/DELETE).
- Domain: `apps/worker/src/publications/{service,repository,eligibility,projections,assets,subscriptions,events,cleanup,selection-source}.ts`.
- Shared: `packages/shared/src/schemas/publications.ts` and
  `packages/shared/src/fixtures/publications/v1.json`, re-exported through shared entrypoints.
- Registration: Worker API router, OpenAPI, account cleanup, bindings/configuration,
  Drizzle schema and migration journal.
- Regeneration: `bun scripts/generate-publication-contracts.ts` updates fixtures and
  formatted OpenAPI from executable schemas.

The asset route uses **raw bounded image bytes** with an image Content-Type, replacing
the handoff's multipart proposal. This avoids unbounded form-data buffering; the
actual OpenAPI documents the implemented upload contract. Uploads themselves are not
idempotent; publication/issue composition mutations require Idempotency-Key and
revision checks as documented. Subscriptions use their own idempotent state semantics.
Publicly deleted resources return 404, and the internal availability seam reports false.
Cache/auth middleware is scoped to publication routes so existing API behavior is preserved.

## Release dependencies and downstream ownership

Hosted rollout must provision the separate `zine-publication-media-dev`,
`zine-publication-media-staging` and `zine-publication-media-production` R2 buckets for
any environments being released, and enable the Images binding/capability. Local
capability was exercised; hosted resource existence and hosted image processing were
not verified or provisioned. The decoder/re-encoding integration follows the
[Cloudflare Images binding contract](https://developers.cloudflare.com/images/optimization/binding/).
The additional final JPEG scrub removes application metadata independently of encoder
metadata-retention defaults.

Wrapped owns persisted calendar windows, timezone rules, consumption evidence and
recap generation; it supplies the server-resolved closed window and chosen saved IDs.
Delivery owns dispatch claims/leases, digest cutoffs, fanout, APNs, visits and retained
reader provenance storage/UI. The resolver only supplies canonical source identity;
it does not implement saving provenance. Public Sharing owns HTML, messaging previews,
canonical domain and deep links. Native owns publication creation/reading UI.

No other workstreams were started. No production application data was changed, no PR
was created, and nothing was merged or deployed. Existing planning and unrelated
worktree changes were preserved. The implementation remains uncommitted for review.

The verification orchestrator was stopped. Its Worker, web, archive and inspector
ports (8785, 8285, 8890, 9285 and 9385) were confirmed released. Simulator remains open.
