# Local native verification after unlock

October 8, 2026. Partial verification; not a release-completion claim.

## Live environment

- Dedicated Simulator: iPhone 17 — Zine Foundation,
  `908889F4-D999-4DE5-9027-1BE1C1AAD451`, iOS 26.2.
- Started canonical dev:worktree with localhost Worker 8785 and web 8285.
- Reused sanitized local data and existing authenticated native session. No refresh,
  auth bypass or production application writes.
- Canonical build, install and launch succeeded. Installed app and share extension
  both confirmed API `http://localhost:8785`; launch PID 96509.
- Parent chat owns exec session 75521 and its dev descendants. Kept alive while
  awaiting the manual toolbar-input check; do not start a duplicate stack.

## Direct computer-use observations

- Home showed populated content after launch.
- Opened the existing saved article through native accessibility activation.
- Discovery references were present, with multiple-reference expansion available.
- Followed a discovery reference to its actual local published issue. Visibly
  observed title, publication/editor attribution, introduction, section heading,
  selection/source/commentary and original/save controls.
- Used the exposed native Scroll Down action to reveal the selection controls.
- Activated Save to Library and observed the button become disabled with accessibility
  label Saved to Library and filled bookmark icon. Reopened original detail and saw
  multiple retained discovery references.
- Followed the publication link and visibly observed its public identity and archive.
- Returned through actual back controls to Home.

No bridge navigation, shell tap, fixture-only screen or screenshot-only substitute
was used to establish these observations. Screenshots were observed through CUA.
Reader used its existing dark reading appearance; issue/archive were light. This is
not proof of the full affected screen matrix in both appearances.

## Fresh authenticated backend smoke

Ran `secretsctl current`, metadata/check, then injected credentials into the existing
trusted `scripts/verify-publication-integration.ts` against loopback 8785. Real Clerk
session subject matched the sanitized snapshot. Passed draft creation/replay,
composition, anonymous draft404, explicit publishing, anonymous public projection,
save/replay identity and provenance, visits/activity/preferences, private recap401,
no preselection and self-subscription409.

Retained local-only sample issue `01M4F27GPSWFVRYVQH3605MYTT` for continued native/web
verification. Secret values and tokens were not printed or persisted.

## Remaining input blocker

The Simulator screenshot visibly contains Home's book menu and settings button,
but its exposed accessibility tree omits them and the tab-bar buttons. CUA coordinate
clicks/drag/keyboard activation did not activate those controls; coordinate clicking
an article likewise failed while its accessibility action worked. A ShareLink action
also did not present the system sheet. This is not enough evidence to label the
publication menu broken in the app: physical/manual input has not been compared.

Requested a manual check of the top-left book button. Creator editor/publish/cover,
Wrapped, activity/subscription UI, light/dark matrix, and share-sheet verification
remain incomplete. No full native end-to-end or two-account UI claim is made.
Second authenticated identity has not been provisioned; existing automated two-user
isolation checks do not substitute for a real two-account journey.

## Review/check scope

Reviewed publication entry routes, editor mutation/recovery and public reader/save,
subscription and Wrapped adapters. `git diff --check` passed. No code changes were
made; no comprehensive independent security-review claim is made. Prior automated
suite evidence remains in 06-integration-completion.md; it was not rerun wholesale
because source did not change.

## Fresh Simulator continuation

After the user reported that manual interaction also failed and removed the old
Simulator, created `iPhone 17 — Zine Fresh`, iOS 26.2,
`77F1AE8E-29EF-4219-AB2F-6CD1C14A8353`. Installed the existing successful build;
the repo simulator launcher confirmed both app and extension target localhost:8785.
No new build was needed. User completed sign-in and opened the publication menu.

Direct computer use then verified:

- My Zine navigation and creation of an independent draft.
- Title entry, selection of the saved article How to read code, autosave, explicit
  publish confirmation, and Published state. Reopening from the archive retained
  title and selection under Fresh simulator reading list.
- Weekly Wrapped archive and private recap with saved/opened/finished counts and
  incomplete-history notices. Explicitly selected one item and created a weekly
  draft containing that item. Returned to My Zine and observed it under Drafts;
  left it unpublished.
- Share your Zine presented the actual iOS system share sheet, visibly containing
  a myzine.app link preview, Copy and available sharing targets. No message sent.
  Hosted link content and messaging delivery are not verified by this sheet.
- Activity and Subscriptions empty states opened visibly; delivery timezone was
  America/Chicago. No second-account delivery or subscription mutation was tested.

Commentary entry remains unresolved: setting the multiline accessibility Group
briefly changed its exposed value, but the text did not survive publishing.
Keyboard/paste attempts did not establish successful input either. Do not claim
commentary persistence verified or infer a confirmed app defect from these input
attempts alone. Cover upload, appearance matrix, real two-account notifications,
APNs, hosted link previews/universal links and physical-device messaging remain
outstanding. The fresh simulator and owned local stack remain available for review.

