/**
 * Domain Types for Zine
 *
 * Core domain models representing Items, UserItems, and Sources.
 */

// ============================================================================
// Enums
// ============================================================================

/**
 * Types of content that can be saved to Zine
 */
export enum ContentType {
  VIDEO = 'VIDEO',
  PODCAST = 'PODCAST',
  ARTICLE = 'ARTICLE',
  POST = 'POST',
}

/**
 * Content providers/sources
 */
export enum Provider {
  YOUTUBE = 'YOUTUBE',
  SPOTIFY = 'SPOTIFY',
  RSS = 'RSS',
  SUBSTACK = 'SUBSTACK',
}

/**
 * States for user items in the processing pipeline
 */
export enum UserItemState {
  /** New items awaiting triage */
  INBOX = 'INBOX',
  /** Items marked for future consumption */
  BOOKMARKED = 'BOOKMARKED',
  /** Items that have been consumed/dismissed */
  ARCHIVED = 'ARCHIVED',
}

// ============================================================================
// Domain Models
// ============================================================================

/**
 * An Item represents a piece of content from any provider.
 * Items are shared across users - the same video/article/podcast
 * can be referenced by multiple UserItems.
 */
export interface Item {
  /** Unique identifier (typically a ULID or UUID) */
  id: string;

  /** Type of content */
  contentType: ContentType;

  /** Provider-specific ID (e.g., YouTube video ID) */
  providerId?: string;

  /** Canonical URL to the content */
  canonicalUrl?: string;

  /** Title of the content */
  title?: string;

  /** Summary or description */
  summary?: string;

  /** Author/creator name */
  author?: string;

  /** Publisher/channel name */
  publisher?: string;

  /** When the content was originally published */
  publishedAt?: string;

  /** URL to thumbnail image */
  thumbnailUrl?: string;

  /** Duration in seconds (for video/audio content) */
  duration?: number;

  /** When this Item record was created */
  createdAt: string;

  /** When this Item record was last updated */
  updatedAt: string;
}

/**
 * A UserItem represents a user's relationship with an Item.
 * Each user has their own UserItem for each Item they interact with.
 */
export interface UserItem {
  /** Unique identifier for this user-item relationship */
  id: string;

  /** Reference to the Item */
  itemId: string;

  /** Current state in the user's workflow */
  state: UserItemState;

  /** When the item was ingested into the user's queue */
  ingestedAt: string;

  /** When the item was bookmarked (if ever) */
  bookmarkedAt?: string;

  /** When the item was archived (if ever) */
  archivedAt?: string;
}

/**
 * A Source represents a subscription to a content provider.
 * Users subscribe to Sources to automatically receive new content.
 */
export interface Source {
  /** Unique identifier */
  id: string;

  /** The provider type */
  provider: Provider;

  /** Provider-specific identifier (e.g., channel ID, feed URL) */
  providerId: string;

  /** Display name for the source */
  name: string;

  /** Provider-specific configuration */
  config?: Record<string, unknown>;

  /** When this source was created */
  createdAt: string;
}

// ============================================================================
// Type Guards
// ============================================================================

/**
 * Type guard to check if a value is a valid ContentType
 */
export function isContentType(value: unknown): value is ContentType {
  return Object.values(ContentType).includes(value as ContentType);
}

/**
 * Type guard to check if a value is a valid Provider
 */
export function isProvider(value: unknown): value is Provider {
  return Object.values(Provider).includes(value as Provider);
}

/**
 * Type guard to check if a value is a valid UserItemState
 */
export function isUserItemState(value: unknown): value is UserItemState {
  return Object.values(UserItemState).includes(value as UserItemState);
}
