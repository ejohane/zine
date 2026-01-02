/**
 * useSyncAll Hook
 *
 * Triggers sync across all active subscriptions.
 * Handles rate limiting (2-minute cooldown) and provides aggregated feedback.
 *
 * Designed for pull-to-refresh on Inbox screen where users want to
 * check ALL their subscriptions for new content at once.
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { trpc } from '../lib/trpc';

// ============================================================================
// Types
// ============================================================================

const DEFAULT_COOLDOWN_SECONDS = 120; // 2 minutes (matches backend)

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

  // NOTE: Using type assertion since syncAll mutation is added in zine-6m2.4
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mutation = (trpc as any).subscriptions.syncAll.useMutation({
    onSuccess: (data: { synced: number; itemsFound: number; errors: string[] }) => {
      // Format user-friendly message
      let message: string;
      if (data.itemsFound > 0) {
        message = `Found ${data.itemsFound} new item${data.itemsFound === 1 ? '' : 's'}`;
      } else if (data.synced > 0) {
        message = 'All caught up!';
      } else {
        message = 'No subscriptions to sync';
      }

      if (data.errors.length > 0) {
        message = `${message} (${data.errors.length} failed)`;
      }

      setLastResult({
        success: true,
        synced: data.synced,
        itemsFound: data.itemsFound,
        errors: data.errors,
        message,
      });

      setCooldownSeconds(DEFAULT_COOLDOWN_SECONDS);

      // Invalidate inbox cache to show new items
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (utils as any).items.inbox.invalidate();
    },
    onError: (error: { data?: { code?: string }; message?: string }) => {
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
          itemsFound: 0,
          errors: [],
          message: `Try again in ${Math.ceil(seconds / 60)} minute${Math.ceil(seconds / 60) === 1 ? '' : 's'}`,
        });
      } else {
        setLastResult({
          success: false,
          synced: 0,
          itemsFound: 0,
          errors: [error.message || 'Unknown error'],
          message: error.message || 'Sync failed',
        });
      }
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
    if (cooldownSeconds > 0 || mutation.isPending) return;
    mutation.mutate();
  }, [cooldownSeconds, mutation]);

  return {
    syncAll,
    isLoading: mutation.isPending,
    cooldownSeconds,
    lastResult,
  };
}
