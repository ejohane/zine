import { and, asc, count, eq, lte, min } from 'drizzle-orm';
import { ulid } from 'ulid';
import { createDb, type Database } from '../db';
import { bookmarkEnrichmentOutbox } from '../db/schema';
import { logger } from '../lib/logger';
import type { Bindings } from '../types';
import { enqueueBookmarkEnrichment } from './service';

const RETRY_DELAY_MS = 5 * 60 * 1000;
const MAX_DELIVERIES = 25;

/** Include this statement in the same batch as the saved-state write. */
export function bookmarkEnrichmentIntent(
  db: Database,
  input: {
    userId: string;
    userItemId: string;
    itemId: string;
    trigger: 'manual_save' | 'inbox_bookmark';
  }
) {
  const now = Date.now();
  return db
    .insert(bookmarkEnrichmentOutbox)
    .values({
      id: ulid(),
      ...input,
      createdAt: now,
      nextAttemptAt: now,
    })
    .onConflictDoNothing({ target: bookmarkEnrichmentOutbox.userItemId });
}

/** Best-effort delivery only: the durable intent remains if queue delivery fails.
 * Delivery is at least once; the enrichment consumer already reuses completed
 * content hashes. A crash after send and before delete can redeliver a message.
 */
export async function dispatchBookmarkEnrichment(
  ctx: {
    db: Database;
    env: Bindings;
    requestId: string;
    traceId: string;
  },
  owner?: { userId: string; userItemId: string }
) {
  if (!ctx.env.ENRICHMENT_QUEUE) return;
  try {
    const now = Date.now();
    const pending = await ctx.db
      .select()
      .from(bookmarkEnrichmentOutbox)
      .where(
        and(
          lte(bookmarkEnrichmentOutbox.nextAttemptAt, now),
          owner ? eq(bookmarkEnrichmentOutbox.userId, owner.userId) : undefined,
          owner ? eq(bookmarkEnrichmentOutbox.userItemId, owner.userItemId) : undefined
        )
      )
      .orderBy(asc(bookmarkEnrichmentOutbox.nextAttemptAt))
      .limit(owner ? 1 : MAX_DELIVERIES);
    for (const entry of pending) {
      // Conditional claim prevents concurrent requests/cron runs sending the same
      // intent. Expiring the claim also recovers from a terminated Worker.
      const claimed = await ctx.db
        .update(bookmarkEnrichmentOutbox)
        .set({ nextAttemptAt: Date.now() + RETRY_DELAY_MS })
        .where(
          and(
            eq(bookmarkEnrichmentOutbox.id, entry.id),
            lte(bookmarkEnrichmentOutbox.nextAttemptAt, now)
          )
        )
        .returning({ id: bookmarkEnrichmentOutbox.id });
      if (!claimed.length) continue;
      try {
        await enqueueBookmarkEnrichment({ ...ctx, userId: entry.userId }, entry);
        await ctx.db
          .delete(bookmarkEnrichmentOutbox)
          .where(eq(bookmarkEnrichmentOutbox.id, entry.id));
      } catch (error) {
        logger.warn('Bookmark enrichment delivery deferred', {
          userItemId: entry.userItemId,
          error,
        });
      }
    }
  } catch (error) {
    // A delivery/read failure must not turn a committed save into an API error.
    logger.warn('Bookmark enrichment outbox unavailable', { error });
  }
}

export async function retryBookmarkEnrichment(env: Bindings) {
  await dispatchBookmarkEnrichment({
    db: createDb(env.DB),
    env,
    requestId: 'scheduled-enrichment-outbox',
    traceId: ulid(),
  });
}

/** Aggregate-only operational readback; no user/item identifiers are exposed. */
export async function getBookmarkEnrichmentHealth(env: Bindings) {
  const configured = Boolean(env.ENRICHMENT_QUEUE);
  try {
    const [summary] = await createDb(env.DB)
      .select({
        pending: count(),
        oldestAt: min(bookmarkEnrichmentOutbox.createdAt),
      })
      .from(bookmarkEnrichmentOutbox);
    const stalled =
      summary.pending > 0 &&
      (!configured ||
        (summary.oldestAt !== null && summary.oldestAt < Date.now() - 30 * 60 * 1000));
    return { status: stalled ? ('degraded' as const) : ('ok' as const), configured, ...summary };
  } catch {
    return { status: 'error' as const, configured, pending: null, oldestAt: null };
  }
}
