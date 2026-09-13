# Zine Agent Guide

## Core Setup

- This repository is a monorepo using Turborepo.
- The package manager is Bun (`bun@1.3.4`).
- Repo installs use a hoisted linker via `bunfig.toml`.
- Node version is pinned to `22` in `.nvmrc`.
- Workspace layout:
  - `apps/ios`: supported native SwiftUI iOS app
  - `apps/worker`: Cloudflare Worker backend
  - `packages/shared`: shared types/schemas/constants
  - `docs`: architecture and system docs

## Supported Client Direction

- `apps/ios` is the canonical and only supported mobile client.
- Default all new mobile product work, verification, tests, and device deployments to `apps/ios/ZineNative.xcodeproj` and the `app.zine.native` bundle.
- The native app uses Clerk-authenticated `/api/v1` REST endpoints. Reuse and extend that boundary instead of introducing tRPC or a parallel native-only API.

## Common Commands (Repo Root)

- Install dependencies: `bun install`
- Start all dev tasks: `bun run dev`
- Start the web app only: `bun run dev:web`
- Worktree-safe dev startup with native `serve-sim` preview: `bun run dev:worktree`
- Back up worktree state before fresh provisioning: `bun run dev:reset`
- Run repository tests (worker + web unit/component): `bun run test`
- Run web unit/component tests: `bun run test:web`
- Run Storybook browser checks: `bun run test:web:storybook`
- Run web smoke tests: `bun run test:web:e2e`
- Run the full web CI-parity suite: `bun run test:web:ci`
- Lint: `bun run lint`
- Web design system checks: `bun run design-system:check`
- Typecheck: `bun run typecheck`
- Build: `bun run build`
- Format check: `bun run format:check`

## Test Commands

- Root test command (`bun run test`) runs:
  - `bun run --cwd apps/worker test:run`
  - `bun run --cwd apps/web test`
- Native tests run through the `ZineNative` Xcode scheme; see `apps/ios/README.md`.
- Worker CI/parity test subset:
  - `bun run test:worker:ci`
  - Excludes `**/user-do.test.ts` and `**/scheduler.test.ts`
- Web test commands:
  - `bun run test:web` → `apps/web` Vitest unit/component suite
  - `bun run test:web:storybook` → Storybook build + Playwright accessibility/visual checks
  - `bun run test:web:e2e` → Playwright smoke coverage against the real Vite app
  - `bun run test:web:ci` → all web lanes together
- Full web testing workflow, debugging notes, and manual verification guidance live in `docs/web/testing.md`.

## Worktree Behavior

- `scripts/dev.sh` is worktree-aware:
  - Computes an available worker port (default range `8700-8799`)
  - Provisions sanitized production D1 and article bodies when local state is absent; otherwise preserves local edits
  - Applies local D1 migrations
  - Never copies or symlinks Worker secrets from the main worktree
  - Detects the current Tailscale IPv4 when available for web and physical-device API access
  - Falls back to `localhost` when Tailscale is unavailable
  - Starts a small local HTTP proxy for non-localhost phone access because local `workerd` is not directly reachable on the Tailscale interface
  - Builds, installs, and launches `apps/ios/ZineNative.xcodeproj` in the dedicated Zine Simulator
  - Starts a scoped `serve-sim` browser preview and stops it with the rest of the dev stack
  - Handles SIGINT, SIGTERM, and SIGHUP through `scripts/dev-processes.sh`, stopping the tracked Bun/Turbo descendants, preview, and proxy even in non-TTY sessions
- Before using a shared simulator, coordinate ownership with other active tasks; select a dedicated alternate when needed.
- When ending a verification session, stop its orchestrator and confirm its Worker, web, archive, proxy (if used), and preview ports are released. Never use blanket process-name kills or stop another task's services.
- Override worker port with `ZINE_WORKER_PORT=<port> bun run dev:worktree`.
- Override the mobile/API host with `ZINE_DEV_HOST=<host> bun run dev:worktree`.
- Override the public API port with `ZINE_API_PORT=<port> bun run dev:worktree`.
- Override the simulator with `ZINE_SIMULATOR_NAME=<name>` or `ZINE_SIMULATOR_UDID=<udid>`.
- Skip an intentional repeat native build with `ZINE_SKIP_IOS_BUILD=1 bun run dev:worktree`.
- Disable the native preview only when explicitly required with `ZINE_SERVE_SIM=0 bun run dev:worktree`.

