# Zine API

Independent backend rewrite in `apps/api`, running on fresh Cloudflare resources.
Existing Zine applications and infrastructure continue to operate separately.

Fresh agent session: start with [AGENTS.md](AGENTS.md), read the
[current handoff](docs/STATUS.md), then run `bun run doctor` from this package.

- REST: <https://api-next.myzine.app/v1>
- API reference: <https://api-next.myzine.app/docs>
- Interactive architecture guide: <https://api-next.myzine.app/architecture>
- Standalone walkthrough: [architecture.html](docs/architecture.html)
- OpenAPI: <https://api-next.myzine.app/openapi.json>
- MCP: <https://api-next.myzine.app/mcp>
- Health and serving deployment ID: <https://api-next.myzine.app/health>

The service owns saved references, personal state, retained metadata and accessible
understanding. Platforms continue to host the original media. Article text and
published transcripts can be retained as private artifacts.

## Capabilities

Durable one-off saves with accumulated context; source subscriptions with latest
matching intake and future arrivals; review-first or automatic saving; independent
lifecycle, archive and completion; tags, ordered collections, collection synthesis,
annotations and progress; private enrichment with provenance and corrections;
verified duplicate reconciliation with stable old IDs; private relationships between
distinct editions; keyword, semantic and hybrid retrieval with evidence; export and account erasure;
CLI and MCP adapters over the same REST contract.

Provider coverage is detailed in [providers.md](docs/providers.md). Evidence and
remaining verification limits are recorded in [verification.md](docs/verification.md).
The [usage guide](docs/usage.md) walks through capture, retrieval and subscriptions.
The [blueprint](docs/blueprint.md) records product and architecture decisions.
The [completion audit](docs/completion-audit.md) records what remains unproven.

## Authentication

The API independently verifies Clerk sessions from the configured issuer and
checks their audience or authorized party. Interactive sign-in can issue a Zine
API token at `POST /v1/tokens`. Its value is returned once; only a hash is stored.
Bearer API tokens can operate on content but cannot mint more credentials, manage
provider grants, or erase an account. Revocation takes effect on the next request.
MCP also excludes credential and account-management operations.

Use a bearer token for REST and MCP. Inject CLI credentials as `ZINE_API_TOKEN`.
Never pass credentials as command arguments or place them in repository files.
Existing test-login credentials are available through the approved `secretsctl`
profile for real-user verification. Provider grants, when needed, are independently
encrypted and owner-bound; they are never included in exports.

## Development and checks

From the repository root, install with `bun install --frozen-lockfile`. Then:

```sh
cd apps/api
bun run db:migrate:local
bun run dev
bun run test
bun run typecheck
bun run lint
bun run build
```

Local development uses its own empty D1/R2 state. It does not provision or copy the
old backend's infrastructure. `scripts/runtime-harness.ts` provides isolated real
workerd/D1/R2 for integration checks with a generated signed issuer. Those tests
are explicitly separate from real Clerk and live-provider evidence.

Zod 4 is imported through the `zod4` alias, preserving the existing applications'
Zod 3 resolution. Tests use the monorepo's Vitest 2. Wrangler 4 is invoked with an
exact Bunx version, preserving the existing root Wrangler 3 installation.
The independent `API rewrite checks` workflow runs this package's checks on changes.

### Local development with a copy of production data

```sh
cd apps/api
bun run local:pull    # newest nightly production backup → cleaned local copy (~10 s once cached)
bun run local:dev     # local API on :8890 against that copy
bun run local:reset   # discard local changes; back to the pristine copy (about a second)
bun run local:token   # the local API token, for curl or agents
```

`local:pull` only reads production through the private backup bucket
(`zine-api-next-backups`, needs `CLOUDFLARE_API_TOKEN`). Rows are copied by
`scripts/local-restore.py` with the isolated-restore cleaning rules from `restore-sql.py`:
no API tokens, provider connections, webhooks or queued work, and subscriptions paused.
It then seeds one local-only API token for the account with the most saves.
`wrangler.local.jsonc` has no production database, bucket, AI, vector index, routes,
schedules or provider secrets, so semantic search and ingestion that needs providers are
unavailable locally. Data lives in ignored `.local-data/dev/`. Stop `local:dev` before
`local:reset`. `test/local-restore.test.ts` proves the cleaning.

### Branch previews

See [docs/environments.md](docs/environments.md) for the full guide and known pitfalls.

A preview is a full copy of the stack for one branch at `https://next-<branch>.myzine.app/next/`:
an API Worker with its own D1 database, R2 bucket and queue, plus the branch's web app. Its data
is a slim, cleaned copy of the newest nightly production backup (`scripts/preview-sql.py`: library
only, no credentials, webhooks, event/job history or semantic index state; subscriptions paused).
Previews have no AI, vector index, cron or provider secrets; search is keyword-only. Sign in with
your normal Zine account; production rejects preview sessions.

