import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { z } from 'zod4';
import { authenticate } from './auth';
import { ApiError, canonicalItemId, id, parseBody } from './lib';
import {
  deleteItem,
  getItem,
  patchItem,
  patchItemSchema,
  progressSchema,
  save,
  saveSchema,
  updateProgress,
} from './items';
import { personalRoutes } from './personal';
import { relationshipRoutes } from './relationships';
import { reconciliationRoutes } from './reconciliation';
import { enrichmentRoutes } from './enrichment';
import { filterSchema, listItems, material, searchItems, searchSchema } from './query';
import { subscriptionRoutes } from './subscriptions';
import { queue, scheduled, dispatchOutbox } from './jobs';
import { memberRoutes } from './members';
import { portabilityRoutes } from './portability';
import { connectionRoutes } from './connections';
import { accessRoutes } from './access';
import { inspector } from './inspector';
import { ProviderError } from './remote';
import { diagnostic } from './diagnostics';
import { mcpHandler } from './mcp';
import { openApiDocument } from './openapi';
import { apiReference } from './docs';
import { architectureGuide } from './architecture';
import type { AppEnv } from './types';
import type { ContentfulStatusCode } from 'hono/utils/http-status';

export const app = new Hono<AppEnv>();
app.use('*', async (c, next) => {
  c.set('requestId', id('req'));
  c.header('X-Request-Id', c.get('requestId'));
  c.header('X-Content-Type-Options', 'nosniff');
  c.header('Referrer-Policy', 'no-referrer');
  c.header('Cache-Control', 'no-store');
  await next();
});
app.use('/v1/*', async (c, next) => {
  const origin = c.req.header('origin');
  const allowed =
    c.env.ALLOWED_ORIGINS?.split(',')
      .map((v) => v.trim())
      .filter(Boolean) ?? [];
  if (origin && !allowed.includes(origin))
    throw new ApiError(403, 'origin_not_allowed', 'Origin is not allowed');
  return cors({
    origin: (origin) => (allowed.includes(origin) ? origin : undefined),
    allowMethods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Authorization', 'Content-Type', 'Idempotency-Key'],
    exposeHeaders: [
      'X-Request-Id',
      'Idempotency-Replayed',
      'X-Zine-Canonical-Item',
      'Content-Location',
    ],
    maxAge: 600,
  })(c, next);
});
app.get('/health', async (c) => {
  await c.env.DB.prepare('SELECT 1').first();
  return c.json({
    service: 'zine-api',
    status: 'ok',
    version: '0.1.0',
    deploymentId: c.env.DEPLOYMENT?.id ?? 'local',
  });
});
app.get('/', (c) => c.html(inspector(c.env, crypto.randomUUID())));
app.get('/openapi.json', (c) => c.json(openApiDocument()));
app.get('/docs', (c) => c.html(apiReference()));
app.get('/architecture', (c) => c.html(architectureGuide()));
app.use('/v1/*', authenticate);
app.use('/v1/*', async (c, next) => {
  const matches = [...c.req.path.matchAll(/\/items\/(itm_[a-f0-9]+)(?=\/|$)/g)];
  let path = c.req.path;
  let canonical: string | undefined;
  for (const match of matches) {
    const resolved = await canonicalItemId(c.env, c.get('principal').userId, match[1]);
    if (resolved !== match[1]) {
      path = path.replace(match[0], `/items/${resolved}`);
      canonical = resolved;
    }
  }
  if (canonical) {
    const url = new URL(c.req.url);
    url.pathname = path;
    const response = await app.fetch(new Request(url, c.req.raw), c.env, c.executionCtx);
    const requestId = response.headers.get('x-request-id');
    if (requestId) {
      c.set('requestId', requestId);
      c.header('X-Request-Id', requestId);
    }
    c.header('X-Zine-Canonical-Item', canonical);
    c.header('Content-Location', url.toString());
    return response;
  }
  await next();
});
app.use('/mcp', authenticate);
app.all('/mcp', async (c) => {
  const origin = c.req.header('origin');
  if (
    origin &&
    !c.env.ALLOWED_ORIGINS.split(',')
      .map((value) => value.trim())
      .includes(origin)
  )
    throw new ApiError(403, 'origin_not_allowed', 'Origin is not allowed');
  const handler = mcpHandler(async (path, method = 'GET', body, key) =>
    app.fetch(
      new Request(`https://api-next.myzine.app${path}`, {
        method,
        headers: {
          authorization: c.req.header('authorization')!,
          ...(body === undefined ? {} : { 'content-type': 'application/json' }),
          ...(key ? { 'idempotency-key': key } : {}),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      }),
      c.env,
      c.executionCtx
    )
  );
  return handler.fetch(c.req.raw);
});
app.get('/v1/me', (c) =>
  c.json({ id: c.get('principal').userId, contributor: c.get('principal').contributor })
);
app.post('/v1/saves', async (c) => {
  const result = await save(
    c.env,
    c.get('principal'),
    await parseBody(c.req.raw, saveSchema),
    c.req.header('idempotency-key')
  );
  if (result.replayed) c.header('Idempotency-Replayed', 'true');
  if (!result.replayed) c.executionCtx.waitUntil(dispatchOutbox(c.env, c.get('principal').userId));
  return c.json(result.body, result.status as ContentfulStatusCode);
});
app.get('/v1/items', async (c) => {
  const q = c.req.query();
  const bool = (key: string) =>
    q[key] === undefined
      ? undefined
      : z
          .enum(['true', 'false'])
          .transform((v) => v === 'true')
          .parse(q[key]);
  const list = (key: string) => q[key]?.split(',').filter(Boolean);
  const filters = filterSchema.parse({
    status: q.status,
    archived: bool('archived'),
    types: list('type'),
    platforms: list('platform'),
    tags: list('tag'),
    tagMatch: q.tagMatch,
    collectionIds: list('collectionId'),
    subscriptionIds: list('subscriptionId'),
    sourceIds: list('sourceId'),
    completed: bool('completed'),
    savedAfter: q.savedAfter,
    savedBefore: q.savedBefore,
    url: q.url,
  });
  const limit = z.coerce.number().int().min(1).max(100).default(50).parse(q.limit);
  return c.json(await listItems(c.env, c.get('principal').userId, filters, limit, q.cursor));
});
app.post('/v1/items/search', async (c) =>
  c.json(
    await searchItems(c.env, c.get('principal').userId, await parseBody(c.req.raw, searchSchema))
  )
);
app.get('/v1/items/:itemId', async (c) => {
  const include = c.req.query('include')?.split(',') ?? [];
  if (
    include.some(
      (value) =>
        !['transcript', 'article', 'thread', 'raw', 'members', 'structuredData'].includes(value)
    )
  )
    throw new ApiError(422, 'invalid_include', 'Unsupported include field');
  return c.json(await getItem(c.env, c.get('principal').userId, c.req.param('itemId'), include));
});
app.patch('/v1/items/:itemId', async (c) =>
  c.json(
    await patchItem(
      c.env,
      c.get('principal').userId,
      c.req.param('itemId'),
      await parseBody(c.req.raw, patchItemSchema)
    )
  )
);
app.delete('/v1/items/:itemId', async (c) => {
  await deleteItem(c.env, c.get('principal').userId, c.req.param('itemId'));
  return c.body(null, 204);
});
app.patch('/v1/items/:itemId/progress', async (c) =>
  c.json(
    await updateProgress(
      c.env,
      c.get('principal'),
      c.req.param('itemId'),
      await parseBody(c.req.raw, progressSchema)
    )
  )
);
for (const field of ['transcript', 'article', 'thread'] as const)
  app.get(`/v1/items/:itemId/${field}`, async (c) =>
    c.json(await material(c.env, c.get('principal').userId, c.req.param('itemId'), field))
  );
app.route('/v1', personalRoutes);
app.route('/v1', relationshipRoutes);
app.route('/v1', reconciliationRoutes);
app.route('/v1', enrichmentRoutes);
app.route('/v1', subscriptionRoutes);
app.route('/v1', accessRoutes);
app.route('/v1', connectionRoutes);
app.route('/v1', portabilityRoutes);
app.route('/v1', memberRoutes);
app.notFound((c) =>
  c.json(
    { error: { code: 'not_found', message: 'Route not found', requestId: c.get('requestId') } },
    404
  )
);
app.onError((error, c) => {
  if (error instanceof ApiError)
    return c.json(
      {
        error: {
          code: error.code,
          message: error.message,
          details: error.details,
          requestId: c.get('requestId'),
        },
      },
      error.status as ContentfulStatusCode
    );
  if (error instanceof z.ZodError)
    return c.json(
      {
        error: {
          code: 'validation_error',
          message: 'Invalid query parameters',
          details: error.issues.map(({ path, message }) => ({ path, message })),
          requestId: c.get('requestId'),
        },
      },
      422
    );
  if (error instanceof ProviderError)
    return c.json(
      {
        error: {
          code: error.code,
          message: 'The source could not be accessed with the current provider capabilities',
          retryable: error.retryable,
          requestId: c.get('requestId'),
        },
      },
      error.retryable ? 503 : 422
    );
  // Provider errors and database exceptions can contain private URLs or values.
  console.error(
    JSON.stringify({
      event: 'request_failed',
      requestId: c.get('requestId'),
      code: 'internal_error',
      diagnostic: diagnostic(error),
    })
  );
  return c.json(
    { error: { code: 'internal_error', message: 'Request failed', requestId: c.get('requestId') } },
    500
  );
});

export default { fetch: app.fetch, queue, scheduled };
