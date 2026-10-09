# Personal publications integration handoff

Status: implementation integrated in shared d0b4 checkout; first-release verification
is incomplete. No commit, deployment, merge, production test write or message to a
person was performed. Native cover resolution and unsaved-recap save adapter corrections are complete. See each stream's completion report and runtime status for detailed evidence.

## Integrated implementation

Foundation publication lifecycle remains intact. Wrapped and Delivery now share the
canonical Clerk REST boundary and native client. Central integration includes shared
schema exports, OpenAPI generation, Drizzle mappings and migrations0035–0038, five-minute
Wrapped catch-up/delivery scheduling, immediate post-publish delivery, push bindings,
account cleanup, and stable interaction IDs for real bookmark opens. Public hosting
uses the dynamic web Worker and stable /p/:id and /i/:id links. All Swift belongs to
the Native stream; all public web implementation belongs to Sharing.

Migration0037 is additive and safely tolerates the checkpoint table being present in
the temporary in-flight0036 local database. Fresh migration tests and the existing
sanitized local database both pass. Do not edit already-deployed migrations later.

## Automated evidence

- Root `bun run typecheck`, `bun run lint`, `bun run build`, and
  `bun run design-system:check`: pass. Lint retains one existing explicit-any warning.
- Worker CI-parity selection: **2,293 tests /108 files /10 sequential shards pass**.
- Combined social integration selection passed71 tests before the final Today-source
  coverage fix; final Today-source selection passes32 tests (22 Wrapped,7 editorial
  feedback and3 cross-stream journeys). These are
  included in the broad suite, not additional unique tests.
- Existing REST/tRPC state integration:78 tests pass. Assertions deliberately include
  SAVED evidence, private metadata snapshots and stable timestamps across save retries.
- Shared publication contracts:5 tests pass. All6 deterministic native CLI scenarios pass.
- Sharing reports105 Vitest +4 policy tests,3 public-host browser tests,10 Storybook
  checks and6 existing web smoke checks pass; production build/hosting dry-run pass.
- A separately attempted, normally CI-excluded polling scheduler suite had20 pass and
  1 failure: its YouTube mock lacks a required export and produces an unexpected error
  log. Scheduler/provider source and that test were not changed for this feature.
- Final formatting passes. Native reports45 XCTest +3 Swift Testing tests pass,
  including13 publication cases; final canonical Xcode builds pass.

## Real local evidence

The canonical `dev:worktree` stack reused the sanitized account/R2 snapshot with real
Clerk authentication. Worker8785 and web8285 were local. Build, Simulator installation
and launch succeeded separately; the installed app and share extension both reported
http://localhost:8785. Dedicated Simulator: iPhone17—Zine Foundation,
908889F4-D999-4DE5-9027-1BE1C1AAD451.

A protected-credential smoke script passed explicit draft creation/replay, section and
commentary editing, anonymous draft404, explicit publication, anonymous safe public
reading, repeat-save bookmark reuse with one reference per selection, retained multiple
references, visit markers, activity/preferences, private recap history/anonymous401,
and self-subscription409. A script assertion originally assumed one total discovery
reference; corrected it to selection-scoped counting, as multiple references are intended.
A failed temporary issue was removed; its saved text attribution remains by design.

Sharing directly observed the persisted issue and publication archive through browser
computer use on desktop and phone widths. Save reached the intended sign-in continuation.
Actual browser sign-in could not complete without approved local-origin Clerk setup.

Native direct computer use could not reach Simulator because the Mac is locked.
Unlock was requested; no native UI interaction, rendering, gesture, appearance, or
navigation result is claimed from the successful build/install/launch or tests.

## Agreed decisions and release evidence

| Decision                                     | Implemented and checked                                                                                         | Remaining required evidence                                |
| -------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| 1. One publication / visible editor          | Foundation ownership uniqueness, owner/public DTOs, native setup, web identity                                  | Native setup interaction                                   |
| 2. Explicit weekly and independent issues    | Private drafts; explicit publish; weekly addition lock; independent additions; retries/conflicts                | Native editor/publish/recovery journey                     |
| 3. Saturday-midnight boundary                | Saved IANA timezone, Sunday closed windows, DST/history/catch-up tests                                          | Native timezone/history experience                         |
| 4. Saved content composition                 | Eligibility, cover sanitation, sections/order/commentary/introduction, native picker/editor                     | Native composition and cover observation; hosted Images/R2 |
| 5. Public reading / private recap and drafts | Anonymous web observed; API owner/draft/private negative checks                                                 | Logged-out/native authentication continuation              |
| 6. Original and private sources              | Public-safe metadata, source links, private-source rejection; no reader-body republication                      | Native original-link/unavailable states                    |
| 7. Publication subscriptions                 | One-way subscriptions, mute/unsubscribe, private subscriber list, recipient isolation tests                     | Native subscribe/mute/subscriber-list interaction          |
| 8. Immediate and daily delivery              | Durable publish outbox, resumable fanout, daily batching/timezones, activity, visits, APNs adapter tests        | Native activity/new markers; actual APNs receipt           |
| 9. Discovery attribution                     | New/existing saves, multiple references, reader-data preservation, deletion retention tests                     | Native Library detail / provenance interaction             |
| 10. Private optional Wrapped                 | Atomic real save/open/finish evidence; no inferred external completion; no preselection; explicit draft adapter | Native candidate choice and weekly publication             |
| 11. Full first release                       | All workstreams integrated; no scope reduction                                                                  | All pending native/hosted/device evidence below            |

