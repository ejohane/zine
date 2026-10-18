# Zine MCP local first version

Status: implementation merged in PR445; no MCP endpoint deployed or real account
grant tested by this task. The parent reports a registered public Clerk client;
see the [unapplied activation proposal](mcp-production-activation.md) for that
registration, production config and user-only secret handoff. The follow-up
branch `feat/mcp-production-plan` is based on remote main
`3b33e1487062dca60cd35f99a924cba76fa32742`, fetched on 2026-10-16. Production
resource identifiers in the proposed config are nonsecret metadata; no live
resource or credential was accessed to prepare it.

## Implemented interface

The separate Worker entry point is `integrations/mcp/src/server.ts`. It reuses
Zine's D1 account/item model, bookmark save service, article-body storage and
private collection model. The existing production Worker entry point, native
app, REST/session authentication and deployment configuration are unchanged.

MCP has a separate manifest and lockfile under `integrations/mcp`, outside the
production Bun workspace, and a verification-only GitHub Actions workflow.
The root lockfile and production manifests are unchanged. This separation keeps
both branch publication and merge outside the existing automatic deployment
path filters. No deployment workflow is disabled or weakened.

| Tool                | Permission        | Behavior                                                                                                 |
| ------------------- | ----------------- | -------------------------------------------------------------------------------------------------------- |
| `save_link`         | `bookmarks:write` | Save a public HTTPS link using existing provider identity/canonicalization and bookmark retry semantics. |
| `search_saved`      | `bookmarks:read`  | Search saved titles, descriptions and URLs; return bookmark IDs and cursor pages.                        |
| `show_saved`        | `bookmarks:read`  | Render selected, reauthorized saved IDs as interactive library cards in MCP Apps hosts.                  |
| `read_saved`        | `bookmarks:read`  | Return already stored text, availability and the next text offset.                                       |
| `list_collections`  | `bookmarks:read`  | Find private collections with cursor pagination.                                                         |
| `create_collection` | `bookmarks:write` | Find/create by normalized name; optionally add a saved bookmark.                                         |
| `add_to_collection` | `bookmarks:write` | Add an owned bookmark through the existing manual `PIN` membership semantics.                            |

Saves initially use the canonical URL as their title when no existing item is
available. They do not preview/fetch URLs, acquire transcripts, fetch images, or
dispatch enrichment. Existing save evidence and enrichment intent records are
retained by the shared service; an independently enabled backend retry job can
process those intents later. This local Worker has no queues or schedules.
An archived/inbox item saved again follows Zine's rebookmark behavior, retaining
its completion state. Collection creation by an existing name returns that
collection without changing its rules. Adds preserve existing collection rules.

Search defaults to 20 results, at most 50. Cursors are bound to the account and
query; they are pagination positions, never authorization. All queries still
filter the account. Search order uses stable descending bookmark IDs. Text is
returned in at most 16,000-character chunks. Missing stored content returns
`available: false`; this endpoint never starts acquisition. HTML is converted to
text; all returned titles, URLs and content remain untrusted source material.

Inputs reject unknown properties, invalid IDs, oversized queries/pages and
malformed cursors. Account identity never comes from tool arguments. Known
credential-bearing, local, file and data URLs are rejected on save. V1 performs
no network ingestion, avoiding redirect/DNS-rebinding/file-download risks.

## Existing product gaps

Real arbitrary private collections already exist (`collections` and
`collection_item_overrides`), so this implementation does not substitute tags
or public publications for collections.

Screenshot storage is **not implemented**. Your Zine publication covers and their
upload path have been removed; private saved screenshots need their own storage. The saved item content types
are ARTICLE, VIDEO, PODCAST and POST. Accepting a file URL as an article would
misrepresent the product and expose an unsafe fetch surface. No screenshot-save
tool is advertised.

The smallest coherent next increment is **a private image attachment on an owned
saved link**: an owner-scoped attachment table and private R2 keys, bounded PNG/JPEG
upload, signature and MIME checks, image decode/re-encode and metadata stripping,
content-hash deduplication, authenticated reads, deletion, and explicit quota/
retention rules. ChatGPT file handles would need their documented download path
and expiry checks; arbitrary remote file URLs must not be accepted. Standalone
screenshots additionally need a saved-item type and native Library/reader support.
Choose attachment-only versus standalone before implementing that increment.

## Privacy finding: legacy publication associations