## Commentary resolution and cover REST recheck

Direct CUA activation of individual onscreen keyboard keys entered `a useful read`
into the commentary field. Autosave completed, and leaving/reopening the published
issue retained the visible text. Anonymous GET of the publication archive returned
the same commentary for issue `01M4F5AFP1DJZ8QKVMQVK1XSRV`, revision 6. The earlier
Group setValue and hardware typing attempts were insufficient input evidence;
this case does not require an application fix.

Re-ran the trusted authenticated `verify-publication-foundation.ts` against
localhost:8785 using secretsctl. Passed cover upload, JPEG signature/content type,
draft issue/cover anonymous404, published issue/cover anonymous200, and disposable
issue deletion followed by issue/cover404. This is live REST/media evidence, not
PhotosPicker UI or production-bucket readiness.

Prepared a separate Reader simulator `37F67373-FE3D-43DC-B1E8-38D849933135` with the
same installed app and extension local API configuration. It is at sign-in pending
a second real account. Only one test identity is currently allowlisted; requested
manual second-account login or second allowlisted credentials. No unrelated app
credentials, synthetic auth bypass or copied production tokens are used.

Physical iPhone was discovered as available (UDID `00008140-001A686E0EDB001C`).
Attempted signed Release build against a temporary local Tailscale proxy, isolated
derived-data directory `ios-publication-device-derived-data`. Build failed before
installation: no Xcode developer account, and the cached app.zine.native profile
lacks Push Notifications and aps-environment. Requested developer account/profile
refresh; did not remove push entitlements or substitute an older build. No phone
installation or launch is claimed. Temporary phone proxy was stopped; original
localhost dev stack remains running.

## Xcode signing repair

At the user's request, opened Xcode Apple Accounts, inspected the existing Erik
Johansson developer team and certificates, and downloaded profiles. The running
GUI is Downloads/Xcode.app (27.1); command-line default is Applications/Xcode.app
(26.2). Both CLI installations initially reported No Accounts, even while the GUI
could access certificates. Merely switching DEVELOPER_DIR did not fix signing.

Opened this worktree's native project in the authenticated GUI, selected Erik's
physical iPhone, and built. Xcode generated a fresh app.zine.native development
profile containing aps-environment=development, expiry 2027-10-09. GUI visibly
reported Build Succeeded. This was a build, with no GUI Run/install requested.
Then started a separate signed Release build with the local phone API override
against the refreshed profile; it uses isolated derived data and no account update
flag. Phone installation/launch remain separate from the GUI build evidence.

The separate Release build subsequently passed with the default Xcode 26.2 CLI
using the refreshed cached profile. `codesign --verify --deep --strict` passed;
signed entitlements identify TRA7965NM5.app.zine.native with development push.
App and extension both target `http://100.92.242.50:8786`. Installation onto Erik's
physical iPhone succeeded. Owned phone proxy session 35319 forwards that Tailscale
address to localhost:8785; anonymous local published-issue request returned200.
Keep it running with the original dev stack while the user reviews this phone build.
These results supersede the earlier signing/profile blocker; APNs backend credentials
and actual delivery remain outstanding separately.

Phone launch was denied by CoreDevice/SpringBoard because the device is locked.
Build, signature and installation passed; launch and observed phone UI did not.

## Second-account phone continuation

User subsequently signed into a different account on the installed phone build.
Cold launch with `--terminate-existing --payload-url` opened the local issue;
launching with payload while the app was already running had not navigated it.
User confirmed seeing the issue and subscribing. Authenticated publisher subscriber
readback confirmed one distinct subscribed reader. Published local issue
`01M4F72KN420SEQWGNC15DR3Y3`, titled Your first subscriber issue, after subscription.
Phone Activity observation and save/provenance verification are the next steps.

User confirmed the new subscriber issue appeared in phone Activity, Save to Library
succeeded, and Library detail showed the source publication attribution.

For daily additions, added two distinct saved articles to that same published issue
through authenticated REST (revision5). Local D1 contained only the original new-issue
activity afterward: additions did not notify immediately. Advanced only this local
subscription's digest due time and ran the real processDailyDigests against the same
persisted local D1 via Wrangler bindings. It created one DAILY_ADDITIONS activity
containing both added selections and the same issue ID. Re-running at the same time
created no duplicate. This accelerates local scheduling for verification; it does
not prove wall-clock cron delivery at 9 a.m. or APNs. User confirmed the grouped daily-additions entry and new-selection markers on the phone.

## Scope waiver and hosted verification (2026-10-08)

