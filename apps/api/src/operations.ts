import { Hono } from 'hono';
import { z } from 'zod4';
import { all, ApiError, atomicOwnerWrite, now, operationGeneration, stmt } from './lib';
import { usageSummary } from './usage';
import { scheduleIndexes, dispatchOutbox } from './jobs';
import type { AppEnv, Env } from './types';

export const alertCodes = [
  'queue_stalled',
  'jobs_failed',
  'subscriptions_stale',
  'cron_stale',
  'cron_failed',
] as const;
export const alertSchema = z.object({
  code: z.enum(alertCodes),
  status: z.enum(['open', 'resolved']),
  firstSeenAt: z.string(),
  lastSeenAt: z.string(),
  resolvedAt: z.string().nullable(),
  occurrences: z.number().int(),
});

/** Owner projections contain aggregate counts, never another owner's jobs or source URLs. */
export async function operationalStatus(env: Env, owner: string) {
  const timestamp = now();
  const [jobs, subscriptions, heartbeat, usage, indexing] = await Promise.all([
    stmt(
      env.DB,
      `SELECT COUNT(*) AS total,
      COALESCE(SUM(status='failed'),0) AS failed,
      COALESCE(SUM(status='pending' AND available_at<=?),0) AS ready,
      COALESCE(SUM(status='running' AND lease_until<?),0) AS expiredLeases,
      MIN(CASE WHEN status='pending' AND available_at<=? THEN available_at END) AS oldestReadyAt
      FROM jobs WHERE owner_id=?`,
      timestamp,
      timestamp,
      timestamp,
      owner
    ).first<{
      total: number;
      failed: number;
      ready: number;
      expiredLeases: number;
      oldestReadyAt: string | null;
    }>(),
    stmt(
      env.DB,
      `SELECT COUNT(*) AS active,
      COALESCE(SUM(next_poll_at<?),0) AS stale,
      COALESCE(SUM(last_error_code IS NOT NULL),0) AS errors,
      MIN(last_success_at) AS oldestSuccessAt FROM subscriptions WHERE owner_id=? AND status='active'`,
      new Date(Date.now() - 3600000).toISOString(),
      owner
    ).first<{
      active: number;
      stale: number;
      errors: number;
      oldestSuccessAt: string | null;
    }>(),
    stmt(
      env.DB,
      'SELECT started_at,succeeded_at,failed_at,error_category FROM service_checks WHERE name=?',
      'cron'
    ).first<{
      started_at: string;
      succeeded_at: string | null;
      failed_at: string | null;
      error_category: string | null;
    }>(),
    usageSummary(env, owner),
    stmt(
      env.DB,
      `SELECT COUNT(*) AS total,COALESCE(SUM(r.requested_revision>r.indexed_revision),0) AS dirty FROM index_requests r JOIN personal_items p ON p.id=r.item_id WHERE p.owner_id=?`,
      owner
    ).first<{ total: number; dirty: number }>(),
  ]);
  const oldestReadyAgeSeconds = jobs?.oldestReadyAt
    ? Math.max(0, Math.floor((Date.now() - Date.parse(jobs.oldestReadyAt)) / 1000))
    : 0;
  const cronAgeSeconds = heartbeat?.succeeded_at
    ? Math.max(0, Math.floor((Date.now() - Date.parse(heartbeat.succeeded_at)) / 1000))
    : null;
  const conditions = {
    queue_stalled: oldestReadyAgeSeconds > 900 || (jobs?.expiredLeases ?? 0) > 0,
    jobs_failed: (jobs?.failed ?? 0) > 0,
    subscriptions_stale: (subscriptions?.stale ?? 0) > 0,
    cron_stale: cronAgeSeconds === null || cronAgeSeconds > 900,
    cron_failed:
      !!heartbeat?.failed_at &&
      (!heartbeat.succeeded_at || heartbeat.failed_at > heartbeat.succeeded_at),
  };
  return {
    observedAt: timestamp,
    deploymentId: env.DEPLOYMENT?.id ?? 'local',
    environment: env.ENVIRONMENT,
    jobs: { ...jobs!, oldestReadyAgeSeconds },
    subscriptions: subscriptions!,
    cron: {
      lastStartedAt: heartbeat?.started_at ?? null,
      lastSucceededAt: heartbeat?.succeeded_at ?? null,
      lastFailedAt: heartbeat?.failed_at ?? null,
      errorCategory: heartbeat?.error_category ?? null,
      ageSeconds: cronAgeSeconds,
    },
    conditions,
    indexing: indexing!,
    usage,
    scope:
      'Owner aggregates and shared scheduler heartbeat; ready work excludes quota/provider-deferred jobs until their due time',
  };
}

