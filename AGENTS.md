# Repository Guidelines

## Project Structure & Module Organization
- `apps/mobile/`: Expo React Native app; primary target for product work.
- `apps/web/`: Vite SPA for QA; keep parity but avoid web-only features.
- `packages/api/`: Cloudflare Worker (Hono) with Drizzle schemas in `src/db`; Wrangler drives D1.
- `packages/design-system/`: HeroUI Native library built with `tsup`; exports tokens for mobile.
- `packages/shared/`: Framework-agnostic utilities and Zod contracts used across apps and API.
Turborepo (`turbo.json`) coordinates tasks, and strict TypeScript rules live in `tsconfig.json`.

## Build, Test, and Development Commands
- `bun install`: install workspace dependencies (Bun lock enforced).
- `bun dev`: run Expo, Vite, and Worker dev servers through Turbo.
- `cd apps/mobile && bun run dev|ios|android`: start the Expo bundler or platform targets.
- `cd packages/api && bun run dev`: serve the Worker with D1 stubs.
- `bun lint`, `bun type-check`, `bun build`: run linting, TS checks, and production builds.
- `./scripts/sync-db-from-main.sh`: refresh the D1 snapshot before API testing.

## Coding Style & Naming Conventions
- TypeScript everywhere; keep new modules under `src/` with index re-exports.
- Prefer function components and hooks; screens use PascalCase filenames, helpers stay camelCase.
- Match the 2-space indentation, single quotes, and trailing semicolons; run package ESLint configs.
- Mobile styling comes from NativeWind tokens in the design system; guard platform APIs in shared code.

## Testing Guidelines
- Vitest drives unit tests: `cd packages/shared && bun run test:run` or `cd packages/design-system && bun run test`.
- API specs live in `src/**/__tests__`; execute with `cd packages/api && bunx vitest`.
- Web e2e coverage uses Playwright (`cd apps/web && bunx playwright test`); run before merging UX work.
- Name specs `*.test.ts` in `__tests__` folders and mock outbound requests for determinism.

## Commit & Pull Request Guidelines
- Write imperative commit subjects; add prefixes such as `docs:` or `ci:` when they clarify scope.
- Keep changes mobile-first and self-contained, bundling migrations with API edits.
- PR descriptions must list affected packages, local checks (`bun lint`, `bun type-check`, relevant tests), and linked issues.
- Attach screenshots or screen recordings for UI updates, noting any manual device validation.

## Environment & Configuration Tips
- Copy `apps/mobile/.env.example` and `packages/api/.env.example`; scripts rely on `dotenv`.
- Clerk and Cloudflare setup lives in `CLAUDE.md`; never commit secrets.
- Reset local data by removing `packages/api/local.db` and re-running the sync script after schema changes.
