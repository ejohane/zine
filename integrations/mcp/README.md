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
MCP Apps card rail with original-source links. Search, stored-text reading and
collection actions remain available through the separate tools. See [the UI implementation and verification guide](../../docs/mcp-ui.md).

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
restarting the server. Cards open their original source in a separate tab.
Article bodies are not loaded from a card snapshot. Stop with Ctrl-C when finished.

## Home editions

The MCP editorial tools use the same account-scoped services, D1 records, R2
artifacts and server validation as `/api/v1/editorial/today` for the daily editorial feed:

| Tool                   | Permission        | Behavior                                                                                                                                                            |
| ---------------------- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `get_home_edition`     | `bookmarks:read`  | Returns the published edition as readable Markdown and structured data, including freshness, coverage and source presentation.                                      |
| `start_home_edition`   | `bookmarks:write` | Registers a stable generation run before collecting inputs.                                                                                                         |
| `create_home_edition`  | `bookmarks:read`  | Validates an agent-authored draft against its captured snapshot and candidate artifact, calculates quality, and renders a reviewable publication bundle. No writes. |
| `publish_home_edition` | `bookmarks:write` | Revalidates and publishes the reviewed bundle, retains artifacts, and verifies edition and Home readback.                                                           |
| `fail_home_edition`    | `bookmarks:write` | Records a sanitized terminal failure before publication.                                                                                                            |

Example requests: “Show my Zine Home edition” or “Create a daily Home edition
from my sources, show me the draft, then publish it when I approve.” The tool
input schemas describe the canonical editorial contract. Follow
[the daily editorial workflow](../../docs/daily-editorial.md): register the run,
collect/read real sources, capture coverage gaps, rank the corpus, author the
draft, validate/revise, review the returned `bundle.markdown`, then publish the
exact bundle. Source collection and authoring are performed by the agent; these
tools do not invoke a model, scrape X, schedule a run, or manufacture a snapshot.
New v2 editions require their exact ranked candidate artifact.

All operations derive account ownership from OAuth. Draft user IDs are replaced
by the linked account; no tool accepts a target account. Existing edition IDs,
revisions and artifact bundles are immutable. Reuse identifiers on retries;
changed content requires a new revision. A readback outage after a successful
write returns `published: true, verified: false`; do not mark that run failed.
`visibleInEditorialFeed: false` means a published historical edition is not the latest
edition selected by the editorial feed. Freshness and coverage warnings remain explicit.

Publication updates the shared editorial feed, not a separate tab-only store.
It does not promote A/B experiments, replace the ordinary Home tab, or create an
automation. Display currently uses Markdown in chat; the card rail remains the
saved-library component. No additional OAuth scopes or secrets are introduced.

## Native Home Lab composition

Home Lab composes existing native Home cards and real items, independently of
editorial editions. No generated stories, briefings or filler paragraphs.

| Tool                       | Purpose                                                 |
| -------------------------- | ------------------------------------------------------- |
| `get_home_components`      | Seven real card types and four native layout containers |
| `get_home_candidates`      | Up to 100 eligible recent inbox/library items           |
| `get_home_composition`     | Current arrangement and fresh real item metadata        |
| `create_home_composition`  | Read-only validation and resolved card preview          |
| `publish_home_composition` | Revalidate and replace the linked account's arrangement |

Only publishing requires `bookmarks:write`; other composition tools require
`bookmarks:read`. Missing/unavailable compositions fall back to normal Home.
See [Native Home composition](../../docs/home-composition.md) for the contract.
