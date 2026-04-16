# Web App Testing

This document is the source of truth for how to test `apps/web`.

## Test Lanes

### Fast local loop

- Root: `bun run test:web`
- App-local: `bun run --cwd apps/web test`
- Watch mode: `bun run --cwd apps/web test:watch`
- Coverage: `bun run --cwd apps/web test:coverage`

Use this lane for route logic, component behavior, auth guards, bookmark interactions, formatting helpers, and OAuth helper changes.

### Storybook browser checks

- Root: `bun run test:web:storybook`
- App-local: `bun run --cwd apps/web storybook:test`

This lane:

- builds Storybook
- serves the static build
- runs Playwright against dedicated app-state stories
- runs axe accessibility assertions
- verifies screenshots

Relevant files:

- stories: `apps/web/src/storybook/layout-web-app-states.stories.tsx`
- Playwright config: `apps/web/playwright.storybook.config.ts`
- spec: `apps/web/e2e/storybook.spec.ts`
- snapshots: `apps/web/e2e/storybook.spec.ts-snapshots/`

### Real app smoke tests

- Root: `bun run test:web:e2e`
- App-local: `bun run --cwd apps/web test:e2e`

This lane starts the real Vite app and uses Playwright to cover the main browser flow with mocked tRPC responses.

Relevant files:

- Playwright config: `apps/web/playwright.config.ts`
- smoke spec: `apps/web/e2e/app.smoke.spec.ts`
- mocked transport: `apps/web/e2e/trpc-mocks.ts`

### CI-parity web run

- Root: `bun run test:web:ci`

Run this before landing broad web changes or test-harness changes. It executes:

1. `bun run test:web`
2. `bun run test:web:storybook`
3. `bun run test:web:e2e`

## Which Checks to Run

| Change type                                                      | Minimum checks                                      |
| ---------------------------------------------------------------- | --------------------------------------------------- |
| `apps/web/src/lib/*`, route logic, query handling                | `bun run test:web`                                  |
| Shared web UI, app states, Storybook stories                     | `bun run test:web` and `bun run test:web:storybook` |
| Routing, auth transitions, bookmark flows, settings behavior     | `bun run test:web` and `bun run test:web:e2e`       |
| Test harness, Playwright config, Storybook automation, CI wiring | `bun run test:web:ci`                               |

If shared web design-system behavior changes, also run the checks documented in `docs/web/design-system.md`.

## Manual Verification

For browser-level manual verification, use the real app instead of Storybook first.

### Local app

1. Start the backend/worktree stack from the repo root: `bun run dev:worktree`
2. Start the web app from the repo root: `bun run dev:web`
3. Open the Vite URL, usually `http://localhost:5173`

### Auth behavior in local development

`apps/web/src/lib/trpc.tsx` supports a localhost development-bypass mode when `VITE_CLERK_PUBLISHABLE_KEY` is absent and the app is running on `localhost` or `127.0.0.1`. That is the intended local path for bookmark and settings verification without live Clerk auth.

### Recommended manual checks

1. Open `/bookmarks` and confirm the list renders.
2. Toggle content filters and confirm the list updates.
3. Open a bookmark and confirm the detail pane route updates.
4. Navigate to `/settings` and confirm the pared-back settings page renders.
5. If you changed auth or empty states, cross-check the dedicated Storybook states after the real app pass.

## CI Reference

CI lives in `.github/workflows/ci.yml` and currently splits web coverage into:

- `test-web` on Ubuntu for Vitest unit/component coverage
- `test-web-browser` on macOS for Storybook and Playwright browser lanes

The browser lane runs on macOS because the checked-in Storybook screenshot baselines were generated there.

## Gotchas

- Do not upgrade `apps/web` to a different Vitest major without coordinating `apps/worker`. The monorepo uses a hoisted Bun install, and mismatched Vitest majors can break the worker test pool.
- `apps/web/storybook-static/`, `apps/web/test-results/`, and `apps/web/playwright-report/` are generated artifacts. Do not commit them unless a task explicitly requires it.
- If Storybook screenshots intentionally change, regenerate the baselines from a matching macOS environment.
