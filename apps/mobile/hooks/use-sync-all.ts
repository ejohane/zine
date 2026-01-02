/**
 * useSyncAll Hook
 *
 * Triggers sync across all active subscriptions.
 * Handles rate limiting (2-minute cooldown) and provides aggregated feedback.
 *
 * Designed for pull-to-refresh on Inbox screen where users want to
 * check ALL their subscriptions for new content at once.
 *
 * Note: Due to Cloudflare Workers subrequest limits, large subscription counts
 * may require multiple sync calls. The hook automatically continues syncing
 * when the backend indicates more subscriptions remain (hasMoreToSync flag).
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { trpc } from '../lib/trpc';

// ============================================================================
// Types
// ============================================================================

const DEFAULT_COOLDOWN_SECONDS = 120; // 2 minutes (matches backend)
const BATCH_DELAY_MS = 500; // Small delay between batch syncs to avoid overwhelming the backend

export interface SyncAllResult {
  success: boolean;
  synced: number;
  itemsFound: number;
  errors: string[];
  message: string;
}

export interface UseSyncAllReturn {
  syncAll: () => void;
  isLoading: boolean;
  cooldownSeconds: number;
  lastResult: SyncAllResult | null;
}

// ============================================================================
// Hook Implementation
// ============================================================================

export function useSyncAll(): UseSyncAllReturn {
  const utils = trpc.useUtils();
  const [cooldownSeconds, setCooldownSeconds] = useState(0);
  const [lastResult, setLastResult] = useState<SyncAllResult | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Track cumulative results across batch syncs
  const cumulativeResultsRef = useRef({ synced: 0, itemsFound: 0, errors: [] as string[] });
  const isBatchSyncingRef = useRef(false);

  const mutation = trpc.subscriptions.syncAll.useMutation({
    onSuccess: (data) => {
      // Accumulate results across batches
      cumulativeResultsRef.current.synced += data.synced;
      cumulativeResultsRef.current.itemsFound += data.itemsFound;
      cumulativeResultsRef.current.errors.push(...data.errors);

      // If there are more subscriptions to sync, continue syncing after a short delay
      if (data.hasMoreToSync && data.remaining > 0) {
        isBatchSyncingRef.current = true;
        setTimeout(() => {
          mutation.mutate();
        }, BATCH_DELAY_MS);
        return; // Don't update UI yet - wait for all batches to complete
      }

      // All batches complete - now update UI with cumulative results
      isBatchSyncingRef.current = false;
      const cumulative = cumulativeResultsRef.current;

      // Format user-friendly message
      let message: string;
      if (cumulative.itemsFound > 0) {
        message = `Found ${cumulative.itemsFound} new item${cumulative.itemsFound === 1 ? '' : 's'}`;
      } else if (cumulative.synced > 0) {
        message = 'All caught up!';
      } else {
        message = 'No subscriptions to sync';
      }

      if (cumulative.errors.length > 0) {
        message = `${message} (${cumulative.errors.length} failed)`;
      }

      setLastResult({
        success: true,
        synced: cumulative.synced,
        itemsFound: cumulative.itemsFound,
        errors: cumulative.errors,
        message,
      });

      // Reset cumulative tracking for next sync
      cumulativeResultsRef.current = { synced: 0, itemsFound: 0, errors: [] };

      setCooldownSeconds(DEFAULT_COOLDOWN_SECONDS);

      // Invalidate inbox cache to show new items
      utils.items.inbox.invalidate();
    },
    onError: (error) => {
      // Reset batch state on error
      isBatchSyncingRef.current = false;
      const cumulative = cumulativeResultsRef.current;

      if (error.data?.code === 'TOO_MANY_REQUESTS') {
        const match = error.message?.match(/(\d+)\s*(minutes?|seconds?)/i);
        let seconds = DEFAULT_COOLDOWN_SECONDS;
        if (match) {
          const value = parseInt(match[1], 10);
          seconds = match[2].toLowerCase().startsWith('minute') ? value * 60 : value;
        }

        setCooldownSeconds(seconds);
        setLastResult({
          success: cumulative.synced > 0, // Partial success if some batches completed
          synced: cumulative.synced,
          itemsFound: cumulative.itemsFound,
          errors: cumulative.errors,
          message:
            cumulative.synced > 0
              ? `Synced ${cumulative.synced}, try again in ${Math.ceil(seconds / 60)} min for the rest`
              : `Try again in ${Math.ceil(seconds / 60)} minute${Math.ceil(seconds / 60) === 1 ? '' : 's'}`,
        });
      } else {
        const errorMessage = error.message ?? 'Sync failed';
        setLastResult({
          success: cumulative.synced > 0, // Partial success if some batches completed
          synced: cumulative.synced,
          itemsFound: cumulative.itemsFound,
          errors: [...cumulative.errors, errorMessage],
          message:
            cumulative.synced > 0
              ? `Synced ${cumulative.synced}, then: ${errorMessage}`
              : errorMessage,
        });
      }

      // Reset cumulative tracking
      cumulativeResultsRef.current = { synced: 0, itemsFound: 0, errors: [] };
    },
  });

  // Countdown timer for cooldown
  useEffect(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    if (cooldownSeconds <= 0) return;

    intervalRef.current = setInterval(() => {
      setCooldownSeconds((prev) => {
        if (prev <= 1) {
          if (intervalRef.current) clearInterval(intervalRef.current);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [cooldownSeconds > 0]);

  const syncAll = useCallback(() => {
    if (cooldownSeconds > 0 || mutation.isPending || isBatchSyncingRef.current) return;
    // Reset cumulative tracking for new sync
    cumulativeResultsRef.current = { synced: 0, itemsFound: 0, errors: [] };
    mutation.mutate();
  }, [cooldownSeconds, mutation]);

  return {
    syncAll,
    // Show loading during mutation AND during batch continuation
    isLoading: mutation.isPending || isBatchSyncingRef.current,
    cooldownSeconds,
    lastResult,
  };
}
