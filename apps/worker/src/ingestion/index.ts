/**
 * Scheduled Ingestion Handler
 *
 * This module handles hourly batch ingestion of content from user-subscribed sources.
 * The actual provider fetching (YouTube API, Spotify API, RSS parsing) is not
 * implemented yet - this is the scheduling infrastructure.
 *
 * @see /features/rearch/analysis.md - Gap: Ingestion Pipeline
 * @see /features/subscriptions/spec.md - Ingestion Pipeline section
 */

import { drizzle, type DrizzleD1Database } from 'drizzle-orm/d1';
import { isNull } from 'drizzle-orm';
import type { Bindings } from '../types';
import { sources } from '../db/schema';
import { ingestionLogger } from '../lib/logger';

/**
 * Run a batch ingestion for all active sources across all users.
 *
 * Called by the scheduled handler on an hourly cron schedule.
 * Individual source failures are caught and logged but don't block other sources.
 *
 * Future enhancements:
 * - Add rate limiting per provider
 * - Implement provider-specific fetchers (YouTube, Spotify, RSS)
 * - Add quota tracking for YouTube API
 * - Consider using Cloudflare Queues for more reliable job processing
 */
export async function runIngestionBatch(env: Bindings): Promise<void> {
  const db = drizzle(env.DB);

  ingestionLogger.info('Starting batch ingestion run');
  const startTime = Date.now();

  // Get all active sources (not soft-deleted)
  const activeSources = await db.select().from(sources).where(isNull(sources.deletedAt));

  ingestionLogger.info('Found active sources', { count: activeSources.length });

  let successCount = 0;
  let errorCount = 0;

  // Process each source
  // Note: Could use Promise.allSettled for parallelism, but sequential
  // is safer for rate limiting and easier to debug initially
  for (const source of activeSources) {
    try {
      await ingestSource(db, source);
      successCount++;
    } catch (error) {
      errorCount++;
      ingestionLogger.error('Failed for source', {
        sourceId: source.id,
        provider: source.provider,
        error,
      });
      // Individual failures don't block other sources
    }
  }

  const duration = Date.now() - startTime;
  ingestionLogger.info('Batch complete', {
    succeeded: successCount,
    failed: errorCount,
    durationMs: duration,
  });
}

/**
 * Ingest content from a single source.
 *
 * This is currently a STUB implementation that just logs.
 * Provider-specific fetching will be implemented in future phases.
 *
 * @see /features/subscriptions/spec.md - Phase 3: Alarm-Based Ingestion
 *
 * Future implementation will:
 * 1. Check provider connection token validity
 * 2. Fetch new content from provider API based on source.provider
 * 3. Check idempotency (provider_items_seen table)
 * 4. Create/upsert canonical items
 * 5. Create user_items in INBOX state
 * 6. Update source.last_fetched_at
 */
async function ingestSource(
  _db: DrizzleD1Database,
  source: typeof sources.$inferSelect
): Promise<void> {
  // Stub implementation - actual provider fetching to be implemented later
  ingestionLogger.debug('Would ingest from source', {
    sourceId: source.id,
    provider: source.provider,
    providerId: source.providerId,
    feedUrl: source.feedUrl,
    userId: source.userId,
  });

  // Future: Call provider-specific fetcher based on source.provider
  // switch (source.provider) {
  //   case 'YOUTUBE':
  //     await ingestYouTubeSource(db, source, env);
  //     break;
  //   case 'SPOTIFY':
  //     await ingestSpotifySource(db, source, env);
  //     break;
  //   case 'RSS':
  //   case 'SUBSTACK':
  //     await ingestRssSource(db, source);
  //     break;
  // }
}
