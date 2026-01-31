import type { Provider } from '@zine/shared';

import type { Database } from '../../db';
import type { NewItem } from '../transformers';

// ============================================================================
// Types
// ============================================================================

/**
 * Result of an ingestion attempt.
 */
export interface IngestResult {
  /** Whether a new user_item was created */
  created: boolean;
  /** ID of the canonical item (if created or found) */
  itemId?: string;
  /** ID of the user_item (if created) */
  userItemId?: string;
  /** Reason for skipping (if not created) */
  skipped?: 'already_seen';
}

/**
 * Result of a batch ingestion operation.
 */
export interface BatchIngestResult {
  /** Total number of items processed */
  total: number;
  /** Number of items successfully created */
  created: number;
  /** Number of items skipped (already seen) */
  skipped: number;
  /** Number of items that failed to process */
  errors: number;
  /** Details of any errors that occurred */
  errorDetails: Array<{ providerId: string; error: string }>;
}

/**
 * Extended result for consolidated batch ingestion with metrics.
 */
export interface ConsolidatedBatchIngestResult extends BatchIngestResult {
  /** Number of batch chunks executed */
  batchCount: number;
  /** Number of items that required individual fallback */
  fallbackCount: number;
  /** Total duration in milliseconds */
  durationMs: number;
}

/**
 * Shared context for ingestion preparation.
 */
export interface IngestContext {
  userId: string;
  provider: Provider;
  db: Database;
}

/**
 * Context for building ingestion write statements.
 */
export interface WriteContext extends IngestContext {
  subscriptionId: string;
  nowISO: string;
  now: number;
}

/**
 * Prepared item ready for insertion.
 */
export interface PreparedItem {
  /** Transformed item data */
  newItem: NewItem;
  /** Raw provider data (for DLQ on failure) */
  rawItem: unknown;
  /** Provider ID (for logging and DLQ) */
  providerId: string;
  /** Canonical item ID (existing or new) */
  canonicalItemId: string;
  /** Whether the canonical item already exists */
  canonicalItemExists: boolean;
  /** User item ID for this ingestion */
  userItemId: string;
  /** Internal creator ID (from creators table) */
  creatorId: string | null;
}

/**
 * Result of preparing a single item for ingestion.
 */
export type PreparedResult =
  | { status: 'prepared'; item: PreparedItem }
  | { status: 'skipped'; reason: 'already_seen' };
