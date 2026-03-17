# Zine Agent Guide

## Core Setup

- This repository is a monorepo using Turborepo.
- The package manager is Bun (`bun@1.3.4`).
- Repo installs use a hoisted linker via `bunfig.toml`.
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
  - Detects the current Tailscale IPv4 when available and uses it for Expo Go + `EXPO_PUBLIC_API_URL`
  - Falls back to `localhost` when Tailscale is unavailable
  - Starts a small local HTTP proxy for non-localhost phone access because local `workerd` is not directly reachable on the Tailscale interface
  - Generates `apps/mobile/.env.local` with `EXPO_PUBLIC_API_URL=http://<reachable-host>:<public-api-port>`
- Override worker port with `ZINE_WORKER_PORT=<port> bun run dev:worktree`.
- Override the mobile/API host with `ZINE_DEV_HOST=<host> bun run dev:worktree`.
- Override the public API port with `ZINE_API_PORT=<port> bun run dev:worktree`.

### Empty Local Data Recovery

- Symptom: Expo Go loads, but Home/Inbox/Library are empty even though local test data should exist.
- First verify which local worker the app is actually using:
  - Check `apps/mobile/.env.local` for `EXPO_PUBLIC_API_URL`.
  - Check Expo logs; Expo Go may still be talking to an older `exp://<host>:<port>` endpoint if another dev server is running.
- Then inspect the local D1 file behind that worker:
  - Path: `apps/worker/.wrangler/state/v3/d1/miniflare-D1DatabaseObject/2a13f10f1e768310d0250437a6253d204a8c839f02e306404fa5e52ca7ded965.sqlite`
  - Quick check:
    - `sqlite3 <db> "SELECT 'items', count(*) FROM items UNION ALL SELECT 'subscriptions', count(*) FROM subscriptions UNION ALL SELECT 'provider_connections', count(*) FROM provider_connections UNION ALL SELECT 'user_items', count(*) FROM user_items;"`
- Important failure mode:
  - `bun run dev:reset && bun run dev:worktree` only re-seeds from the main worktree.
  - If the main worktree D1 file is empty, missing, or `0` bytes, the worktree will faithfully copy that broken state and the app will still show no data.
- Recovery order:
  - If the current worktree DB is broken, check the same D1 path in other Zine worktrees for a non-empty SQLite file with real row counts.
  - If another worktree has the expected data, stop the active local `wrangler dev` process, copy that SQLite file into both:
    - the current worktree D1 path
    - the main worktree D1 path
  - Restart `wrangler dev` after the copy.
- Expo Go cache gotcha:
  - After the DB is fixed, Expo Go can still show stale anonymous React Query results.
  - Cold restart Expo Go and reopen the project after restoring the DB.
  - In this repo, `apps/mobile/providers/trpc-provider.tsx` now clears the anonymous persisted query cache in development to reduce this failure mode.
- Verification:
  - Query the running local worker directly before trusting the UI:
    - `bun -e "import { createTRPCProxyClient, httpBatchLink } from '@trpc/client'; import superjson from 'superjson'; const client = createTRPCProxyClient({ links:[httpBatchLink({ url:'http://localhost:8787/trpc', transformer: superjson })]}); const home = await client.items.home.query(); console.log(home.recentBookmarks.map(i => i.title));"`
  - Then verify in the iOS simulator after reopening the project in Expo Go.

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

## Observability Guidance

- When you need to observe or diagnose application behavior, prefer the local Codex skill at `.codex/skills/zine-observability/SKILL.md`.
- Use that skill for worker health regressions, request/trace correlation, sync failures, queue or DLQ triage, and release-scoped incident diagnosis.
- Prefer the repo-owned diagnostics commands (`bun run diag:health`, `bun run diag:incident`, `bun run diag:cf:logs`, `bun run diag:release`, `bun run diag:queue:dlq`) over ad hoc dashboard browsing so evidence stays reproducible.
