# Zine MCP: concrete Clerk account-linking runbook

For the now-registered public client, current administrative facts and the
remaining unapplied activation proposal, see
[production activation](mcp-production-activation.md). This original runbook
records the pre-registration investigation and alternatives; its pending-client
statements below are historical, not the current registration status.
The current handoff requires user-only Clerk key entry: the agent must never
read or transmit that key. The older optional private-preflight path below is
not authorization to use it during this activation.

This is an implementation and unapplied deployment plan, checked on
2026-10-16. Nothing in this document has registered a client, issued a token,
changed Clerk settings, installed a connector, bound production data or deployed.

## What is established

Zine's native publishable-key configuration and Worker verifier both identify
the existing production Clerk instance at `https://clerk.myzine.app`. D1 `users.id`
stores the Clerk subject; the new surface uses that same identity, without an
email lookup or a separate account database.

Public GETs to the issuer's OAuth/OIDC discovery documents succeeded. The
checked-in [public report](mcp-clerk-discovery.json) records:

| Purpose               | Confirmed endpoint                                                |
| --------------------- | ----------------------------------------------------------------- |
| OAuth metadata        | `https://clerk.myzine.app/.well-known/oauth-authorization-server` |
| OIDC metadata         | `https://clerk.myzine.app/.well-known/openid-configuration`       |
| Sign-in/consent       | `https://clerk.myzine.app/oauth/authorize`                        |
| Code/refresh exchange | `https://clerk.myzine.app/oauth/token`                            |
| Revocation            | `https://clerk.myzine.app/oauth/token/revoke`                     |
| Introspection         | `https://clerk.myzine.app/oauth/token_info`                       |
| Signing keys          | `https://clerk.myzine.app/.well-known/jwks.json`                  |

Discovery advertises authorization codes, refresh tokens, S256, public-client
token exchange (`none`) and authorization-response issuer identification. It
does not advertise CIMD/DCR or `bookmarks:read` / `bookmarks:write`. That proves
those capabilities are not currently advertised, not that hidden scopes are
absent or PKCE enforcement/audience claims are enabled.

Clerk's current official schemas implement the RFC8707 `resource` parameter at
authorization, code exchange and refresh. The instance setting is
`aud_claim_enabled`. Custom scope keys are supported and can be advertised and
assigned to individual clients. Therefore the existing provider can meet this
integration's contract after the settings/client prerequisites below; no bridge
or second sign-in provider is necessary. Actual grant behavior remains untested.

## Smallest linking flow

Use one manually registered public OAuth client for ChatGPT, require S256 PKCE,
leave the consent screen enabled and allowlist the exact callback shown in the
ChatGPT server-management UI. This avoids enabling public DCR or automatic CIMD
admission. Register another explicit client later for another MCP host.

1. ChatGPT discovers the MCP resource metadata and the existing Clerk issuer.
2. It sends `response_type=code`, its pre-registered `client_id`, exact
   `redirect_uri`, state, S256 challenge and
   `resource=https://mcp.myzine.app/mcp` to Clerk. That resource host is the
   **proposed** new HTTPS endpoint, not an existing deployment.
3. Clerk authenticates the same Zine account and asks for explicit consent to
   `bookmarks:read` and, when needed, `bookmarks:write`.
4. The client verifies the callback's issuer/state, then exchanges the code with
   its PKCE verifier and the identical resource. Clerk binds the token's audience
   to that resource. The same binding must survive refresh.
5. The Worker verifies an access token on every request, checks the client and
   granted permissions and resolves its exact existing D1 user. Tool arguments
   cannot select another account. Mailbox provenance is independently checked
   before private Gmail metadata/content becomes visible.

The Worker does not handle passwords, OAuth codes, client secrets, refresh-token
storage or consent redirects. Clerk and the MCP host perform those standard
roles. No credentials need to be embedded in ChatGPT when using a public client.

## Read-only preflight before any mutation

```sh
bun scripts/mcp-clerk-preflight.ts
bun test scripts/mcp-clerk-preflight.test.ts
```

The first command uses only public discovery by default, even if an environment
variable containing a secret already exists. It does not start OAuth. An
optional explicit `--with-private-settings` flag performs only this fixed GET:

`https://api.clerk.com/v1/instance/oauth_application_settings`

It requires an approved **existing** Clerk backend key supplied as
`MCP_CLERK_SECRET_KEY` through a trusted secret launcher. It outputs only an
allowlist of boolean flags, not the raw response or key. Do not add admin keys to
the test-login profile or broaden Bitwarden access just to run it.

This read was **blocked, not denied or attempted against Clerk**: `secretsctl
current` resolved `zine.test`; metadata contains only test email/password.
`secretsctl doctor` reported the machine-account token unavailable and `check`
could not retrieve credentials. Public discovery and all local fixtures were
completed independently. An authorized operator can inspect the flags in the
Dashboard or supply the sanitized GET result instead of granting this agent an
admin key.

Inspect `aud_claim_enabled`, `pkce_required`, `oauth_jwt_access_tokens` and the
per-client format/PKCE/consent/scope/redirect settings. No private value has been
assumed from public metadata. There is no test token that can safely prove an
unconfigured production grant without creating a real grant.

## Exact proposed configuration changes — approval required

Perform only after the user approves these concrete actions:

1. **Audience binding:** if `aud_claim_enabled` is false, enable it for the existing
   Clerk instance. This is an instance-wide change requiring review of existing
   OAuth clients. Do not enable `aud_claim_refresh_backfill_enabled` for this
   integration; create fresh resource-bound grants rather than upgrading legacy
   grants. If it is already enabled, review it separately without silently
   changing unrelated clients. If audience binding
   is unavailable to this instance, stop; never infer it from a client ID.