### Required Local Development and Verification Workflow

- Use `.codex/skills/zine-local-development/SKILL.md` for every request to implement, run, test, verify, debug, inspect, or visually review local Zine runtime behavior.
- `bun run dev:worktree` is the default local entrypoint. It starts the canonical native app and `serve-sim`; do not launch a parallel preview unless the task explicitly requires an isolated alternate simulator.
- For native local testing and verification, open the exact `serve-sim` URL printed by the command in the Codex in-app Browser and use the Browser plugin's computer-use surface to exercise the relevant user journey.
- A successful native build, test run, install, launch, loaded preview page, or shell-only `simctl` interaction is not UI verification. Require a real streamed frame, computer-use interaction, and visible final state.
- Report automated checks, build, install, launch, live stream, computer-use interaction, and UI observation as separate evidence states.
- If the host cannot provide the simulator or Browser computer-use surface, run every remaining safe check but report native UI verification as skipped or blocked; never substitute a static screenshot or logs.

### Production-Shaped Local Data

- To refresh local D1 and reader bodies from the primary production account, run `bun run data:prod:local -- --yes --include-article-bodies` from the repo root.
- The script exports production D1, keeps only `user_31ejjz59G6mTX1SIyErOi0fwu4A`, retains that Clerk user ID by default (or remaps to the explicit `ZINE_LOCAL_USER_ID` Clerk subject), sanitizes sensitive fields, and restores the result into `apps/worker/.wrangler/state`.
- Stop `bun run dev:worktree` before running the restore. The script refuses to replace local Wrangler state while this worktree's Worker is running; restart the dev stack after the sync.
- Add `--include-article-bodies` when local reader work needs the production article corpus. This downloads only current v2 artifacts and legacy HTML objects referenced by the sanitized user snapshot from production R2, then restores them into the local `ARTICLE_CONTENT` bucket.
- Sensitive production values are not meant to survive this flow:
  - OAuth tokens in `provider_connections` are replaced with local redacted placeholders.
  - Provider connections are marked `EXPIRED`.
  - Gmail mailbox identity/cursor fields and newsletter unsubscribe targets are scrubbed.
  - Raw production export artifacts and temporary article-body downloads are deleted by default; sanitized SQL remains under `.local-data/`, which is gitignored.
- The script backs up the previous local Wrangler state under `.local-data/local-d1-backups/` before replacing it.
- Use `--skip-restore` to generate and inspect the sanitized SQL without replacing local D1. Use `--keep-raw` only for short-lived debugging, and remove raw exports afterward.

### Authenticated Local Verification

- Use real Clerk login for both native and web manual verification. Read the shared `agent-secrets` skill, then `secretsctl current`, `metadata`, and `check` before credential use. Fill credentials through the protected clipboard workflow; never print or persist them.
- `bun run dev:worktree` supplies the selected LOCAL API URL to the native build. No verification writes should go to production. Check the built app configuration before reusing an installed build.
- The default sanitized snapshot preserves `user_31ejjz59G6mTX1SIyErOi0fwu4A`, the account selected by the export and the current Bitwarden Zine login. For a different Clerk account, set `ZINE_LOCAL_USER_ID=user_...` consistently for refresh and startup. Obtain the ID from the authenticated account; never map arbitrary authenticated users onto one local identity.
- Startup provisions D1/R2 only when local state is absent. Existing unrecognized state, old `dev-user-001` snapshots, or snapshots without bodies cause an actionable stop. Refresh explicitly after stopping this worktree's Worker. The restore backs up existing state; startup never unconditionally refreshes or copies another worktree's state.
- Native uses the existing Clerk publishable key. That production key rejects localhost browser origins. Web verification requires an approved local-origin Clerk instance, matching Worker JWKS configuration, and a snapshot owned by its authenticated subject; see `docs/local-development.md`. Missing configuration or an origin/login/MFA failure is a blocker to report, not permission to fall back to bypass.
- Worker auth bypass is restricted to explicit isolated tests (`ENVIRONMENT=test`, `TEST_AUTH_BYPASS=true`). Web smoke tests explicitly set `VITE_TEST_AUTH_BYPASS=true` on a localhost development server with mocked APIs. Never use these settings for manual verification.
- Debug screenshot fixtures and unit/integration fixtures remain useful deterministic test inputs. They are not proof of authenticated runtime behavior.
- Require a live streamed frame and computer-use login/navigation through populated Library, bookmark detail, and reader for local reader verification. Report auth, sanitized D1/R2 refresh, build/install/launch, live stream, interactions and visible final state separately.
- If Library is empty, inspect this worktree's local D1 `users` and `user_items` IDs against the authenticated Clerk subject. Do not disable auth, copy live tokens, or point the app at production to compensate.
- See `docs/local-development.md` for provisioning, refresh, recovery, and credential instructions.

