# Zine MCP production activation proposal

Prepared locally on 2026-10-16 against remote main
`3b33e1487062dca60cd35f99a924cba76fa32742`. This is an unapplied proposal.
No production configuration, secret, deployment or user grant was accessed or
changed during this preparation. No browser was used.

## Confirmed registration and remaining gate

The parent task reports a verified public Clerk client `5gNCO8oX8tGw0eA5`
on `https://clerk.myzine.app`, with consent enabled, opaque access tokens,
device authorization disabled and the sole callback
`https://chatgpt.com/connector_platform_oauth_redirect`. Its assigned scopes are
`openid email profile bookmarks:read bookmarks:write offline_access`.
Both custom scopes are advertised. Audience binding is enabled and refresh
audience backfill is disabled. These are reported administrative facts, not a
fresh grant test by this task.

The parent now reports that **Require PKCE was saved and verified** in Clerk
after user approval. S256 support is advertised. This task has not created a
grant or independently exercised verifier rejection; that remains a release
acceptance check. Do not change other clients' registrations or grant behavior
incidentally.

## Runtime and exact data bindings

The existing API deployment is `zine-worker-production`, entry point
`apps/worker/src/index.ts`, configured in `apps/worker/wrangler.toml` under
`env.production`, route `api.myzine.app/*`. It does not serve this MCP entry
point. The merged baseline had only `wrangler.local.toml`; this follow-up adds an
unapplied production configuration, not a deployed target. No cloud inventory
was read.

Use a separate Worker named **`zine-mcp-production`**, with custom domain
**`mcp.myzine.app`**, serving **`https://mcp.myzine.app/mcp`** and its protected
resource discovery endpoints. Disable workers.dev and preview URLs. Verify name
and domain availability in the authorized account before creation; stop on an
unexpected existing owner/target. Do not replace the API Worker or run its deploy
workflow, which also runs database migrations.

The local candidate is `integrations/mcp/wrangler.production.toml`. Its essential
data/auth configuration is shown below; the file also disables observability
and declares the verification limiter. Nothing has been applied:

```toml
# integrations/mcp/wrangler.production.toml -- local candidate, not applied
name = "zine-mcp-production"
main = "src/server.ts"
compatibility_date = "2024-12-01"
compatibility_flags = ["nodejs_compat"]
workers_dev = false
preview_urls = false
routes = [{ pattern = "mcp.myzine.app", custom_domain = true }]

[vars]
ENVIRONMENT = "production"
MCP_AUTH_MODE = "clerk-opaque"
MCP_RESOURCE = "https://mcp.myzine.app/mcp"
MCP_OAUTH_ISSUER = "https://clerk.myzine.app"
MCP_OAUTH_JWKS_URL = "https://clerk.myzine.app/.well-known/jwks.json"
MCP_CLERK_CLIENT_IDS = '["5gNCO8oX8tGw0eA5"]'

[[d1_databases]]
binding = "DB"
database_name = "zine-db-production"
database_id = "82911dea-5a6b-411b-ab4b-4145cb0c191d"

[[r2_buckets]]
binding = "ARTICLE_CONTENT"
bucket_name = "zine-article-content-prod"
```

No schema migration, new database/bucket, queue, cron, KV, AI, vector index,
publication-media bucket, provider token or account provisioning is required.
The database and bucket identifiers above come from the existing production
Worker config and must be checked against the selected account before binding.
Native D1 bindings permit database-wide reads/writes; native R2 bindings are not
restricted to object GETs. Code enforces account/content ownership and uses R2
reads only, but these bindings are broader capabilities than individual tools.

## Credentials and actual privilege

For each request bearing an accepted `oat_` token, the adapter makes one uncached
POST to `https://api.clerk.com/v1/oauth_applications/access_tokens/verify` with
that access token and a backend bearer credential. It checks the returned user
subject, exact resource audience, exact admitted client, scopes, expiration and
revocation. The JWKS URL remains required configuration but is not fetched in
opaque mode. Anonymous discovery/initialize/list do not call this verifier.

