/**
 * useSyncAll Hook
 *
 * Triggers async sync across all active subscriptions using Cloudflare Queues.
 * Provides real-time progress tracking with a non-blocking UX.
 *
 * New async architecture:
 * 1. syncAllAsync: Returns immediately after enqueuing messages
 * 2. Poll syncStatus every 2s for progress updates
 * 3. activeSyncJob: Check on app resume if sync is in progress
 *
 * Benefits over the old blocking approach:
 * - Instant response (< 500ms) vs 30+ seconds blocking
 * - Error isolation (one failure doesn't affect others)
 * - App restart safe (progress persists in KV)
 * - No subrequest limit issues
 *
 * @see zine-wsjp: Feature: Async Pull-to-Refresh with Cloudflare Queues
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { trpc } from '../lib/trpc';

// ============================================================================
// Types
// ============================================================================

const DEFAULT_COOLDOWN_SECONDS = 120; // 2 minutes (matches backend)
const STATUS_POLL_INTERVAL_MS = 2000; // Poll every 2 seconds

/**
 * Response from syncStatus tRPC query
 */
interface SyncStatusResponse {
  jobId: string;
  status: 'pending' | 'processing' | 'completed' | 'not_found';
  total: number;
  completed: number;
  succeeded: number;
  failed: number;
  itemsFound: number;
  progress: number;
  errors: Array<{ subscriptionId: string; error: string }>;
}

export interface SyncProgress {
  /** Total subscriptions to sync */
  total: number;
  /** Completed syncs (success + failure) */
  completed: number;
  /** Progress percentage (0-100) */
  percentage: number;
}

export interface SyncAllResult {
  /** Whether all syncs succeeded (no failures) */
  success: boolean;
  /** Number of subscriptions that synced successfully */
  synced: number;
  /** Total number of subscriptions attempted */
  total: number;
  /** Number of new items found across all syncs */
  itemsFound: number;
  /** Error messages from failed syncs */
  errors: string[];
  /** Human-readable summary message */
  message: string;
}

export interface UseSyncAllReturn {
  /** Trigger a sync */
  syncAll: () => void;
  /** Whether sync is currently in progress */
  isLoading: boolean;
  /** Progress info when syncing */
  progress: SyncProgress | null;
  /** Cooldown remaining in seconds */
  cooldownSeconds: number;
  /** Result of the last completed sync */
  lastResult: SyncAllResult | null;
}

// ============================================================================
// Hook Implementation
// ============================================================================

