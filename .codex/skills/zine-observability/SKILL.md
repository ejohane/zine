---
name: zine-observability
description: Diagnose Zine mobile, worker, queue, and release incidents using the repo-owned observability commands and runbooks.
---

# Zine Observability

Use this skill when you need deterministic, machine-readable diagnostics for Zine incidents instead of ad hoc dashboard clicking.

## When to Use

Use this skill for:

- Worker health regressions
- Trace/request/job correlation checks
- Release-scoped regression diagnosis
- Queue and DLQ triage
- Incident bundle generation for agent reasoning or issue follow-up

## Requirements

Base worker diagnostics:

- `bun`
- local or remote worker reachable via `ZINE_DIAG_BASE_URL` or `ZINE_WORKER_PORT`

Cloudflare log diagnostics:

- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_API_TOKEN`
  - keep scopes limited to Workers/log read access

## Core Commands

### Health

```bash
bun run diag:health
```

Returns JSON first, then a short summary line. Use this before deeper incident work.

### Trace / Request / Job Logs

```bash
bun run diag:cf:logs -- --trace trc_123 --since 1h
bun run diag:cf:logs -- --request req_123 --since 30m
bun run diag:cf:logs -- --job 01J... --provider YOUTUBE --since 2h
```

Accepted filters:

- `--trace`
- `--request`
- `--client-request`
- `--job`
- `--release`
- `--provider`
- `--operation`
- `--since`
- `--from` + `--to`

### Release Diagnostics

```bash
bun run diag:release -- abc1234 --since 24h
```

Use this to answer whether a regression clusters around a specific release version or git SHA.

### Queue / DLQ

```bash
bun run diag:queue:dlq
```

This returns the worker's safe DLQ summary from `/health/queues`.

### Incident Bundle

```bash
bun run diag:incident -- --trace trc_123 --since 1h --out ./tmp/incident-trc_123.json
```

This combines health probes, filtered Cloudflare logs, and a machine-readable verdict with evidence and next queries.

## Output Contract

All commands follow the same contract:

1. Print strict JSON first.
2. Print one short summary line second.

For incident-style reasoning, prefer outputs that include:

- `verdict`
- `confidence`
- `evidence[]`
- `candidateFixes[]`
- `nextQueries[]`

## Recommended Workflows

### "User tapped Sync, nothing happened"

1. Run `bun run diag:health`.
2. Get the mobile `traceId` or `clientRequestId`.
3. Run `bun run diag:incident -- --trace <traceId> --since 1h`.
4. If the verdict mentions queue backlog, run `bun run diag:queue:dlq`.
5. If a release looks suspicious, run `bun run diag:release -- <gitSha|version> --since 24h`.

### "Did release X break sync?"

1. Run `bun run diag:release -- <gitSha|version> --since 24h`.
2. Inspect error-level operations and provider clusters in the JSON summary.
3. Follow up with `bun run diag:incident -- --release <gitSha|version> --provider <provider>`.

## Safety Rules

- Treat command output as internal operational data.
- Do not paste raw secrets or auth headers into follow-up issues.
- Prefer the repo commands over manual dashboard browsing so evidence remains reproducible.
- If Cloudflare credentials are missing, fall back to `diag:health` and state that historical worker logs were unavailable.
