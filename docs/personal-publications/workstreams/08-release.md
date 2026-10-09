# Personal publications release

This release delivers one personal publication per editor, explicit independent issues,
optional Weekly Wrapped drafts, anonymous public reading and messaging links, subscriber
Activity, grouped daily additions, and source attribution when a selection is saved.
Direct-link composition remains outside scope.

## Accepted verification scope

The user confirmed local composition/publishing, subscriber Activity, save/provenance,
and grouped additions. Hosted test issue/archive and app association were verified;
the user confirmed the Messages preview and app-link flow worked on the physical phone.
Cover-selection interaction and light/dark appearance checks were explicitly skipped.
Real APNs delivery was not completed; production APNS_ENABLED remains false. Activity
and daily additions are supported independently of optional push.

## Deployment preparation

Provisioned production R2 bucket zine-publication-media-production for the existing
PUBLICATION_MEDIA binding. Public reader hosting includes server rendering and AASA.
Updated production web deployment to Wrangler 4.119.0, matching the preview workflow;
the old 3.95.0 tool ignored assets.run_worker_first. The production-config dry run with
4.119.0 passed. Isolated verification resources remain separate from production.

## Validation

Root lint, typecheck, build, format and design-system gates passed. Web unit/policy
checks, five shared contract tests, three dynamic public-reader browser tests,
47 native XCTest tests plus three Swift Testing tests, and all native CLI scenarios
passed. Worker CI-parity suite passed: 2,293 tests across 108 files. GitHub release
verification is recorded below when complete. Exact merged-source device build/install/launch are still pending.

## Integration with the concurrent tag release

Integrated main ea60af19 after bookmark tag suggestions shipped while this PR was
under review. Preserved both schema/API changes and renumbered the unpublished
publication migrations to 0035–0039 after the existing 0034 tag migration. Historical
local/hosted verification reports refer to the original pre-release numbering.
The migration compatibility test now selects the checkpoint migration by semantic
name. The journal matches all 40 SQL files.

Aligned the isolated hosted and local Wrangler migration records with the renumbered
publication files, then applied only the newly integrated tag migration. No test data
was reset and no production verification data was written.
