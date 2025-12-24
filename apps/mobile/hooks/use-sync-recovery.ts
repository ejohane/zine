/**
 * Sync Recovery Hook for App Resume Sync
 *
 * Handles sync recovery when the app comes to foreground from inactive/background state.
 * Automatically processes the offline queue and invalidates stale caches when:
 * 1. App transitions from background/inactive to active (AppState change)
 * 2. Device comes back online after being offline
 *
 * Features:
 * - 30-second debounce to prevent rapid processing on frequent state changes
 * - Network-aware: only processes when online
 * - Integrates with offline queue and React Query cache invalidation
 *
 * @see Frontend Spec Section 9.6 for detailed requirements
 */

import { useEffect, useRef, useCallback } from 'react';
import type { AppStateStatus } from 'react-native';
import { AppState } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { offlineQueue } from '../lib/offline-queue';
import { trpc } from '../lib/trpc';

/** Debounce interval in milliseconds (30 seconds) */
const SYNC_DEBOUNCE_MS = 30_000;

/**
 * Hook that handles sync recovery when app resumes from background.
 *
 * When the app comes to foreground (AppState transition from inactive/background to active):
 * 1. Checks network connectivity with NetInfo
 * 2. Checks if the offline queue has pending items
 * 3. If online and queue not empty, processes the queue
 * 4. Invalidates relevant React Query caches to refresh stale data
 *
 * Uses a 30-second debounce to prevent rapid processing when the app
 * quickly transitions between states (e.g., during system dialogs).
 *
 * @returns Object with performSyncRecovery function for manual trigger if needed
 *
 * @example
 * ```tsx
 * // In your root layout or app provider
 * function App() {
 *   useSyncRecovery();
 *   return <RootNavigator />;
 * }
 *
 * // Or with manual trigger
 * function SyncButton() {
 *   const { performSyncRecovery } = useSyncRecovery();
 *   return <Button onPress={performSyncRecovery}>Force Sync</Button>;
 * }
 * ```
 */
export function useSyncRecovery() {
  const utils = trpc.useUtils();

  /** Track if we were previously offline to trigger recovery on reconnect */
  const wasOffline = useRef(false);

  /** Current app state for comparison on state change */
  const appState = useRef<AppStateStatus>(AppState.currentState);

  /** Timestamp of last sync recovery to implement debounce */
  const lastSyncTime = useRef<number>(0);

  /**
   * Check if enough time has passed since the last sync (30-second debounce).
   * This prevents rapid sync operations when the app state changes frequently.
   */
  const canSync = useCallback((): boolean => {
    const now = Date.now();
    const timeSinceLastSync = now - lastSyncTime.current;
    return timeSinceLastSync >= SYNC_DEBOUNCE_MS;
  }, []);

  /**
   * Perform sync recovery operations:
   * 1. Check and process offline queue
   * 2. Invalidate React Query caches for fresh data
   *
   * Respects the 30-second debounce unless force=true.
   */
  const performSyncRecovery = useCallback(
    async (options?: { force?: boolean }): Promise<void> => {
      // Check debounce (skip if forced)
      if (!options?.force && !canSync()) {
        return;
      }

      // Update last sync timestamp
      lastSyncTime.current = Date.now();

      try {
        // Step 1: Check if queue has items and process if needed
        const pendingCount = await offlineQueue.getPendingCount();
        if (pendingCount > 0) {
          await offlineQueue.processQueue();
        }

        // Step 2: Invalidate relevant caches to fetch fresh data
        // This runs regardless of queue state to ensure data is current after resume
        // Note: Using available routers (sources, items). When subscriptions router
        // is added, include subscriptions.list and subscriptions.connections.list
        await Promise.all([utils.sources.list.invalidate(), utils.items.inbox.invalidate()]);
      } catch (error) {
        // Log but don't throw - sync recovery is best-effort
        console.error('[SyncRecovery] Recovery failed:', error);
      }
    },
    [canSync, utils]
  );

  /**
   * Effect: Handle network connectivity changes.
   * When device comes back online after being offline, trigger sync recovery.
   */
  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      const isOnline = state.isConnected === true && state.isInternetReachable !== false;

      if (!isOnline) {
        // Mark that we went offline
        wasOffline.current = true;
        return;
      }

      // If we were offline and now we're back online, trigger recovery
      if (wasOffline.current) {
        wasOffline.current = false;
        performSyncRecovery();
      }
    });

    return () => unsubscribe();
  }, [performSyncRecovery]);

  /**
   * Effect: Handle AppState changes.
   * When app comes to foreground from background/inactive, trigger sync recovery.
   */
  useEffect(() => {
    const subscription = AppState.addEventListener('change', async (nextState: AppStateStatus) => {
      // Check if transitioning from inactive/background to active
      const wasInBackground = appState.current.match(/inactive|background/);
      const isNowActive = nextState === 'active';

      // Update current state reference
      appState.current = nextState;

      if (wasInBackground && isNowActive) {
        // Check network before attempting sync
        const networkState = await NetInfo.fetch();
        const isOnline =
          networkState.isConnected === true && networkState.isInternetReachable !== false;

        if (isOnline) {
          performSyncRecovery();
        }
      }
    });

    return () => subscription.remove();
  }, [performSyncRecovery]);

  return {
    /** Manually trigger sync recovery (respects debounce unless force: true) */
    performSyncRecovery,
  };
}