export async function checkOperations(env: Env, owner: string) {
  const epoch = await operationGeneration(env, owner);
  const status = await operationalStatus(env, owner);
  await atomicOwnerWrite(
    env,
    owner,
    alertCodes.map((code) =>
      status.conditions[code]
        ? stmt(
            env.DB,
            `INSERT INTO operational_alerts(owner_id,code,status,first_seen_at,last_seen_at) VALUES(?,?,'open',?,?)
      ON CONFLICT(owner_id,code) DO UPDATE SET status='open',
      first_seen_at=CASE WHEN operational_alerts.status='resolved' THEN excluded.first_seen_at ELSE operational_alerts.first_seen_at END,
      last_seen_at=excluded.last_seen_at,resolved_at=NULL,
      occurrences=operational_alerts.occurrences+CASE WHEN operational_alerts.status='resolved' THEN 1 ELSE 0 END`,
            owner,
            code,
            status.observedAt,
            status.observedAt
          )
        : stmt(
            env.DB,
            `UPDATE operational_alerts SET status='resolved',resolved_at=?,last_seen_at=? WHERE owner_id=? AND code=? AND status='open'`,
            status.observedAt,
            status.observedAt,
            owner,
            code
          )
    ),
    epoch
  );
  return { status, alerts: await listAlerts(env, owner) };
}
export function listAlerts(env: Env, owner: string) {
  return all<z.infer<typeof alertSchema>>(
    env.DB,
    `SELECT code,status,first_seen_at AS firstSeenAt,last_seen_at AS lastSeenAt,resolved_at AS resolvedAt,occurrences FROM operational_alerts WHERE owner_id=? ORDER BY code`,
    owner
  );
}
export const operationsRoutes = new Hono<AppEnv>();
operationsRoutes.get('/ops/status', async (c) =>
  c.json(await operationalStatus(c.env, c.get('principal').userId))
);
operationsRoutes.get('/ops/usage', async (c) =>
  c.json(await usageSummary(c.env, c.get('principal').userId))
);
operationsRoutes.get('/ops/alerts', async (c) =>
  c.json({ alerts: await listAlerts(c.env, c.get('principal').userId) })
);
operationsRoutes.post('/ops/check', async (c) =>
  c.json(await checkOperations(c.env, c.get('principal').userId))
);

/** A bounded rotating owner scan prevents a large account set from exhausting a cron invocation. */
export async function scheduledOperations(env: Env) {
  const cursor =
    (await stmt(env.DB, "SELECT value FROM service_state WHERE name='ops_cursor'").first<string>(
      'value'
    )) ?? '';
  const owners = await all<{ owner_id: string; generation: number }>(
    env.DB,
    `SELECT o.owner_id,COALESCE(g.generation,0) AS generation FROM (SELECT owner_id FROM jobs UNION SELECT owner_id FROM subscriptions) o LEFT JOIN owner_generations g ON g.owner_id=o.owner_id WHERE o.owner_id>? ORDER BY o.owner_id LIMIT 50`,
    cursor
  );
  for (const { owner_id: owner, generation } of owners) {
    try {
      await checkOperations({ ...env, OPERATION_EPOCH: { owner, generation } }, owner);
    } catch (error) {
      if (!(error instanceof ApiError && error.code === 'account_data_erased')) throw error;
    }
  }
  await stmt(
    env.DB,
    "INSERT INTO service_state(name,value) VALUES('ops_cursor',CASE WHEN EXISTS(SELECT 1 FROM jobs WHERE owner_id=?) OR EXISTS(SELECT 1 FROM subscriptions WHERE owner_id=?) THEN ? ELSE '' END) ON CONFLICT(name) DO UPDATE SET value=excluded.value",
    owners.length === 50 ? owners.at(-1)!.owner_id : '',
    owners.length === 50 ? owners.at(-1)!.owner_id : '',
    owners.length === 50 ? owners.at(-1)!.owner_id : ''
  ).run();
}

operationsRoutes.post('/ops/index/rebuild', async (c) => {
  if (!c.env.VECTORS)
    throw new ApiError(503, 'semantic_index_not_configured', 'Search index is not configured');
  const owner = c.get('principal').userId;
  const result = await atomicOwnerWrite(c.env, owner, [
    stmt(
      c.env.DB,
      `INSERT INTO index_requests(item_id) SELECT id FROM personal_items WHERE owner_id=?
    ON CONFLICT(item_id) DO UPDATE SET requested_revision=index_requests.requested_revision+1`,
      owner
    ),
  ]);
  c.executionCtx.waitUntil(scheduleIndexes(c.env, owner).then(() => dispatchOutbox(c.env, owner)));
  return c.json({ queued: true, items: result[0].meta.changes }, 202);
});
