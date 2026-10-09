# Native creation and reading: implementation handoff

Status: assigned native workstream; implementation-ready decomposition, no app code
changed. Product authority: `../product-spec.md`; accepted technical baseline:
`../contracts.md`. All paths below are repository-relative. This document adds
implementation recommendations, not new product scope or endpoint claims.

## Ownership and sequencing

The native owner owns all SwiftUI composition, navigation, native DTO adapters,
auth continuation, and native persistence for this feature. Foundation owns REST
schemas and invariants; Wrapped owns recap evidence; delivery owns activity,
subscription delivery, visits, push services, and discovery-reference semantics.
Other streams supply contracts/fixtures, not concurrent SwiftUI edits.

Proposed new native files (names are allocations, not existing capabilities):

- `apps/ios/ZineNative/Core/Models/Publication.swift`: public/private publication,
  issue, section, selection, subscription, and mutation request/response DTOs.
- `apps/ios/ZineNative/Core/API/PublicationClient.swift`: injectable feature-client
  closures backed by the existing APIClient, including explicitly anonymous reads.
- `apps/ios/ZineNative/Core/Persistence/PublicationDraftCache.swift`: recoverable,
  owner-scoped edits, server baseline revision, pending operation identities.
- `apps/ios/ZineNative/Core/Models/PublicationRoute.swift`: typed route/link/intent
  values, independent of SwiftUI for headless tests.
- `apps/ios/ZineNative/Features/Publications/PublicationStore.swift`,
  `IssueEditorStore.swift`, `IssueReaderStore.swift`: observable feature state and
  cancellation/generation guards following LibraryStore conventions.
- `apps/ios/ZineNative/Features/Publications/PublicationHomeView.swift`,
  `PublicationSetupView.swift`, `IssueEditorView.swift`,
  `SavedSelectionPicker.swift`, `IssueReaderView.swift`: native view ownership.
- `apps/ios/ZineNative/Features/Publications/PublicationActivityView.swift` and
  `WeeklyRecapView.swift`: native UI adapting delivery and Wrapped DTOs respectively.
- `apps/ios/ZineNative/Features/Library/DiscoveryReferencesView.swift`: standalone
  detail component; reference DTOs supplied by attribution owner.
- `apps/ios/CoreTests/PublicationContractTests.swift`,
  `PublicationEditorTests.swift`, `PublicationRouteTests.swift` and
  `apps/ios/ZineNativeTests/PublicationNavigationTests.swift`: focused proof.

Serialize edits to shared native files through this owner:
`App/AppRootView.swift`, `App/ZineNativeApp.swift`, `Core/API/APIClient.swift`,
`Core/API/APIError.swift`, `Features/Home/HomeView.swift`,
`Features/Library/BookmarkDetailView.swift`, `apps/ios/Package.swift`, Xcode project,
and entitlements. Delivery requests push registration/app-delegate hooks through
this owner; public sharing requests associated-domain/link hooks through this owner.
Foundation must not independently introduce native transport or DTO copies.

## Existing code: reusable pieces and concrete gaps

Inspection evidence on 2026-10-08:

