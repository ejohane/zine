---
name: sim-launch
description: Launch the native Zine iOS app with the repository Apple Simulator workflow.
---

# Launch Zine in Simulator

Use `ZINE_DEV_HOST=localhost bun run dev:worktree` from the repository root for local development.
It builds, installs, and launches `app.zine.native` in Apple Simulator. Use
computer use directly in that app. To launch against an already running local
Worker, set `ZINE_LOCAL_API_URL` and run `bun run ios:simulator`.

Follow `.codex/skills/zine-local-development/SKILL.md` for simulator selection,
computer-use verification, and cleanup. The supported project is
`apps/ios/ZineNative.xcodeproj`, scheme `ZineNative`.

Use [the sign-in procedure](../../../docs/local-development.md#sign-in-directly-in-apple-simulator)
for protected Bitwarden credential transfer and native `setValue` entry on the
settable Clerk email/password fields. Keep credential-bearing state out of output.
