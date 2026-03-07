import { getDLQSummary } from '../sync/dlq-consumer';
import type { Bindings } from '../types';

type CheckStatus = 'ok' | 'error';

interface DependencyCheck {
  status: CheckStatus;
  durationMs: number;
  error?: string;
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function checkDb(db: D1Database): Promise<DependencyCheck> {
  const startedAt = Date.now();

  try {
    await db.prepare('SELECT 1 as ok').first();
    return {
      status: 'ok',
      durationMs: Date.now() - startedAt,
    };
  } catch (error) {
    return {
      status: 'error',
      durationMs: Date.now() - startedAt,
      error: formatError(error),
    };
  }
}

async function checkKv(kv: KVNamespace): Promise<DependencyCheck> {
  const startedAt = Date.now();

  try {
    await kv.get('__healthcheck__');
    return {
      status: 'ok',
      durationMs: Date.now() - startedAt,
    };
  } catch (error) {
    return {
      status: 'error',
      durationMs: Date.now() - startedAt,
      error: formatError(error),
    };
  }
}

export async function getDependencyHealth(env: Bindings) {
  const [database, oauthStateKv] = await Promise.all([
    checkDb(env.DB),
    checkKv(env.OAUTH_STATE_KV),
  ]);
  const status = database.status === 'ok' && oauthStateKv.status === 'ok' ? 'ok' : 'degraded';

  return {
    status,
    dependencies: {
      database,
      oauthStateKv,
    },
  };
}

export async function getQueueHealth(env: Bindings) {
  const dlqSummary = await getDLQSummary(env.OAUTH_STATE_KV);

  return {
    status: dlqSummary.count > 0 ? 'degraded' : 'ok',
    queues: {
      sync: {
        configured: Boolean(env.SYNC_QUEUE),
      },
      dlq: {
        count: dlqSummary.count,
        oldestAt: dlqSummary.oldestAt,
        newestAt: dlqSummary.newestAt,
        recent: dlqSummary.recent.slice(0, 5).map((entry) => ({
          deadLetteredAt: entry.deadLetteredAt,
          attempts: entry.attempts,
          provider: entry.message.provider,
          release: entry.message.meta?.release,
        })),
      },
    },
  };
}
