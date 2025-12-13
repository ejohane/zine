/**
 * useSubscribe Hook for Zine Mobile
 *
 * A wrapper around Replicache's subscribe functionality with:
 * - Generic typing
 * - Loading and error states
 * - Automatic cleanup
 *
 * @module hooks/useSubscribe
 */

import { useState, useEffect, useRef } from 'react';
import type { ReadTransaction } from 'replicache';
import { useReplicache } from './useReplicache';

// ============================================================================
// Types
// ============================================================================

/**
 * Query function type for Replicache subscriptions
 */
export type QueryFn<T> = (tx: ReadTransaction) => Promise<T>;

/**
 * Result of the useSubscribe hook
 */
export interface UseSubscribeResult<T> {
  /** The current data from the subscription */
  data: T | undefined;
  /** Whether the subscription is loading initial data */
  isLoading: boolean;
  /** Any error that occurred during the subscription */
  error: Error | null;
}

/**
 * Options for useSubscribe
 */
export interface UseSubscribeOptions {
  /** Default value to use while loading or if no data */
  defaultValue?: unknown;
  /** Whether to enable the subscription (useful for conditional queries) */
  enabled?: boolean;
}

// ============================================================================
// Hook Implementation
// ============================================================================

/**
 * Subscribe to Replicache data with automatic updates
 *
 * This hook wraps Replicache's `subscribe` method and provides:
 * - Reactive data that updates when the underlying data changes
 * - Loading and error states for UI feedback
 * - Automatic cleanup on unmount
 *
 * @param queryFn - A function that queries Replicache data
 * @param deps - Dependencies array (like useEffect) to re-run the subscription
 * @param options - Optional configuration
 * @returns Subscription result with data, loading, and error states
 *
 * @example
 * ```tsx
 * import { useSubscribe } from '@/hooks/useSubscribe';
 * import { userItemScanPrefix } from '@zine/shared';
 *
 * function InboxList() {
 *   const { data: items, isLoading, error } = useSubscribe(
 *     async (tx) => {
 *       const entries = await tx.scan({ prefix: userItemScanPrefix() }).entries().toArray();
 *       return entries.map(([, value]) => value as UserItem);
 *     },
 *     [] // no dependencies
 *   );
 *
 *   if (isLoading) return <ActivityIndicator />;
 *   if (error) return <Text>Error: {error.message}</Text>;
 *
 *   return (
 *     <FlatList
 *       data={items}
 *       renderItem={({ item }) => <ItemCard item={item} />}
 *     />
 *   );
 * }
 * ```
 */
export function useSubscribe<T>(
  queryFn: QueryFn<T>,
  deps: unknown[] = [],
  options: UseSubscribeOptions = {}
): UseSubscribeResult<T> {
  const { defaultValue, enabled = true } = options;
  const { rep, isReady } = useReplicache();

  const [data, setData] = useState<T | undefined>(defaultValue as T | undefined);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  // Keep track of whether we've received initial data
  const hasReceivedData = useRef(false);

  // Memoize queryFn to avoid unnecessary re-subscriptions
  const queryFnRef = useRef(queryFn);
  queryFnRef.current = queryFn;

  useEffect(() => {
    // Don't subscribe if disabled or Replicache not ready
    if (!enabled || !isReady || !rep) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);
    hasReceivedData.current = false;

    // Create the subscription
    const unsubscribe = rep.subscribe((tx) => queryFnRef.current(tx), {
      onData: (newData) => {
        setData(newData);
        setError(null);
        if (!hasReceivedData.current) {
          hasReceivedData.current = true;
          setIsLoading(false);
        }
      },
      onError: (err) => {
        console.error('useSubscribe error:', err);
        setError(err instanceof Error ? err : new Error(String(err)));
        setIsLoading(false);
      },
      onDone: () => {
        // Subscription ended (e.g., Replicache closed)
        setIsLoading(false);
      },
    });

    // Cleanup subscription on unmount or deps change
    return () => {
      unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rep, isReady, enabled, ...deps]);

  return { data, isLoading, error };
}

/**
 * Subscribe to a single key in Replicache
 *
 * Convenience wrapper for single-key lookups.
 *
 * @param key - The key to subscribe to
 * @param options - Optional configuration
 * @returns Subscription result
 *
 * @example
 * ```tsx
 * import { useSubscribeKey } from '@/hooks/useSubscribe';
 * import { userItemKey } from '@zine/shared';
 *
 * function ItemDetail({ id }: { id: string }) {
 *   const { data: item, isLoading } = useSubscribeKey<UserItem>(
 *     userItemKey(id)
 *   );
 *
 *   if (isLoading) return <ActivityIndicator />;
 *   if (!item) return <Text>Item not found</Text>;
 *
 *   return <Text>{item.state}</Text>;
 * }
 * ```
 */
export function useSubscribeKey<T>(
  key: string,
  options: UseSubscribeOptions = {}
): UseSubscribeResult<T | undefined> {
  return useSubscribe<T | undefined>(
    async (tx) => {
      const value = await tx.get(key);
      return value as unknown as T | undefined;
    },
    [key],
    options
  );
}

/**
 * Subscribe to all entries with a given prefix
 *
 * Convenience wrapper for prefix scans.
 *
 * @param prefix - The key prefix to scan
 * @param options - Optional configuration
 * @returns Subscription result with array of values
 *
 * @example
 * ```tsx
 * import { useSubscribePrefix } from '@/hooks/useSubscribe';
 * import { sourceScanPrefix, type Source } from '@zine/shared';
 *
 * function SourceList() {
 *   const { data: sources, isLoading } = useSubscribePrefix<Source>(
 *     sourceScanPrefix()
 *   );
 *
 *   return (
 *     <FlatList
 *       data={sources}
 *       renderItem={({ item }) => <Text>{item.name}</Text>}
 *     />
 *   );
 * }
 * ```
 */
export function useSubscribePrefix<T>(
  prefix: string,
  options: UseSubscribeOptions = {}
): UseSubscribeResult<T[]> {
  return useSubscribe<T[]>(
    async (tx) => {
      const entries = await tx.scan({ prefix }).entries().toArray();
      return entries.map(([, value]) => value as unknown as T);
    },
    [prefix],
    { ...options, defaultValue: options.defaultValue ?? [] }
  );
}
