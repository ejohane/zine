/**
 * useSyncNow Hook
 *
 * Provides manual sync functionality for individual subscriptions.
 * Handles rate limiting (5-minute cooldown) and provides user feedback.
 *
 * Features:
 * - Calls subscriptions.syncNow mutation
 * - Tracks 5-minute cooldown per subscription (enforced by backend)
 * - Provides last result for UI feedback
 * - Handles TOO_MANY_REQUESTS errors gracefully
 *
 * Backend API: subscriptions.syncNow
 * Rate limit: 1 sync per 5 minutes per subscription
 *
 * @see features/subscriptions/frontend-spec.md Section 6.5
 * @see apps/worker/src/trpc/routers/subscriptions.ts syncNow procedure
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { trpc } from '../lib/trpc';

// ============================================================================
// Types
// ============================================================================

/**
 * Result of a sync attempt, used for UI feedback.
 */
export interface SyncResult {
  /** Whether the sync completed successfully */
  success: boolean;
  /** Number of new items found (only present on success) */
  itemsFound?: number;
  /** Human-readable status message */
  message: string;
}

/**
 * Return type for the useSyncNow hook.
 */
export interface UseSyncNowReturn {
  /** Function to trigger manual sync (no-op if loading or in cooldown) */
  syncNow: () => void;
  /** True while sync mutation is in progress */
  isLoading: boolean;
  /** Seconds remaining in rate limit cooldown (0 = ready) */
  cooldownSeconds: number;
  /** Result of last sync attempt for UI feedback */
  lastResult: SyncResult | null;
}

// ============================================================================
// Constants
// ============================================================================

/** Default cooldown duration in seconds (5 minutes) */
const DEFAULT_COOLDOWN_SECONDS = 300;

// ============================================================================
// Hook
// ============================================================================

/**
 * Hook for triggering manual sync of a subscription.
 *
 * Manages sync state including loading, cooldown timer, and result feedback.
 * The cooldown is enforced both client-side (for immediate feedback) and
 * server-side (for security).
 *
 * @param subscriptionId - The subscription to sync
 * @returns Object with syncNow function, loading state, cooldown, and last result
 *
 * @example
 * ```tsx
 * function SubscriptionDetail({ subscription }) {
 *   const { syncNow, isLoading, cooldownSeconds, lastResult } = useSyncNow(subscription.id);
 *
 *   return (
 *     <View>
 *       <Pressable
 *         onPress={syncNow}
 *         disabled={isLoading || cooldownSeconds > 0}
 *       >
 *         <Text>
 *           {isLoading
 *             ? 'Syncing...'
 *             : cooldownSeconds > 0
 *               ? `Wait ${Math.ceil(cooldownSeconds / 60)}m`
 *               : 'Sync Now'}
 *         </Text>
 *       </Pressable>
 *
 *       {lastResult && (
 *         <Text style={{ color: lastResult.success ? 'green' : 'red' }}>
 *           {lastResult.message}
 *         </Text>
 *       )}
 *     </View>
 *   );
 * }
 * ```
 */
export function useSyncNow(subscriptionId: string): UseSyncNowReturn {
  const [cooldownSeconds, setCooldownSeconds] = useState(0);
  const [lastResult, setLastResult] = useState<SyncResult | null>(null);

  // Track the interval ID for cleanup
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Using type assertion until router is updated with proper typing
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mutation = (trpc as any).subscriptions.syncNow.useMutation({
    onSuccess: (data: { success: boolean; itemsFound: number }) => {
      const itemsFound = data.itemsFound ?? 0;

      setLastResult({
        success: true,
        itemsFound,
        message:
          itemsFound > 0
            ? `Found ${itemsFound} new item${itemsFound === 1 ? '' : 's'}`
            : 'No new content',
      });

      // Start cooldown after successful sync
      setCooldownSeconds(DEFAULT_COOLDOWN_SECONDS);
    },
    onError: (error: { data?: { code?: string }; message?: string }) => {
      if (error.data?.code === 'TOO_MANY_REQUESTS') {
        // Parse cooldown from error message or use default
        // Server message format: "Please wait X minutes between manual syncs"
        const message = error.message || '';
        const match = message.match(/(\d+)\s*(minutes?|seconds?)/i);

        let seconds = DEFAULT_COOLDOWN_SECONDS;
        if (match) {
          const value = parseInt(match[1], 10);
          const unit = match[2].toLowerCase();
          // Check if unit starts with 'minute' (minute, minutes)
          seconds = unit.indexOf('minute') === 0 ? value * 60 : value;
        }

        setCooldownSeconds(seconds);
        setLastResult({
          success: false,
          message: `Rate limited. Try again in ${Math.ceil(seconds / 60)} minute${Math.ceil(seconds / 60) === 1 ? '' : 's'}.`,
        });
      } else {
        setLastResult({
          success: false,
          message: error.message || 'Sync failed',
        });
      }
    },
  });

  // Countdown timer for cooldown
  useEffect(() => {
    // Clear any existing interval
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    // No countdown needed if cooldown is 0 or less
    if (cooldownSeconds <= 0) {
      return;
    }

    // Start countdown interval
    intervalRef.current = setInterval(() => {
      setCooldownSeconds((prev) => {
        const next = prev - 1;
        if (next <= 0) {
          // Clear interval when countdown reaches 0
          if (intervalRef.current) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
          }
          return 0;
        }
        return next;
      });
    }, 1000);

    // Cleanup on unmount or when cooldownSeconds changes
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [cooldownSeconds > 0]); // Only re-run when transitioning to/from cooldown

  /**
   * Trigger a manual sync.
   *
   * No-op if already syncing or in cooldown period.
   * On success, starts a 5-minute cooldown.
   * On rate limit error, parses remaining cooldown from server response.
   */
  const syncNow = useCallback(() => {
    // Guard against sync while loading or in cooldown
    if (cooldownSeconds > 0 || mutation.isPending) {
      return;
    }

    mutation.mutate({ subscriptionId });
  }, [subscriptionId, cooldownSeconds, mutation]);

  return {
    syncNow,
    isLoading: mutation.isPending,
    cooldownSeconds,
    lastResult,
  };
}
