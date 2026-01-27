---
name: cloudflare-logpull
description: Pull recent Cloudflare Workers logs on demand using the Logpull API, with optional filtering for quick incident triage.
version: 1.0.0
license: MIT
---

# Cloudflare Logpull (Workers)

Use this skill when you need to fetch recent Cloudflare Workers logs without persistent storage.

## Requirements

- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_API_TOKEN` (Logs read access)

Optional:

- `CLOUDFLARE_LOGPULL_DATASET` (default: `workers_trace_events`)
- `CLOUDFLARE_LOGPULL_BASE_URL` (default: `https://api.cloudflare.com/client/v4`)
- `CLOUDFLARE_LOGPULL_ENDPOINT` (override full endpoint)
- `CLOUDFLARE_LOGPULL_FIELDS` (comma list of fields)
- `CLOUDFLARE_LOGPULL_TIME_FORMAT` (`rfc3339` or `unix`, default: `rfc3339`)

## Script

Use `.opencode/skill/cloudflare-logpull/logpull-logs.py` to pull logs on demand.

Examples:

```bash
# Last 15 minutes
python3 .opencode/skill/cloudflare-logpull/logpull-logs.py --since 15m

# Last 2 hours, filter by worker and 5xx
python3 .opencode/skill/cloudflare-logpull/logpull-logs.py --since 2h --worker api-worker --status 500

# Exact window
python3 .opencode/skill/cloudflare-logpull/logpull-logs.py --from "2026-01-27T12:00:00Z" --to "2026-01-27T12:15:00Z"

# Find a Ray ID
python3 .opencode/skill/cloudflare-logpull/logpull-logs.py --since 30m --ray 7b38d7c69f1b3a28
```

## Notes

- Logpull is best for short windows; use it to triage incidents quickly.
- If the account uses a different dataset or endpoint, set the env vars above.
- Avoid long windows unless necessary to keep responses small.
