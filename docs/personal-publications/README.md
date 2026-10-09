# Personal publications: implementation planning

Status: planning only; no feature implementation or release authorization implied.
Product decisions agreed with Erik on October 7, 2026.

## Intended outcome

An editor assembles and publishes an issue, sends its link through iMessage, and a
recipient reads without an account, saves a selection with discovery attribution,
and subscribes to receive future issues. A private weekly reflection provides a
second path into the same publishing experience.

## Read in this order

1. [Product specification](product-spec.md): the eleven agreed decisions.
2. [Shared contracts](contracts.md): proposed implementation contracts and examples.
3. [Delivery and integration](delivery-plan.md): dependencies, gates, and evidence.
4. [Assignment register](assignments.md): agent ownership and implementation handoffs.
5. The five bounded workstream briefs:
   - [Publishing foundation](workstreams/01-foundation.md)
   - [Native creation and reading](workstreams/02-native.md)
   - [Public sharing](workstreams/03-public-sharing.md)
   - [Weekly Wrapped](workstreams/04-wrapped.md)
   - [Delivery and attribution](workstreams/05-delivery-attribution.md)

The product specification is agreed scope. The technical baseline was approved on October 8, 2026; remaining executable
schema details are coordinated by the integration owner. Implementation
teams must not silently convert technical gaps into reduced release scope.

## Existing architecture, inspected for this plan

- Canonical mobile client: `apps/ios/ZineNative.xcodeproj`, bundle `app.zine.native`.
- Native REST boundary: `apps/worker/src/routes/api-v1.ts` and
  `apps/ios/ZineNative/Core/API/APIClient.swift`.
- Shared schemas: `packages/shared/src/schemas/index.ts`.
- Persistence: `apps/worker/src/db/schema.ts`, D1 migrations alongside it.
- Bookmark save service: `apps/worker/src/bookmarks/save.ts` already distinguishes
  created, already bookmarked, and rebookmarked results.
- Existing recap service/tests: `apps/worker/src/lib/weekly-recap.ts` and
  `weekly-recap.test.ts`; current service already computes the previous Sunday-to-Sunday
  calendar week. Existing access is through the tRPC insights router. The historical
  plan below does not accurately describe all current service behavior.
- Consumption events already exist in schema and migration
  `0008_add_weekly_recap_support.sql`. Event coverage and client call sites still
  need auditing; table existence does not establish trustworthy consumption data.
- `user_notifications` currently serves system/connection alerts. Its active unique
  index is not a suitable event-deduplication contract for publication deliveries.
- Public web work belongs in the existing web/Worker architecture; authenticated
  web-client parity is not part of this feature.

The historical [weekly recap plan](../weekly-recap-plan.md) is context, not the
contract for this feature. This plan uses calendar weeks and native REST, and does
not require estimated-time charts or week-over-week statistics. The older
[experience architecture](../zine-experience-architecture.md) predates this social
publishing direction; its exclusion of social experiences does not override these
agreements. Existing provider subscriptions and Today editorial editions remain
separate concepts from personal-publication subscriptions and issues.
