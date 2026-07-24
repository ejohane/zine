import { createDb } from '../db';
import { enqueueArticleBody } from '../article-body/service';
import { ARTICLE_BODY_EXTRACTOR_VERSION } from '../article-body/types';
import { logger } from '../lib/logger';
import type { Bindings } from '../types';

const backfillLogger = logger.child('admin:article-body-backfill');
const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 50;

interface BackfillRow {
  item_id: string;
  provider: string;
  pipeline_status: string | null;
  extractor_version: number | null;
}

export interface ArticleBodyBackfillOptions {
  dryRun?: boolean;
  limit?: number;
  cursor?: string | null;
  traceId?: string;
}

export interface ArticleBodyBackfillCandidate {
  itemId: string;
  provider: string;
  pipelineStatus: string | null;
  extractorVersion: number | null;
}

export interface ArticleBodyBackfillResult {
  dryRun: boolean;
  extractorVersion: number;
  limit: number;
  cursor: string | null;
  nextCursor: string | null;
  scanned: number;
  enqueued: number;
  skipped: number;
  skipReasons: Record<string, number>;
  candidates: ArticleBodyBackfillCandidate[];
}

function normalizeLimit(value: number | undefined): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return DEFAULT_LIMIT;
  return Math.max(1, Math.min(MAX_LIMIT, Math.floor(value)));
}

async function loadCandidates(
  db: D1Database,
  options: { limit: number; cursor: string | null }
): Promise<ArticleBodyBackfillCandidate[]> {
  const cursorClause = options.cursor ? 'AND i.id > ?' : '';
  const statement = db.prepare(`
    SELECT
      i.id AS item_id,
      i.provider,
      abs.status AS pipeline_status,
      abv.extractor_version
    FROM items i
    LEFT JOIN article_body_states abs ON abs.item_id = i.id
    LEFT JOIN article_body_versions abv ON abv.id = abs.current_version_id
    WHERE i.content_type = 'ARTICLE'
      AND (i.canonical_url LIKE 'https://%' OR i.canonical_url LIKE 'http://%')
      AND EXISTS (SELECT 1 FROM user_items ui WHERE ui.item_id = i.id)
      AND (abs.status IS NULL OR abs.status NOT IN ('PENDING', 'PROCESSING'))
      AND (
        abs.status IS NULL
        OR abv.extractor_version IS NULL
        OR abs.status NOT IN ('AVAILABLE', 'DEGRADED')
        OR abv.extractor_version < ?
      )
      ${cursorClause}
    ORDER BY i.id
    LIMIT ?
  `);
  const bound = options.cursor
    ? statement.bind(ARTICLE_BODY_EXTRACTOR_VERSION, options.cursor, options.limit)
    : statement.bind(ARTICLE_BODY_EXTRACTOR_VERSION, options.limit);
  const result = await bound.all<BackfillRow>();
  return (result.results ?? []).map((row) => ({
    itemId: row.item_id,
    provider: row.provider,
    pipelineStatus: row.pipeline_status,
    extractorVersion: row.extractor_version,
  }));
}

export async function backfillArticleBodies(
  env: Pick<Bindings, 'DB' | 'ARTICLE_BODY_PIPELINE_ENABLED' | 'ARTICLE_BODY_QUEUE'>,
  options: ArticleBodyBackfillOptions = {}
): Promise<ArticleBodyBackfillResult> {
  const dryRun = options.dryRun ?? true;
  const limit = normalizeLimit(options.limit);
  const cursor = options.cursor ?? null;
  const candidates = await loadCandidates(env.DB, { limit, cursor });
  let enqueued = 0;
  let skipped = 0;
  const skipReasons: Record<string, number> = {};

  if (!dryRun) {
    const db = createDb(env.DB);
    for (const candidate of candidates) {
      const result = await enqueueArticleBody(db, env, {
        itemId: candidate.itemId,
        trigger: 'backfill',
        traceId: options.traceId,
      });
      if (result.queued) {
        enqueued += 1;
      } else {
        skipped += 1;
        const reason = result.reason ?? 'unknown';
        skipReasons[reason] = (skipReasons[reason] ?? 0) + 1;
      }
    }
  }

  const nextCursor =
    candidates.length === limit ? (candidates[candidates.length - 1]?.itemId ?? null) : null;
  backfillLogger.info('Article-body backfill page processed', {
    dryRun,
    limit,
    cursor,
    nextCursor,
    scanned: candidates.length,
    enqueued,
    skipped,
    skipReasons,
  });

  return {
    dryRun,
    extractorVersion: ARTICLE_BODY_EXTRACTOR_VERSION,
    limit,
    cursor,
    nextCursor,
    scanned: candidates.length,
    enqueued,
    skipped,
    skipReasons,
    candidates,
  };
}

export const articleBodyBackfillInternals = { normalizeLimit, loadCandidates };
