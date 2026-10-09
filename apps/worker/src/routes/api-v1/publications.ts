import { runPublicationDelivery } from '../../publications/delivery/service';
import { logger } from '../../lib/logger';
import { Hono } from 'hono';
import { ZodError } from 'zod';
import type { MiddlewareHandler } from 'hono';
import {
  CreatePublicationSchema,
  PatchPublicationSchema,
  CreateIssueSchema,
  PatchIssueSchema,
  PublishIssueSchema,
  PublicationPageInputSchema,
  IdempotencyKeySchema,
  SubscriptionPreferenceSchema,
  PublicationIdSchema,
} from '@zine/shared';
import type { Env } from '../../types';
import { apiAuth } from './auth';
import { PublicationService } from '../../publications/service';
import { PublicationError } from '../../publications/errors';
import { issueProjection, publicationProjection } from '../../publications/projections';
import { subscription } from '../../publications/subscriptions';
import {
  uploadCover,
  publicCover,
  privateCover,
  purgeRetiredCovers,
} from '../../publications/assets';
import type { IssueRow } from '../../publications/model';
const routes = new Hono<Env>();
const clerkOnly: MiddlewareHandler<Env> = async (c, next) => {
  if (
    c.req.header('Authorization')?.startsWith('Bearer ') &&
    c.req.header('Authorization')?.slice(7).trim().startsWith('zine_pat_')
  )
    return c.json(
      {
        error: 'Forbidden',
        code: 'FORBIDDEN',
        requestId: c.get('requestId'),
        traceId: c.get('traceId'),
      },
      403
    );
  return apiAuth('bookmarks:read')(c, next);
};
routes.onError((e, c) => {
  if (e instanceof ZodError)
    return c.json(
      {
        error: 'Invalid input',
        code: 'INVALID_INPUT',
        details: { issues: e.issues.map((v) => ({ path: v.path, code: v.code })) },
        requestId: c.get('requestId'),
        traceId: c.get('traceId'),
      },
      400
    );
  if (e instanceof PublicationError)
    return c.json(
      {
        error: e.code,
        code: e.code,
        details: e.details,
        requestId: c.get('requestId'),
        traceId: c.get('traceId'),
      },
      e.status
    );
  throw e;
});
const privatePaths = [
  '/me/publication',
  '/me/publication/*',
  '/me/issues/*',
  '/me/publication-assets',
  '/me/publication-assets/*',
  '/me/publication-subscriptions',
];
for (const path of [...privatePaths, '/publications/*', '/issues/*', '/publication-assets/*'])
  routes.use(path, async (c, next) => {
    c.header('Cache-Control', 'no-store');
    await next();
  });
for (const path of privatePaths) routes.use(path, clerkOnly);
routes.use('/publications/:id/subscription', clerkOnly);
const jsonInput = async (c: Parameters<MiddlewareHandler<Env>>[0]) => {
  if (Number(c.req.header('content-length')) > 256 * 1024)
    throw new PublicationError('PAYLOAD_TOO_LARGE', 413);
  const reader = c.req.raw.body?.getReader();
  if (!reader) throw new PublicationError('INVALID_INPUT', 400);
  let size = 0;
  const chunks: Uint8Array[] = [];
  try {
    while (true) {
      const r = await reader.read();
      if (r.done) break;
      size += r.value.length;
      if (size > 256 * 1024) throw new PublicationError('PAYLOAD_TOO_LARGE', 413);
      chunks.push(r.value);
    }
  } finally {
    await reader.cancel();
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const v of chunks) {
    bytes.set(v, offset);
    offset += v.length;
  }
  try {
    return JSON.parse(new TextDecoder().decode(bytes)) as unknown;
  } catch {
    throw new PublicationError('INVALID_INPUT', 400);
  }
};
const service = (c: Parameters<MiddlewareHandler<Env>>[0]) => new PublicationService(c.env.DB);
const key = (c: Parameters<MiddlewareHandler<Env>>[0]) =>
  IdempotencyKeySchema.parse(c.req.header('Idempotency-Key'));
const page = (c: Parameters<MiddlewareHandler<Env>>[0]) =>
  PublicationPageInputSchema.parse(c.req.query());
const owner = (c: Parameters<MiddlewareHandler<Env>>[0]) => c.get('userId')!;
const identity = (c: Parameters<MiddlewareHandler<Env>>[0], name = 'id') =>
  PublicationIdSchema.parse(c.req.param(name));
const envelope = (c: Parameters<MiddlewareHandler<Env>>[0], value: unknown) =>
  c.json({
    ...(value as Record<string, unknown>),
    requestId: c.get('requestId'),
    traceId: c.get('traceId'),
  });
