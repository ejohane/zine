# Zine Tech Stack

## Supported applications

| Application                    | Implementation                                    | Entry point                          |
| ------------------------------ | ------------------------------------------------- | ------------------------------------ |
| Native iOS and share extension | SwiftUI, ClerkKit, URLSession                     | `apps/ios/ZineNative.xcodeproj`      |
| Web                            | React, Vite, Clerk, tRPC                          | `apps/web`                           |
| Backend                        | Hono, Cloudflare Workers, Drizzle, D1, R2, Queues | `apps/worker`                        |
| Editorial tooling              | Bun / TypeScript CLI                              | `apps/editorial`                     |
| X archive and collector        | Worker API and local collection tooling           | `apps/x-archive`, `apps/x-collector` |
| Browser capture                | Chrome extension                                  | `apps/chrome-extension`              |

The native app uses Clerk-authenticated `/api/v1` REST endpoints. The web app
uses the existing tRPC boundary. Shared application behavior remains in the
Worker; client decommissioning does not remove APIs used by supported clients.

## Workspace tooling

- Bun 1.3.4 manages the workspace and hoisted dependency installation.
- Node 22 is pinned in `.nvmrc`.
- Turborepo runs package builds, development servers, lint, and typechecks.
- TypeScript uses the shared strict configuration in `tsconfig.base.json`.
- ESLint and Prettier provide JavaScript/TypeScript lint and formatting checks.
- `bun.lock` and the application manifests are the dependency version authority.

## Shared code

- `packages/shared`: domain types, schemas, and reusable utilities.
- `packages/design-system`: web foundations, recipes, and theme adapter.
- `packages/editorial-schema`: editorial contracts.
- `packages/x-archive-schema`: collection and archive contracts.

Native UI uses `apps/ios/ZineNative/Core/ZineTheme.swift` and the
[native design system](../apps/ios/DESIGN_SYSTEM.md). Web UI uses the
[web design system](web/design-system.md).

## Development and verification

`bun run dev:worktree` owns the Worker, web services, and native simulator preview.
The native app's API URL is configured separately in `Local.xcconfig`; see the
[native README](../apps/ios/README.md).

`bun run test` runs Worker and web tests. Native XCTest is run through the
`ZineNative` Xcode scheme. Web browser checks, editorial tests, and archive tests
have separate root commands. See [AGENTS.md](../AGENTS.md) for the current gates.

## Production

Checked-in workflows deploy Worker, web, web previews, and X archive changes to
Cloudflare. Native builds and device installation use Xcode and `devicectl`.
Provider tokens and service credentials stay on the backend; see the
[provider connection guide](zine-provider-connections.md) and
[diagnostics guide](observability/agent-diagnostics.md).
