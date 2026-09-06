# Zine

Zine brings saved content and subscriptions into a native iOS reader and a web app.

## Repository structure

- `apps/ios`: supported SwiftUI iOS app and share extension (`app.zine.native`)
- `apps/web`: Vite + React web app
- `apps/worker`: Cloudflare Worker API, ingestion, and background jobs
- `apps/editorial`: editorial generation and publishing CLI
- `apps/x-archive` and `apps/x-collector`: source archive and collection tooling
- `apps/chrome-extension`: browser bookmark capture
- `packages/*`: shared schemas, types, and web design system
- `docs/*`: architecture, product, and operational documentation

## Local development

Use Bun 1.3.4 and the Node 22 version pinned in `.nvmrc`:

```bash
bun install
bun run dev:worktree
```

The worktree command selects service ports, seeds local Worker data, generates
`apps/web/.env.local`, and starts the services plus the native iOS simulator
preview. It requires Apple Silicon and Xcode for the native preview.

Native configuration lives in `apps/ios/Configuration/Local.xcconfig` (see the
example beside it). Set `ZINE_API_BASE_URL` there to the local Worker URL when
needed; the native app otherwise defaults to the production API. Worker secrets
belong in `apps/worker/.dev.vars`; web configuration belongs in `apps/web/.env.local`.

Use `bun run dev` for workspace services without the native preview, or
`bun run ios:preview` for the standalone native simulator preview.

## Validation

```bash
bun run lint
bun run typecheck
bun run test
bun run design-system:check
bun run build
bun run format:check
```

`test` runs Worker and web tests. Native XCTest/build instructions live in
`apps/ios/README.md`. Editorial and X archive suites are available through
`bun run editorial:test` and `bun run x:archive:test`.

## Further guidance

- [Agent guide](AGENTS.md)
- [Native iOS](apps/ios/README.md)
- [Tech stack](docs/zine-tech-stack.md)
- [Architecture](docs/zine-architecture.md)
- [Web testing](docs/web/testing.md)
