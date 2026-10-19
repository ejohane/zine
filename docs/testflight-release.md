# Internal TestFlight releases on Erik's Mac

The repo-owned `scripts/testflight-release` command releases immutable latest
`origin/main` snapshots of Zine's iOS app to **Erik Internal**. It uses Xcode for
manual archive/export, pinned fastlane Pilot for upload, and Apple's public API
for exact-build processing and internal group assignment. No App Store release,
external testing, tester creation, profile/certificate generation, expiration or
revocation operation is implemented.

## Prerequisites

- macOS, Python 3.9+, Node, Git, working Xcode selected through `DEVELOPER_DIR`
  or `xcode-select`, Ruby 3.2+ and Bundler 2.7.2. The Mac's system Ruby is too old.
- Existing distribution identity/private key
  `089C7A0D222C10692C5CCCF0A1E0F13875313822` in the unlocked signing keychain.
- Manual App Store profiles for the app, share extension, and widget, installed
  under Xcode UserData or MobileDevice Provisioning Profiles. Set the approved
  UUIDs with `ZINE_TF_APP_PROFILE_UUID`, `ZINE_TF_SHARE_PROFILE_UUID`, and
  `ZINE_TF_WIDGET_PROFILE_UUID`. These are profile identifiers, not credentials.
  The legacy app/share UUIDs remain defaults; the widget has no legacy default.
  The app and widget profiles must authorize `group.app.zine.native`. The old
  app profile predates widgets and must be replaced with an App Group profile.
  Doctor checks expiry, distribution type, certificate membership, identifiers,
  team, and target-specific grants. It never accepts a development profile.
- App `6823593368`, bundle `app.zine.native`, extensions
  `app.zine.native.share` and `app.zine.native.widgets`, team `TRA7965NM5`.
  The only permitted TestFlight group is
  `83615578-9adf-46d6-9ffd-a6b30d319160`, named Erik Internal, internal,
  public link disabled, automatic distribution (`hasAccessToAllBuilds`) off,
  and exactly one tester: `ejohane@gmail.com`. Every app group must report automatic
  access disabled; another automatic or unknown-access group blocks upload. Exact
  build group membership must remain limited to Erik Internal. Missing or changed
  fields fail closed.

Install the isolated Ruby bundle (this does not configure Apple credentials):

```sh
export PATH="/opt/homebrew/opt/ruby/bin:$PATH"
gem install bundler -v 2.7.2
BUNDLE_GEMFILE=scripts/testflight/Gemfile bundle _2.7.2_ install
```

Dependency versions are locked in `scripts/testflight/Gemfile.lock`; fastlane is
pinned to 2.241.1. Do not substitute the older global Homebrew fastlane.

## Credential setup is a separate approval

This implementation neither creates nor retrieves nor configures a key. After
separate approval, the operator supplies `ZINE_ASC_KEY_ID`, an absolute
`ZINE_ASC_KEY_FILE` path to an owner-only `.p8` file outside every repo checkout,
and `ZINE_ASC_ISSUER_ID` for a team key. Omit the issuer for an individual key.
Never put key material in CLI arguments, repository files, review notes or logs.
The command suppresses upstream tool/server output and saves only release state.
Local build/Git/project processes receive no ASC environment variables. Ambient
Pilot/fastlane/Transporter settings are discarded; the adapter runs from a neutral
directory and accepts only the pinned altool Transporter executor, whose temporary
key directory is private. Shell Transporter mode is rejected before key preparation
because its shared key-directory cleanup can affect other credentials.

