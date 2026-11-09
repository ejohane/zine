import { z } from 'zod4';
import type { MiddlewareHandler } from 'hono';
import { all, ApiError, atomicOwnerWrite, digest, id, stmt } from './lib';
import type { AppEnv, Env } from './types';

const policySchema = z
  .object({
    webhookDeliveriesPerDay: z.number().int().min(1).max(1000000).default(10000),
    requestsPerMinute: z.number().int().min(1).max(1000000).default(1200),
    callerRequestsPerMinute: z.number().int().min(1).max(1000000).default(600),
    enrichmentPerDay: z.number().int().min(1).max(1000000).default(1000),
    syncPerDay: z.number().int().min(1).max(1000000).default(10000),
    aiCallsPerDay: z.number().int().min(1).max(1000000).default(5000),
    artifactBytesPerDay: z.number().int().min(1).max(1000000000).default(250000000),
    aiSourceBytesPerDay: z.number().int().min(1).max(1000000000).default(32000000),
  })
  .strict();
export function usagePolicy(env: Env) {
  try {
    return policySchema.parse(env.USAGE_LIMITS_JSON ? JSON.parse(env.USAGE_LIMITS_JSON) : {});
  } catch {
    throw new ApiError(503, 'usage_policy_invalid', 'Usage controls are not configured correctly');
  }
}
export class UsageLimitError extends ApiError {
  constructor(
    public metric: string,
    public resetAt: string
  ) {
    super(429, 'usage_limit_exceeded', 'The usage limit for this capability has been reached', {
      metric,
      resetAt,
    });
  }
  get retryAfterSeconds() {
    return Math.max(1, Math.ceil((Date.parse(this.resetAt) - Date.now()) / 1000));
  }
}
export const usageOwnerKey = (owner: string) => digest('usage-owner:' + owner);
interface Charge {
  metric: string;
  amount: number;
  limit: number;
  periodSeconds: number;
  subject?: string;
}

