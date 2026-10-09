# Native runtime status

Owner: Native chat `01a11b82-d86d-7f03-b777-155b03095d46`.

## Implementation

Full native publication scope is implemented: setup and archive, independent issue
composition, local draft persistence and revision recovery, explicit publishing,
anonymous reading and sharing, subscriptions, activity and visit markers, optional
push registration, Weekly Wrapped review and explicit selection, and bookmark
source attribution. Native owns all Swift, Package.swift, project and entitlement
changes. Other workstream files were preserved.

Foundation, Delivery and Wrapped schemas/fixtures are consumed as implemented.
Native opens send a stable X-Zine-Interaction-Id. Delivery timezone initialization
uses configured + atomic initializeOnly. Wrapped timezone is explicitly editable;
GET history can initialize UTC, so device-zone initialization is not claimed.

## Latest corrective changes

Relative publication/issue cover asset URLs resolve against the selected client API
baseURL in every artwork callsite, including the editor. Absolute remote URLs remain
absolute; non-HTTP schemes are rejected. A focused headless test covers resolution.

Rejected definitive mutation batches preserve working edits and stop automatic
retries until correction or explicit retry. Removing an unsent rejected addition
removes its pending operations without dropping unrelated writing; covered by a
focused test. Uncertain requests retain their original replay key/body.

## Verification

- Latest headless suite: 44 XCTest tests, including 12 publication tests, and
  3 Swift Testing tests passed.
- Six deterministic native CLI scenarios passed at the earlier checkpoint.
- Final corrected canonical Simulator Xcode build passed with CODE_SIGNING_ALLOWED=NO
  in `/tmp/zine-publications-native-derived`.
- Final `git diff --check -- apps/ios` passed.
- Integration built, installed and launched the local-target app before these final
  source corrections. The installed app does not yet contain those corrections.

## Live verification blocker and ownership

Integration owns dev:worktree session 44592, local API localhost:8785, and transferred
exclusive direct computer use of Simulator `908889F4-D999-4DE5-9027-1BE1C1AAD451`
(`iPhone 17 — Zine Foundation`) to Native. First getApp(Simulator) failed because
macOS is locked and automatic unlock failed. User unlock is pending; no repeated
prompt or bypass was attempted. No direct UI interactions or final visible states
were observed. No Simulator UI, physical phone, real APNs, iMessage or hosted
universal-link claim is made. Integration retains lifecycle ownership of its stack.

## Handoff

Final native completion report will be `02-native-completion.md`. Integration must
rebuild/install the final corrected sources before resuming UI verification. Native
UI proof remains blocked until the user unlocks the Mac; source implementation and
headless checks do not replace that requirement. No commits or deployments made.

## Wrapped unsaved-source adapter (final follow-up)

Decoded optional candidate.originalUrl and added safe HTTP(S) Open original links.
Unsaved candidates offer Save to Library through the existing normal saveBookmark
API (canonical backend deduplication semantics), then GET the recap again before
any candidate becomes selectable. Selections are intersected with the refreshed
eligible candidate IDs. A failed refresh leaves the unsaved row disabled and surfaces
an error; pull-to-refresh permits retry. No automatic inclusion or direct-link entry.

Final follow-up Simulator Xcode build passed. Headless fixture test now also checks
originalUrl roundtrip, unsafe-scheme rejection and unsaved-versus-saved selection
eligibility; final suite passed (44 XCTest + 3 Swift Testing). Integration must rebuild/install again for
these latest native adapters. UI verification remains blocked by macOS lock.

Final one-line correction: save completion checks the refreshed candidate's stable
candidate.id rather than itemId (which changes when saving a synthetic source item).
Incremental canonical Simulator Xcode build passed; native diff check passed.

## Authenticated owner cover preview

Added APIClient.ownPublicationCover(assetID) against exact authenticated
GET /api/v1/me/publication-assets/:id. Only validated ULID IDs are accepted;
no content-provided URL is used for authenticated image requests. Private bytes
use reloadIgnoringLocalCacheData and remain in view UIImage memory. Editor and
publication setup use OwnerPublicationArtwork with loading/retry state and asset,
account and API task identity. New upload asset IDs immediately load the owner
preview; draft relaunch reloads through the owner endpoint. Public artwork retains
anonymous AsyncImage behavior. Server no-store/owner checks supplied by Integration.

Focused owner transport test verifies exact API route, bearer and rejection of
external URL input without making a request. Full headless suite passed: 45 XCTest
(including 13 publication tests) + 3 Swift Testing. Final setup adapter incremental
Xcode build passed; no UI observations because Mac remains locked.
