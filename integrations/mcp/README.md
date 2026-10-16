# Zine MCP

An isolated, currently undeployed Cloudflare Worker that reuses Zine's existing
backend services and account model. See [the integration overview](../../docs/mcp-integration.md)
and [the Clerk linking checklist](../../docs/mcp-account-linking.md).
The [production activation proposal](../../docs/mcp-production-activation.md)
records the registered public client, unapplied configuration and user-only
secret-entry handoff.

```sh
# Repository root: install canonical backend dependencies first.
bun install --frozen-lockfile
bun install --cwd integrations/mcp --frozen-lockfile
bun run --cwd integrations/mcp typecheck
bun run --cwd integrations/mcp lint
bun run --cwd integrations/mcp test
bun run --cwd integrations/mcp build
bun run --cwd integrations/mcp build:production
```

Both build commands are Wrangler dry-runs; neither deploys or needs a secret.
They use an explicit empty env file. `build:production` validates the proposed
production bindings and rate-limit declaration without applying them. `dev`
starts the local entry point with placeholder OAuth configuration and simulated
bindings. This package pins Wrangler 4.119.0; use Node 22 as specified by the repo.

This package is deliberately outside the production Bun workspace. Its own
lockfile avoids changing the root dependency lock, which triggers automatic
production deployments in this repository. The MCP workflow tests and bundles
this integration but contains no deployment job or credentials and applies no
production bindings. Merging this code does not activate an endpoint or account
access. Production opaque-token verification fails closed without the configured
limiter or a Cloudflare source IP; limits are per IP and Cloudflare location.

Screenshots remain pending; see [the private attachment increment](../../docs/mcp-screenshots-plan.md).
