# Building an experience on Zine

Use the independent `/v1` service. Its production origin is
`https://api-next.myzine.app`; use `https://api-next-staging.myzine.app` for trials.
Read `../docs/STATUS.md` for the current release and provider limitations.

The helper is a small TypeScript fetch client, with no runtime dependency on Worker
code. Types derive from this service's inputs/outputs. A browser experience can
supply its Clerk token callback; a trusted agent/server can receive a scoped PAT
from approved secret injection. Never embed a shared server token in a client app.

```ts
import { ZineClient, ZineError } from './client/index';

const zine = new ZineClient({
  baseUrl: 'https://api-next-staging.myzine.app',
  token: () => getAuthenticatedSessionToken(),
});

// Persist this key in the experience before starting a retryable operation.
const operationKey = crypto.randomUUID();
const receipt = await zine.save(
  {
    url: 'https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API',
    context: { text: 'Useful reference for the API experience I am building.' },
    tags: ['api-experience'],
  },
  operationKey
);

const item = await zine.item(receipt.item.id);
const results = await zine.search({ query: 'Fetch API', match: 'hybrid' });
for await (const saved of zine.items({ tags: ['api-experience'] })) {
  renderSavedReference(saved);
}
```

A successful save means the reference and explicit context are durable. Extraction,
understanding and semantic indexing are asynchronous and may be unavailable for a
source. Read `/items/{id}/jobs` to obtain work IDs. `waitForJob(id)` returns terminal
failed/cancelled states too; inspect `status` and `errorCode`. A wait timeout leaves
the accepted save intact. Keyword search can retrieve explicit context while rich
extraction is pending; semantic visibility also depends on the derived index.

The helper retries reads, search and saves with a stable idempotency key. A retry
inside one save call reuses the same key. Across process restarts, supply the
persisted key again. Other mutations are not retried silently. Long quota resets
return `ZineError` with `code`, `details`, `requestId` and `retryAfterMs`; schedule
later work instead of keeping an interactive request asleep for hours.

```ts
try {
  await zine.save(input, persistedOperationKey);
} catch (error) {
  if (error instanceof ZineError && error.status === 429) {
    scheduleRetry(error.retryAfterMs, persistedOperationKey);
  } else {
    throw error;
  }
}
```

Sources and subscriptions use the same client boundary:

```ts
const source = await zine.request<{
  id: string;
  routes: { id: string }[];
}>('POST', '/v1/sources/resolve', { url: publicSourceUrl });
const subscription = await zine.subscribe({
  sourceId: source.id,
  routeId: source.routes[0].id,
  autoSave: false, // Receive into triage; true saves matching arrivals directly.
});
const initial = await zine.waitForJob(subscription.jobId);
```

Initial intake includes arrivals since subscription creation plus the last
preceding matching publication. Following polls are due 15 minutes after success;
cron, queue and provider delays affect actual timing. Source failures retain prior
items and expose an error/next poll time. Unsubscribe with
`zine.unsubscribe(subscription.id)` when the experience no longer follows it.

Use `library:read` and `library:write` for a saving experience;
`subscriptions:read`/`subscriptions:write` for following sources. Write capabilities
do not automatically grant reads. Event replay and webhooks have their own scopes;
see `../docs/events.md`. Export sections obey those same boundaries, and an export
manifest lists only sections available to that token. Narrow operational tokens
can read service state without accessing library contents.

The existing agent CLI remains available:

```sh
bun run cli help
secretsctl run zine.test -- bun run cli list --limit 5
```

The CLI uses `ZINE_API_TOKEN` when securely injected; otherwise it creates and
closes a real Clerk session through the approved test login. `ZINE_API_BASE_URL`
selects staging. A token for the original `/api/v1` service does not authenticate
this rewrite. The authenticated Inspector, `/docs`, `/openapi.json`, and `/mcp`
provide additional experience entry points.