| Existing path / symbol                                   | What exists                                                                                                        | Required addition                                                                                                                    |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------ |
| `App/AppRootView.swift`, `AuthenticatedAppView.appShell` | One outer NavigationStack around Home/Inbox/Library/Search TabView; centralized navigationDestination registration | Publication routes and entry points, without a competing stack or unapproved new tab                                                 |
| `App/AppRootView.swift`, `AppRootView.body`              | Signed-out users receive ZineAuthEntryView exclusively                                                             | Anonymous publication reader and pending save/subscribe continuation above auth/session replacement                                  |
| `App/ZineNativeApp.swift`, `configuredRootView`          | onOpenURL delegates received URLs to Clerk                                                                         | Explicit publication URL recognition plus preserved Clerk callback fallback; universal-link user activity handling                   |
| `Configuration/ZineNative.entitlements`                  | Associated domains contains only `webcredentials:clerk.myzine.app`                                                 | `applinks:` for the public host coordinated with public-sharing AASA and signing; APNs capability also needs delivery audit          |
| `Core/API/APIClient.swift`, `send` / `request`           | Bearer token required for every request; JSONDecoder defaults; private transport helpers                           | Explicit anonymous public read mode and typed conflict/validation details; no token required for public reads                        |
| `Core/API/APIError.swift`, `APIErrorPayload`             | `error` and `code`, with server status carried by APIError                                                         | Decode revision conflict and per-selection eligibility detail agreed by foundation                                                   |
| `App/AppRootView.swift`, `AuthenticatedAppSession`       | Account-scoped library/article caches and stores                                                                   | Account-scoped draft cache and publications session state; cleanup/account-switch policy                                             |
| `Features/Library/LibraryStore.swift`                    | Search/filter/cursor loading, cached owned bookmarks, cancellation guards                                          | Dedicated selection picker including finished bookmarks; server eligibility feedback, without treating provider alone as eligibility |
| `Core/Models/Bookmark.swift`, `Bookmark`                 | Saved content ID, item ID, original source, state and activity fields                                              | Separate discovery-reference DTO/component; Bookmark currently has no publication reference fields                                   |
| `Features/Library/BookmarkDetailView.swift`              | ShareLink shares original canonical URL                                                                            | Publication issue ShareLink uses public issue URL, never the original bookmark URL                                                   |
| `apps/ios/Package.swift`                                 | Explicit canonical source lists and SwiftUI exclusions                                                             | Include new headless models/client/cache/stores and exclude new views deliberately                                                   |

There is no current native publication route/model/editor in the inspected sources.
Existing provider subscriptions must not be relabeled or reused for publications.
Do not build the public issue reader from BookmarkDetailContent: it would couple
anonymous projection to owner bookmark/private reading state.

## Navigation and screen flows

Recommended placement for first implementation: an explicit “My Zine” entry and
an “Activity” entry on Home, using existing navigation actions. No new primary tab
is presumed. UI design can refine placement before live UI work; route semantics
are independent of placement.

Typed destinations: ownPublication, publication(publicationID),
issue(issueID), editor(issueID), activity, recap(weekStart). Editor access always
revalidates ownership; routes carry stable IDs, not cached private objects.

- My Zine → setup if absent → owner home with separate drafts/published sections →
  new independent draft → editor → publish confirmation → public reader → Share.
- Editor → saved picker (search/type/filter, finished included) → explicit selection
  → section/order/commentary controls → autosave state. No URL-entry control.
- Publication home → archive → issue reader → original source, Save, Subscribe.
  Owner-only Edit is available after permissions are loaded, not inferred from URL.
- Weekly recap → no preselected candidates → create weekly draft from explicit
  choices → same editor; add older saved content through the ordinary picker.
- Activity item/push → public issue or publication; digest spanning issues opens
  publication/activity context rather than arbitrarily choosing the first issue.
- Library detail → first discovery attribution → expanded references → original
  issue when available; unavailable references remain text without tappable links.

Issue reader presents title/cover/introduction, ordered sections, source/author,
commentary, original link, Save, publication identity and subscription state. It
never embeds stored full article/transcript content. A saved item may subsequently
be opened through its normal Library detail/reader journey.

Use ZineTheme semantic roles, native system share sheets, existing outer shell and
pushed-destination chrome. Neutral issue reading surfaces; orange only for actions,
selection and narrow accents. Provide loading/empty/error/unavailable states,
Dynamic Type and labeled reorder controls as alternatives to drag gestures.

## DTO, transport, and error contract

Mirror executable shared schemas once foundation supplies them. Minimum types:
PublicPublication, OwnerPublication, PublicIssue, OwnerIssue, IssueSection,
PublicIssueSelection, OwnerIssueSelection, PublicationSubscription,
IssueMutationRequest, PublishIssueRequest and PublicationPage<T>. Keep owner
library/item references out of public DTOs. Existing ContentType raw values can be
reused where identical to the shared schema; otherwise adapt explicitly.

