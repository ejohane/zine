---
name: sim-launch
description: Launch the native Zine iOS app with the repository simulator preview workflow.
---

# Launch Zine in Simulator

Use `bun run dev:worktree` from the repository root for local development.
It builds, installs, and launches `app.zine.native` and starts a scoped
`serve-sim` preview. For a standalone preview use `bun run ios:preview`.

Follow `.codex/skills/zine-local-development/SKILL.md` for simulator selection,
computer-use verification, and cleanup. The supported project is
`apps/ios/ZineNative.xcodeproj`, scheme `ZineNative`.
