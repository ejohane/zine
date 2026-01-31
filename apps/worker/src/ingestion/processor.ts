/**
 * Idempotent Ingestion Processor
 *
 * This module handles the core ingestion logic for transforming raw provider data
 * into canonical items and user items with D1 batch operations for atomicity.
 *
 * Key responsibilities:
 * - Check idempotency via provider_items_seen before processing
 * - Use D1 batch API for atomic writes (items, user_items, subscription_items, provider_items_seen)
 * - Share canonical items across users
 * - Bridge timestamp formats between new tables (Unix ms) and existing tables (ISO8601)
 * - Store failed items in dead-letter queue for later retry
 *
 * Note: D1 doesn't support traditional SQL transactions. We use db.batch() which
 * executes all statements in a single round-trip and rolls back on any failure.
 *
 * @see /features/subscriptions/backend-spec.md - Section 4: Ingestion Pipeline
 */

export { ingestItem } from './processor/ingest';
export { ingestBatch, ingestBatchConsolidated, DEFAULT_BATCH_CHUNK_SIZE } from './processor/batch';
export { classifyError, type DLQErrorType } from './processor/errors';
export type {
  IngestResult,
  BatchIngestResult,
  ConsolidatedBatchIngestResult,
} from './processor/types';

// Re-export validation utilities for external use
export { ValidationError, isValidationError } from './validation';
