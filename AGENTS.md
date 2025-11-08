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

## "Land the Plane" - Session Completion Checklist

When the user says "land the plane", execute this comprehensive session wrap-up procedure:

### 1. Quality Gates & Testing

Run all quality checks in parallel:
```bash
bun lint && bun type-check && bun test:run
```

For specific package testing:
```bash
cd packages/shared && bun run test:run
cd packages/design-system && bun run test
cd packages/api && bunx vitest run
cd apps/web && bunx playwright test
```

**Action items:**
- Fix any lint errors or type errors
- Ensure all tests pass
- If tests fail, fix the issues or update tests appropriately
- Run build command (`bun build`) to verify production bundle

### 2. Clean Up Debugging Code & Temporary Artifacts

Search for and remove:
- `console.log`, `console.debug`, `console.warn` statements (unless intentional logging)
- Commented-out code blocks
- `TODO`, `FIXME`, `HACK` comments (convert to bd issues if needed)
- Test files with `.only` or `.skip`
- Temporary files: `*.tmp`, `*.bak`, `test-*.js`, `debug-*.ts`
- Unused imports
- Debug environment variables

**Commands:**
```bash
# Find console statements
rg "console\.(log|debug|warn|info)" --type ts --type tsx --type js

# Find test-only/skip
rg "(it|test|describe)\.(only|skip)" --type ts

# Find TODO comments
rg "(TODO|FIXME|HACK|XXX):" --type ts --type tsx --type js

# Find temporary files
fd -e tmp -e bak
```

**Actions:**
- Remove or convert findings to proper issues in bd
- Clean up any temporary scripts in `scripts/` or root directory
- Remove debug-only dependencies from package.json

### 3. Git Stash Management

Check for and deal with stashes:
```bash
git stash list
```

**Actions:**
- If stashes exist, review each one: `git stash show -p stash@{N}`
- Either apply useful stashes (`git stash pop`) or drop them (`git stash drop`)
- Confirm no orphaned work remains: stash list should be empty or documented

### 4. Git Branch Management

Check branch status:
```bash
git branch -a
git status
```

**Actions:**
- Ensure current branch is clean and up to date
- Check if there are any unmerged feature branches: `git branch --no-merged`
- For worktrees, check: `git worktree list`
- Document any intentional WIP branches, or clean up abandoned ones
- Verify you're on the correct branch for the work completed

### 5. Update and Close Issues

**Beads workflow:**
```bash
# Check current in-progress issues
bd list --status in_progress --json

# Check what's ready for next session
bd ready --json

# Close completed issues
bd close <id> --reason "Completed: <brief description>"

# Update partially completed issues
bd update <id> --status open --json
bd update <id> --comment "Session ended: <current status>"
```

**GitHub workflow:**
```bash
# Check open PRs
gh pr list

# Check open issues assigned to you
gh issue list --assignee @me

# Update PR status
gh pr comment <number> --body "Session update: <status>"

# Close completed issues
gh issue close <number> --comment "Completed in <commit/PR>"
```

**Actions:**
- Close all completed bd issues with descriptive reasons
- Update in-progress issues with current status
- Link commits/PRs to issues
- Update GitHub PRs with progress comments
- Close or update GitHub issues as appropriate

### 6. Documentation Updates

Check if documentation needs updates:
```bash
# Find markdown docs
fd -e md

# Check for outdated docs
rg "TODO|OUTDATED|WIP" -g "*.md"
```

**Actions:**
- Update README.md if new features were added
- Update relevant docs in `docs/` folder
- Update API documentation if endpoints changed
- Update package READMEs if public APIs changed
- Add migration guides if breaking changes occurred
- Update CLAUDE.md or AGENTS.md if workflow changed
- Check if any IMPLEMENTATION_PLAN.md or DESIGN.md files need status updates

### 7. Git Operations & Commits

Prepare final commit:
```bash
# Check status
git status

# View diff
git diff
git diff --staged

# Check recent commits
git log --oneline -10
```

**Actions:**
- Stage relevant changes (be selective, don't use `git add .` blindly)
- Commit with descriptive message following convention:
  - Format: `type(scope): imperative description`
  - Types: `feat`, `fix`, `docs`, `test`, `refactor`, `chore`, `ci`
  - Include issue references: `feat(feed): add pagination (closes bd-42)`
- Always commit `.beads/issues.jsonl` with related code changes
- Push to remote: `git push` (or `git push -u origin <branch>` if new branch)
- Verify push succeeded: `git status`

### 8. Untracked Files & Edge Cases

Handle untracked files:
```bash
git status --short | grep "^??"
```

**Actions:**
- Review each untracked file
- Either add to git, add to `.gitignore`, or delete
- Check for accidentally ignored important files
- Verify `.env` files are not tracked (should be in .gitignore)
- Check for large files that shouldn't be committed
- Verify no sensitive data (API keys, tokens) in tracked files

**Common edge cases:**
- Lock file conflicts: Prefer Bun's `bun.lockb`, delete others
- Build artifacts: Should be in `.gitignore`
- IDE files: Should be in `.gitignore` or global gitignore
- OS files (`.DS_Store`): Should be in global gitignore
- Database files: `packages/api/local.db*` should not be committed

### 9. Choose Work & Create Next Session Prompt

Prepare handoff for next session:

**Check available work:**
```bash
bd ready --json
bd list --status open --priority 0 --json
bd list --status open --priority 1 --json
```

**Create session summary:**
- List what was completed this session
- List what's in-progress and needs continuation
- Identify highest-priority ready work
- Note any blockers or dependencies
- Flag any technical debt or discovered issues

**Draft next session prompt:**

Format:
```
# Session Context

## Completed This Session
- [List completed work with bd/GH issue IDs]

## Current State
- [Describe current branch, features, status]

## Ready for Next Session
- [List prioritized work from bd ready]
- Recommended: [Specific issue ID and why]

## Notes & Context
- [Any important context, gotchas, or decisions]
- [Links to relevant docs or discussions]
```

**Actions:**
- Save this summary in a session note or share with user
- Recommend specific next issue to work on
- Flag any urgent items needing attention
- Note any environment setup needed for next session

### Checklist Summary

When "landing the plane", verify:
- [ ] All tests pass, no lint/type errors
- [ ] Debug code and temp files removed
- [ ] Git stashes reviewed and cleared
- [ ] Git branches cleaned up or documented
- [ ] bd issues updated and closed appropriately
- [ ] GitHub issues/PRs updated
- [ ] Documentation updated
- [ ] All changes committed with good messages
- [ ] Changes pushed to remote
- [ ] Untracked files handled
- [ ] Next session prompt created
- [ ] User informed of completion status

**Final output to user:**
Provide a concise summary with:
1. What was accomplished
2. Quality gate status (all passing)
3. Issues closed
4. Next recommended work
5. Any warnings or items needing attention