2. **Custom scopes:** in Clerk Dashboard → OAuth applications → Scopes, inspect or
   create and advertise `bookmarks:read` ("Read my saved Zine items and private
   collections") and `bookmarks:write` ("Save links and organize my private Zine
   collections"). Do not reuse `profile`, `email`, `public_metadata` or
   `private_metadata` as authorization for Zine library data.
3. **Client:** create one OAuth application named "Zine MCP — ChatGPT". Mark it
   Public, require PKCE, keep consent enabled, assign the approved Zine scopes
   plus `openid email profile`, and add the exact callback from ChatGPT's UI.
   OpenAI requests those OIDC scopes by default when the issuer advertises them,
   as this Clerk instance does. This also shares the consenting account's identity
   claims with ChatGPT; include that scope in the registration/consent approval.
   Do not grant `public_metadata` or `private_metadata`. With the currently
   advertised issuer-response support, OpenAI documents the stable callback
   `https://chatgpt.com/connector_platform_oauth_redirect`; the management UI's
   exact value is authoritative. Record the returned `client_id`. Do not enable
   DCR, broad CIMD admission, device flow or token exchange. Per-client PKCE
   enforcement avoids an unrelated instance-wide PKCE change.
4. **Token/revocation choice:** choose one of the two implemented Clerk modes
   below. Set the corresponding client token format. Existing apps and their
   token formats must not be changed incidentally. Decide whether to request
   `offline_access`; it creates ongoing refresh access and requires explicit
   approval. A short pilot can omit it and re-link when access expires.
5. **Remote endpoint:** approve the canonical hostname, recommended
   `https://mcp.myzine.app/mcp`, DNS/domain routing, a separate Worker using
   `src/server.ts`, and binding that Worker to the approved existing Zine D1
   database and ARTICLE_CONTENT R2 bucket. Add no public-media bucket, queues,
   crons, provider tokens or auth bypass. Review Cloudflare limits/rate limiting,
   privacy-safe logging and any costs before deployment. Existing deployment
   workflows do not publish this separate entry point.
6. **MCP admission:** after registration, put only the returned approved client
   ID(s) in `MCP_CLERK_CLIENT_IDS`. Add the server to ChatGPT with the registered
   public-client ID. This client registration, connector installation and the
   subsequent user consent grant are separate approved actions.

The initial prototype's generic one-hour JWT verifier is not sufficient for
Clerk's documented one-day default. It has not been silently relaxed: select an
explicit Clerk mode, both implemented and fixture-tested.

### Mode A: JWT; smallest infrastructure change

```toml
MCP_AUTH_MODE = "clerk-jwt"
MCP_RESOURCE = "https://mcp.myzine.app/mcp"
MCP_OAUTH_ISSUER = "https://clerk.myzine.app"
MCP_OAUTH_JWKS_URL = "https://clerk.myzine.app/.well-known/jwks.json"
MCP_CLERK_CLIENT_IDS = '["client_REPLACE"]'
```

No Clerk backend secret is required. The adapter supports Clerk `scp` arrays and
`scope` strings, pins OAuth token type/issuer/signature, checks resource audience
and client ID and permits at most a one-day token lifetime. Session/ID tokens,
other clients and delegated token-exchange actors are rejected.

**Residual risk:** an already issued JWT may remain usable for its remaining
lifetime, up to 24 hours, after disconnect/revocation. Do not claim immediate
revocation. Accept that pilot limitation explicitly or use Mode B.

### Mode B: opaque tokens; immediate revocation

Use the same variables with `MCP_AUTH_MODE = "clerk-opaque"`, select opaque
access tokens for the dedicated OAuth client, and inject
`MCP_CLERK_SECRET_KEY` as a separately approved Worker secret.

The adapter sends only `oat_` access tokens to the fixed official
`POST https://api.clerk.com/v1/oauth_applications/access_tokens/verify` endpoint.
Its schema checks the returned subject, single exact audience, admitted client,
scopes, revocation/expiry flags and Unix-seconds expiration; it accepts neither
missing audiences nor legacy unbound grants. The key is never returned, logged,
stored in D1 or sent to any host-supplied URL. Redirects are forbidden, timeouts
and body size are bounded, verification is uncached and outages return 503.

**Residual risk:** this places a sensitive Clerk backend key in the new Worker
and adds a Clerk API dependency on authenticated requests. That expands runtime
access and needs explicit approval, plus edge rate limits to constrain invalid
token verification traffic. JWT mode avoids that key entirely. No secret has
been injected or created here.

## Release acceptance after approval

- Verify custom scopes and exact `aud` with a fresh approved development grant;
  verify scope preservation and resource binding on refresh if refresh is used.
- Test two existing accounts, cross-account IDs, readonly/write-only grants and
  scope upgrades. The D1 account and mailbox provenance checks stay mandatory.
- Verify user denial, wrong callback/state/issuer, expired credentials, wrong
  audience and wrong client. These are provider/client flow checks in addition
  to the already-passing resource-server fixtures.
- Test disconnect and revocation according to the selected mode, with no claims
  of instant JWT revocation. In opaque mode, verify provider outages yield 503.
- Test existing public-publication/Gmail association fixtures against the deployed
  MCP boundary. The older REST/tRPC publication identity issue remains a separate
  release concern; this MCP surface does not call that save route.
- Confirm worker bindings, absence of auth bypass and no logging of headers,
  tokens, bookmark URLs or private bodies. Confirm client admission and edge
  request limits before inviting users.

## Decisions still needed

Only three product/security choices remain: accepting JWT's revocation window
versus approving the opaque-mode backend secret; refresh access versus re-linking
for a pilot; and confirming the proposed hostname. Client IDs and callbacks are
registration outputs, not values that can be invented locally.

## Sources

- [Clerk public issuer metadata](https://clerk.myzine.app/.well-known/oauth-authorization-server)
- [Clerk OAuth features and scopes](https://clerk.com/docs/guides/configure/auth-strategies/oauth/how-clerk-implements-oauth)
- [Official Clerk Backend API schema](https://github.com/clerk/openapi-specs/blob/main/bapi/2026-05-12.yml)
- [Official Clerk Frontend OAuth schema](https://github.com/clerk/openapi-specs/blob/main/fapi/2026-05-12.yml)
- [Clerk OAuth token verification](https://clerk.com/docs/guides/configure/auth-strategies/oauth/verify-oauth-tokens)
- [Clerk JWT claim adapter source](https://github.com/clerk/javascript/blob/main/packages/backend/src/api/resources/IdPOAuthAccessToken.ts)
- [OpenAI authentication and callbacks](https://developers.openai.com/plugins/build/auth)
