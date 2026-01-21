/**
 * Async Sync Types
 *
 * Type definitions for the queue-based async sync system.
 * Used by the sync service, queue consumer, and tRPC procedures.
 *
 * @see zine-wsjp: Feature: Async Pull-to-Refresh with Cloudflare Queues
 */

import { z } from 'zod';

// ============================================================================
// Queue Message Types
// ============================================================================

/**
 * Message sent to the sync queue for processing a single subscription.
 * Each subscription is processed independently for error isolation.
 */
export interface SyncQueueMessage {
  /** Job ID this message belongs to */
  jobId: string;
  /** User ID who initiated the sync */
  userId: string;
  /** Subscription ID to sync */
  subscriptionId: string;
  /** Provider for this subscription */
  provider: 'YOUTUBE' | 'SPOTIFY';
  /** Channel/show ID for this subscription */
  providerChannelId: string;
  /** Timestamp when the message was enqueued */
  enqueuedAt: number;
}

/**
 * Zod schema for validating queue messages
 */
export const SyncQueueMessageSchema = z.object({
  jobId: z.string(),
  userId: z.string(),
  subscriptionId: z.string(),
  provider: z.enum(['YOUTUBE', 'SPOTIFY']),
  providerChannelId: z.string(),
  enqueuedAt: z.number(),
});

// ============================================================================
// Job Status Types
// ============================================================================

/**
 * Status of a sync job.
 * Stored in KV with TTL for automatic cleanup.
 */
export interface SyncJobStatus {
  /** Unique job ID */
  jobId: string;
  /** User who initiated the sync */
  userId: string;
  /** Total number of subscriptions to sync */
  total: number;
  /** Number of subscriptions completed (success or failure) */
  completed: number;
  /** Number of subscriptions that succeeded */
  succeeded: number;
  /** Number of subscriptions that failed */
  failed: number;
  /** Total new items found across all subscriptions */
  itemsFound: number;
  /** Job status */
  status: 'pending' | 'processing' | 'completed';
  /** Timestamp when the job was created */
  createdAt: number;
  /** Timestamp when the job was last updated */
  updatedAt: number;
  /** List of failed subscription IDs with error messages */
  errors: Array<{ subscriptionId: string; error: string }>;
}

/**
 * Zod schema for validating job status
 */
export const SyncJobStatusSchema = z.object({
  jobId: z.string(),
  userId: z.string(),
  total: z.number(),
  completed: z.number(),
  succeeded: z.number(),
  failed: z.number(),
  itemsFound: z.number(),
  status: z.enum(['pending', 'processing', 'completed']),
  createdAt: z.number(),
  updatedAt: z.number(),
  errors: z.array(
    z.object({
      subscriptionId: z.string(),
      error: z.string(),
    })
  ),
});

// ============================================================================
// API Response Types
// ============================================================================

/**
 * Response from syncAllAsync - initiating an async sync job
 */
export interface SyncAllAsyncResponse {
  /** Unique job ID for tracking progress */
  jobId: string;
  /** Total subscriptions that will be synced */
  total: number;
  /** Whether this is an existing job (deduplication) */
  existing: boolean;
}

/**
 * Response from syncStatus - checking job progress
 */
export interface SyncStatusResponse {
  /** Job ID */
  jobId: string;
  /** Current status */
  status: 'pending' | 'processing' | 'completed' | 'not_found';
  /** Total subscriptions to sync */
  total: number;
  /** Completed subscriptions */
  completed: number;
  /** Successful syncs */
  succeeded: number;
  /** Failed syncs */
  failed: number;
  /** New items found */
  itemsFound: number;
  /** Progress percentage (0-100) */
  progress: number;
  /** Errors if any */
  errors: Array<{ subscriptionId: string; error: string }>;
}

/**
 * Response from activeSyncJob - checking if a sync is in progress
 */
export interface ActiveSyncJobResponse {
  /** Whether a sync is currently in progress */
  inProgress: boolean;
  /** Job ID if in progress */
  jobId: string | null;
  /** Progress info if in progress */
  progress?: {
    total: number;
    completed: number;
    status: 'pending' | 'processing' | 'completed';
  };
}

// ============================================================================
// KV Keys
// ============================================================================

/**
 * Get the KV key for a user's active sync job.
 * Used for job deduplication.
 */
export function getActiveJobKey(userId: string): string {
  return `sync-job:active:${userId}`;
}

/**
 * Get the KV key for a sync job's status.
 */
export function getJobStatusKey(jobId: string): string {
  return `sync-job:status:${jobId}`;
}

/**
 * TTL for job status in seconds (10 minutes).
 * After this, the job status will be automatically deleted.
 */
export const JOB_STATUS_TTL_SECONDS = 600;

/**
 * TTL for active job marker in seconds (5 minutes).
 * Prevents duplicate jobs if user pulls to refresh multiple times.
 */
export const ACTIVE_JOB_TTL_SECONDS = 300;

// ============================================================================
// DLQ Types
// ============================================================================

/**
 * Dead Letter Queue entry metadata.
 * When a message exhausts all retries, it's moved to the DLQ.
 * We capture this for monitoring and investigation.
 */
export interface DLQEntry {
  /** Unique DLQ entry ID */
  id: string;
  /** Original message that failed */
  message: SyncQueueMessage;
  /** Timestamp when the message was moved to DLQ */
  deadLetteredAt: number;
  /** Number of times the message was retried before DLQ */
  attempts: number;
  /** Environment where the failure occurred */
  environment: string;
}

/**
 * Zod schema for validating DLQ entries
 */
export const DLQEntrySchema = z.object({
  id: z.string(),
  message: SyncQueueMessageSchema,
  deadLetteredAt: z.number(),
  attempts: z.number(),
  environment: z.string(),
});

/**
 * DLQ summary for monitoring dashboard
 */
export interface DLQSummary {
  /** Total count of messages in DLQ */
  count: number;
  /** Recent DLQ entries (last 24 hours) */
  recent: DLQEntry[];
  /** Oldest entry timestamp (if any) */
  oldestAt: number | null;
  /** Most recent entry timestamp (if any) */
  newestAt: number | null;
}

/**
 * Get the KV key prefix for DLQ entries.
 */
export function getDLQKeyPrefix(): string {
  return 'sync-dlq:entry:';
}

/**
 * Get the KV key for a specific DLQ entry.
 */
export function getDLQEntryKey(id: string): string {
  return `${getDLQKeyPrefix()}${id}`;
}

/**
 * Get the KV key for DLQ index (list of entry IDs).
 */
export function getDLQIndexKey(): string {
  return 'sync-dlq:index';
}

/**
 * TTL for DLQ entries in seconds (7 days).
 * Longer TTL to allow investigation of persistent failures.
 */
export const DLQ_ENTRY_TTL_SECONDS = 7 * 24 * 60 * 60;
