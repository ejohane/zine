/**
 * Inbox Item Types
 *
 * Type definitions for inbox items with source attribution.
 * These types extend the base ItemWithUserState to support
 * subscription-delivered content display.
 */

import type { ItemWithUserState } from '../hooks/use-items';

// ============================================================================
// Source Attribution
// ============================================================================

/**
 * Source attribution information for subscription-delivered content.
 * Provides context about where an inbox item originated from.
 *
 * Used for displaying attribution like "📺 MKBHD · 2 hours ago" in the inbox.
 */
export interface SourceAttribution {
  /** The subscription that delivered this item */
  subscriptionId: string;

  /** Display name of the source (channel/show name) */
  sourceName: string;

  /** Provider type for icon/styling purposes */
  provider: 'YOUTUBE' | 'SPOTIFY';

  /** Optional thumbnail/avatar URL for the source */
  sourceImageUrl?: string | null;
}

// ============================================================================
// Inbox Item
// ============================================================================

/**
 * Inbox item with full context for rendering in the inbox list.
 *
 * This interface extends ItemWithUserState with subscription source
 * attribution, enabling the inbox to show where each item came from
 * (e.g., "📺 MKBHD · 2 hours ago").
 *
 * Relationship to existing types:
 * - Extends `ItemWithUserState` from `apps/mobile/hooks/use-items.ts`
 * - `item` contains content metadata (title, duration, thumbnailUrl, etc.)
 * - `userItem` contains user-specific state (inbox/archived/bookmarked)
 * - `source` (optional) provides subscription attribution for display
 *
 * @example
 * ```tsx
 * const renderItem = ({ item }: { item: InboxItem }) => (
 *   <View>
 *     {item.source && (
 *       <Text>{item.source.provider === 'YOUTUBE' ? '📺' : '🎧'} {item.source.sourceName}</Text>
 *     )}
 *     <Text>{item.item.title}</Text>
 *   </View>
 * );
 * ```
 */
export interface InboxItem extends ItemWithUserState {
  /**
   * Source attribution for subscription-delivered items.
   * Present when the item was delivered via a subscription.
   * May be absent for manually-added items or items from other sources.
   */
  source?: SourceAttribution;
}

// ============================================================================
// Response Types
// ============================================================================

/**
 * Response shape from the inbox items query.
 * Used by `useInboxItems` hook and the Inbox screen.
 *
 * Supports cursor-based pagination for infinite scroll.
 */
export interface InboxItemsResponse {
  /** Array of inbox items with optional source attribution */
  items: InboxItem[];

  /** Cursor for fetching the next page of results */
  nextCursor?: string;

  /** Whether there are more items to fetch */
  hasMore: boolean;
}
