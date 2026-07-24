import type { Bindings } from '../types';
import { isArticleBodyPipelineEnabled } from './service';
import type { ArticleBodyStatus } from './types';

const STATUSES: ArticleBodyStatus[] = [
  'PENDING',
  'PROCESSING',
  'AVAILABLE',
  'DEGRADED',
  'UNAVAILABLE',
];

export interface ArticleBodyHealth {
  status: 'ok' | 'error';
  enabled: boolean;
  configured: boolean;
  states: Record<ArticleBodyStatus, number>;
  dlqCount: number;
  error?: string;
}

function emptyStateCounts(): Record<ArticleBodyStatus, number> {
  return Object.fromEntries(STATUSES.map((status) => [status, 0])) as Record<
    ArticleBodyStatus,
    number
  >;
}

export async function getArticleBodyHealth(env: Bindings): Promise<ArticleBodyHealth> {
  const base = {
    enabled: isArticleBodyPipelineEnabled(env),
    configured: Boolean(env.ARTICLE_BODY_QUEUE),
    states: emptyStateCounts(),
    dlqCount: 0,
  };

  try {
    const [statesResult, dlqResult] = await Promise.all([
      env.DB.prepare(
        'SELECT status, COUNT(*) AS count FROM article_body_states GROUP BY status'
      ).all<{ status: ArticleBodyStatus; count: number }>(),
      env.DB.prepare('SELECT COUNT(*) AS count FROM article_body_dlq_events').first<{
        count: number;
      }>(),
    ]);

    for (const row of statesResult.results) {
      if (STATUSES.includes(row.status)) base.states[row.status] = Number(row.count);
    }

    return {
      status: 'ok',
      ...base,
      dlqCount: Number(dlqResult?.count ?? 0),
    };
  } catch (error) {
    return {
      status: 'error',
      ...base,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