export function useSyncAll(): UseSyncAllReturn {
  const utils = trpc.useUtils();

  // UI state
  const [cooldownSeconds, setCooldownSeconds] = useState(0);
  const [lastResult, setLastResult] = useState<SyncAllResult | null>(null);
  const [progress, setProgress] = useState<SyncProgress | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Refs for cleanup and tracking
  const cooldownIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const statusPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const activeJobIdRef = useRef<string | null>(null);

  // tRPC mutations/queries
  const syncAsyncMutation = trpc.subscriptions.syncAllAsync.useMutation();

  /**
   * Handle sync status update
   */
  const handleStatusUpdate = useCallback(
    (status: SyncStatusResponse) => {
      if (status.status === 'not_found') {
        // Job expired or not found - clean up
        stopStatusPolling();
        setIsLoading(false);
        setProgress(null);
        activeJobIdRef.current = null;
        return;
      }

      // Update progress
      setProgress({
        total: status.total,
        completed: status.completed,
        percentage: status.progress,
      });

      // Check if completed
      if (status.status === 'completed') {
        stopStatusPolling();
        setIsLoading(false);
        setProgress(null);
        activeJobIdRef.current = null;

        // Format result message
        let message: string;
        if (status.itemsFound > 0) {
          message = `Found ${status.itemsFound} new item${status.itemsFound === 1 ? '' : 's'}`;
        } else if (status.succeeded > 0) {
          message = 'All caught up!';
        } else {
          message = 'No subscriptions to sync';
        }

        if (status.failed > 0) {
          message = `${message} (${status.failed} failed)`;
        }

        setLastResult({
          success: status.failed === 0,
          synced: status.succeeded,
          total: status.total,
          itemsFound: status.itemsFound,
          errors: status.errors.map((e) => e.error),
          message,
        });

        // Start cooldown
        setCooldownSeconds(DEFAULT_COOLDOWN_SECONDS);

        // Invalidate inbox cache to show new items
        utils.items.inbox.invalidate();
      }
    },
    [utils.items.inbox]
  );

  /**
   * Start polling for sync status
   */
  const startStatusPolling = useCallback(
    (jobId: string) => {
      // Stop any existing polling
      if (statusPollRef.current) {
        clearInterval(statusPollRef.current);
      }

      activeJobIdRef.current = jobId;

      // Poll immediately and then every 2 seconds
      const pollStatus = async () => {
        if (!activeJobIdRef.current) return;

        try {
          const result = await utils.client.subscriptions.syncStatus.query({
            jobId: activeJobIdRef.current,
          });
          handleStatusUpdate(result);
        } catch {
          // Ignore query errors during polling
        }
      };

      pollStatus(); // Initial poll
      statusPollRef.current = setInterval(pollStatus, STATUS_POLL_INTERVAL_MS);
    },
    [utils.client.subscriptions.syncStatus, handleStatusUpdate]
  );

  /**
   * Stop status polling
   */
  const stopStatusPolling = useCallback(() => {
    if (statusPollRef.current) {
      clearInterval(statusPollRef.current);
      statusPollRef.current = null;
    }
  }, []);

  /**
   * Check for active sync job on app resume
   */
  const checkActiveJob = useCallback(async () => {
    try {
      const result = await utils.client.subscriptions.activeSyncJob.query();

      if (result.inProgress && result.jobId) {
        setIsLoading(true);
        if (result.progress) {
          setProgress({
            total: result.progress.total,
            completed: result.progress.completed,
            percentage:
              result.progress.total > 0
                ? Math.round((result.progress.completed / result.progress.total) * 100)
                : 0,
          });
        }
        startStatusPolling(result.jobId);
      }
    } catch {
      // Ignore errors during resume check
    }
  }, [utils.client.subscriptions.activeSyncJob, startStatusPolling]);

  /**
   * Handle app state changes - check for active job on resume
   */
  useEffect(() => {
    const handleAppStateChange = (nextAppState: AppStateStatus) => {
      if (nextAppState === 'active') {
        checkActiveJob();
      }
    };

    const subscription = AppState.addEventListener('change', handleAppStateChange);

    // Check on mount as well
    checkActiveJob();

    return () => {
      subscription.remove();
    };
  }, [checkActiveJob]);

  /**
   * Countdown timer for cooldown
   */
  useEffect(() => {
    if (cooldownIntervalRef.current) {
      clearInterval(cooldownIntervalRef.current);
      cooldownIntervalRef.current = null;
    }

    if (cooldownSeconds <= 0) return;

    cooldownIntervalRef.current = setInterval(() => {
      setCooldownSeconds((prev) => {
        if (prev <= 1) {
          if (cooldownIntervalRef.current) clearInterval(cooldownIntervalRef.current);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (cooldownIntervalRef.current) clearInterval(cooldownIntervalRef.current);
    };
  }, [cooldownSeconds > 0]);

  /**
   * Cleanup on unmount
   */
  useEffect(() => {
    return () => {
      stopStatusPolling();
      if (cooldownIntervalRef.current) {
        clearInterval(cooldownIntervalRef.current);
      }
    };
  }, [stopStatusPolling]);

  /**
   * Trigger sync
   */
  const syncAll = useCallback(() => {
    if (cooldownSeconds > 0 || isLoading) return;

    setIsLoading(true);
    setProgress({ total: 0, completed: 0, percentage: 0 });

    syncAsyncMutation.mutate(undefined, {
      onSuccess: (data) => {
        if (data.total === 0) {
          // No subscriptions to sync
          setIsLoading(false);
          setProgress(null);
          setLastResult({
            success: true,
            synced: 0,
            total: 0,
            itemsFound: 0,
            errors: [],
            message: 'No subscriptions to sync',
          });
          setCooldownSeconds(DEFAULT_COOLDOWN_SECONDS);
          return;
        }

        // Update initial progress
        setProgress({ total: data.total, completed: 0, percentage: 0 });

        // Start polling for status
        startStatusPolling(data.jobId);
      },
      onError: (error) => {
        setIsLoading(false);
        setProgress(null);

        if (error.data?.code === 'TOO_MANY_REQUESTS') {
          const match = error.message?.match(/(\d+)\s*(minutes?|seconds?)/i);
          let seconds = DEFAULT_COOLDOWN_SECONDS;
          if (match) {
            const value = parseInt(match[1], 10);
            seconds = match[2].toLowerCase().startsWith('minute') ? value * 60 : value;
          }

          setCooldownSeconds(seconds);
          setLastResult({
            success: false,
            synced: 0,
            total: 0,
            itemsFound: 0,
            errors: [],
            message: `Try again in ${Math.ceil(seconds / 60)} minute${Math.ceil(seconds / 60) === 1 ? '' : 's'}`,
          });
        } else {
          setLastResult({
            success: false,
            synced: 0,
            total: 0,
            itemsFound: 0,
            errors: [error.message ?? 'Sync failed'],
            message: error.message ?? 'Sync failed',
          });
        }
      },
    });
  }, [cooldownSeconds, isLoading, syncAsyncMutation, startStatusPolling]);

  return {
    syncAll,
    isLoading,
    progress,
    cooldownSeconds,
    lastResult,
  };
}