An individual key inherits its user's roles and app access; Erik's Account
Holder individual key must **not** be described as Zine-scoped. Team keys apply
to all apps and cannot be limited to Zine. App Manager or Admin access is needed
for distribution; Developer is upload-only. Individual keys cannot access
provisioning endpoints; this workflow reuses installed signing material and does
not need those endpoints. See [Apple's key documentation](https://developer.apple.com/help/app-store-connect/get-started/app-store-connect-api/),
[fastlane API authentication](https://docs.fastlane.tools/app-store-connect-api/),
and [Pilot permissions/options](https://docs.fastlane.tools/actions/pilot/).

## Commands

```sh
scripts/testflight-release doctor --local
scripts/testflight-release plan --offline
scripts/testflight-release doctor
scripts/testflight-release plan
# Only after a release is authorized and the planned source has been reviewed:
scripts/testflight-release publish --reviewed-sha FULL_MAIN_SHA \
  --review-note 'Source, pinned dependencies, production configuration and signing reviewed; evidence reference'
scripts/testflight-release status '/absolute/path/to/manifest.json'
scripts/testflight-release resume '/absolute/path/to/manifest.json' --wait 1200
```

`plan` is the dry run: it fetches main and reads Apple without reserving a build,
changing source, archiving or uploading. Offline planning uses cached main,
requires no credentials and deliberately leaves the build number unallocated.
Doctor local checks no credentials and makes no Apple calls. Full doctor/plan
require configured API access and verify the audience. Publish repeats checks,
fetches latest main, requires the reviewed SHA to match, and takes a detached
worktree at that immutable SHA. Source overrides are restricted to manual
signing and synchronized app/extension build numbers in that snapshot. The prepared
project hash is checked after archiving as well as tracked source changes.
Selected profile UUIDs are recorded in the release manifest and used to verify
every archived and exported product. Both extensions must be present. The widget
reads the shared App Group snapshot and has no API configuration or keychain grant;
production API checks apply to the app and share extension. Entitlement checks
match the current source exactly, including the app's three associated domains.

Before a release, review changes since the last release, native dependency pins,
production endpoint/auth configuration, signing and entitlements. Changes to
cryptography, auth, networking, source package pins or new native libraries need
renewed encryption review. `--review-note` records human/operator evidence; it
is not an automated compliance determination. No UI, auth or app runtime code is
changed by this tooling.

## State and recovery

All releases share a nonblocking OS lock at
`~/Library/Application Support/Zine/TestFlight/release.lock`, across checkouts.
The lock releases on process exit; do not delete an active lock file. Each
release keeps `manifest.json`, immutable source SHA, version/build, review
reference, archive/export paths, IPA hash, upload intent, ASC build ID,
processing state and membership result in a separate directory there. Keep the
manifest and IPA; protect this directory as local release evidence. Detached
worktrees and archives are retained for inspection; no automatic cleanup occurs.

Build allocation continues the numeric train already accepted for Zine
(`2026101701`), choosing at least UTC date plus `01`, above Apple's observed
numeric builds and previous local allocations. The lock covers allocation
through assignment on this Mac. Other Macs/manual uploads are outside this
lock; exact-build collision checks stop before upload. Do not run parallel
manual releases. Plans reserve nothing.

Upload intent is atomically persisted and fsynced before invoking Pilot. If the
process or network fails, run status against that original manifest. Resume
first checks the exact app, build number, marketing version and platform, and
requires a stable ASC build ID once observed. It never uploads twice after
intent was recorded, even when Apple has not yet listed the build. Wait and
check status again. If Apple definitively rejected an attempt, retain the
manifest and diagnose it; an operator must resolve the unresolved release before
starting a new one. A build that Apple lists as FAILED/INVALID, or expired, is recorded as a terminal
rejected/expired release and allows a fresh build allocation. There is deliberately
no automatic or force-reupload flag.

Status makes no Apple mutations; it refreshes the local manifest. Resume may
upload once if a completed archive has **never** had upload intent; this still
requires the full local signing/project doctor and verified IPA. Once upload
intent exists, resume validates API credentials and reconciles that exact Apple
build without requiring local signing assets, the IPA or the current project
configuration. It assigns the build only after Apple reports internal readiness.
The default poll window is 20 minutes, at intervals up to 30 seconds; timeout is
resumable. Membership and audience are read back after assignment. Status refuses to adopt a matching Apple build when the manifest never recorded
upload intent. This preserves the collision guard through status/resume. Before
any first upload, including resume of an older archive, unresolved uploads from
other manifests block progress. An
interrupted assignment is recovered by checking exact membership first. A
missing readiness/compliance state stops without attestation or distribution.
A ready manifest confirms server availability, not invitation acceptance or
installation on an iPhone.

Doctor/prerequisite failures occur before creating a release snapshot or making
Apple mutations. A failed local archive can leave a preparing manifest; retain
it, diagnose prerequisites, and start a new publish. Completed/ambiguous uploads
must be resolved using their own manifests before a new publish is allowed.
Raw subprocess output is intentionally not stored; local failures identify the
stage. Reproduce only safe local build checks for detailed diagnosis; never
reproduce an upload command to obtain logs.

## Encryption classification

On 2026-10-17 Erik explicitly approved **“None of the algorithms mentioned
above”** for source `b6d64534b12c7edcf2245bb60ef3da28b7aa9855`, version 0.1,
build 2026101701. Apple cleared Missing Compliance and that build entered internal
testing. This records that build's approval, not permission for future answers.

A source scan at that SHA finds CryptoKit in auth/OAuth and the Debug Simulator
bridge. The app locks Clerk 1.3.1, Nuke 13.0.6 and PhoneNumberKit 5.0.4. Imports
alone do not establish encryption classification or cover transitive code.
**No `ITSAppUsesNonExemptEncryption` value is added by this change.** A focused
review of the app and pinned dependencies should determine whether only exempt
system encryption/authentication/hashing is used. Only after that review and
approval should a separate change encode `ITSAppUsesNonExemptEncryption=false`
in the app (and extension as appropriate), documenting scope, dependency pins
and what changes invalidate that conclusion. Until then, new builds may stop at
Missing Compliance and require a build-specific review before resume. See
[Apple's export compliance guidance](https://developer.apple.com/help/app-store-connect/manage-app-information/overview-of-export-compliance/).

## Verification

```sh
python3 -m unittest discover -s tests/testflight -v
BUNDLE_GEMFILE=scripts/testflight/Gemfile bundle exec ruby tests/testflight/bridge_test.rb
```

Tests stub external mutations; they do not contact Apple or upload. A live
archive and API acceptance check remain distinct validation steps. The skill at
`.agents/skills/zine-testflight/SKILL.md` invokes these commands; `.codex/skills`
and `.github/skills` discovery entries point to that same harness-independent
skill. Copilot can read the same skill or invoke the CLI directly.
