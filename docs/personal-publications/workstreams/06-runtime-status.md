# Integration runtime status

Owner: Publication integration chat `01a11b82-eb54-7f93-940c-c6153961d7b3`.
Status: implementation handoff complete; first-release runtime verification incomplete.
All four contributor chats are terminal with completion reports. See
[final evidence report](06-integration-completion.md).

## Integrated changes

- Central Drizzle/journal mappings and shared exports; migrations 0035 Wrapped,
  0036 Delivery, 0037 resumable fanout, 0038 exact private Today source-open snapshots.
- Canonical REST registry/OpenAPI, Worker types/configuration, five-minute catch-up
  and delivery cron, immediate durable post-publish delivery, account cleanup.
- Stable bookmark interaction IDs and source-specific private reading evidence.
- Owner-only cover preview REST route and native authenticated image adapter;
  anonymous draft covers remain unavailable.
- Full native publication/editor/reader/Wrapped/activity/provenance implementation,
  anonymous dynamic web reading, authentication continuation and hosted configuration.

## Final checks

- Worker CI-parity selection: 2,293 tests across 108 files pass. Shards 8–10 were
  rerun after the intentional private-cover route snapshot update.
- Final private-cover/lifecycle/registered-route selection: 356 tests pass.
- Final Today-source/Wrapped/cross-stream selection: 32 tests pass.
- Native: 45 XCTest plus 3 Swift Testing tests pass; canonical Xcode build passes.
- Root format, lint, typecheck, build and design-system checks pass.
- Six deterministic native CLI scenarios pass.
- Sharing's web/browser checks pass; persisted anonymous issue/archive navigation
  was directly observed on desktop and phone widths.
- Real Clerk/local REST smoke passes publication, privacy, saves, attribution,
  visits, activity, recap history and self-subscription rejection after migration 0038.

## Runtime and lifecycle

Final canonical session 94939 built, installed and launched all final native sources
(PID 61271). App and share extension both target `http://localhost:8785`. Dedicated
Simulator: iPhone 17 — Zine Foundation, `908889F4-D999-4DE5-9027-1BE1C1AAD451`.
Existing sanitized account/R2 snapshot and local edits were preserved.

Direct native computer use was blocked by the locked Mac; unlock was requested and
no UI observation is claimed. Integration stopped its last orchestrator and all prior
owned sessions. `lsof` confirmed Worker 8785, web 8285, archive 8890, inspectors
9285/9385 and Sharing 45274/9424 have no listeners. No other task's services were stopped.

Local-only sample issue `01M4DSKNDYFVZN7EFCK9HQD9DR` and the earlier web sample
`01M4DRW8Z0MA5REGC6MGRKX550` remain available for a resumed verification session.

## Remaining evidence gates

Native UI journeys and light/dark appearance after unlock; real browser Clerk login
with approved local-origin configuration; hosted media/Images, APNs provisioning and
physical push; signed app/domain AASA association; real iMessage preview/universal links.
No commits, merges, deployments, production test writes or messages to people occurred.