## Quality Gates and Commit Hygiene

- Pre-commit (`.husky/pre-commit`):
  - Blocks build artifacts in commits (`dist/`, `build/`, `.next/`, `out/`, `web-build/`)
  - Runs `lint-staged`
- Pre-push (`.husky/pre-push`) runs:
  - `bun run format:check`
  - `bun run design-system:check`
  - `bun run typecheck`
  - `bun run test:web`
  - `cd apps/worker && bun run test:run --exclude='**/user-do.test.ts' --exclude='**/scheduler.test.ts'`

## CI and Deploy Parity

- CI workflow: `.github/workflows/ci.yml` (lint, typecheck, worker tests, web unit tests, web browser tests, build).
- Worker deploy workflow: `.github/workflows/deploy-worker.yml` (shared build, DB migrate, production deploy).

## Additional Agent Context

- Native iOS setup and architecture guidance lives in `apps/ios/README.md`; it documents the supported client configuration and preview workflow.
- Web testing guidance lives in `docs/web/testing.md`.

## Design System Workflow

- New mobile UI belongs in `apps/ios` and should follow the existing native SwiftUI component, navigation, typography, color, accessibility, and state-management patterns there.
- Before changing native iOS UI, read `apps/ios/DESIGN_SYSTEM.md`. Treat its palette and `apps/ios/ZineNative/Core/ZineTheme.swift` as the native color contract.
- In supported native views, use `ZineTheme` semantic roles instead of raw hex/RGB values or direct `Color.primary`/`Color.secondary` styling. Add a semantic role, both light and dark values, and focused resolution tests when an established role cannot express the design.
- Keep Zine orange (`#EF661F`) restrained to selection, primary actions, progress, links, and small brand moments. Keep cards and long-form reading surfaces neutral, and preserve the Zine logo exactly.
- Verify material native color changes in both light and dark mode across the affected screen states. Changes to saved-content or reading UI must include Library, bookmark detail, and article-reader verification where applicable.
- Content artwork, provider branding, contrast-driven media overlays, semantic status feedback, and third-party account UI may retain their established colors; keep these exceptions local and do not use them as alternate app palette logic.

- When editing shared web UI or `packages/design-system`, read:
  - `docs/web/design-system.md`
  - `docs/web/testing.md`
- Web design-system source of truth is layered:
  - shared tokens/specs/recipes in `packages/design-system/src`
  - web theme adapter in `packages/design-system/src/web/theme.ts` and `packages/design-system/src/web/theme.css`
  - web primitives in `apps/web/src/components/ui/*`
  - app-facing web wrappers/composites in `apps/web/src/components.tsx` and `apps/web/src/components/item-card.tsx`
  - Storybook references in `apps/web/src/storybook/*`
- In `apps/web`, prefer app-facing wrappers and semantic tokens over raw ad hoc styles.
- Do not treat `apps/web/components.json` or shadcn-style structure as the source of truth for design semantics.
- Do not add new raw hex/rgb colors, ad hoc typography literals, or duplicate palette logic in shared web components when `@zine/design-system` already provides the token or recipe.
- When shared web design-system behavior changes, update Storybook coverage and the package tests in `packages/design-system/test/design-system.test.ts`.
- Run these checks when web shared UI or `packages/design-system` changes:
  - `bun test packages/design-system/test/design-system.test.ts`
  - `bun run --cwd apps/web lint`
  - `bun run --cwd apps/web typecheck`
  - `bun run --cwd apps/web storybook:build`

## Observability Guidance

- When you need to observe or diagnose application behavior, prefer the local Codex skill at `.codex/skills/zine-observability/SKILL.md`.
- Use that skill for worker health regressions, request/trace correlation, sync failures, queue or DLQ triage, and release-scoped incident diagnosis.
- Prefer the repo-owned diagnostics commands (`bun run diag:health`, `bun run diag:incident`, `bun run diag:cf:logs`, `bun run diag:release`, `bun run diag:queue:dlq`) over ad hoc dashboard browsing so evidence stays reproducible.