User explicitly skipped remaining cover-selection interaction and light/dark appearance
checks, and requested proceeding to hosted sharing, universal links, and push.

The existing staging Worker is absent, and its article/media buckets are unprovisioned.
Created an isolated, synthetic verification environment rather than use production:

- Worker `zine-publications-verification`, version cf5158ab-0487-4db1-8b68-a704c40a9c0c.
- Fresh D1 `zine-publications-verification`, ID 6ccc7d79-81a0-417e-a94b-785303d0b1c4;
  all migrations 0000–0038 applied successfully. No production export/import.
- R2 `zine-publications-verification`, with separate article/publication object key spaces.
- Reader `zine-publications-reader-verification`, version b7f00c7a-222e-46f4-8a1e-98b2b318c46a,
  custom hostname https://publications-test.myzine.app.
- Repeatable configs in apps/{worker,web}/wrangler.publications-verification.jsonc.
  This is a publication verification slice: no ingestion queues, provider secrets,
  cron triggers, or AI/vector bindings configured. Push remains disabled.

Seeded one synthetic saved Example Domain article for the already authenticated
publisher subject. Through real Clerk authentication and hosted REST, created and
explicitly published issue `01M4F7R8VNSDRMNYEVY0MFAFKZ` in publication
`01M4F7R8H8X1WBEQRXKDRDDME2`. Anonymous draft read returned404 before publish.
Direct browser interaction observed the anonymous published issue, commentary,
original link, and issue-to-publication archive navigation.

Hosted issue, association file, preview fallback PNG, and Apple CDN association all
returned200. Message-style fetch observed the expected issue title and HTTPS og:image.
Python urllib's default user agent received403, while curl, browser and Apple CDN
succeeded; no universal client accessibility claim is made.

Native configuration now selects publication links and signed associated-domain host
alongside the API environment, defaulting to myzine.app. Verification host parser tests
cover isolation and malformed/credential-bearing host rejection. Native core tests:
46 XCTest plus 3 Swift Testing tests passed. Hosted Release phone build passed; deep/strict code signature verification passed.
App and extension target https://publications-test.myzine.app; signed associated domain
is applinks:publications-test.myzine.app with development APNs. Installed onto Erik's
physical iPhone and launched successfully using a cold-launch issue payload. This is
launch/routing setup evidence, not an observed Messages tap or phone UI assertion.
No real Messages link-card observation, tapped universal-link observation, or APNs
provider delivery is claimed yet. No production deploy, commit or merge performed.

APNs Worker secret-name inspection found no APNS provider credentials in production;
allowlisted Bitwarden discovery also found none. Asked explicit confirmation before
creating a persistent APNs key, as required by the agent-secrets skill. This does not
block the independent hosted-sharing verification work.

Rebuilt the hosted web bundle with the existing public Clerk publishable key and
same-origin verification API URL; reader version now
c9347b5c-9513-4405-89e0-16946e270b56. Browser Subscribe navigated to its continuation
sign-in URL and visibly rendered the real Clerk email/password form. Credentials
were not entered and web continuation completion is not claimed. Git diff whitespace
and both new Wrangler config format checks passed.

## APNs setup and registration correction

User confirmed the hosted Messages sharing test worked, then explicitly approved
creating and securely storing an APNs key. Created Apple key 6BKM7D6AZJ on team
TRA7965NM5, restricted to Sandbox and topic app.zine.native. No other services enabled.
The portal session was authenticated before registration. No terms or MFA bypass.

Bitwarden secret creation rejected by its API (404 Resource not found); no machine
account permissions expanded. Stored a protected backup in macOS Keychain service
app.zine.apns.sandbox, account 6BKM7D6AZJ. Installed APNS_PRIVATE_KEY, APNS_KEY_ID,
APNS_TEAM_ID as isolated Worker secrets via stdin. Temporary downloaded .p8 removed.
Private key content never printed, added to repository, or stored in an .env file.
This key is not onboarded into secretsctl; future Bitwarden onboarding remains separate.

Found and corrected an environment mismatch: #if DEBUG chose production for a Release
app even when signed with a development provisioning profile. The app now reads the
embedded profile's aps-environment, with an explicit signed Info setting fallback for
App Store builds lacking that profile. Invalid embedded profile fails closed. Regression
covers Release setting plus development profile, missing profile and malformed profile.
47 XCTest plus 3 Swift Testing tests passed. Release build, strict signature verification,
physical phone installation and cold issue-payload launch passed separately.

Isolated Worker version 7affdb97-5e94-4c2f-b958-1e74752c2f83 has APNS_ENABLED=true
and all three protected secret names confirmed. Production remains unchanged.
Asked user to subscribe to hosted test publication and enable notifications in Activity.
Actual registered sandbox token, APNs acceptance, and visible notification pending.
