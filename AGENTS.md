# Zine Agent Guide

## Core Setup

- This repository is a monorepo using Turborepo.
- The package manager is Bun (`bun@1.1.38`).
- Node version is pinned to `22` in `.nvmrc`.
- Workspace layout:
  - `apps/mobile`: Expo React Native app
  - `apps/worker`: Cloudflare Worker backend
  - `packages/shared`: shared types/schemas/constants
  - `docs`: architecture and system docs

## Common Commands (Repo Root)

- Install dependencies: `bun install`
- Start all dev tasks: `bun run dev`
- Worktree-safe dev startup: `bun run dev:worktree`
- Reset worktree state before re-seeding: `bun run dev:reset`
- Run tests (mobile + worker): `bun run test`
- Lint: `bun run lint`
- Design system checks: `bun run design-system:check`
- Typecheck: `bun run typecheck`
- Build: `bun run build`
- Format check: `bun run format:check`

## Test Commands

- Root test command (`bun run test`) runs:
  - `bun run --cwd apps/mobile test`
  - `bun run --cwd apps/worker test:run`
- Worker CI/parity test subset:
  - `bun run test:worker:ci`
  - Excludes `**/user-do.test.ts` and `**/scheduler.test.ts`

## Worktree Behavior

- `scripts/dev.sh` is worktree-aware:
  - Computes an available worker port (default range `8700-8799`)
  - Computes an available Metro port (`8081` in main, `8100+` in worktrees)
  - Seeds `apps/worker/.wrangler/state` from the main worktree on first run
  - Applies local D1 migrations
  - Symlinks `apps/worker/.dev.vars` from the main worktree when appropriate
  - Generates `apps/mobile/.env.local` with `EXPO_PUBLIC_API_URL=http://localhost:<WORKER_PORT>`
- Override worker port with `ZINE_WORKER_PORT=<port> bun run dev:worktree`.

## Quality Gates and Commit Hygiene

- Pre-commit (`.husky/pre-commit`):
  - Blocks build artifacts in commits (`dist/`, `build/`, `.next/`, `out/`, `web-build/`)
  - Runs `lint-staged`
- Pre-push (`.husky/pre-push`) runs:
  - `bun run format:check`
  - `bun run design-system:check`
  - `bun run typecheck`
  - `cd apps/worker && bun run test:run --exclude='**/user-do.test.ts' --exclude='**/scheduler.test.ts'`

## CI and Deploy Parity

- CI workflow: `.github/workflows/ci.yml` (lint, typecheck, worker tests, build).
- Worker deploy workflow: `.github/workflows/deploy-worker.yml` (shared build, DB migrate, production deploy).

## Additional Agent Context

- Mobile-specific guidance lives in `apps/mobile/AGENTS.md`.

## Design System Workflow

- When editing shared mobile UI, read:
  - `docs/mobile/design-system/principles.md`
  - `docs/mobile/design-system/foundations.md`
  - `docs/mobile/design-system/components.md`
- In `apps/mobile/components`, prefer `@/components/primitives` (`Badge`, `Button`, `IconButton`, `Surface`, `Text`) plus semantic theme tokens before introducing new one-off shared styles.
- For `apps/mobile/components`, prefer canonical components and semantic theme tokens over one-off styles.
- Do not add new raw hex/rgb colors or ad hoc typography literals in shared mobile components unless the line is marked with `design-system-exception:` and a short reason.
- Do not expand legacy mobile UI paths (`apps/mobile/components/home/*`, `apps/mobile/components/themed-*`, `apps/mobile/components/ui/*`) for new work.
- Run `bun run design-system:check` when mobile shared UI changes.
