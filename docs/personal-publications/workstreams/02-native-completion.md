# Native implementation handoff

Native source implementation is complete. Runtime acceptance is blocked by the
locked Mac; this stream is not fully verified end to end.

## Delivered

- Publication setup, bounded cover upload, own draft/published archive and subscriber
  list; independent issues can be created on demand.
- Saved-content picker, sections and ordering, cover/title/introduction/commentary,
  explicit public publish/delete, account-and-API-scoped local drafts, revision conflict
  recovery, stable replay of uncertain mutations and correction of rejected batches.
- Anonymous publication/issue reader, share sheet links, expiring sign-in continuation,
  subscribe/unsubscribe/mute, original links and saving selections with provenance.
- Activity inbox, daily delivery preference timezone, visit revision/new markers,
  optional APNs permission/token registration/revocation and notification routing.
- Private Weekly Wrapped history/evidence/coverage, explicit candidate selection,
  timezone settings and conversion into an editable issue without automatic publishing.
- Discovery references in bookmark detail, strict universal-link routing and native
  associated-domain/APNs entitlements. Cover assets resolve against the active API.

## Evidence

`bun run test:native:core`: 44 XCTest tests and 3 Swift Testing tests passed. Twelve
publication tests cover actual shared fixtures, anonymous transport, replay/conflicts,
account isolation, explicit null/coalescing, concurrent editing, auth-intent expiry,
eligibility errors, rejected-addition recovery and relative cover URL resolution.

`bun run native:agent scenario run all`: six deterministic scenarios passed before
final source corrections. Final canonical ZineNative Simulator Xcode build passed,
with CODE_SIGNING_ALLOWED=NO and isolated derived data. Final native diff whitespace
check passed. Build and test logs are in `/tmp/zine-publications-native-{build,tests}.log`.

Integration separately built, installed and launched the local-API app before the
final corrective edits. Direct Simulator computer use failed on first selection
because the Mac is locked. No UI behavior, light/dark appearance, physical-device
receipt, real iMessage preview or hosted universal-link association was observed.

## Remaining acceptance

Integration must rebuild/install these final sources, then exercise setup, create,
picker/reorder/commentary, relaunch draft, publish, public read/save/subscription,
Wrapped/activity/provenance and light/dark states through direct Simulator computer
use after unlock. Verify authenticated subject and selected local API. Physical APNs,
entitlement signing and hosted association need their actual configured environments.
Wrapped initializes UTC on first history GET; the explicit timezone picker is present,
but automatic first-use device-zone initialization is not claimed.

No commits, merges, deployments, production writes or real chat messages were made.
Live stack lifecycle remains owned by Integration. See `02-runtime-status.md` for
session/device ownership and exact current blockers.

## Wrapped late-audit follow-up

Optional originalUrl is decoded for prospective unsaved-source snapshots. Such rows
now expose Open original and Save to Library using the ordinary bookmark API. The
recap is refreshed after saving, and only server-refreshed saved/eligible candidates
can be selected. Refresh errors remain actionable through pull-to-refresh; nothing
is automatically included. The fixture test covers URL roundtrip/scheme validation
and eligibility gating. Canonical Simulator build passed with this adapter; the
installed Integration app predates it and must be rebuilt. Mac lock still blocks UI.

## Private cover preview follow-up

Editor and publication setup now load UIImage previews through authenticated
GET /api/v1/me/publication-assets/:id, using the owning API client and a validated
asset ULID. Authentication is never applied to a content-provided cover URL.
New uploads preview immediately by their asset ID; relaunch reloads private draft
covers. Loading and explicit retry states are present. Public readers remain
anonymous. Owner bytes stay in view memory, with local cache bypass and backend
no-store. Focused transport test covers route/auth/invalid external input.

Final canonical Simulator build passed. Updated full native suite passed: 45 XCTest
(including 13 publication tests) + 3 Swift Testing, 48 total. Whitespace check passed.
Integration must rebuild/install this final adapter. Direct UI proof is still blocked
by the locked Mac, including uploaded cover appearance and draft relaunch behavior.
