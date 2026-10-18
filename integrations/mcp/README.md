# Zine MCP

An isolated Cloudflare Worker that reuses Zine's existing
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

## Interactive saved library

`search_saved` returns card metadata; `show_saved` renders selected results as an
MCP Apps component with search, stored-text reading, source links and private
collection actions. See [the UI implementation and verification guide](../../docs/mcp-ui.md).

```sh
bun run --cwd integrations/mcp preview:ui
```

Open `http://127.0.0.1:8797`. The playground uses the same component served by
`resources/read`, at the live ChatGPT embed width and in dark mode by default.
If `.local-data/mcp-ui-cards.json` exists, it uses that local saved-card snapshot;
otherwise it uses labeled sample cards. Keep real library snapshots gitignored.
The simulated host performs no production reads, writes, or OAuth login.

Use the width selector and appearance button to compare chat, phone and wide
layouts. **Reload design** rebuilds the current component source without
restarting the server. Collection actions remain simulated; article bodies are
not loaded from a card snapshot. Stop with Ctrl-C when finished.
