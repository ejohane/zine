import { and, eq, gt } from 'drizzle-orm';
import { UserItemState } from '@zine/shared';

import type { Database } from '../db';
import { userItems } from '../db/schema';
import { logger } from '../lib/logger';
import type { Bindings } from '../types';
import { syncPeopleForUserItem } from './service';
import { resolveXProfilesForItem } from './social-resolution';

const backfillLogger = logger.child('people-backfill');

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 500;

export interface PeopleBackfillOptions {
  dryRun?: boolean;
  limit?: number;
  cursor?: string | null;
  userId?: string | null;
}

export interface PeopleBackfillResult {
  dryRun: boolean;
  limit: number;
  cursor: string | null;
  nextCursor: string | null;
  scanned: number;
  indexed: number;
  deactivated: number;
  skipped: number;
  socialProfilesLinked: number;
  socialProfileCandidates: number;
  candidates: Array<{
    userItemId: string;
    userId: string;
    itemId: string;
  }>;
}

function normalizeLimit(value: number | undefined): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return DEFAULT_LIMIT;
  return Math.max(1, Math.min(MAX_LIMIT, Math.floor(value)));
}

export async function backfillPeopleIndex(
  db: Database,
  env?: Pick<Bindings, 'X_BEARER_TOKEN'>,
  options: PeopleBackfillOptions = {}
): Promise<PeopleBackfillResult> {
  const dryRun = options.dryRun ?? true;
  const limit = normalizeLimit(options.limit);
  const cursor = options.cursor ?? null;
  const conditions = [eq(userItems.state, UserItemState.BOOKMARKED)];

  if (cursor) {
    conditions.push(gt(userItems.id, cursor));
  }
  if (options.userId) {
    conditions.push(eq(userItems.userId, options.userId));
  }

  const rows = await db
    .select({
      userItemId: userItems.id,
      userId: userItems.userId,
      itemId: userItems.itemId,
    })
    .from(userItems)
    .where(and(...conditions))
    .orderBy(userItems.id)
    .limit(limit);

  let indexed = 0;
  let deactivated = 0;
  let skipped = 0;
  let socialProfilesLinked = 0;
  let socialProfileCandidates = 0;

  if (!dryRun) {
    for (const row of rows) {
      const result = await syncPeopleForUserItem(db, {
        userId: row.userId,
        userItemId: row.userItemId,
      });
      indexed += result.indexed;
      deactivated += result.deactivated;
      skipped += result.skipped;

      if (env) {
        const socialResult = await resolveXProfilesForItem(db, env, { itemId: row.itemId });
        socialProfilesLinked += socialResult.linked;
        socialProfileCandidates += socialResult.candidates;
      }
    }
  }

  const nextCursor = rows.length === limit ? (rows[rows.length - 1]?.userItemId ?? null) : null;

  backfillLogger.info('People backfill page processed', {
    dryRun,
    limit,
    cursor,
    nextCursor,
    scanned: rows.length,
    indexed,
    deactivated,
    skipped,
    socialProfilesLinked,
    socialProfileCandidates,
  });

  return {
    dryRun,
    limit,
    cursor,
    nextCursor,
    scanned: rows.length,
    indexed,
    deactivated,
    skipped,
    socialProfilesLinked,
    socialProfileCandidates,
    candidates: rows,
  };
}
