import { Hono } from 'hono';
import { ZodError } from 'zod';
import {
  DeliveryPreferencesSchema,
  PushInstallationInputSchema,
  IssueVisitInputSchema,
  PublicationIdSchema,
  IdempotencyKeySchema,
} from '@zine/shared';
import type { Env } from '../../types';
import { apiAuth } from './auth';
import { PublicationError } from '../../publications/errors';
import {
  listActivity,
  markActivityRead,
  deliveryLimit,
  ensureDeliveryUser,
} from '../../publications/delivery/activity';
import {
  deliveryPreferences,
  setDeliveryPreferences,
  registerInstallation,
  revokeInstallation,
} from '../../publications/delivery/installations';
import { saveIssueSelection, discoveryReferences } from '../../publications/attribution';
import { issueVisit } from '../../publications/visits';
const routes = new Hono<Env>();
const paths = [
  '/me/publication-activity',
  '/me/publication-activity/:id',
  '/me/push-installations/:installationId',
  '/me/publication-delivery-preferences',
  '/issues/:id/visit',
  '/issues/:id/selections/:selectionId/save',
  '/bookmarks/:id/discovery-references',
];
for (const path of paths)
  routes.use(path, async (c, next) => {
    c.header('Cache-Control', 'no-store');
    if (c.req.header('Authorization')?.slice(7).trim().startsWith('zine_pat_'))
      return c.json({ error: 'Forbidden', code: 'FORBIDDEN' }, 403);
    return apiAuth('bookmarks:read')(c, next);
  });
routes.onError((e, c) => {
  const details =
    e instanceof ZodError
      ? { issues: e.issues.map((v) => ({ path: v.path, code: v.code })) }
      : e instanceof PublicationError
        ? e.details
        : undefined;
  if (e instanceof ZodError || e instanceof PublicationError)
    return c.json(
      {
        error: e instanceof ZodError ? 'Invalid input' : e.code,
        code: e instanceof ZodError ? 'INVALID_INPUT' : e.code,
        details,
        requestId: c.get('requestId'),
        traceId: c.get('traceId'),
      },
      e instanceof ZodError ? 400 : e.status
    );
  throw e;
});
type Context = Parameters<ReturnType<typeof apiAuth>>[0];
const identity = (c: Context, name = 'id') => PublicationIdSchema.parse(c.req.param(name));
const envelope = (c: Context, value: object) =>
  c.json({ ...value, requestId: c.get('requestId'), traceId: c.get('traceId') });
async function input(c: Context) {
  if (Number(c.req.header('content-length')) > 16_384)
    throw new PublicationError('PAYLOAD_TOO_LARGE', 413);
  const reader = c.req.raw.body?.getReader();
  if (!reader) throw new PublicationError('INVALID_INPUT', 400);
  let data = '';
  let size = 0;
  const decoder = new TextDecoder();
  try {
    while (true) {
      const r = await reader.read();
      if (r.done) break;
      size += r.value.length;
      if (size > 16_384) throw new PublicationError('PAYLOAD_TOO_LARGE', 413);
      data += decoder.decode(r.value, { stream: true });
    }
    data += decoder.decode();
  } finally {
    await reader.cancel();
    reader.releaseLock();
  }
  try {
    return JSON.parse(data) as unknown;
  } catch {
    throw new PublicationError('INVALID_INPUT', 400);
  }
}
routes.get('/me/publication-activity', async (c) =>
  envelope(
    c,
    await listActivity(
      c.env.DB,
      c.get('userId')!,
      c.req.query('cursor') ? PublicationIdSchema.parse(c.req.query('cursor')) : undefined,
      deliveryLimit(c.req.query('limit'))
    )
  )
);
routes.patch('/me/publication-activity/:id', async (c) =>
  envelope(c, { activity: await markActivityRead(c.env.DB, c.get('userId')!, identity(c)) })
);
routes.get('/me/publication-delivery-preferences', async (c) =>
  envelope(c, { preferences: await deliveryPreferences(c.env.DB, c.get('userId')!) })
);
routes.put('/me/publication-delivery-preferences', async (c) => {
  const body = DeliveryPreferencesSchema.parse(await input(c));
  return envelope(c, {
    preferences: await setDeliveryPreferences(
      c.env.DB,
      c.get('userId')!,
      body.timezone,
      undefined,
      body.initializeOnly
    ),
  });
});
routes.put('/me/push-installations/:installationId', async (c) => {
  const config = c.env as typeof c.env & { APNS_TOPIC?: string };
  return envelope(c, {
    installation: await registerInstallation(
      c.env.DB,
      c.get('userId')!,
      identity(c, 'installationId'),
      PushInstallationInputSchema.parse(await input(c)),
      config.APNS_TOPIC || 'app.zine.native'
    ),
  });
});
routes.delete('/me/push-installations/:installationId', async (c) =>
  envelope(c, {
    installation: await revokeInstallation(
      c.env.DB,
      c.get('userId')!,
      identity(c, 'installationId')
    ),
  })
);
routes.get('/issues/:id/visit', async (c) =>
  envelope(c, { visit: await issueVisit(c.env.DB, c.get('userId')!, identity(c)) })
);
routes.put('/issues/:id/visit', async (c) => {
  const body = IssueVisitInputSchema.parse(await input(c));
  await ensureDeliveryUser(c.env.DB, c.get('userId')!);
  return envelope(c, {
    visit: await issueVisit(c.env.DB, c.get('userId')!, identity(c), body.observedRevision),
  });
});
routes.post('/issues/:id/selections/:selectionId/save', async (c) =>
  envelope(
    c,
    await saveIssueSelection(
      c.env.DB,
      c.get('userId')!,
      identity(c),
      identity(c, 'selectionId'),
      IdempotencyKeySchema.parse(c.req.header('Idempotency-Key'))
    )
  )
);
routes.get('/bookmarks/:id/discovery-references', async (c) =>
  envelope(c, {
    discoveryReferences: await discoveryReferences(c.env.DB, c.get('userId')!, c.req.param('id')),
  })
);
export default routes;
