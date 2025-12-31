/**
 * Offline Action Queue with AsyncStorage Persistence
 *
 * Queues subscription-related mutations when offline and executes them
 * when connectivity returns. Implements smart retry logic with error
 * classification to handle different failure modes appropriately.
 *
 * @see Frontend Spec Section 9.3 for detailed requirements
 *
 * Features:
 * - ULID-based action ordering for deterministic replay
 * - AsyncStorage persistence survives app restarts
 * - Smart retry logic based on error type
 * - NetInfo integration for automatic queue processing on reconnect
 * - Subscriber pattern for UI updates (SyncStatusIndicator)
 *
 * Error Handling Strategy:
 * - NETWORK/SERVER/UNKNOWN: Retry with MAX_RETRIES (3)
 * - AUTH (401): Refresh token, retry once
 * - CONFLICT (409): Treat as success (already done)
 * - CLIENT (4xx): Don't retry, permanent failure
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import { ulid } from 'ulid';
import { offlineLogger } from './logger';
import { classifyErrorLegacy, type ErrorClassification } from './error-utils';

// Re-export for backward compatibility
export type { ErrorClassification } from './error-utils';

// ============================================================================
// Constants
// ============================================================================

const QUEUE_KEY = 'zine:offline_action_queue';
const MAX_RETRIES = 3;
const AUTH_RETRY_LIMIT = 1; // Only retry auth errors once after token refresh

// ============================================================================
// Types
// ============================================================================

/**
 * Types of offline actions that can be queued.
 * Maps to tRPC mutation endpoints.
 */
export type OfflineActionType = 'SUBSCRIBE' | 'UNSUBSCRIBE';

/**
 * A queued offline action with metadata for retry handling.
 */
export interface OfflineAction {
  /** ULID for ordering (lexicographically sortable by creation time) */
  id: string;
  /** The type of mutation to perform */
  type: OfflineActionType;
  /** Mutation payload (specific to action type) */
  payload: Record<string, unknown>;
  /** Timestamp when the action was created */
  createdAt: number;
  /** Number of retry attempts for network/server errors */
  retryCount: number;
  /** Number of retry attempts after auth token refresh */
  authRetryCount: number;
  /** Last error message for debugging */
  lastError?: string;
  /** Last error classification for UI display */
  lastErrorType?: ErrorClassification;
}

/**
 * Callback type for queue change listeners.
 */
type QueueListener = () => void;

/**
 * Result of processing a single action.
 * Used to determine whether to keep or remove action from queue.
 */
interface ActionProcessingResult {
  /** Whether the action should be removed from the queue */
  shouldRemove: boolean;
  /** Whether this counts as a success (for cache invalidation) */
  succeeded: boolean;
  /** Updated action to keep in queue (if shouldRemove is false) */
  updatedAction?: OfflineAction;
}

/**
 * Determine if an error should trigger a retry based on type and retry counts.
 *
 * @param errorType - The classified error type
 * @param action - The action being processed (for retry count checks)
 * @returns Whether the action should be retried
 */
function isRetryableError(errorType: ErrorClassification, action: OfflineAction): boolean {
  switch (errorType) {
    case 'NETWORK':
    case 'SERVER':
    case 'UNKNOWN':
      // Retry if under the general retry limit
      return action.retryCount < MAX_RETRIES;

    case 'AUTH':
      // Auth errors get one retry after token refresh
      return action.authRetryCount < AUTH_RETRY_LIMIT;

    case 'CONFLICT':
      // Conflict means the action's intent was already fulfilled
      // (e.g., user is already subscribed) - don't retry
      return false;

    case 'CLIENT':
      // Client errors (4xx except 401, 409) are permanent - don't retry
      return false;

    default:
      return false;
  }
}

// ============================================================================
// Offline Action Queue
// ============================================================================

/**
 * Singleton queue for managing offline subscription mutations.
 *
 * Usage:
 * ```typescript
 * // Queue an action
 * const actionId = await offlineQueue.enqueue({
 *   type: 'SUBSCRIBE',
 *   payload: { provider: 'YOUTUBE', providerChannelId: 'UC...' }
 * });
 *
 * // Check pending count
 * const count = await offlineQueue.getPendingCount();
 *
 * // Subscribe to changes (for UI indicators)
 * const unsubscribe = offlineQueue.subscribe(() => {
 *   console.log('Queue changed');
 * });
 * ```
 */
class OfflineActionQueue {
  /** Flag to prevent concurrent queue processing */
  private isProcessing = false;

  /** Set of listeners notified on queue changes */
  private listeners: Set<QueueListener> = new Set();

  /**
   * Add an action to the queue.
   *
   * Actions are assigned a ULID for deterministic ordering and persisted
   * immediately to AsyncStorage. Queue processing is triggered if online.
   *
   * @param action - The action type and payload to queue
   * @returns The generated action ID (ULID)
   */
  async enqueue(action: {
    type: OfflineActionType;
    payload: Record<string, unknown>;
  }): Promise<string> {
    const queue = await this.getQueue();

    const queuedAction: OfflineAction = {
      id: ulid(),
      type: action.type,
      payload: action.payload,
      createdAt: Date.now(),
      retryCount: 0,
      authRetryCount: 0,
    };

    queue.push(queuedAction);
    await this.saveQueue(queue);
    this.notifyListeners();

    // Attempt to process immediately if online
    this.processQueue();

    return queuedAction.id;
  }

