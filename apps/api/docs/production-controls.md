# Credentials, usage and operations

These controls belong to the independent `/v1` service. New OAuth flows remain
outside this milestone. Consult STATUS.md for what has actually been deployed.

## Personal tokens

Create through an interactive Clerk session with `POST /v1/tokens`. Supply a name,
optional expiry and scopes. The response reveals the token once; storage contains
its hash. New tokens default to `library:read`. A migration preserves the previous
library/subscription capabilities of existing tokens. Revoke with
`DELETE /v1/tokens/{id}`; expiry and revocation are checked on every request.

| Scope                 | Capability                                                     |
| --------------------- | -------------------------------------------------------------- |
| `library:read`        | Library, material, collections, jobs, export and search        |
| `library:write`       | Saves, context, contributions, progress and collection changes |
| `subscriptions:read`  | Read sources and subscriptions                                 |
| `subscriptions:write` | Resolve sources and change subscriptions                       |
| `ops:read`            | Read operational status, usage and alerts                      |
| `ops:manage`          | Evaluate and persist operational alerts                        |
| `events:read`         | Replay owner change receipts                                   |
| `webhooks:manage`     | Configure webhooks and inspect/retry delivery                  |

Write scopes do not imply read scopes. Event, webhook and subscription export sections
require their matching capabilities; the export manifest filters unavailable sections. Personal tokens cannot issue tokens, change
provider credentials or erase the account. Clerk sessions retain interactive user
capabilities. REST enforces permissions for direct calls and internal MCP dispatch.
The inspector currently uses interactive Clerk sign-in.

## Usage controls

`USAGE_LIMITS_JSON` optionally overrides these limits independently per deployment.
An invalid policy fails closed with `503 usage_policy_invalid`.

| Setting                   |                                 Default per owner |
| ------------------------- | ------------------------------------------------: |
| `requestsPerMinute`       |                                             1,200 |
| `callerRequestsPerMinute` | 600 per personal token or interactive contributor |
| `enrichmentPerDay`        |                         1,000 processing attempts |
| `webhookDeliveriesPerDay` |                          10,000 outbound attempts |
| `syncPerDay`              |                        10,000 processing attempts |
| `aiCallsPerDay`           |                                             5,000 |
| `aiSourceBytesPerDay`     |                      32,000,000 UTF-8 input bytes |
| `artifactBytesPerDay`     |             250,000,000 serialized R2 write bytes |

Request counters cover authenticated requests, including denied capabilities. MCP
and alias forwarding count once per incoming operation. Windows align to UTC
minutes or days. Atomic D1 batches reserve related counters together; rejected
reservations consume none. AI and artifact reservations happen before external
execution. Failed external attempts can still consume their reserved allowance.
These controls are usage ceilings, not an invoice or a precise monetary budget.
They do not cap all Cloudflare storage, unauthenticated traffic or provider billing.

Quota errors return `429 usage_limit_exceeded`, `details.metric`,
`details.resetAt`, `Retry-After`, and `X-Usage-Reset-At`. Clients should honor reset
times. Accepted saves survive deferred enrichment. Quota-deferred jobs keep their
failure allowance and become eligible at reset; provider cooldowns still apply.

Content-free counters hash owner/caller identifiers and expire within 48 hours.
They survive account erasure until expiry to prevent quota resets by deletion.
They contain no saved URLs, prompts, content or credential values.

## Operations

- `GET /v1/ops/status`: owner job totals, ready backlog age, expired leases,
  subscription freshness, usage and the shared cron heartbeat.
- `GET /v1/ops/usage`: policy and active counters. A window's limit is its last
  accepted reservation ceiling; the policy reports current configured limits.
- `GET /v1/ops/alerts`: persisted alert state.
- `POST /v1/ops/check`: evaluate and persist current alerts.

Alerts open for failed jobs, ready work older than 15 minutes/expired leases,
active subscriptions overdue by more than an hour, or a missing/older-than-15-minute
successful cron heartbeat, or a failed cron run after its last success. Future quota/provider-deferred work is excluded from
ready backlog age. Old failed jobs keep the failure alert open until addressed.
An alert resolves when the condition clears; a recurrence reopens the same code
and increments its occurrence count. No external notification destination has
been configured. These are durable in-service alerts.

Cron evaluates up to 50 owners per invocation using a rotating cursor. At larger
owner counts, alert freshness includes that rotation delay. This is not an
independent uptime monitor: when Cloudflare cannot run the Worker, use external
health checks. A missing cron is exposed by the status endpoint and the next
successful evaluation. Account erasure removes owner alert state and fences
operations already in progress.

## Reproduce isolated checks

From `apps/api`, run:

```sh
bun run test -- test/scopes.test.ts test/usage.test.ts test/operations.test.ts test/material-durability.test.ts test/openapi.test.ts
bun run typecheck
bun run lint
bun run build
```

These use isolated D1/R2/Worker runtimes and synthetic credentials/providers where
needed. They establish authorization, concurrency, rollback, retry, erasure and
alert cases; they are separate from deployed Clerk/provider acceptance.
