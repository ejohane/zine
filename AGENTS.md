# Repository Guidelines

## Issue Tracking with bd (beads)

**IMPORTANT**: This project uses **bd (beads)** for ALL issue tracking. Do NOT use markdown TODOs, task lists, or other tracking methods.

### Why bd?

- Dependency-aware: Track blockers and relationships between issues
- Git-friendly: Auto-syncs to JSONL for version control
- Agent-optimized: JSON output, ready work detection, discovered-from links
- Prevents duplicate tracking systems and confusion

### Quick Start

**Check for ready work:**
```bash
bd ready --json
```

**Create new issues:**
```bash
bd create "Issue title" -t bug|feature|task -p 0-4 --json
bd create "Issue title" -p 1 --deps discovered-from:bd-123 --json
```

**Claim and update:**
```bash
bd update bd-42 --status in_progress --json
bd update bd-42 --priority 1 --json
```

**Complete work:**
```bash
bd close bd-42 --reason "Completed" --json
```

### Issue Types

- `bug` - Something broken
- `feature` - New functionality
- `task` - Work item (tests, docs, refactoring)
- `epic` - Large feature with subtasks
- `chore` - Maintenance (dependencies, tooling)

### Priorities

- `0` - Critical (security, data loss, broken builds)
- `1` - High (major features, important bugs)
- `2` - Medium (default, nice-to-have)
- `3` - Low (polish, optimization)
- `4` - Backlog (future ideas)

### Workflow for AI Agents

1. **Check ready work**: `bd ready` shows unblocked issues
2. **Claim your task**: `bd update <id> --status in_progress`
3. **Work on it**: Implement, test, document
4. **Discover new work?** Create linked issue:
   - `bd create "Found bug" -p 1 --deps discovered-from:<parent-id>`
5. **Complete**: `bd close <id> --reason "Done"`
6. **Commit together**: Always commit the `.beads/issues.jsonl` file together with the code changes so issue state stays in sync with code state

### Auto-Sync

bd automatically syncs with git:
- Exports to `.beads/issues.jsonl` after changes (5s debounce)
- Imports from JSONL when newer (e.g., after `git pull`)
- No manual export/import needed!

### MCP Server (Recommended)

If using Claude or MCP-compatible clients, install the beads MCP server:

```bash
pip install beads-mcp
```

Add to MCP config (e.g., `~/.config/claude/config.json`):
```json
{
  "beads": {
    "command": "beads-mcp",
    "args": []
  }
}
```

Then use `mcp__beads__*` functions instead of CLI commands.

### Important Rules

- ✅ Use bd for ALL task tracking
- ✅ Always use `--json` flag for programmatic use
- ✅ Link discovered work with `discovered-from` dependencies
- ✅ Check `bd ready` before asking "what should I work on?"
- ❌ Do NOT create markdown TODO lists
- ❌ Do NOT use external issue trackers
- ❌ Do NOT duplicate tracking systems

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