Use opaque string IDs, numeric revisions, optional URL strings with validated URL
accessors, and explicit uppercase kind/status raw values. Unknown content types
must render a generic selection rather than invalidate an entire public issue;
unknown lifecycle/mutation states must disable writes rather than assume draft.
Parse UTC ISO8601 timestamps with and without fractional seconds in feature DTO
helpers; retain local date and IANA timezone as separate recap values. Do not change
global bookmark date decoding incidentally. Field/envelope names follow actual
shared fixtures; the contracts example is an inner resource, not an envelope.

PublicationClient exposes anonymous getPublication/getIssue/archive and private
owner CRUD/publish/subscription methods. Extend APIClient transport narrowly so
public mode explicitly omits token lookup, keeping authenticated mode the default.
Inject URLSession for fixture-backed HTTP tests. No tRPC or second auth provider.

Expected writes send revision and typed operations; publish/save carry persisted
idempotency keys per user intent. Foundation owns exact keys/header/body placement.
Native error presentation must distinguish:

- 401: preserve edits/action intent and offer sign-in; never treat every 403 as
  expired auth (403 may mean non-owner).
- 403: show permission failure, keep recoverable local editor data. Foundation
  may return privacy-preserving 404 for foreign owner resources; handle both.
- 404/unavailable: public unavailable screen without exposing draft existence.
- 409 revision conflict: stop writes, fetch latest and show recovery choices.
- 422 eligibility/validation: highlight affected selections/fields with actionable
  reason; do not silently remove selections or publish a reduced issue.
- Network/408/429/5xx: keep pending state; retry safely with the same intent identity.
- Cancellation: no user-facing failure; stale responses cannot overwrite new state.

## Editor persistence and concurrency

Maintain a server-confirmed baseline (revision and content), local working copy,
and serialized pending operations. Persist local changes immediately to an
account-and-API-base-scoped protected cache, then debounce server saves. “Saved”
means server acknowledged; distinguish “Saved on this device”, “Saving”, and failure.
Use atomic file replacement and iOS data protection; no provider tokens in drafts.
Do not send issue mutations through OfflineBookmarkMutationOutbox.

Navigation/relaunch restores unsent work. Relaunch checks the server revision
before sending pending operations. Account switch never exposes another account's
drafts; sign-out clears active in-memory state while unsynced disk drafts remain
recoverable only under that exact account/baseURL namespace. Confirm cache retention
with integration owner before implementing destructive cleanup.

At conflict preserve both versions, show changed fields/selections, and let the
editor choose server copy or explicitly reconcile local changes onto the latest
revision. No blind “retry overwrite”, no silent text merge, no automatic last-writer
wins. Do not discard local work when fetching latest. Unknown outcomes retry using
the original operation identity only where server idempotency is supported;
otherwise reconcile fetched revision/result before sending again.

Publishing first flushes pending saves, checks acknowledgement of the exact draft
revision, displays public visibility confirmation and invokes publish explicitly.
A failed/ambiguous response never means published until reconciled with the server.
Weekly published UI removes Add/Replace controls but keeps corrections; server
remains authoritative. Independent additions are server-committed before shown as
public. Corrections/order/removals create no native notification locally.

## Share, link, and authentication continuation

Public sharing proposes `/p/:publicationId` and `/i/:issueId` on the reserved public
HTTPS host. Use these same shapes in native parser and web/AASA fixtures; integration
owner freezes the host. Public sharing owner supplies the URL builder/parser
contract and domain/path fixtures. Share only canonical HTTPS issue links after successful publication;
draft routes are never shareable. Handle recognized publication/issue links at the
app root before Clerk callbacks. Validate host, scheme, exact path and ID format;
ignore hostile/unsupported parameters. Keep native API base separate from public
share host, especially during local verification.