Clerk's current [verification documentation](https://clerk.com/docs/guides/configure/auth-strategies/oauth/verify-oauth-tokens)
and [Backend API security schema](https://github.com/clerk/openapi-specs/blob/main/bapi/2026-05-12.yml)
specify the instance Secret Key (`sk_live_...`) as backend bearer authentication.
They do not document a verification-only or OAuth-client-scoped backend key for
this endpoint. A public client ID, publishable key, user token, OAuth client
secret or machine credential is not a documented substitute. No least-privilege
credential has been established; do not claim one exists. A separate copy/key
does not make its instance authority narrower.

The concrete opaque-mode approval is to allow the user to install the existing
approved production instance backend key as the new Worker's
**`MCP_CLERK_SECRET_KEY`** secret through a user-only protected handoff. This expands
that key's runtime exposure to another Worker and carries the backend key's
instance-wide authority, beyond the two library scopes. Do not extract it from
an existing Worker, send it in chat, print it, put it in a config/file/CI output,
rotate it, or create a new key as an incidental setup step. The agent must never
read or transmit this key. If no approved user-accessible source is available,
stop before activation; do not request the key in chat or retrieve it through
automation.

### Secure user handoff and existing hosting secrets

After deployment itself is separately approved, the agent can prepare a Worker
version without the key; its authentication config returns 503. Then stop all
agent browser inspection, screenshots, accessibility capture and log tails before
the user enters the key. In their own Cloudflare Dashboard, the user selects
Workers & Pages -> `zine-mcp-production` -> Settings -> Variables and Secrets,
adds a **Secret** named `MCP_CLERK_SECRET_KEY`, enters the existing key directly
and applies it. The user reports only completion. Do not have the agent fill the
field, read it, proxy the request, operate a secret CLI, copy a clipboard or
capture the secret-bearing session. The user remains responsible for secret
entry; the agent can later verify only nonsecret endpoint behavior. If the UI
differs, the user follows Cloudflare's current secret-entry instructions.

Cloudflare's [Worker secrets documentation](https://developers.cloudflare.com/workers/configuration/secrets/)
defines these as per-Worker bindings. There is no documented direct binding from
this new Worker to an arbitrary other Worker's secret, nor a supported readback
path to copy it. Existing GitHub Actions secrets are not automatically available
to this Worker. Their presence or values have not been inspected.

Cloudflare [Secrets Store references](https://developers.cloudflare.com/secrets-store/integrations/workers/)
can share an **existing account-level secret** by `store_id` and `secret_name`
without exposing its value to the deploying operator. Repository Wrangler
configs have no Secrets Store reference, and hosted inventory was not queried;
an existing store/key is therefore unconfirmed. This string-key adapter would
also need a small tested async `.get()` binding adapter. Adding a new binding
expands runtime access even if nobody sees the key. Do not create/migrate a
store, add that adapter or bind a stored secret without a separate approved
reference and access decision. A service binding to a narrowly implemented
verifier in the existing Worker could avoid copying the key, but no such
verifier exists in this implementation; it would change the API deployment and
is outside this increment. Do not use another Worker as a secret-export proxy.

If that privilege is unacceptable, opaque-mode activation is blocked. JWT mode
would remove the backend key but requires a separately approved client-format
change and acceptance of up to 24 hours of post-revocation token validity. It is
not an automatic fallback and is outside this proposed activation bundle.

Cloudflare deployment authentication stays with the authorized operator/tool;
the runtime needs no Cloudflare API token. Do not create a broader deployment
token. Verify existing auth and account identity before any deployment command.

## Local changes and protections required before exposure

The merged adapter incorrectly required `client_` in the allowlist. A local fix
accepts bounded alphanumeric/underscore/hyphen identifiers, including this
public-client format, while retaining exact allowlist equality. Fixtures cover
both formats, malformed IDs and a prefixed impersonation of an unprefixed ID.
The adapter accepts both public and prefixed formats and rejects aliases. The
fix, production config and throttle prepare an unapplied deployment candidate;
publication does not activate it. Verification passed: 74 MCP tests, 6
preflight/config tests, typecheck, lint and both Wrangler dry-run bundles.

The local candidate includes an early request throttle: at most
**60 authenticated verification attempts per 60 seconds
per source IP**, before sending any token to Clerk; return 429 with Retry-After
when limited and 503 if the limiter fails. Anonymous discovery remains possible.
It uses Cloudflare's Worker rate-limiting binding. The isolated MCP package now
pins Wrangler 4.119.0 (also used by the repository's web deploy); Cloudflare
requires >=4.36.0. The root toolchain and lockfile remain unchanged. The proposed
binding is `MCP_VERIFICATION_LIMITER`, namespace ID `260101`, with
`simple = { limit = 60, period = 60 }`; stop if that ID is already used rather
than sharing another task's counters. The [rate-limiting API](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/)
is local to each Cloudflare location and eventually consistent; this is an abuse
throttle, not a global spend cap. Shared host IPs can also be throttled. Do not
substitute a process-local Map or silently raise the limit for ChatGPT.

Keep request/body logging and tracing off for this Worker; log only controlled
error codes and aggregate counters if explicitly added. Never log bearer tokens,
Clerk keys, private bodies, bookmark URLs or raw verification responses. The
existing 32 KiB MCP request bound and 16,000-character content chunks remain.

The verification-only workflow runs the new config tests and production dry-run;
it has no deployment or credential step. Publish these changes for review only
after approval. `bun run --cwd integrations/mcp build:production` bundles the
candidate with an explicit empty env file and does not upload, migrate or bind
remote resources. No root lockfile or API Worker config change is needed.

## Data exposed and approved pilot verification

After explicit consent, ChatGPT can receive the account's identity claims
(`openid email profile`), saved-item IDs, titles, URLs, descriptions, available
stored text (including private email-derived text only with verified mailbox
ownership), collection names and membership. Write access saves safe HTTPS link
references and creates/adds to private collections. No screenshot support is
claimed. It does not publish or acquire new transcripts/content. All saved text
remains untrusted. The shared save service records normal enrichment intent even
though this MCP Worker does not dispatch enrichment; later existing backend
processing may handle that intent.

`offline_access` allows the host to retain refresh access until revoked. The
resource server does not store refresh tokens. Clerk receives the presented
access token for verification, not library content. An approved pilot grant is
a separate real access grant, even though client registration already exists.

Before inviting users, verify:

1. PKCE rejects missing/plain/wrong verifiers and the exact callback works;
   explicit consent denial does not authorize access.
2. Public metadata, initialize/list and six tool schemas work at the canonical
   endpoint; no user content appears before authentication.
3. With two explicitly approved existing accounts and fresh grants, exact `aud`,
   `client_id`, scopes and Clerk subject are preserved, including refresh.
   Use dedicated known fixture items/collections; obtain consent from each
   account owner rather than creating credentials or impersonating a user.
4. Exercise cross-account read/add IDs, the private-publication/Gmail regression,
   read-only/write-only permissions, safe URL rejection, pagination, repeat-save
   idempotency and expected errors. No broad production search/export is needed.
5. Revoke/disconnect a pilot grant and confirm its next request is rejected;
   fixture-based timeout/429/5xx checks return 503 without unwanted re-consent.
   Never deliberately disrupt the production Clerk service to simulate failure.
6. Prove the early throttle prevents outbound verification when limited,
   inspect the final binding/route inventory and confirm sensitive logging is off.
   If account/fixture owners are unavailable, keep the pilot closed rather than
   claiming cross-account production verification passed.

## Rollback and costs

Before the first live version, retain a minimal 503 maintenance version with no
data/secret bindings as the rollback target. On failure, replace only
`zine-mcp-production` with that version (or remove its custom domain), disconnect
and revoke only the pilot grants, and remove the new Worker's Clerk secret and
data bindings. Check for any alternate Worker URLs as well. Do not rotate a
shared instance key or disable/change other OAuth clients. Do not roll back the
instance PKCE/audience flags automatically. Link/collection writes already made
are persistent library data; remove only specifically identified pilot writes
with owner approval, never restore the whole shared database.

New usage consists of Worker requests/CPU, existing D1 reads/writes, existing R2
reads and one Clerk backend verification per eligible authenticated request.
There is no justified incremental dollar estimate without the account's current
plan, remaining allowances, Clerk limits and pilot traffic. Cloudflare documents
a [Workers Paid minimum of $5/month per account](https://developers.cloudflare.com/workers/platform/pricing/),
not per new Worker; this does not prove the current account needs an upgrade or
that this pilot is free. Do not upgrade plans, add a paid WAF/service or incur a
new paid subscription without separate cost approval. Stop if the existing plan
cannot run the bounded pilot within its approved limits.

## Single proposed approval bundle

PKCE enforcement is reported verified and PR publication is approved. The next
activation approval would authorize merging the reviewed MCP changes and a
bounded production pilot at `https://mcp.myzine.app/mcp`: have the user enter the
approved existing Clerk backend key through the user-only handoff into
`zine-mcp-production`, accepting its instance-wide privilege; deploy only that new
Worker with the exact existing DB/R2 bindings above and no schema migrations;
connect ChatGPT using public client `5gNCO8oX8tGw0eA5`; allow explicitly consenting
pilot account owners to grant the listed identity/library/refresh scopes and run
the verification above. Authorize rollback of only this MCP deployment and pilot
grants if acceptance fails. No new paid plan or other production change is
included. Stop for any incompatible existing client, missing approved secret
source, unsupported required protection or additional charge.
