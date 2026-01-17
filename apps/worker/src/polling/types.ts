/**
 * Polling Types
 *
 * Shared types and interfaces for the polling system.
 * Used by scheduler.ts and provider-specific pollers.
 *
 * @see /features/subscriptions/backend-spec.md Section 3: Polling Architecture
 */

import type { DrizzleD1Database } from 'drizzle-orm/d1';
import type * as schema from '../db/schema';
import type { subscriptions } from '../db/schema';
import type { Bindings } from '../types';
import { YOUTUBE_SHORTS_MAX_DURATION_SECONDS } from '@zine/shared';

// ============================================================================
// Database Types
// ============================================================================

/**
 * Database type with full schema inference
 */
export type DrizzleDB = DrizzleD1Database<typeof schema>;

/**
 * Subscription row from database
 */
export type Subscription = typeof subscriptions.$inferSelect;

// ============================================================================
// Polling Result Types
// ============================================================================

/**
 * Result of polling a single subscription
 */
export interface PollingResult {
  /** Number of new items ingested */
  newItems: number;
}

/**
 * Result of processing a provider batch
 */
export interface BatchResult {
  /** Number of subscriptions processed */
  processed: number;
  /** Number of new items ingested */
  newItems: number;
  /** Number of subscriptions skipped (e.g., delta detection) */
  skipped?: number;
}

// ============================================================================
// Batch Polling Types
// ============================================================================

/**
 * YouTube skip reason metrics.
 * Tracks why videos were filtered/skipped during polling.
 */
export interface YouTubeSkipMetrics {
  /** Videos already in user's inbox */
  alreadySeen: number;
  /** YouTube Shorts excluded (≤ 3 minutes) */
  shortsFiltered: number;
  /** Videos without valid publishedAt date */
  invalidDate: number;
  /** Private/deleted/unavailable videos */
  unavailable: number;
  /** Other skip reasons (e.g., API errors during enrichment) */
  other: number;
}

/**
 * Create an empty YouTubeSkipMetrics object.
 */
export function createEmptyYouTubeSkipMetrics(): YouTubeSkipMetrics {
  return {
    alreadySeen: 0,
    shortsFiltered: 0,
    invalidDate: 0,
    unavailable: 0,
    other: 0,
  };
}

/**
 * Aggregate multiple YouTubeSkipMetrics into a single object.
 */
export function aggregateYouTubeSkipMetrics(metrics: YouTubeSkipMetrics[]): YouTubeSkipMetrics {
  return metrics.reduce(
    (acc, m) => ({
      alreadySeen: acc.alreadySeen + m.alreadySeen,
      shortsFiltered: acc.shortsFiltered + m.shortsFiltered,
      invalidDate: acc.invalidDate + m.invalidDate,
      unavailable: acc.unavailable + m.unavailable,
      other: acc.other + m.other,
    }),
    createEmptyYouTubeSkipMetrics()
  );
}

/**
 * Get total count of all skips from a YouTubeSkipMetrics object.
 */
export function getTotalSkipCount(metrics: YouTubeSkipMetrics): number {
  return (
    metrics.alreadySeen +
    metrics.shortsFiltered +
    metrics.invalidDate +
    metrics.unavailable +
    metrics.other
  );
}

/**
 * Result of batch polling multiple subscriptions.
 * Extended version of PollingResult with batch-specific metrics.
 */
export interface BatchPollingResult {
  /** Total new items ingested across all subscriptions */
  newItems: number;
  /** Number of subscriptions successfully processed */
  processed: number;
  /** Number of subscriptions skipped (e.g., delta detection) */
  skipped?: number;
  /** Number of subscriptions marked as disconnected (e.g., show deleted from Spotify) */
  disconnected?: number;
  /** Any errors that occurred during batch processing */
  errors?: Array<{ subscriptionId: string; error: string }>;
  /** Cache hit count for show metadata lookups (Spotify only) */
  cacheHits?: number;
  /** Cache miss count for show metadata lookups (Spotify only) */
  cacheMisses?: number;
  /** YouTube-specific skip metrics (YouTube only) */
  youtubeSkipMetrics?: YouTubeSkipMetrics;
}

// ============================================================================
// Provider Interface
// ============================================================================

/**
 * Provider batch configuration for the generic batch processor.
 * Encapsulates provider-specific behavior for client creation and polling.
 *
 * @template TClient - The API client type for the provider
 */
export interface ProviderBatchConfig<TClient> {
  /** Provider identifier for logging and rate limiting */
  provider: 'YOUTUBE' | 'SPOTIFY';
  /** Create an API client from a provider connection */
  getClient: (connection: ProviderConnectionRow, env: Bindings) => Promise<TClient>;
  /** Poll a single subscription and return new item count */
  pollSingle: (
    sub: Subscription,
    client: TClient,
    userId: string,
    env: Bindings,
    db: DrizzleDB
  ) => Promise<PollingResult>;
  /**
   * Poll multiple subscriptions in a batch (optional).
   *
   * When provided, the scheduler will prefer this method over pollSingle
   * for improved efficiency. Batch polling typically offers:
   * - Reduced API calls via batching and delta detection
   * - Parallel processing for faster wall-clock time
   * - Cross-subscription optimizations
   *
   * The scheduler handles grouping subscriptions by user before calling
   * this method, so all subs passed here belong to the same user.
   *
   * If batch polling fails, the scheduler may fall back to pollSingle.
   *
   * @param subs - Subscriptions to poll (grouped by userId)
   * @param client - Authenticated provider client
   * @param userId - User ID owning these subscriptions
   * @param env - Cloudflare Worker bindings
   * @param db - Database instance
   * @returns BatchPollingResult with aggregated metrics
   */
  pollBatch?: (
    subs: Subscription[],
    client: TClient,
    userId: string,
    env: Bindings,
    db: DrizzleDB
  ) => Promise<BatchPollingResult>;
}

/**
 * Minimal provider connection type needed for polling.
 * Matches the providerConnections table select type.
 */
export interface ProviderConnectionRow {
  id: string;
  userId: string;
  provider: string;
  providerUserId: string | null;
  accessToken: string;
  refreshToken: string;
  tokenExpiresAt: number;
  scopes: string | null;
  status: string;
  connectedAt: number;
  lastRefreshedAt: number | null;
}

// ============================================================================
// Constants
// ============================================================================

/** Maximum videos/episodes to fetch per subscription poll */
export const MAX_ITEMS_PER_POLL = 10;

/** YouTube Shorts duration threshold - re-exported from shared for convenience */
export const SHORTS_DURATION_THRESHOLD = YOUTUBE_SHORTS_MAX_DURATION_SECONDS;
