---
name: zine-mobile-preview-deploy
description: Use when the user asks to push, deploy, install, or send the Zine mobile app to their phone or device. Treat these requests as iOS preview deployments by default, and use the mobile deploy script unless the user explicitly asks for a different build type or target.
metadata:
  short-description: Deploy Zine mobile preview to phone
---

# Zine Mobile Preview Deploy

When the user asks to "push it to my phone", "deploy it to my phone", "install it on my phone", or similar, assume they mean the iOS preview build for `apps/mobile`.

Default workflow:

1. Work from the requested source snapshot. If they say to pull latest/main first, update to `origin/main` before building. In a linked worktree, use detached `origin/main` if the local `main` branch is already checked out elsewhere.
2. From `apps/mobile`, run:

   ```bash
   bun run deploy:ios:preview
   ```

3. Let the script handle the EAS preview build, IPA download, device discovery, and `devicectl` install.
4. Do not run production, TestFlight, or ad hoc EAS commands unless the user explicitly asks for that.
5. If the script appears quiet, check EAS status with:

   ```bash
   eas build:list --platform ios --limit 3 --non-interactive
   ```

   Keep the existing deploy process attached instead of starting duplicate builds when a current build is in progress.

Expected output after success includes `App installed` with bundle ID `app.zine.mobile`.