  /**
   * Get all pending actions in the queue.
   *
   * @returns Array of pending actions, ordered by creation time (ULID order)
   */
  async getQueue(): Promise<OfflineAction[]> {
    try {
      const data = await AsyncStorage.getItem(QUEUE_KEY);
      return data ? JSON.parse(data) : [];
    } catch (error) {
      offlineLogger.error('Failed to read queue', { error });
      return [];
    }
  }

  /**
   * Get the number of pending actions.
   *
   * @returns Number of actions in the queue
   */
  async getPendingCount(): Promise<number> {
    const queue = await this.getQueue();
    return queue.length;
  }

  /**
   * Process all queued actions if online.
   *
   * Actions are processed in order (ULID order = creation order).
   * Failed actions are either retried (network/server errors) or
   * removed (client errors, conflicts, or retry limit exceeded).
   *
   * After processing, React Query caches are invalidated via the
   * registered callback from TRPCProvider.
   */
  async processQueue(): Promise<void> {
    // Prevent concurrent processing
    if (this.isProcessing) return;

    // Check connectivity before processing
    const state = await NetInfo.fetch();
    if (!state.isConnected || state.isInternetReachable === false) {
      return;
    }

    this.isProcessing = true;

    try {
      const queue = await this.getQueue();
      const remainingActions: OfflineAction[] = [];
      let anySucceeded = false;

      for (const action of queue) {
        const result = await this.processAction(action);
        if (result.succeeded) {
          anySucceeded = true;
        }
        if (!result.shouldRemove && result.updatedAction) {
          remainingActions.push(result.updatedAction);
        }
      }

      await this.saveQueue(remainingActions);
      this.notifyListeners();

      // Notify React Query to invalidate caches after queue processing
      if (anySucceeded) {
        const { notifyQueueProcessed } = await import('./trpc-offline-client');
        notifyQueueProcessed();
      }
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Process a single action from the queue.
   *
   * Handles execution, error classification, and retry logic.
   *
   * @param action - The action to process
   * @returns Result indicating success/failure and whether to keep in queue
   */
  private async processAction(action: OfflineAction): Promise<ActionProcessingResult> {
    try {
      await this.executeAction(action);
      return { shouldRemove: true, succeeded: true };
    } catch (error) {
      return this.handleActionError(action, error);
    }
  }

  /**
   * Handle an error from action execution.
   *
   * Classifies the error and determines appropriate handling:
   * - CONFLICT: Treat as success (already done)
   * - AUTH: Try token refresh and retry once
   * - CLIENT: Permanent failure, remove from queue
   * - NETWORK/SERVER/UNKNOWN: Retry with backoff
   *
   * @param action - The action that failed
   * @param error - The error that occurred
   * @returns Result indicating how to handle the action
   */
  private async handleActionError(
    action: OfflineAction,
    error: unknown
  ): Promise<ActionProcessingResult> {
    const errorType = classifyErrorLegacy(error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    // CONFLICT: The action's intent is already fulfilled
    if (errorType === 'CONFLICT') {
      offlineLogger.info('Action resolved as conflict - already done', {
        actionId: action.id,
        type: action.type,
      });
      return { shouldRemove: true, succeeded: true };
    }

    // AUTH: Try to refresh token and retry
    if (errorType === 'AUTH') {
      return this.handleAuthError(action, errorMessage);
    }

    // CLIENT: Permanent failure (4xx except 401, 409)
    if (errorType === 'CLIENT') {
      offlineLogger.error('Action failed permanently', {
        actionId: action.id,
        type: action.type,
        error: errorMessage,
      });
      return { shouldRemove: true, succeeded: false };
    }

    // NETWORK, SERVER, UNKNOWN: Retry with backoff
    return this.handleRetryableError(action, errorType, errorMessage);
  }

  /**
   * Handle authentication errors with token refresh and retry.
   */
  private async handleAuthError(
    action: OfflineAction,
    originalErrorMessage: string
  ): Promise<ActionProcessingResult> {
    if (action.authRetryCount < AUTH_RETRY_LIMIT) {
      try {
        await this.refreshAuth();
        await this.executeAction(action);
        return { shouldRemove: true, succeeded: true };
      } catch (retryError) {
        const retryErrorType = classifyErrorLegacy(retryError);
        const updatedAction: OfflineAction = {
          ...action,
          authRetryCount: action.authRetryCount + 1,
          lastError: retryError instanceof Error ? retryError.message : 'Auth retry failed',
          lastErrorType: retryErrorType,
        };

        if (isRetryableError(retryErrorType, updatedAction)) {
          return { shouldRemove: false, succeeded: false, updatedAction };
        }
        offlineLogger.error('Action failed permanently after auth retry', {
          actionId: action.id,
          error: retryError,
        });
        return { shouldRemove: true, succeeded: false };
      }
    }

    // Exceeded auth retry limit
    offlineLogger.error('Action exceeded auth retry limit', {
      actionId: action.id,
      error: originalErrorMessage,
    });
    return { shouldRemove: true, succeeded: false };
  }

  /**
   * Handle retryable errors (NETWORK, SERVER, UNKNOWN) with retry counting.
   */
  private handleRetryableError(
    action: OfflineAction,
    errorType: ErrorClassification,
    errorMessage: string
  ): ActionProcessingResult {
    const updatedAction: OfflineAction = {
      ...action,
      retryCount: action.retryCount + 1,
      lastError: errorMessage,
      lastErrorType: errorType,
    };

    if (isRetryableError(errorType, updatedAction)) {
      return { shouldRemove: false, succeeded: false, updatedAction };
    }

    // Exceeded retry limit
    offlineLogger.error('Action exceeded retry limit', {
      actionId: action.id,
      type: action.type,
      error: errorMessage,
    });
    return { shouldRemove: true, succeeded: false };
  }

  /**
   * Subscribe to queue changes.
   *
   * Listeners are called when actions are added, removed, or modified.
   * Use this to update UI indicators (e.g., pending action count).
   *
   * @param listener - Callback function to invoke on queue changes
   * @returns Unsubscribe function
   */
  subscribe(listener: QueueListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * Clear all pending actions from the queue.
   *
   * Use with caution - this discards all queued mutations.
   * Intended for debugging or user-initiated "cancel all pending changes".
   */
  async clear(): Promise<void> {
    await AsyncStorage.removeItem(QUEUE_KEY);
    this.notifyListeners();
  }

  // ==========================================================================
  // Private Methods
  // ==========================================================================

  /**
   * Persist the queue to AsyncStorage.
   */
  private async saveQueue(queue: OfflineAction[]): Promise<void> {
    try {
      await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
    } catch (error) {
      offlineLogger.error('Failed to save queue', { error });
    }
  }

  /**
   * Notify all listeners of a queue change.
   */
  private notifyListeners(): void {
    this.listeners.forEach((listener) => {
      try {
        listener();
      } catch (error) {
        offlineLogger.error('Listener error', { error });
      }
    });
  }

  /**
   * Attempt to refresh the authentication token.
   *
   * Called when a 401 Unauthorized error is encountered.
   * Uses Clerk's token refresh mechanism via the auth module.
   *
   * @throws Error if auth refresh fails
   */
  private async refreshAuth(): Promise<void> {
    // TODO: Implement token refresh when Clerk integration is complete
    // For now, we'll import and call refreshAuthToken when available
    // const { refreshAuthToken } = await import('./auth');
    // await refreshAuthToken();

    // Placeholder: throw to indicate refresh not available
    offlineLogger.warn('Auth refresh not yet implemented');
    throw new Error('Auth refresh not available');
  }

  /**
   * Execute a single queued action using the offline tRPC client.
   *
   * Uses getOfflineTRPCClient() to ensure:
   * 1. Same client instance across all queue operations
   * 2. Proper auth header injection
   * 3. Ability to notify React Query after successful execution
   *
   * @param action - The action to execute
   * @throws Error if the mutation fails
   */
  private async executeAction(action: OfflineAction): Promise<void> {
    const { getOfflineTRPCClient } = await import('./trpc-offline-client');
    const client = getOfflineTRPCClient();

    // Map action types to tRPC mutations
    // Note: Current router uses 'sources' not 'subscriptions'
    // The action payload structure should match the mutation input
    switch (action.type) {
      case 'SUBSCRIBE':
        // payload: { provider, feedUrl, name? }
        await client.sources.add.mutate(
          action.payload as Parameters<typeof client.sources.add.mutate>[0]
        );
        break;

      case 'UNSUBSCRIBE':
        // payload: { id }
        await client.sources.remove.mutate(
          action.payload as Parameters<typeof client.sources.remove.mutate>[0]
        );
        break;
    }
  }
}

// ============================================================================
// Singleton Export
// ============================================================================

/**
 * Singleton instance of the offline action queue.
 *
 * Import this to enqueue actions or subscribe to changes:
 * ```typescript
 * import { offlineQueue } from './offline-queue';
 *
 * await offlineQueue.enqueue({
 *   type: 'SUBSCRIBE',
 *   payload: { provider: 'YOUTUBE', feedUrl: 'https://youtube.com/@channel' }
 * });
 * ```
 */
export const offlineQueue = new OfflineActionQueue();

// ============================================================================
// NetInfo Integration
// ============================================================================

/**
 * Auto-process queue when app comes online.
 *
 * This listener is registered at module load time, so the queue
 * will automatically attempt to process whenever connectivity is restored.
 */
NetInfo.addEventListener((state) => {
  if (state.isConnected && state.isInternetReachable !== false) {
    offlineQueue.processQueue();
  }
});
