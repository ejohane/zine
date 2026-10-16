# Zine MCP

An isolated, currently undeployed Cloudflare Worker that reuses Zine's existing
backend services and account model. See [the integration overview](../../docs/mcp-integration.md)
and [the Clerk linking checklist](../../docs/mcp-account-linking.md).

```sh
# Repository root: install canonical backend dependencies first.
bun install --frozen-lockfile
bun install --cwd integrations/mcp --frozen-lockfile
bun run --cwd integrations/mcp typecheck
bun run --cwd integrations/mcp lint
bun run --cwd integrations/mcp test
bun run --cwd integrations/mcp build
```

`build` is a local Wrangler dry-run; it does not deploy. `dev` starts the local
entry point with placeholder OAuth configuration and simulated bindings.

This package is deliberately outside the production Bun workspace. Its own
lockfile avoids changing the root dependency lock, which triggers automatic
production deployments in this repository. The MCP workflow tests and bundles
this integration but contains no deployment job, credentials or production
bindings. Merging this code does not activate an endpoint or account access.

Screenshots remain pending; see [the private attachment increment](../../docs/mcp-screenshots-plan.md).