The removed publication attribution path could save a public selection with the
original Gmail item's identity after checking `raw_metadata.publicWebUrl`. A new
`user_items` row therefore does not prove the new account received that email.
The existing `items.getArticleContent` check only establishes a user-item
association. Reusing it unmodified would risk exposing the original private
email body and metadata. The former publication snapshots resolved public web metadata separately, which
did not authorize access to the original item. Keep the authorization guard for
any saved associations created before publications were removed.

MCP search, read and collection-add paths share an additional authorization
predicate. Gmail items require a matching `newsletter_feed_messages` delivery
and newsletter feed owned by the current user. A publication-created association
without that provenance is hidden as NOT_FOUND, including title/URL metadata.
Non-Gmail items marked private/private-feed (or malformed provenance JSON) are
excluded conservatively. R2 keys are derived from authorized item IDs or verified
body records, never supplied by the client; v2 artifact identity and integrity
are checked before returning text. The fixtures reproduce a shared Gmail item
owned by its recipient and also associated with a different publication reader.

This guard protects the new MCP surface. It does **not repair existing REST/tRPC
publication-save behavior**. Before a wider rollout, fix that independently:
save a separate public-web identity for the public edition and retain private
mailbox identity/content only for the original recipient. Review existing
associations and migration/backfill implications before changing them.

## Transport and authentication decision

Use stateless **Streamable HTTP**, JSON responses, at `/mcp`, through the official
TypeScript SDK's Web Standards transport. This fits Cloudflare Request/Response
and the existing D1/R2 backend. A fresh server/transport per request prevents
cross-account session reuse. GET/DELETE do not offer persistent sessions and
return 405 after authentication. Request bodies are bounded to 32 KiB and Origin
is checked. Server-to-server clients with no Origin work; browser origins must
match the configured canonical resource origin. No broad CORS is enabled.

The current official SDK repository identifies v2 as stable; v1 remains in its
maintenance window. This first increment deliberately uses the maintained v1
line, compatible with Zine's Zod 3 stack and OpenAI's linked quickstart, locked
to SDK 1.32.1. It negotiates up to MCP 2025-11-25. It does not claim every
2026-07-28 protocol feature; plan a v2/Zod migration before v1 support ends.
The optional [saved-library component](mcp-ui.md) uses the standard MCP Apps
bridge directly, without adding an ext-apps dependency.

**Standard OAuth account linking is required.** The local code implements the
resource-server side, not an authorization/consent/token server. It publishes
protected-resource metadata at both `/.well-known/oauth-protected-resource/mcp`
and the root equivalent. Anonymous initialize/tools-list discovery is allowed;
every tool enforces OAuth. Per-tool `securitySchemes` and tool-result
`mcp/www_authenticate` challenges trigger linking. Invalid supplied tokens return
401; missing tool permissions return an MCP error with an insufficient-scope
challenge. Successful tool responses are marked untrusted and not cacheable.

Do not reuse existing Clerk session tokens or Zine PATs as remote MCP access
tokens. The existing general Clerk verifier does not establish this resource's
audience/scopes. There are now three explicit verification profiles:

- `jwt` (default): pinned issuer/JWKS, RS256, OAuth access-token type, exact
  audience, expiry/issued-at, space-delimited scopes and at most one hour.
- `clerk-jwt`: pinned Zine Clerk issuer, OAuth access-token type, signature,
  exact audience, explicitly admitted client IDs, Clerk scope claims and at most
  one day, matching Clerk's documented token lifetime. No server secret needed.
  Revocation takes effect at expiry, potentially up to 24 hours later.
- `clerk-opaque`: fixed Clerk Backend API verification on every request, exact
  audience, admitted client IDs, granted scopes, revoked/expired/expiration
  checks. Requires a separately approved Worker secret. Outages return 503;
  neither a stale cache nor session/JWT fallback is used.

All profiles resolve only an existing D1 account by its exact Clerk user ID.
They never map accounts by email, provision new users, or accept delegated actor
chains in the Clerk profiles. No refresh tokens are stored by this Worker.

### Exact configuration/approval still needed

The existing issuer is confirmed as `https://clerk.myzine.app`; its public
discovery report is saved in [mcp-clerk-discovery.json](mcp-clerk-discovery.json).
Current Clerk source/API schemas support the needed scopes and resource-bound
audiences. The smallest path is direct Clerk OAuth with a manually registered,
PKCE-required public client, with no new identity provider or OAuth bridge.

