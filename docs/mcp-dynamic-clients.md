# Automatic MCP client onboarding

Zine can accept dynamically registered OAuth clients without adding every client
ID to a Worker allowlist. This requires both Clerk onboarding configuration and
the MCP admission policy; changing either one alone is insufficient.

## Clerk configuration

On the production Zine instance, open **Configure → Developers → OAuth
applications → Settings**:

- Enable **Publish DCR support** for clients that require registration.
- Keep **Require PKCE** enabled (S256), **Opaque access tokens** selected, and
  **Include Audience** enabled. Keep refresh-token audience backfill disabled.
- DCR enforces the user consent screen. Registration alone grants no account
  access. Each user must sign in and approve the requested scopes.
- Use `bookmarks:read` as the default for dynamic clients that omit scopes.
  Clerk also includes `offline_access` for refresh tokens.
  Clients needing mutations must explicitly request `bookmarks:write` and obtain
  consent. Do not default to identity/private-metadata scopes.

Clerk labels DCR deprecated and recommends Client ID Metadata Documents (CIMD)
for clients supporting them. This implementation enables DCR compatibility; it
does not enable CIMD or assume HTTPS metadata URLs are ordinary Clerk client IDs.

Reference: [Clerk OAuth implementation](https://clerk.com/docs/guides/configure/auth-strategies/oauth/how-clerk-implements-oauth).

## MCP admission policy

`MCP_CLERK_CLIENT_POLICY` has two supported values:

- Omitted or `allowlist`: exact comparison against `MCP_CLERK_CLIENT_IDS`.
- `instance`: accept valid Clerk client IDs returned by authoritative opaque-token
  verification using this instance's backend key. Only `clerk-opaque` supports
  this policy; JWT compatibility mode retains explicit admission.

Instance admission does not trust a client ID supplied by the request. Clerk must
verify a real OAuth access token. Zine still checks the exact MCP audience,
expiry, revocation status, Clerk user subject, and per-tool bookmark scopes. It
continues rejecting session tokens, personal access tokens, delegated actors,
other-resource tokens, and malformed token records. Verification outages fail
closed.

This admits all OAuth clients whose tokens are verified by the configured Clerk
instance and target this resource, including manually registered clients. Clerk
owns client registration, redirect validation, PKCE, and consent; Zine owns
account isolation and tool permissions.

## Activation and verification

1. Run MCP typecheck, lint, tests, and the production dry-run build.
2. Enable Clerk DCR, retaining the security settings above.
3. Deploy the MCP Worker with `MCP_CLERK_CLIENT_POLICY=instance`, preserving its
   existing secret bindings. Do not use a deployment path that drops the runtime
   Clerk verification key.
4. Verify discovery advertises a `registration_endpoint`, register a test client,
   and complete an actual fresh PKCE sign-in from the target harness. Check read
   access, denied ungranted writes, and the existing ChatGPT connection separately.
   Public metadata and fixture tests alone do not prove a live OAuth grant works.

Rollback: restore `allowlist` and the retained ChatGPT client ID, then disable DCR
to stop new registrations. Review/revoke unwanted OAuth grants in Clerk;
disabling registration alone does not revoke existing tokens.

Activation status must be reported separately from code/configuration readiness.

## Production activation: October 27, 2026

DCR is enabled. Allowed dynamic scopes are `bookmarks:read`, `bookmarks:write`,
and Clerk's mandatory `offline_access`; defaults are `bookmarks:read` and
`offline_access`. PKCE, opaque tokens, and audience binding remain enabled.

Worker version `c488c9e1-b073-4eed-9563-33be410767ee` runs at 100% with
`MCP_CLERK_CLIENT_POLICY=instance`. It was built from main
`4e508822499835cff27a87717cb34897c80aca38` plus the scoped authentication changes,
and inherits bindings from the prior live version
`184331d4-4520-4e90-8e91-d661e0983bad`. The isolated release passed 115 tests,
typecheck, lint, and its production dry-run build.

Live discovery advertises registration; a labeled public verification client
registered successfully with bookmark read/write scopes. Existing authenticated
MCP reads and the unchanged 17-tool catalog passed after deployment. No account
grant was created for the verification client. Fresh authorization and token
exchange in the user's other harness remain to be exercised there.

### Standard-client sign-in correction

The initial DCR activation missed an HTTP interoperability bug: an anonymous
tool call returned HTTP 200 with only ChatGPT's `mcp/www_authenticate` hint, so
standard MCP transports never started OAuth. Initialization now returns HTTP
401 when unauthenticated; tool calls return 401 for missing authentication and
403 for insufficient scopes, with a standard `WWW-Authenticate` header as well
as the retained ChatGPT hint. Scope upgrades include existing bookmark scopes
so granting write does not discard read. Public catalogs remain inspectable.

Version `d7dfeb5e-3636-4069-aff2-ecda36eca569` includes this correction. The
isolated release passed 117 tests, typecheck, lint, and its production build.
Regression tests use the real MCP SDK transport to verify OAuth startup from
both initialization and a tool call. Live probes reproduced the old failure,
then generated Clerk S256 authorization URLs with the exact resource and read
scope after deployment. Existing authenticated MCP reads also passed. These
checks reach the sign-in redirect; they do not prove the other harness completed
user consent or exchanged its authorization code.