MilestoneA sharing loop: backend and anonymous web pass; native compose/save/auth/link
and real iMessage evidence pending. MilestoneB delivery/provenance: backend pass;
native states and physical push pending. MilestoneC weekly ritual: backend pass;
native recap/editor journey pending. MilestoneD first-release verification remains
incomplete untilA–C are observed together on the final integrated app.

## External release prerequisites

- Unlock the Mac and run direct native Simulator journeys, including light/dark views,
  Library detail and reader where affected. Builds/tests cannot substitute for this.
- Supply an approved local-origin Clerk instance and matching backend verification for
  real browser Save/Subscribe authentication continuation. Never enable auth bypass.
- Provision separate hosted publication R2 media and Images bindings; verify covers.
- Validate the actual signed app identifier, Associated Domains/APNs capabilities,
  provisioning profiles and the deployed myzine.app AASA response. The web identifier
  TRA7965NM5.app.zine.native is a candidate until signed proof confirms it.
- Provision protected APNS_TEAM_ID/APNS_KEY_ID/APNS_PRIVATE_KEY; APNS_ENABLED remains
  false. Verify sandbox/production registration, permission, delivery and tap on phone.
- After separately authorized hosting/deployment, verify actual iMessage link cards and
  installed-app universal links. No real chat message has been sent during this work.

Local session cleanup and final stream evidence are recorded below.

## Final coverage correction

Today source opens without a Library row now write an exact private source snapshot
in the same feedback insert. Migration0038 adds its nullable column, and Drizzle
mapping/OpenAPI are regenerated. Wrapped includes that exact source only, keeps
related story sources out, and reconciles the synthetic candidate with its real item
after ordinary saving. Native offers Open original and Save to Library, refreshes the
recap, and requires saved eligibility before selection. No direct-link composer entry
was added. Final broad Worker regression selection passes after this correction.

The final authenticated local smoke after0038 passes again; retained sample issue
01M4DSKNDYFVZN7EFCK9HQD9DR is local-only. Native's first-use Wrapped timezone remains
UTC until explicitly changed with its picker; automatic device-zone initialization
is not claimed. OpenAPI/fixture generation is repeatable without further diffs.

## Owner cover preview and final native evidence

A final source review found draft covers could not use the deliberately anonymous,
published-only asset route. Authenticated GET/me/publication-assets/:id now returns
only the owner's sanitized JPEG with no-store; anonymous requests get401 and foreign
owners404. The public route still returns404 for unpublished private assets. Native
editor/setup previews fetch owner bytes only through the fixed API client route,
keep them in view memory, clear them on asset/account changes, and never attach
a bearer to an arbitrary cover URL. The transport test checks exact owner route,
authentication and external-URL rejection.

Final cover/lifecycle/registered-route suite:356 tests pass. Mounted-route snapshot
was intentionally updated for the private cover endpoint; the concurrent broad run
reached it before that update and failed only this snapshot. Shards8–10 were rerun
afterward, keeping all earlier passing shards; final counts follow below.

Final canonical dev:worktree session94939 rebuilt, installed and launched all final
native sources (PID61271); app and share extension both targetlocalhost8785. Native
reports45 XCTest plus3 Swift Testing tests pass. Direct UI remains unobserved because
the Mac stayed locked. All6 native CLI scenarios passed after the earlier corrective
changes; the final preview transport change is covered by the native test/build.

Integration stopped its last orchestrator session94939; prior owned sessions were also
stopped. lsof confirmed Worker8785, web8285, archive8890, inspectors9285/9385 and
Sharing45274/9424 have no listeners. Simulator may remain open, and sanitized local
data/drafts are preserved. No other task's processes were stopped.

Final Worker CI-parity result: **2,293 tests across108 files pass**, combining the
seven passing final-run shards and the three passing rerun shards after the snapshot
update. The final private-cover focused suite separately covers all changed routes
and asset code. Root format, lint, typecheck and build all pass on final sources;
design-system checks passed9 tests. No further implementation work is pending in
these streams. Required runtime/hosted/device observations above remain incomplete.
