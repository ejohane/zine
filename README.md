# Zine

Zine is a monorepo with apps and shared packages.

## Repo structure

- `apps/mobile`: Expo mobile app
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

# Worker
bun run --cwd apps/worker dev
```

## Where to look next

- `docs/zine-architecture.md`
- `docs/zine-tech-stack.md`
- `apps/mobile/README.md`
- `AGENTS.md`
