# Parallel implementation dispatch

Dispatched October 8, 2026, in the shared d0b4/zine worktree. Foundation implementation
is present, uncommitted, and must be preserved. Current Foundation implementation,
OpenAPI and fixtures override older proposed route/upload details; read its completion
report before coding. All eleven product decisions and full first-release scope apply.

## Chats

- Native publications: `01a11b82-d86d-7f03-b777-155b03095d46`
- Public publication sharing: `01a11b82-dc6a-7672-9284-05df6126364f`
- Weekly Wrapped: `01a11b82-e0ee-7b00-ba63-8cd811c25ab7`
- Publication delivery and attribution: `01a11b82-e550-7fe2-a54c-e1906dd44eea`
- Publication integration: `01a11b82-eb54-7f93-940c-c6153961d7b3`

## Ownership and coordination

- Native owns all Swift code, Xcode project, native entitlements, Package.swift,
  navigation, native models/client/stores and all publication/recap/activity/provenance UI.
- Public Sharing owns web implementation/configuration, dynamic public HTML/metadata,
  authentication continuation and AASA. Native owns native universal-link integration.
- Wrapped owns weekly-recaps modules/routes/evidence and save/open/finish writer fixes,
  its own shared schema module, and its own migration SQL file.
- Delivery owns publications/delivery, attribution, visits and selection-save adapter,
  its own shared schema module, and its own migration SQL file. Coordinate any edits
  to bookmarks/save.ts with Wrapped via integration owner; do not concurrently edit it.
- Integration exclusively owns db/schema.ts, migration journal, shared root/index exports,
  API route registry/OpenAPI/generator, types.ts, Worker index/cron/queue/config bindings,
  account cleanup and broad integration tests. Contributors provide precise integration
  requests/patches in owned handoffs; integration applies them promptly.
- Reserve next migration names only after checking current journal: Wrapped first,
  Delivery second. Integration records numbers and schema dependencies before applying.
  Do not run concurrent migrations/restores against the same local Wrangler state.
- Each stream first writes its definition of done in its existing workstream handoff,
  then implements the entire assigned stream. First fixture slices are not completion.
- Each stream owns a coordination/status file named NN-runtime-status.md in workstreams,
  keeping interfaces, needed shared edits, file claims, checks and blockers current.
  No global format --write or root destructive commands while others edit. No commits
  while others edit; integrated commit/release is not part of this dispatch.
- Integration owns live dev:worktree orchestration and a dedicated Simulator. Native
  may request exclusive device/live session ownership through its status file. Other
  streams run isolated tests with separate ports/state. Never stop another service or
  use another task's Simulator without coordination.

## Completion and authority

This dispatch authorizes implementation and local verification of all remaining streams,
and integrated fixes within the approved scope. It does not authorize sending actual
chat messages to people, production verification writes, deployment or merging.
Prepare hosted configuration and report external prerequisites precisely; do not
claim real iMessage/APNs/universal-link proof from fixtures or mocks. Preserve all
Foundation work and unrelated edits. Use the repo skills and approved secrets workflow.

Integration owns the final evidence report against all eleven agreed decisions and
milestones A-D. It follows each dispatched chat using wait_threads and current status
files, integrates as work becomes available, and performs full end-to-end checks once
ready. It must not declare the feature complete just because the individual chats end.