See [the exact account-linking runbook](mcp-account-linking.md) for confirmed
endpoints, required private setting checks, custom scope/client configuration,
mode-specific Worker variables, rollout sequence and approval boundaries. The
private instance switches could not be read: the existing allowlisted profile
contains only test-login credentials and Bitwarden machine access is unavailable.
No admin settings request, registration, token issuance or mutation occurred.
Public metadata does not advertise Zine's custom scopes, CIMD or DCR today.

Other Streamable HTTP clients can use the same endpoint and OAuth metadata.
For example, after deployment, Codex can configure `[mcp_servers.zine]` with
`url = "https://<approved-host>/mcp"`; its normal OAuth login must be authorized
separately. There is no client-specific shared credential or PAT bridge.
Each additional Clerk OAuth client must be explicitly admitted in the Worker
client-ID list; enabling arbitrary client admission is not part of this version.

## Local setup and verification

From the repo root, using the repository's Bun version:

```sh
bun install --frozen-lockfile
bun install --cwd integrations/mcp --frozen-lockfile
bun run --cwd integrations/mcp typecheck
bun run --cwd integrations/mcp test
```

The suite uses migrated local D1, local R2, synthetic users and in-memory RSA
keys. JWKS HTTP is intercepted by a local fixture; no real OAuth grant is
created. It tests OAuth claims/signatures/scopes, HTTP initialize/tools discovery,
linking errors, schemas, read/write isolation, private publication associations,
legacy/v2 body reads, pagination, URL rejection and duplicate saves.
The older Workers Vitest runner cannot load AJV's CJS JSON modules unbundled;
the test config bundles the real SDK with esbuild, as Wrangler does. No SDK or
protocol handler is mocked. The unrelated Google API module is stubbed because
these workflows do not use provider ingestion.

For a discovery-only local server with an empty isolated database:

```sh
cd integrations/mcp
bunx wrangler d1 migrations apply zine-mcp-local --local --config wrangler.local.toml
bun run dev
```

It binds only `127.0.0.1:8798`. The `.example` resource/issuer/JWKS values are
nonfunctional placeholders. Discovery works; real protected calls must fail
until an approved development OAuth issuer is configured. Do not point this
config at production or enable an auth bypass. No native/UI behavior changed;
native installation, login and UI smoke verification are not claimed.

## Official references checked 2026-10-16

### Local evidence

- Worker typecheck, targeted MCP ESLint, Prettier and `git diff --check`: passed.
- MCP workflow suite: 31 tests passed, including real SDK transport, signed-token
  JWKS validation, account isolation, Gmail provenance, v2 artifact identity,
  concurrent idempotent saves and collection adds. Clerk JWT/opaque adapter
  suite: 27 passed, including client/audience binding, one-day JWT compatibility,
  wrong token types, revoked/inactive results, redirects and provider outages.
- Existing REST integration suite: 79 passed. Existing publication integration
  suite: 19 passed. Both are covered by the full Worker CI-parity gate, which
  passed 2,305 tests. The isolated MCP suites passed 58 tests, and the separate
  read-only preflight script suite passed two tests.
- Real `wrangler dev --local` startup on `127.0.0.1:8798`: passed. HTTP initialize,
  six-tool discovery with OAuth descriptors, protected-resource discovery, and
  unauthenticated tool-call linking challenge all returned the expected responses.
  The server was stopped afterward and port 8798 was confirmed released.
- Tests ran in workerd through the repo's Vitest pool, with Bun 1.3.4. The initial
  fixture run used Node 25.6.0; the final isolated MCP suite also passed on the
  repository-pinned Node 22 (22.23.3). The SDK
  emits missing-source-map warnings in tests, without test failures. No native
  build, device install, live UI, real OAuth consent, or ChatGPT installation was
  performed. Only public production OAuth discovery/signing-key metadata was
  read; no private production content or private configuration was accessed or changed.

### Sources

- [OpenAI quickstart](https://developers.openai.com/plugins/build/app-quickstart)
- [OpenAI OAuth and linking metadata](https://developers.openai.com/plugins/build/auth)
- [Current MCP authorization](https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization)
- [Streamable HTTP protocol](https://modelcontextprotocol.io/specification/2025-11-25/basic/transports)
- [Official TypeScript SDK and v1 maintenance policy](https://github.com/modelcontextprotocol/typescript-sdk)
- [Cloudflare Web Standards runtime](https://developers.cloudflare.com/workers/runtime-apis/web-standards/)
- [Clerk OAuth MCP guide](https://clerk.com/docs/expressjs/guides/ai/mcp/build-mcp-server)