/** Counters and ceiling checks commit atomically; a rejected multi-counter charge changes nothing. */
export async function reserveUsage(env: Env, owner: string, charges: Charge[], at = Date.now()) {
  if (!charges.length) return;
  const ownerKey = await usageOwnerKey(owner);
  const guard = id('usage');
  const windows = await Promise.all(
    charges.map(async (charge) => {
      if (
        !Number.isSafeInteger(charge.amount) ||
        charge.amount < 1 ||
        !Number.isSafeInteger(charge.limit) ||
        charge.limit < 1
      )
        throw new Error('Invalid usage charge');
      const start = Math.floor(at / (charge.periodSeconds * 1000)) * charge.periodSeconds * 1000;
      return {
        ...charge,
        subjectKey: charge.subject ? 'caller:' + (await digest(charge.subject)) : 'owner',
        start: new Date(start).toISOString(),
        resetAt: new Date(start + charge.periodSeconds * 1000).toISOString(),
        expiresAt: new Date(start + charge.periodSeconds * 1000 + 86400000).toISOString(),
      };
    })
  );
  const writes = [];
  for (const window of windows) {
    writes.push(
      stmt(
        env.DB,
        `INSERT INTO usage_windows(owner_key,subject_key,metric,window_start,reset_at,expires_at,used,ceiling) VALUES(?,?,?,?,?,?,?,?)
    ON CONFLICT(owner_key,subject_key,metric,window_start) DO UPDATE SET used=usage_windows.used+excluded.used,ceiling=excluded.ceiling`,
        ownerKey,
        window.subjectKey,
        window.metric,
        window.start,
        window.resetAt,
        window.expiresAt,
        window.amount,
        window.limit
      )
    );
  }
  writes.push(
    stmt(
      env.DB,
      'INSERT INTO usage_guards(id,allowed) SELECT ?,NOT EXISTS(SELECT 1 FROM usage_windows WHERE owner_key=? AND used>ceiling)',
      guard,
      ownerKey
    )
  );
  writes.push(stmt(env.DB, 'DELETE FROM usage_guards WHERE id=?', guard));
  try {
    await atomicOwnerWrite(env, owner, writes);
  } catch (error) {
    if (!String(error).includes('CHECK constraint failed: allowed=1')) throw error;
    let exceeded = windows[0];
    for (const window of windows) {
      const used =
        (await stmt(
          env.DB,
          'SELECT used FROM usage_windows WHERE owner_key=? AND subject_key=? AND metric=? AND window_start=?',
          ownerKey,
          window.subjectKey,
          window.metric,
          window.start
        ).first<number>('used')) ?? 0;
      if (used + window.amount > window.limit) {
        exceeded = window;
        break;
      }
    }
    throw new UsageLimitError(exceeded.metric, exceeded.resetAt);
  }
}
export const accountRequestUsage: MiddlewareHandler<AppEnv> = async (c, next) => {
  const principal = c.get('principal');
  if (c.env.OPERATION_USAGE_OWNER !== principal.userId) {
    const policy = usagePolicy(c.env);
    await reserveUsage(c.env, principal.userId, [
      { metric: 'requests', amount: 1, limit: policy.requestsPerMinute, periodSeconds: 60 },
      {
        metric: 'requests',
        amount: 1,
        limit: policy.callerRequestsPerMinute,
        periodSeconds: 60,
        subject: principal.tokenId ?? 'session:' + principal.contributor,
      },
    ]);
    c.env = { ...c.env, OPERATION_USAGE_OWNER: principal.userId };
  }
  await next();
};
export async function reserveAIUsage(env: Env, owner: string, source: string[]) {
  const policy = usagePolicy(env),
    bytes = source.reduce((sum, text) => sum + new TextEncoder().encode(text).length, 0);
  await reserveUsage(env, owner, [
    { metric: 'ai_calls', amount: 1, limit: policy.aiCallsPerDay, periodSeconds: 86400 },
    ...(bytes
      ? [
          {
            metric: 'ai_source_bytes',
            amount: bytes,
            limit: policy.aiSourceBytesPerDay,
            periodSeconds: 86400,
          },
        ]
      : []),
  ]);
}
export async function reserveArtifactUsage(env: Env, owner: string, serialized: string) {
  const bytes = new TextEncoder().encode(serialized).length;
  if (bytes)
    await reserveUsage(env, owner, [
      {
        metric: 'artifact_write_bytes',
        amount: bytes,
        limit: usagePolicy(env).artifactBytesPerDay,
        periodSeconds: 86400,
      },
    ]);
}
export async function reserveSourceJob(env: Env, owner: string, kind: 'enrich' | 'sync') {
  const policy = usagePolicy(env);
  await reserveUsage(env, owner, [
    {
      metric: kind === 'sync' ? 'sync_jobs' : 'enrichment_jobs',
      amount: 1,
      limit: kind === 'sync' ? policy.syncPerDay : policy.enrichmentPerDay,
      periodSeconds: 86400,
    },
  ]);
}
export async function usageSummary(env: Env, owner: string) {
  const windows = await all<{
    subject_key: string;
    metric: string;
    window_start: string;
    reset_at: string;
    used: number;
    ceiling: number;
  }>(
    env.DB,
    'SELECT subject_key,metric,window_start,reset_at,used,ceiling FROM usage_windows WHERE owner_key=? AND reset_at>? ORDER BY metric,subject_key',
    await usageOwnerKey(owner),
    new Date().toISOString()
  );
  return {
    policy: usagePolicy(env),
    windows: windows.map((row) => ({
      metric: row.metric,
      subject: row.subject_key,
      windowStart: row.window_start,
      resetAt: row.reset_at,
      used: row.used,
      limit: row.ceiling,
    })),
    accounting: 'Calls, processing attempts and UTF-8 source bytes; not a currency bill',
    retention:
      'Content-free hashed-owner counters expire within 48 hours and remain across account erasure to prevent quota reset abuse',
  };
}
