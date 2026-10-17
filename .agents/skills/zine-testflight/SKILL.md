---
name: zine-testflight
description: Plan, publish, or resume a Zine iOS release to Erik Internal in TestFlight using the repository release command. Excludes App Store releases and external testing.
---

Use `scripts/testflight-release` from the repository root. Read
[the release guide](../../../docs/testflight-release.md) for prerequisites,
review requirements and recovery. Run `doctor` and `plan` before an authorized
publish; use `plan --offline` when credentials are unavailable.

The command owns immutable source snapshots, manual signing, build numbers,
locking, manifests, exact-build recovery and internal audience checks. Invoke it;
do not reconstruct the workflow with UI clicks or separate upload commands.
For `publish`, review the planned SHA and pass that SHA and a concise evidence
note. If main moves, review the new SHA. A release request authorizes release
operations within its stated scope; building this tooling does not authorize a
live upload. Key creation/configuration is a separate user action.

For an interrupted release, use its original manifest with `status`, then
`resume` when continuing is authorized. If upload intent is recorded but Apple
has no matching build, stop and report the uncertainty; never retry the upload
or pick a different/newest build. If audience or compliance checks stop the
command, report the blocker instead of changing testers, settings or encryption
answers. Current build approval does not attest future source/dependencies.

Summarize the manifest path, source SHA, version/build, archive/upload/processing
state, internal readiness and membership readback. Distinguish stub tests and
local archive validation from Apple acceptance, tester invitation acceptance
and device installation. Never include keys, credentials or raw transport logs.
