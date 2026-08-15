---
name: zine-ship
description: Ship completed Zine repository changes end to end. Use when the user says "ship it", asks to create a PR and merge it, or wants finished Zine work published to main and then installed on their phone. Create a scoped ready PR, wait for required checks, merge only when clean and mergeable, verify the exact post-merge main workflows and applicable production health, then build, install, and launch the canonical native iOS app from the merged source on the user's physical iPhone when available.
---

# Ship Zine

Carry finished work through GitHub and onto the physical iPhone. Treat build, install, launch, UI observation, merge, CI, deployment, and production readback as separate evidence states.

## 1. Confirm scope and source

1. Read the repository `AGENTS.md` instructions and inspect `git status -sb`, the relevant diff, recent commits, and remotes.
2. Preserve unrelated user changes. Stage only the intended files; isolate the work in another worktree if scope cannot be separated safely.
3. Fetch `origin/main` and confirm whether the work is based on the current remote main. Integrate current main before publication when needed, then rerun affected validation. Never discard work with a destructive reset.
4. Create a concise `codex/...` branch when the checkout is detached or the current branch is unsuitable.

## 2. Validate and publish a ready PR

1. Run checks proportional to the change plus the repository-required pre-push gates. For native UI work, include focused native tests and `git diff --check`. Reserve the signed physical-device build, installation, and launch for the exact merged source unless a device-only compile check is necessary before publication.
2. Commit only the scoped changes with a Conventional Commit message.
3. Push the branch and let the repository hooks complete. Fix failures before continuing.
4. Create a non-draft PR targeting `main`. Use a Conventional Commits title and include `Summary` and `Validation` sections with actual outcomes.
5. Verify the PR with `gh pr view`, including `isDraft`, `baseRefName`, `headRefOid`, `mergeStateStatus`, `mergeable`, and `statusCheckRollup`.

## 3. Wait, fix, and merge

1. Watch every check with `gh pr checks <pr> --watch --fail-fast=false`.
2. If a check fails, inspect its job and logs before changing code. Fix in-scope failures, rerun relevant local checks, commit, push, and resume watching. Rerun a job only when evidence indicates infrastructure flakiness.
3. Merge only when the PR is non-draft, every required check is complete and acceptable, and GitHub reports `mergeStateStatus=CLEAN` and `mergeable=MERGEABLE`.
4. Squash-merge by default unless the repository or user requires another strategy.
5. Read back `state=MERGED`, `mergedAt`, and the exact `mergeCommit.oid`. Fetch `origin/main` and confirm it resolves to that merge SHA.

## 4. Verify merged main

1. List workflows for the exact merge SHA with `gh run list --branch main --commit <merge-sha>` and watch every triggered required workflow through completion.
2. Do not stop after the merge command or infer post-merge success from PR checks.
3. If production-affecting Worker or web paths changed, also watch the corresponding deployment workflow and run the repository production health/readback commands after deployment. Do not claim a deployment for native-only changes when no deployment workflow is expected.

## 5. Put the merged native build on the phone

Use `apps/ios/ZineNative.xcodeproj`, scheme `ZineNative`, and bundle `app.zine.native`. Never substitute deprecated `apps/mobile`, Expo, Expo Go, EAS, or bundle `app.zine.mobile` unless the user explicitly requests legacy Expo work.

1. Build only after the merge and required post-merge workflows pass.
2. Ensure the build source is the exact merge SHA. A clean current worktree is acceptable only when its tree equals `origin/main^{tree}`; otherwise use a clean detached worktree at the merge SHA.
3. Discover the paired physical iPhone with `xcrun devicectl list devices`. Prefer the available device named `Erik’s iPhone`; never silently use a simulator.
4. If no physical iPhone is available, finish the GitHub delivery and report phone build/install/launch as skipped. Do not treat device absence as a reason to leave a ready PR unmerged.
5. Build a signed Release app for the discovered device UDID using disposable DerivedData:

   ```bash
   xcodebuild \
     -project apps/ios/ZineNative.xcodeproj \
     -scheme ZineNative \
     -configuration Release \
     -destination 'platform=iOS,id=<device-udid>' \
     -derivedDataPath '<temporary-derived-data>' \
     CODE_SIGN_STYLE=Automatic \
     DEVELOPMENT_TEAM=TRA7965NM5 \
     -allowProvisioningUpdates \
     build
   ```

6. Verify the bundle before installation:

   ```bash
   codesign --verify --deep --strict '<derived-data>/Build/Products/Release-iphoneos/Zine Native.app'
   ```

7. Install and launch with the discovered CoreDevice identifier:

   ```bash
   xcrun devicectl device install app --device <core-device-id> '<app-path>'
   xcrun devicectl device process launch --device <core-device-id> --terminate-existing app.zine.native
   ```

8. Retry an installation or launch after refreshing device state when the connection is transient. If the phone is locked, report installation success and launch unverified, then retry after the user unlocks it.

## 6. Report completion

Report:

- PR URL and merged state
- exact merge SHA and `origin/main` readback
- PR check result
- post-merge workflow result
- applicable deployment and production readback result
- signed build result
- bundle verification result
- physical install result
- launch result
- UI observation result, only if actually observed

Do not call the task shipped while required PR or post-merge checks are pending. If the phone is unavailable, say the repository change shipped and clearly identify the device step as skipped.
