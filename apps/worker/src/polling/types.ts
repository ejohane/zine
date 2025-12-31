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