An app-root PendingPublicationIntent survives auth view replacement and contains
only public IDs plus action (read/save selection/subscribe), expiry and request
identity. Public browsing does not invoke sign-in. Save/Subscribe prompts auth,
then resumes the exact requested action once, revalidating selection/subscription
state. Canceling login returns to the same issue without mutation. Clear completed,
expired and canceled mutation intent; do not accidentally replay for a different
signed-in account. Coordinate web-to-app deferred auth with public-sharing owner;
a browser login alone does not prove native continuation.

## Integration hooks

- Wrapped supplies private recap DTOs with activity labels/coverage and adapter
  returning the ordinary OwnerIssue after explicit candidate selection. Native owns
  WeeklyRecapView; no client-side inferred consumption or automatic inclusion.
- Delivery supplies subscription/activity/visit/push-installation client contracts.
  Reader retains the prior lastSeenRevision while rendering new markers and records
  the displayed revision only after presentation; background loading does not mark
  visited. Preserve the prior marker baseline for the current reading session.
- Attribution supplies save-selection result and reference listing/availability.
  Selection saves must use the selection-specific endpoint, never saveBookmark(url:).
  Reconcile returned bookmark with existing mutation state/cache and post the
  existing bookmark-saved signal to refresh Home/Library without overwriting notes.
- Push token registration occurs only with authenticated account scope; revoke or
  transfer ownership correctly on sign-out/account switch. Denied push permission
  leaves in-app activity functional. Delivery owns policy, native owns permission UI.

## Verification and first bounded implementation task

First task after fixture freeze: implement headless Publication DTOs, route/intent
parsing and injectable client transport, with public/private/error decoding fixtures.
No UI/navigation/entitlement changes in that task. Prove anonymous requests never
ask for a token, authenticated writes do, private fields do not leak into public
models, invalid links are rejected, and conflicts retain typed details. Document
shared schema revision and include new canonical files in SwiftPM source lists.

Next: editor state/cache/revision recovery against fixtures; then view composition
and centralized navigation; then real backend wiring and cross-stream hooks.
Fixture success is not live verification. Required evidence includes:

- Headless meaningful tests for revisions, relaunch recovery, failed/ambiguous
  publish, weekly mutation restrictions and auth intent replay/account isolation.
- Authenticated local Simulator computer-use journeys for create/order/commentary,
  publish/share, second-reader save/subscribe, relaunch recovery and conflict states.
- Both appearances, Dynamic Type, loading/empty/error and unavailable originals;
  Library/detail/article reader regression observation for attribution changes.
- Wrapped candidate selection → ordinary editor → publish; activity/digest/new
  markers; muted/denied-push paths with actual server results.
- Physical iPhone iMessage preview, installed-app universal links, auth continuation
  and push receipt. Simulator, fixture images and build success do not prove these.

Use zine-local-development for runtime implementation and coordinate Simulator
ownership. Report tests/build/install/launch/direct interactions/visible final state
separately. Complete required lint/format/typecheck/test/build checks before commits;
shipping/PR/release belongs to later authorization and integration ownership.

## Implementation definition of done (October 8 dispatch)

Native is complete when the actual canonical app supports publication setup/edit,
private persistent issue composition from saved content, ordered sections/commentary/
covers, explicit publication, weekly editing restrictions, anonymous public reading,
system sharing and validated universal links, account-safe sign-in continuation,
subscribe/mute/unsubscribe, activity/new markers, recap selection to ordinary editor,
Library discovery references and optional authenticated push registration/routing.
Meaningful headless tests and canonical Xcode build must pass; integrated direct
Simulator journeys in both appearances and Library/detail/reader regression paths
must be observed with Integration's coordinated local stack. Device-only iMessage,
universal-link and APNs evidence must be recorded separately and external blockers
reported honestly. Plumbing alone or mocked UI is not completion.
