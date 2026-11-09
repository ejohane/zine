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
