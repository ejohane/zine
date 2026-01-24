/**
 * useSubscriptions Query Hook (Read-only)
 *
 * Simple query hook for fetching user subscriptions. Use this for read-only
 * scenarios like displaying subscription count on the Settings screen.
 *
 * For mutation support with offline handling, use the full useSubscriptions
 * hook (to be implemented in Section 9.5 of frontend-spec.md).
 *
 * Backend API: subscriptions.list
 *
 * @see features/subscriptions/frontend-spec.md Section 3.1.2
 */

import { keepPreviousData } from '@tanstack/react-query';
import { trpc } from '../lib/trpc';

// ============================================================================
// Types
// ============================================================================

/**
 * Subscription status values
 */
export type SubscriptionStatus = 'ACTIVE' | 'PAUSED' | 'UNSUBSCRIBED' | 'DISCONNECTED';

/**
 * Supported subscription providers
 */
export type SubscriptionProvider = 'YOUTUBE' | 'SPOTIFY';

/**
 * Subscription type returned from the backend.
 * Represents a user's subscription to a specific channel/show.
 */
export interface Subscription {
  /** Unique subscription identifier (ULID) */
  id: string;
  /** The content provider */
  provider: SubscriptionProvider;
  /** Provider-specific channel/show ID */
  providerChannelId: string;
  /** Display name of the channel/show */
  name: string;
  /** Thumbnail/avatar URL for the channel/show */
  imageUrl: string | null;
  /** Current subscription status */
  status: SubscriptionStatus;
  /** When the subscription was created (epoch ms) */
  createdAt: number;
  /** When the last item was fetched (epoch ms or null) */
  lastItemAt: number | null;
}

/**
 * Subscriptions list response shape from tRPC.
 */
export interface SubscriptionsResponse {
  /** Array of subscription items */
  items: Subscription[];
  /** Cursor for next page (ULID of last item, or null if no more) */
  nextCursor: string | null;
  /** Whether there are more items to fetch */
  hasMore: boolean;
}

// ============================================================================
// Hook
// ============================================================================

/**
 * Simple query hook for fetching subscriptions.
 *
 * Use this for read-only scenarios (e.g., Settings screen subscription count).
 * For mutation support with offline handling, use the full useSubscriptions
 * hook from Section 9.5.
 *
 * Query configuration:
 * - staleTime: 5 minutes (connection status doesn't change frequently)
 * - gcTime: 24 hours (keep in cache for offline access)
 *
 * @returns Query result with subscriptions data { items, nextCursor, hasMore }
 *
 * @example
 * ```tsx
 * function SettingsScreen() {
 *   const { data, isLoading, error } = useSubscriptions();
 *
 *   if (isLoading) return <LoadingSpinner />;
 *   if (error) return <ErrorMessage error={error} />;
 *
 *   const count = data?.items?.length ?? 0;
 *   return <Text>{count} active subscription{count !== 1 ? 's' : ''}</Text>;
 * }
 * ```
 *
 * @example
 * // Access individual subscriptions
 * ```tsx
 * function SubscriptionsList() {
 *   const { data } = useSubscriptions();
 *
 *   return data?.items.map((sub) => (
 *     <SubscriptionCard key={sub.id} subscription={sub} />
 *   ));
 * }
 * ```
 */
export function useSubscriptions() {
  // API path: subscriptions.list
  // Using type assertion until router is updated with proper typing
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (trpc as any).subscriptions.list.useQuery(
    {}, // Empty input uses defaults (limit: 50, no filters)
    {
      // Cache for 5 minutes - subscriptions don't change frequently
      staleTime: 5 * 60 * 1000,
      // Keep in cache for 24 hours for offline access
      gcTime: 24 * 60 * 60 * 1000,
      placeholderData: keepPreviousData,
    }
  );
}

/**
 * Query hook for fetching subscriptions with filtering options.
 *
 * Extends the base useSubscriptions with support for provider filtering
 * and status filtering.
 *
 * @param options - Filter options for the query
 * @returns Query result with filtered subscriptions data
 *
 * @example
 * ```tsx
 * // Get only YouTube subscriptions
 * function YouTubeSubscriptions() {
 *   const { data } = useSubscriptionsFiltered({ provider: 'YOUTUBE' });
 *   return data?.items.map((sub) => <Card key={sub.id} sub={sub} />);
 * }
 * ```
 *
 * @example
 * ```tsx
 * // Get only active subscriptions
 * function ActiveSubscriptions() {
 *   const { data } = useSubscriptionsFiltered({ status: 'ACTIVE' });
 *   return <Text>Active: {data?.items.length ?? 0}</Text>;
 * }
 * ```
 */
export function useSubscriptionsFiltered(options?: {
  /** Filter by provider */
  provider?: SubscriptionProvider;
  /** Filter by status */
  status?: SubscriptionStatus;
  /** Number of items per page (1-100, default 50) */
  limit?: number;
  /** Pagination cursor */
  cursor?: string;
}) {
  // API path: subscriptions.list
  // Using type assertion until router is updated with proper typing
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (trpc as any).subscriptions.list.useQuery(options ?? {}, {
    staleTime: 5 * 60 * 1000,
    gcTime: 24 * 60 * 60 * 1000,
    placeholderData: keepPreviousData,
  });
}
