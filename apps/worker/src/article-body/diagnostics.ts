import type { Bindings } from '../types';
import { getArticleBodyEnrollmentMode, isArticleBodyPipelineEnabled } from './service';
import type {
  ArticleBodyEnrollmentMode,
  ArticleBodySourceKind,
  ArticleBodyStatus,
  ArticleBodyTrigger,
} from './types';

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
  enrollmentMode: ArticleBodyEnrollmentMode;
  configured: boolean;
  states: Record<ArticleBodyStatus, number>;
  oldestPendingAt: string | null;
  terminalLatencyMs: { sampleCount: number; average: number | null; maximum: number | null };
  outcomesByTrigger: Partial<
    Record<ArticleBodyTrigger, Partial<Record<ArticleBodyStatus, number>>>
  >;
  sourceKinds: Partial<Record<ArticleBodySourceKind, number>>;
  failureCodes: Array<{ code: string; count: number }>;
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
    enrollmentMode: getArticleBodyEnrollmentMode(env),
    configured: Boolean(env.ARTICLE_BODY_QUEUE),
    states: emptyStateCounts(),
    oldestPendingAt: null,
    terminalLatencyMs: { sampleCount: 0, average: null, maximum: null },
    outcomesByTrigger: {},
    sourceKinds: {},
    failureCodes: [],
    dlqCount: 0,
  };

  try {
    const [
      statesResult,
      dlqResult,
      oldestPendingResult,
      latencyResult,
      triggerResult,
      sourceResult,
      failureResult,
    ] = await Promise.all([
      env.DB.prepare(
        'SELECT status, COUNT(*) AS count FROM article_body_states GROUP BY status'
      ).all<{ status: ArticleBodyStatus; count: number }>(),
      env.DB.prepare('SELECT COUNT(*) AS count FROM article_body_dlq_events').first<{
        count: number;
      }>(),
      env.DB.prepare(
        "SELECT MIN(COALESCE(requested_at, updated_at)) AS timestamp FROM article_body_states WHERE status IN ('PENDING', 'PROCESSING')"
      ).first<{ timestamp: number | null }>(),
      env.DB.prepare(
        'SELECT COUNT(*) AS count, AVG(terminal_at - requested_at) AS average, MAX(terminal_at - requested_at) AS maximum FROM article_body_states WHERE requested_at IS NOT NULL AND terminal_at IS NOT NULL'
      ).first<{ count: number; average: number | null; maximum: number | null }>(),
      env.DB.prepare(
        'SELECT enrollment_trigger AS trigger, status, COUNT(*) AS count FROM article_body_states WHERE enrollment_trigger IS NOT NULL GROUP BY enrollment_trigger, status'
      ).all<{ trigger: ArticleBodyTrigger; status: ArticleBodyStatus; count: number }>(),
      env.DB.prepare(
        'SELECT v.source_kind AS sourceKind, COUNT(*) AS count FROM article_body_states s JOIN article_body_versions v ON v.id = s.current_version_id GROUP BY v.source_kind'
      ).all<{ sourceKind: ArticleBodySourceKind; count: number }>(),
      env.DB.prepare(
        'SELECT last_error_code AS code, COUNT(*) AS count FROM article_body_states WHERE last_error_code IS NOT NULL GROUP BY last_error_code ORDER BY count DESC LIMIT 5'
      ).all<{ code: string; count: number }>(),
    ]);

    for (const row of statesResult.results) {
      if (STATUSES.includes(row.status)) base.states[row.status] = Number(row.count);
    }

    const outcomesByTrigger: ArticleBodyHealth['outcomesByTrigger'] = {};
    for (const row of triggerResult.results) {
      outcomesByTrigger[row.trigger] = {
        ...outcomesByTrigger[row.trigger],
        [row.status]: Number(row.count),
      };
    }
    const sourceKinds: ArticleBodyHealth['sourceKinds'] = {};
    for (const row of sourceResult.results) sourceKinds[row.sourceKind] = Number(row.count);

    return {
      status: 'ok',
      ...base,
      oldestPendingAt: oldestPendingResult?.timestamp
        ? new Date(Number(oldestPendingResult.timestamp)).toISOString()
        : null,
      terminalLatencyMs: {
        sampleCount: Number(latencyResult?.count ?? 0),
        average: latencyResult?.average == null ? null : Math.round(Number(latencyResult.average)),
        maximum: latencyResult?.maximum == null ? null : Math.round(Number(latencyResult.maximum)),
      },
      outcomesByTrigger,
      sourceKinds,
      failureCodes: failureResult.results.map((row) => ({
        code: row.code,
        count: Number(row.count),
      })),
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
