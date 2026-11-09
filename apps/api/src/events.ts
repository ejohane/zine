import { Hono } from 'hono';
import { z } from 'zod4';
import {
  all,
  ApiError,
  atomicOwnerWrite,
  id,
  now,
  operationGeneration,
  parseBody,
  stmt,
} from './lib';
import { publicUrl } from './identity';
import { ProviderError, validateDns } from './remote';
import { openWebhookSecret, sealWebhookSecret, webhookSignature } from './webhook-crypto';
import { reserveUsage, UsageLimitError, usagePolicy } from './usage';
import type { AppEnv, Env } from './types';

export const eventSchema = z.object({
  id: z.string(),
  sequence: z.string(),
  type: z.string(),
  subjectId: z.string(),
  occurredAt: z.string(),
  data: z.record(z.string(), z.unknown()),
});
export const webhookInputSchema = z.object({ url: z.string().url().max(8192) }).strict();
export const webhookPatchSchema = z.object({ enabled: z.boolean() }).strict();
export const webhookSchema = z.object({
  id: z.string(),
  url: z.string(),
  enabled: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
  errorCode: z.string().nullable(),
});
interface EventRow {
  sequence: number;
  id: string;
  owner_id: string;
  type: string;
  subject_id: string;
  data_json: string;
  occurred_at: string;
}
interface Hook {
  id: string;
  owner_id: string;
  url: string;
  secret_envelope: string;
  enabled: number;
  revision: number;
  last_sequence: number;
  last_error_code: string | null;
  created_at: string;
  updated_at: string;
}
interface Delivery {
  id: string;
  owner_id: string;
  webhook_id: string;
  event_sequence: number;
  status: string;
  attempts: number;
  available_at: string;
  lease_token: string | null;
}
const eventView = (row: EventRow): z.infer<typeof eventSchema> => ({
  id: row.id,
  sequence: String(row.sequence),
  type: row.type,
  subjectId: row.subject_id,
  occurredAt: row.occurred_at,
  data: JSON.parse(row.data_json),
});
const hookView = (row: Hook) => ({
  id: row.id,
  url: row.url,
  enabled: !!row.enabled,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  errorCode: row.last_error_code,
});
async function ownedHook(env: Env, owner: string, hookId: string) {
  const row = await stmt(
    env.DB,
    'SELECT * FROM webhooks WHERE owner_id=? AND id=?',
    owner,
    hookId
  ).first<Hook>();
  if (!row) throw new ApiError(404, 'not_found', 'Webhook not found');
  return row;
}
export async function eventPage(env: Env, owner: string, after = 0, limit = 50) {
  const floor = Number(
    (await stmt(
      env.DB,
      'SELECT min_sequence FROM event_retention WHERE owner_id=?',
      owner
    ).first<number>('min_sequence')) ?? '0'
  );
  if (after > 0 && after < floor)
    throw new ApiError(
      410,
      'event_cursor_expired',
      'Replay retention elapsed; reconcile the library and restart replay'
    );
  const rows = await all<EventRow>(
    env.DB,
    'SELECT * FROM service_events WHERE owner_id=? AND sequence>? ORDER BY sequence LIMIT ?',
    owner,
    after,
    limit + 1
  );
  const page = rows.slice(0, limit);
  return {
    events: page.map(eventView),
    nextCursor: String(page.at(-1)?.sequence ?? after),
    hasMore: rows.length > limit,
    retentionDays: 30,
  };
}
export async function createWebhook(env: Env, owner: string, url: string) {
  const epoch = await operationGeneration(env, owner),
    target = publicUrl(url);
  if (target.protocol !== 'https:')
    throw new ApiError(422, 'unsafe_url', 'Webhook destinations require HTTPS');
  await validateDns(target.hostname);
  const hookId = id('wh'),
    secret =
      'whsec_' +
      Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) =>
        b.toString(16).padStart(2, '0')
      ).join('');
  const envelope = await sealWebhookSecret(env, owner, hookId, secret),
    timestamp = now(),
    guard = id('webhook_limit');
  try {
    await atomicOwnerWrite(
      env,
      owner,
      [
        stmt(
          env.DB,
          'INSERT INTO webhook_guards(id,within_limit) SELECT ?,COUNT(*)<10 FROM webhooks WHERE owner_id=?',
          guard,
          owner
        ),
        stmt(
          env.DB,
          `INSERT INTO webhooks(id,owner_id,url,secret_envelope,last_sequence,created_at,updated_at) VALUES(?,?,?,?,MAX(COALESCE((SELECT MAX(sequence) FROM service_events),0),COALESCE((SELECT MAX(min_sequence) FROM event_retention),0)),?,?)`,
          hookId,
          owner,
          target.toString(),
          envelope,
          timestamp,
          timestamp
        ),
        stmt(env.DB, 'DELETE FROM webhook_guards WHERE id=?', guard),
      ],
      epoch
    );
  } catch (error) {
    if (String(error).includes('CHECK constraint failed: within_limit=1'))
      throw new ApiError(409, 'webhook_limit', 'At most ten webhooks can be configured per owner');
    throw error;
  }
  return { ...hookView(await ownedHook(env, owner, hookId)), secret };
}
export async function fanoutWebhook(env: Env, hook: Hook) {
  const epoch = await operationGeneration(env, hook.owner_id);
  const floor = Number(
    (await stmt(
      env.DB,
      'SELECT min_sequence FROM event_retention WHERE owner_id=?',
      hook.owner_id
    ).first<number>('min_sequence')) ?? '0'
  );
  if (hook.last_sequence < floor) {
    await atomicOwnerWrite(
      env,
      hook.owner_id,
      [
        stmt(
          env.DB,
          "UPDATE webhooks SET enabled=0,revision=revision+1,last_error_code='event_retention_gap',updated_at=? WHERE id=? AND owner_id=? AND revision=?",
          now(),
          hook.id,
          hook.owner_id,
          hook.revision
        ),
        stmt(
          env.DB,
          "UPDATE webhook_deliveries SET status='cancelled',lease_token=NULL,lease_until=NULL,updated_at=? WHERE webhook_id=? AND owner_id=? AND status IN ('pending','running')",
          now(),
          hook.id,
          hook.owner_id
        ),
      ],
      epoch
    );
    return;
  }
  const events = await all<EventRow>(
    env.DB,
    'SELECT * FROM service_events WHERE owner_id=? AND sequence>? ORDER BY sequence LIMIT 100',
    hook.owner_id,
    hook.last_sequence
  );
  if (!events.length) return;
  const timestamp = now();
  await atomicOwnerWrite(
    env,
    hook.owner_id,
    [
      ...events.map((event) =>
        stmt(
          env.DB,
          `INSERT OR IGNORE INTO webhook_deliveries(id,owner_id,webhook_id,event_sequence,status,available_at,created_at,updated_at)
      SELECT ?,owner_id,id,?,'pending',?,?,? FROM webhooks WHERE id=? AND owner_id=? AND enabled=1 AND revision=?`,
          'dlv_' + hook.id + '_' + event.id,
          event.sequence,
          timestamp,
          timestamp,
          timestamp,
          hook.id,
          hook.owner_id,
          hook.revision
        )
      ),
      stmt(
        env.DB,
        'UPDATE webhooks SET last_sequence=MAX(last_sequence,?) WHERE id=? AND owner_id=? AND enabled=1 AND revision=?',
        events.at(-1)!.sequence,
        hook.id,
        hook.owner_id,
        hook.revision
      ),
    ],
    epoch
  );
}
export async function deliverWebhook(env: Env, deliveryId: string) {
  const delivery = await stmt(
    env.DB,
    'SELECT * FROM webhook_deliveries WHERE id=?',
    deliveryId
  ).first<Delivery>();
  if (!delivery) return;
  const owner = delivery.owner_id,
    epoch = await operationGeneration(env, owner),
    lease = id('whlease'),
    timestamp = now();
  const claimed = await stmt(
    env.DB,
    `UPDATE webhook_deliveries SET status='running',lease_token=?,lease_until=?,attempts=attempts+1,updated_at=?
    WHERE id=? AND available_at<=? AND (status='pending' OR (status='running' AND lease_until<?))
    AND EXISTS(SELECT 1 FROM webhooks w WHERE w.id=webhook_id AND w.enabled=1)`,
    lease,
    new Date(Date.now() + 120000).toISOString(),
    timestamp,
    deliveryId,
    timestamp,
    timestamp
  ).run();
  if (!claimed.meta.changes) return;
  let statusCode: number | null = null,
    errorCode: string | null = null,
    resetAt: string | undefined;
  const attempt = delivery.attempts + 1;
  try {
    const hook = await ownedHook(env, owner, delivery.webhook_id);
    const event = await stmt(
      env.DB,
      'SELECT * FROM service_events WHERE sequence=? AND owner_id=?',
      delivery.event_sequence,
      owner
    ).first<EventRow>();
    if (!hook.enabled || !event) return;
    const url = publicUrl(hook.url);
    if (url.protocol !== 'https:')
      throw new ApiError(422, 'unsafe_url', 'Webhook destinations require HTTPS');
    await validateDns(url.hostname);
    const secret = await openWebhookSecret(env, owner, hook.id, hook.secret_envelope);
    const body = JSON.stringify({ deliveryId, event: eventView(event) }),
      sentAt = String(Math.floor(Date.now() / 1000));
    const signature = await webhookSignature(secret, sentAt, body);
    await reserveUsage(env, owner, [
      {
        metric: 'webhook_deliveries',
        amount: 1,
        limit: usagePolicy(env).webhookDeliveriesPerDay,
        periodSeconds: 86400,
      },
    ]);
    // Recheck the lease, endpoint revision and owner epoch immediately before external I/O.
    const live = await stmt(
      env.DB,
      `SELECT 1 AS ok FROM webhook_deliveries d JOIN webhooks w ON w.id=d.webhook_id
      WHERE d.id=? AND d.lease_token=? AND d.status='running' AND w.enabled=1 AND w.revision=?
      AND COALESCE((SELECT generation FROM owner_generations WHERE owner_id=?),0)=?`,
      deliveryId,
      lease,
      hook.revision,
      owner,
      epoch
    ).first();
    if (!live) return;
    const response = await fetch(url.toString(), {
      method: 'POST',
      redirect: 'manual',
      signal: AbortSignal.timeout(20000),
      headers: {
        'content-type': 'application/json',
        'user-agent': 'ZineWebhook/1.0',
        'x-zine-delivery': deliveryId,
        'x-zine-timestamp': sentAt,
        'x-zine-signature': signature,
      },
      body,
    });
    statusCode = response.status;
    await response.body?.cancel();
    if (!response.ok)
      errorCode =
        response.status >= 300 && response.status < 400
          ? 'webhook_redirect_rejected'
          : 'webhook_http_error';
  } catch (error) {
    if (error instanceof UsageLimitError) {
      resetAt = error.resetAt;
      errorCode = error.code;
    } else
      errorCode =
        error instanceof ProviderError
          ? error.code
          : error instanceof ApiError
            ? error.code
            : 'webhook_delivery_error';
  }
  const succeeded = statusCode !== null && statusCode >= 200 && statusCode < 300;
  await atomicOwnerWrite(
    env,
    owner,
    [
      stmt(
        env.DB,
        `UPDATE webhook_deliveries SET status=?,available_at=?,lease_token=NULL,lease_until=NULL,http_status=?,error_code=?,attempts=attempts-?,updated_at=?
    WHERE id=? AND owner_id=? AND lease_token=? AND status='running' AND EXISTS(SELECT 1 FROM webhooks w WHERE w.id=webhook_id AND w.enabled=1)`,
        succeeded ? 'succeeded' : !resetAt && attempt >= 8 ? 'failed' : 'pending',
        resetAt ??
          new Date(Date.now() + Math.min(3600, 60 * 2 ** (attempt - 1)) * 1000).toISOString(),
        statusCode,
        errorCode,
        resetAt ? 1 : 0,
        now(),
        deliveryId,
        owner,
        lease
      ),
    ],
    epoch
  );
}
export async function scheduledWebhooks(env: Env) {
  const cursor =
    (await stmt(
      env.DB,
      "SELECT value FROM service_state WHERE name='webhook_cursor'"
    ).first<string>('value')) ?? '';
  const hooks = await all<Hook>(
    env.DB,
    'SELECT * FROM webhooks WHERE enabled=1 AND id>? ORDER BY id LIMIT 25',
    cursor
  );
  for (const hook of hooks) {
    try {
      await fanoutWebhook(env, hook);
    } catch (error) {
      if (!(error instanceof ApiError && error.code === 'account_data_erased')) throw error;
    }
  }
  await stmt(
    env.DB,
    "INSERT INTO service_state(name,value) VALUES('webhook_cursor',?) ON CONFLICT(name) DO UPDATE SET value=excluded.value",
    hooks.length === 25 ? hooks.at(-1)!.id : ''
  ).run();
  const pending = await all<{ id: string }>(
    env.DB,
    `SELECT id FROM webhook_deliveries WHERE available_at<=? AND (status='pending' OR(status='running' AND lease_until<?)) ORDER BY available_at,id LIMIT 25`,
    now(),
    now()
  );
  for (const row of pending) {
    try {
      await deliverWebhook(env, row.id);
    } catch (error) {
      if (!(error instanceof ApiError && error.code === 'account_data_erased')) throw error;
    }
  }
  const cutoff = new Date(Date.now() - 30 * 86400000).toISOString();
  await env.DB.batch([
    stmt(
      env.DB,
      `INSERT INTO event_retention(owner_id,min_sequence) SELECT owner_id,MAX(sequence) FROM service_events WHERE occurred_at<? GROUP BY owner_id
        ON CONFLICT(owner_id) DO UPDATE SET min_sequence=MAX(event_retention.min_sequence,excluded.min_sequence)`,
      cutoff
    ),
    stmt(env.DB, 'DELETE FROM service_events WHERE occurred_at<?', cutoff),
  ]);
}
export const eventRoutes = new Hono<AppEnv>();
eventRoutes.get('/events', async (c) =>
  c.json(
    await eventPage(
      c.env,
      c.get('principal').userId,
      z.coerce
        .number()
        .int()
        .min(0)
        .max(Number.MAX_SAFE_INTEGER)
        .default(0)
        .parse(c.req.query('cursor')),
      z.coerce.number().int().min(1).max(100).default(50).parse(c.req.query('limit'))
    )
  )
);
eventRoutes.post('/webhooks', async (c) =>
  c.json(
    await createWebhook(
      c.env,
      c.get('principal').userId,
      (await parseBody(c.req.raw, webhookInputSchema)).url
    ),
    201
  )
);
eventRoutes.get('/webhooks', async (c) =>
  c.json({
    webhooks: (
      await all<Hook>(
        c.env.DB,
        'SELECT * FROM webhooks WHERE owner_id=? ORDER BY id',
        c.get('principal').userId
      )
    ).map(hookView),
  })
);
eventRoutes.patch('/webhooks/:hookId', async (c) => {
  const owner = c.get('principal').userId,
    hookId = c.req.param('hookId'),
    input = await parseBody(c.req.raw, webhookPatchSchema);
  await ownedHook(c.env, owner, hookId);
  await atomicOwnerWrite(c.env, owner, [
    stmt(
      c.env.DB,
      'UPDATE webhooks SET enabled=?,revision=revision+1,last_error_code=NULL,last_sequence=MAX(COALESCE((SELECT MAX(sequence) FROM service_events),0),COALESCE((SELECT MAX(min_sequence) FROM event_retention),0)),updated_at=? WHERE id=? AND owner_id=?',
      input.enabled ? 1 : 0,
      now(),
      hookId,
      owner
    ),
    stmt(
      c.env.DB,
      "UPDATE webhook_deliveries SET status='cancelled',lease_token=NULL,lease_until=NULL,updated_at=? WHERE webhook_id=? AND owner_id=? AND status IN('pending','running')",
      now(),
      hookId,
      owner
    ),
  ]);
  return c.json(hookView(await ownedHook(c.env, owner, hookId)));
});
eventRoutes.delete('/webhooks/:hookId', async (c) => {
  const owner = c.get('principal').userId,
    hookId = c.req.param('hookId');
  await ownedHook(c.env, owner, hookId);
  await atomicOwnerWrite(c.env, owner, [
    stmt(c.env.DB, 'DELETE FROM webhooks WHERE id=? AND owner_id=?', hookId, owner),
  ]);
  return c.body(null, 204);
});
eventRoutes.get('/webhooks/:hookId/deliveries', async (c) => {
  const owner = c.get('principal').userId,
    hookId = c.req.param('hookId');
  await ownedHook(c.env, owner, hookId);
  const limit = z.coerce.number().int().min(1).max(100).default(50).parse(c.req.query('limit'));
  const rows = await all(
    c.env.DB,
    `SELECT id,event_sequence AS eventSequence,status,attempts,available_at AS availableAt,http_status AS httpStatus,error_code AS errorCode,created_at AS createdAt,updated_at AS updatedAt
    FROM webhook_deliveries WHERE webhook_id=? AND owner_id=? AND id>? ORDER BY id LIMIT ?`,
    hookId,
    owner,
    c.req.query('cursor') ?? '',
    limit + 1
  );
  return c.json({
    deliveries: rows.slice(0, limit),
    nextCursor: rows.length > limit ? (rows[limit - 1] as { id: string }).id : null,
  });
});
eventRoutes.post('/webhooks/:hookId/deliveries/:deliveryId/retry', async (c) => {
  const owner = c.get('principal').userId,
    hook = await ownedHook(c.env, owner, c.req.param('hookId'));
  if (!hook.enabled)
    throw new ApiError(409, 'webhook_disabled', 'Enable the webhook before retrying');
  const result = await atomicOwnerWrite(c.env, owner, [
    stmt(
      c.env.DB,
      "UPDATE webhook_deliveries SET status='pending',attempts=0,available_at=?,error_code=NULL,updated_at=? WHERE id=? AND webhook_id=? AND owner_id=? AND status='failed'",
      now(),
      now(),
      c.req.param('deliveryId'),
      hook.id,
      owner
    ),
  ]);
  if (!result[0].meta.changes)
    throw new ApiError(409, 'delivery_not_failed', 'Only a failed owned delivery can be retried');
  return c.json({ queued: true });
});

eventRoutes.post('/webhooks/:hookId/dispatch', async (c) => {
  const owner = c.get('principal').userId,
    hook = await ownedHook(c.env, owner, c.req.param('hookId'));
  if (!hook.enabled)
    throw new ApiError(409, 'webhook_disabled', 'Enable the webhook before dispatching');
  await fanoutWebhook(c.env, hook);
  const due = await all<{ id: string }>(
    c.env.DB,
    "SELECT id FROM webhook_deliveries WHERE owner_id=? AND webhook_id=? AND available_at<=? AND (status='pending' OR (status='running' AND lease_until<?)) ORDER BY event_sequence LIMIT 5",
    owner,
    hook.id,
    now(),
    now()
  );
  c.executionCtx.waitUntil(
    (async () => {
      for (const row of due) await deliverWebhook(c.env, row.id);
    })()
  );
  return c.json({ accepted: true, candidates: due.length }, 202);
});
