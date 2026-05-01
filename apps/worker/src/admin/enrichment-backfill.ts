import { ENRICHMENT_SCHEMA_VERSION, type EnrichmentQueueMessage } from '../enrichment/types';
import { computeItemContentHash } from '../enrichment/service';
import { logger } from '../lib/logger';
import type { Bindings } from '../types';

const backfillLogger = logger.child('admin:enrichment-backfill');

const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;

type EnrichmentQueue = Queue<EnrichmentQueueMessage>;

interface BackfillRow {
  user_item_id: string;
  user_id: string;
  item_id: string;
  title: string;
  canonical_url: string;
  content_type: string;
  provider: string;
  publisher: string | null;
  summary: string | null;
  article_content_key: string | null;
  creator_name: string | null;
}

export interface EnrichmentBackfillOptions {
  dryRun?: boolean;
  limit?: number;
  cursor?: string | null;
}

export interface EnrichmentBackfillCandidate {
  userItemId: string;
  userId: string;
  itemId: string;
  contentHash: string;
}

export interface EnrichmentBackfillResult {
  dryRun: boolean;
  schemaVersion: number;
  limit: number;
  cursor: string | null;
  nextCursor: string | null;
  scanned: number;
  enqueued: number;
  candidates: EnrichmentBackfillCandidate[];
}

function normalizeLimit(value: number | undefined): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return DEFAULT_LIMIT;
  return Math.max(1, Math.min(MAX_LIMIT, Math.floor(value)));
}

function mapCandidate(row: BackfillRow): EnrichmentBackfillCandidate {
  return {
    userItemId: row.user_item_id,
    userId: row.user_id,
    itemId: row.item_id,
    contentHash: computeItemContentHash({
      title: row.title,
      canonicalUrl: row.canonical_url,
      contentType: row.content_type,
      provider: row.provider,
      publisher: row.publisher,
      summary: row.summary,
      creatorName: row.creator_name,
      articleContentKey: row.article_content_key,
    }),
  };
}

async function loadCandidates(
  db: D1Database,
  options: { limit: number; cursor: string | null }
): Promise<EnrichmentBackfillCandidate[]> {
  const cursorClause = options.cursor ? 'AND ui.id > ?' : '';
  const statement = db.prepare(`
    SELECT
      ui.id AS user_item_id,
      ui.user_id,
      ui.item_id,
      i.title,
      i.canonical_url,
      i.content_type,
      i.provider,
      i.publisher,
      i.summary,
      i.article_content_key,
      c.name AS creator_name
    FROM user_items ui
    INNER JOIN items i ON i.id = ui.item_id
    LEFT JOIN creators c ON c.id = i.creator_id
    LEFT JOIN user_item_enrichments uie
      ON uie.user_item_id = ui.id
     AND uie.schema_version = ?
     AND uie.status = 'COMPLETE'
    WHERE ui.state = 'BOOKMARKED'
      AND uie.id IS NULL
      ${cursorClause}
    ORDER BY ui.id
    LIMIT ?
  `);

  const bound = options.cursor
    ? statement.bind(ENRICHMENT_SCHEMA_VERSION, options.cursor, options.limit)
    : statement.bind(ENRICHMENT_SCHEMA_VERSION, options.limit);
  const result = await bound.all<BackfillRow>();

  return (result.results ?? []).map(mapCandidate);
}

export async function backfillBookmarkEnrichment(
  env: Pick<Bindings, 'DB' | 'ENRICHMENT_QUEUE'>,
  options: EnrichmentBackfillOptions = {}
): Promise<EnrichmentBackfillResult> {
  const dryRun = options.dryRun ?? true;
  const limit = normalizeLimit(options.limit);
  const cursor = options.cursor ?? null;
  const candidates = await loadCandidates(env.DB, { limit, cursor });
  const queue = env.ENRICHMENT_QUEUE as EnrichmentQueue | undefined;

  if (!dryRun && !queue) {
    throw new Error('ENRICHMENT_QUEUE is not configured');
  }

  if (!dryRun && queue) {
    for (const candidate of candidates) {
      const message: EnrichmentQueueMessage = {
        itemId: candidate.itemId,
        userItemId: candidate.userItemId,
        userId: candidate.userId,
        trigger: 'backfill',
        schemaVersion: ENRICHMENT_SCHEMA_VERSION,
        contentHash: candidate.contentHash,
        enqueuedAt: Date.now(),
      };

      await queue.send(message);
    }
  }

  const nextCursor =
    candidates.length === limit ? (candidates[candidates.length - 1]?.userItemId ?? null) : null;

  backfillLogger.info('Bookmark enrichment backfill page processed', {
    dryRun,
    limit,
    cursor,
    nextCursor,
    scanned: candidates.length,
    enqueued: dryRun ? 0 : candidates.length,
  });

  return {
    dryRun,
    schemaVersion: ENRICHMENT_SCHEMA_VERSION,
    limit,
    cursor,
    nextCursor,
    scanned: candidates.length,
    enqueued: dryRun ? 0 : candidates.length,
    candidates,
  };
}