routes.get('/me/publication', async (c) =>
  envelope(c, {
    publication: publicationProjection(await service(c).repo.ownPublication(owner(c)), true),
  })
);
routes.post('/me/publication', async (c) =>
  envelope(
    c,
    await service(c).createPublication(
      owner(c),
      CreatePublicationSchema.parse(await jsonInput(c)),
      key(c)
    )
  )
);
routes.patch('/me/publication', async (c) =>
  envelope(
    c,
    await service(c).patchPublication(
      owner(c),
      PatchPublicationSchema.parse(await jsonInput(c)),
      key(c)
    )
  )
);
routes.post('/me/publication/issues', async (c) => {
  const input = CreateIssueSchema.parse(await jsonInput(c));
  return envelope(c, await service(c).createIssue(owner(c), input.title, key(c)));
});
routes.get('/me/issues/:id', async (c) =>
  envelope(c, { issue: issueProjection(await service(c).repo.issue(identity(c), owner(c)), true) })
);
routes.patch('/me/issues/:id', async (c) =>
  envelope(
    c,
    await service(c).mutateIssue(
      owner(c),
      identity(c),
      PatchIssueSchema.parse(await jsonInput(c)),
      key(c),
      'patch'
    )
  )
);
routes.delete('/me/issues/:id', async (c) => {
  const result = await service(c).mutateIssue(
    owner(c),
    identity(c),
    PublishIssueSchema.parse(await jsonInput(c)),
    key(c),
    'delete'
  );
  await purgeRetiredCovers(c.env, owner(c));
  return envelope(c, result);
});
routes.post('/me/issues/:id/publish', async (c) => {
  const result = await service(c).mutateIssue(
    owner(c),
    identity(c),
    PublishIssueSchema.parse(await jsonInput(c)),
    key(c),
    'publish'
  );
  // The outbox is durable; background delivery failure never rolls back publication.
  // Hono's direct request test harness has no execution context; full Worker requests do.
  let context: ExecutionContext | undefined;
  try {
    context = c.executionCtx;
  } catch {
    /* isolated route harness */
  }
  if (context)
    context.waitUntil(
      runPublicationDelivery(c.env).catch(() => {
        logger.warn('Publication delivery deferred to durable retry');
      })
    );
  return envelope(c, result);
});
routes.get('/publications/:id', async (c) =>
  envelope(c, {
    publication: publicationProjection(await service(c).repo.publication(identity(c))),
  })
);
routes.get('/issues/:id', async (c) =>
  envelope(c, { issue: issueProjection(await service(c).repo.issue(identity(c))) })
);
for (const path of ['/me/publication/issues', '/publications/:id/issues'])
  routes.get(path, async (c) => {
    const s = service(c),
      p = path.startsWith('/me')
        ? await s.repo.ownPublication(owner(c))
        : await s.repo.publication(identity(c)),
      query = page(c),
      privateRead = path.startsWith('/me');
    const rows = await c.env.DB.prepare(
      `SELECT * FROM personal_issues WHERE publication_id=? AND unavailable_at IS NULL ${privateRead ? '' : "AND status='PUBLISHED'"} ${query.cursor ? 'AND id<?' : ''} ORDER BY id DESC LIMIT ?`
    )
      .bind(p.id, ...(query.cursor ? [query.cursor] : []), query.limit + 1)
      .all<IssueRow>();
    const items = await Promise.all(
      rows.results
        .slice(0, query.limit)
        .map(async (r) =>
          issueProjection(await s.repo.issue(r.id, privateRead ? owner(c) : undefined), privateRead)
        )
    );
    return envelope(c, {
      issues: items,
      nextCursor: rows.results.length > query.limit ? rows.results[query.limit - 1].id : null,
    });
  });
for (const [method, action] of [
  ['get', 'get'],
  ['put', 'subscribe'],
  ['patch', 'mute'],
  ['delete', 'end'],
] as const)
  routes[method]('/publications/:id/subscription', async (c) =>
    envelope(c, {
      subscription: await subscription(
        c.env.DB,
        owner(c),
        identity(c),
        action,
        action === 'mute' ? SubscriptionPreferenceSchema.parse(await jsonInput(c)).muted : false
      ),
    })
  );
routes.get('/me/publication/subscribers', async (c) => {
  const p = await service(c).repo.ownPublication(owner(c)),
    query = page(c);
  // Private identities; never expose emails or reuse this projection publicly.
  const rows = await c.env.DB.prepare(
    `SELECT subscriber_id,generation,subscribed_at FROM personal_publication_subscriptions WHERE publication_id=? AND ended_at IS NULL ${query.cursor ? 'AND subscriber_id>?' : ''} ORDER BY subscriber_id LIMIT ?`
  )
    .bind(p.id, ...(query.cursor ? [query.cursor] : []), query.limit + 1)
    .all<{ subscriber_id: string; generation: number; subscribed_at: number }>();
  return envelope(c, {
    subscribers: rows.results.slice(0, query.limit).map((r) => ({
      userId: r.subscriber_id,
      generation: r.generation,
      subscribedAt: new Date(r.subscribed_at).toISOString(),
    })),
    nextCursor:
      rows.results.length > query.limit ? rows.results[query.limit - 1].subscriber_id : null,
  });
});
routes.get('/me/publication-subscriptions', async (c) => {
  const query = page(c),
    rows = await c.env.DB.prepare(
      `SELECT s.publication_id FROM personal_publication_subscriptions s JOIN personal_publications p ON p.id=s.publication_id WHERE s.subscriber_id=? AND s.ended_at IS NULL AND p.unavailable_at IS NULL ${query.cursor ? 'AND s.publication_id>?' : ''} ORDER BY s.publication_id LIMIT ?`
    )
      .bind(owner(c), ...(query.cursor ? [query.cursor] : []), query.limit + 1)
      .all<{ publication_id: string }>();
  return envelope(c, {
    subscriptions: await Promise.all(
      rows.results
        .slice(0, query.limit)
        .map((r) => subscription(c.env.DB, owner(c), r.publication_id, 'get'))
    ),
    nextCursor:
      rows.results.length > query.limit ? rows.results[query.limit - 1].publication_id : null,
  });
});
routes.post('/me/publication-assets', async (c) =>
  envelope(c, await uploadCover(c.env, owner(c), c.req.raw))
);
routes.get('/me/publication-assets/:id', async (c) => privateCover(c.env, owner(c), identity(c)));
routes.get('/publication-assets/:id', async (c) => publicCover(c.env, identity(c)));
export default routes;