- Request one: add the `preview` label to a pull request (redeploys on each push; data is loaded
  once and kept), or run the "Zine Next branch preview" workflow by hand.
- Removed when the label is removed, the pull request closes, or after 7 days. At most 3 exist;
  a new one replaces the oldest.
- From a checkout (needs `CLOUDFLARE_API_TOKEN`; build `apps/next-web` first):
  `bun run preview deploy|destroy <branch>`, `bun run preview list`, `bun run preview sweep`.
- Agents: `bun run preview token <branch>` mints a fresh 7-day API token straight into that
  preview's database (same `CLOUDFLARE_API_TOKEN`, no other secret).

## CLI

```sh
bun run cli save https://example.com/article --context 'Why I saved this' --tag reading
bun run cli list --limit 20
bun run cli search 'memory systems for agents' --match hybrid
bun run cli get itm_EXAMPLE --include transcript,article,thread
```

`ZINE_API_BASE_URL` selects another HTTPS or loopback API. `--output FILE` writes
private output with mode 0600 and refuses to overwrite an existing file.
`scripts/api-console.ts` records interactive HTTP observations with response hashes;
private recordings and library snapshots stay in ignored `.local-data/` storage.

## Deployment and operations

All bindings in `wrangler.jsonc` belong to this rewrite. From `apps/api`:

```sh
bunx wrangler@4.158.0 d1 migrations apply DB --remote
bun run deploy
bun run scripts/tail.ts
```

Provision approved reusable provider credentials with
`scripts/provision-provider-secrets.ts`. Values travel through process memory and
stdin to Worker secrets. The script can derive the X application bearer once, so
cold isolates do not depend on the provider's token-issuance endpoint. Google user
grants are optional and separate from public-page extraction; provisioning a client
ID alone does not establish an authorized Google account connection.

### Image proxy secret (`IMAGE_PROXY_SECRET`)

Some publishers serve covers and avatars with `Cross-Origin-Resource-Policy: same-origin` or
hotlink protection, so a browser on our origin cannot show them. With `IMAGE_PROXY_SECRET` set,
the `thumbnail` and `creatorImageUrl` fields of item, list, search, Home and collection-item
responses become signed `GET /v1/img?u=<url>&s=<signature>` references, and that route fetches
the image (public hosts only, `image/*` only, 5 MB cap, cached for a day). The signature
(HMAC-SHA256 of the URL with this secret) is the authorization; the route needs no bearer token.
Stored data, exports and MCP output keep the original URLs.

It is an optional Worker secret: a long random string, different per environment. It is not set
by any script or workflow here; a person sets it once per Worker:

```sh
openssl rand -base64 48                                               # generate a value
bunx wrangler@4.158.0 secret put IMAGE_PROXY_SECRET                   # production
bunx wrangler@4.158.0 secret put IMAGE_PROXY_SECRET --config wrangler.staging.jsonc
bunx wrangler@4.158.0 secret put IMAGE_PROXY_SECRET --name zine-api-next-pv-<slug>  # a branch preview
```

Locally, add `IMAGE_PROXY_SECRET=...` to the ignored `apps/api/.dev.vars`; see
[docs/environments.md](docs/environments.md) for when that is useful.

When it is unset, `/v1/img` answers 503 and no response is rewritten: clients get the original
image URLs, exactly as before the proxy existed. Changing the value invalidates references
already handed out; clients get fresh ones on their next API read. SVG is served, but only with
`Content-Security-Policy: default-src 'none'; style-src 'unsafe-inline'; sandbox` and
`Content-Disposition: inline`, because many site icons exist only as SVG and the references are
only used in `<img>`, where scripts never run.

Durable D1 jobs survive queue delivery failures. Cron recovers unsent work and
expired leases. Provider budgets coordinate backoff. Source ingestion takes
priority over AI backfills, and only bounded AI work is queued at once. Long
understanding and indexing work resumes through durable continuations. Search
indexes are eventually consistent; responses report pending indexing work.

Large private artifacts and obsolete vectors are deleted through durable cleanup
queues. Account erasure removes authoritative personal data immediately, revokes
API credentials, and changes the owner's generation so stale work cannot recreate
old enrichment. Physical artifact cleanup remains asynchronous and observable.

## Verification artifacts

Public proof in `evidence/` contains counts, assertions, request IDs, response hashes
and declared scope. It excludes credentials and raw private exports. Important
artifacts include the 444-item imports, manual lifecycle journeys, owner isolation,
search evaluation, provider pagination, timed podcast intake, and export/erasure.
Browser interaction with the optional inspector has not been verified because
browser use is disabled in this session. Native mobile work is outside this task.
