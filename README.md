# Zine

Zine is a monorepo with apps and shared packages.

## Repo structure

- `apps/mobile`: Expo mobile app
- `apps/web`: Vite + React web app
- `apps/worker`: Cloudflare Worker backend
- `packages/*`: Shared libraries used by the apps
- `docs/*`: Architecture and system docs
- `scripts/*`: Dev and maintenance scripts

## Quick start

```bash
bun install
bun run dev
```

This runs the workspace dev tasks via Turbo. For app-specific workflows:

```bash
# Mobile
bun run --cwd apps/mobile dev

# Web
bun run --cwd apps/web dev

# Worker
bun run --cwd apps/worker dev
```

For worktree-safe local development, use `bun run dev:worktree`. Keep app secrets in each app's own env file: `apps/mobile/.env.local` for mobile and `apps/web/.env.local` for web. The script rewrites only the dynamic API URL for each app and preserves the rest from that app's existing env file.

## Where to look next

- `docs/zine-architecture.md`
- `docs/zine-tech-stack.md`
- `apps/mobile/README.md`
- `AGENTS.md`
