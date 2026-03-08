# Agent Diagnostics

This is the agent-facing observability runbook for the cross-surface diagnostics implemented from issue `#98`.

## Implemented Surfaces

- Mobile tRPC, OAuth, and offline replay clients now send:
  - `X-Trace-ID`
  - `X-Client-Request-ID`
- Worker HTTP middleware now:
  - preserves or generates `traceId`
  - generates a server `requestId`
  - echoes `X-Trace-ID`, `X-Client-Request-ID`, and `X-Request-ID`
- Async sync jobs now persist telemetry metadata in:
  - sync job KV status
  - queue message payload metadata
  - DLQ entries
- Worker health diagnostics now expose:
  - `GET /health`
  - `GET /health/deps`
  - `GET /health/queues`
- Mobile developer diagnostics now expose:
  - `buildMobileDiagnosticBundle()`
  - Settings > "Share Diagnostics" in development/storybook builds
- Root-level diagnostics commands now expose:
  - `bun run diag:health`
  - `bun run diag:cf:logs -- --trace <id>`
  - `bun run diag:release -- <gitSha|version>`
  - `bun run diag:queue:dlq`
  - `bun run diag:incident -- --trace <id> --out ./tmp/incident-<id>.json`

## One-Command Health Check

Run:

```bash
bun run diag:health
```

Environment overrides:

- `ZINE_DIAG_BASE_URL`: explicit worker base URL
- `ZINE_WORKER_PORT`: local worker port override used when `ZINE_DIAG_BASE_URL` is not set

The command prints machine-readable JSON first and a short summary second.

## Cloudflare Log Queries

Run:

```bash
bun run diag:cf:logs -- --trace trc_123 --since 1h
```

Common filters:

- `--trace <traceId>`
- `--request <requestId>`
- `--client-request <clientRequestId>`
- `--job <jobId>`
- `--release <gitSha|version>`
- `--provider <provider>`
- `--operation <event-or-operation>`
- `--since 15m|1h|24h`

Authentication requirements:

- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_API_TOKEN`
  - Scope should be limited to Workers/log read access for diagnostics.

The wrapper uses the repo-owned Cloudflare Logpull skill and returns redacted JSON lines summarized into a machine-readable report.

## Release Diagnostics

Run:

```bash
bun run diag:release -- abc1234 --since 24h
```

This filters Cloudflare records by `release.version`, `release.gitSha`, `release.buildId`, and `release.channel` fields. Production deploys now stamp:

- `RELEASE_GIT_SHA`
- `RELEASE_BUILD_ID`
- `RELEASE_DEPLOYED_AT`
- `RELEASE_RING`

into worker runtime bindings during GitHub deploys so release-scoped diagnostics are reconstructable from logs.

## Queue / DLQ Diagnostics

Run:

```bash
bun run diag:queue:dlq
```

This fetches `/health/queues`, returns the safe DLQ summary, and keeps the output redacted. Use it before replay or manual queue inspection.

## Incident Bundle

Run:

```bash
bun run diag:incident -- --trace trc_123 --since 1h --out ./tmp/incident-trc_123.json
```

The incident bundle combines:

- worker health/dependency/queue probes
- filtered Cloudflare logs
- a machine-readable verdict
- evidence, candidate fixes, and next queries

The command writes JSON first to stdout and optionally to `--out` for attachment to follow-up issues or agent loops.

## Trace Reconstruction

For async subscription syncs:

1. Start from the mobile-side `traceId` or `clientRequestId`.
2. Find the initiating `subscriptions.syncAllAsync` worker log.
3. Use the returned `jobId` plus persisted job `telemetry`.
4. Inspect queue/DLQ entries for matching `traceId`, `requestId`, and `clientRequestId`.

## Correlation Rules

- `traceId`: logical flow correlation across mobile, worker, queue, and DLQ
- `clientRequestId`: client-originated request identifier
  - offline replay uses the persisted offline action ID here
- `requestId`: worker-generated server request identifier for a single HTTP request

## Expected Signals

- Successful async sync:
  - `subscriptions.sync.queued`
  - `http.request.completed`
- Retryable queue failure:
  - `subscriptions.sync.retry`
- Terminal queue failure:
  - `subscriptions.sync.dlq.batch_received`
  - `subscriptions.sync.dlq.message_failed`

## Workflow: "Sync did nothing"

1. Run `bun run diag:health` to confirm worker, DB, KV, and queue surfaces are reachable.
2. Capture the mobile request trace from the last network trace store or the worker response headers.
3. Run `bun run diag:incident -- --trace <traceId> --since 1h`.
4. If the verdict points at queue backlog or DLQ activity, run `bun run diag:queue:dlq`.
5. If the incident appears tied to a deploy, run `bun run diag:release -- <gitSha|version> --since 24h`.
6. If the message was retried and then DLQ'd, use the stored job error and queue metadata to localize the failing provider/subscription.

## Workflow: "Did this start after release X?"

1. Identify the suspected `gitSha` or release version.
2. Run `bun run diag:release -- <gitSha|version> --since 24h`.
3. Compare error-level operations and providers before/after the suspect window with `bun run diag:cf:logs`.
4. Confirm the same release metadata is present in DLQ summaries or queue-backed failures.

## Retention and Access Model

- Native Cloudflare log availability is useful for short-horizon incidents but should not be treated as indefinite retention.
- Diagnostics commands intentionally avoid dashboard-only workflows so agents can operate from structured command output.
- Use least-privilege Cloudflare API tokens and avoid broad account-scoped credentials for day-to-day diagnosis.
- All command output should be treated as internal-only operational data even after redaction.

## Agent Skill

The canonical skill packaging for these flows lives at:

```text
.codex/skills/zine-observability/SKILL.md
```

Agents should prefer the skill workflow over ad hoc command composition when diagnosing sync, queue, release, or worker incidents.

## Current Gaps

- No deploy marker timeline beyond release metadata stamped into runtime logs yet
- Long-horizon retained-log guarantees still depend on Cloudflare plan/sink decisions outside this repo
