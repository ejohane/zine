import type { ContentCardData } from '../components/ContentCard';
import type { Bookmark } from '@zine/shared';

/**
 * Feed item structure from the API
 */
export interface FeedItemWithState {
  id: string;
  isRead: boolean;
  readAt?: Date;
  feedItem: {
    id: string;
    contentId?: string;
    title: string;
    externalUrl: string;
    thumbnailUrl?: string | null;
    publishedAt: string;
    contentType?: string;
    durationSeconds?: number | null;
    subscription: {
      id: string;
      providerId: string;
      externalId: string;
      title: string;
      creatorName: string;
      thumbnailUrl?: string | null;
    };
  };
}

/**
 * Converts a feed item to the normalized ContentCardData structure
 */
export function feedItemToContentCard(item: FeedItemWithState): ContentCardData {
  const { feedItem } = item;
  
  return {
    id: item.id,
    title: feedItem.title,
    thumbnailUrl: feedItem.thumbnailUrl,
    contentType: feedItem.contentType as any,
    publishedAt: feedItem.publishedAt,
    duration: feedItem.durationSeconds ?? undefined,
    creator: {
      name: feedItem.subscription.creatorName,
      avatarUrl: feedItem.subscription.thumbnailUrl,
    },
    metadata: undefined,
    source: undefined,
    alternateLinks: undefined,
  };
}

/**
 * Converts a bookmark to the normalized ContentCardData structure
 */
export function bookmarkToContentCard(bookmark: Bookmark): ContentCardData {
  // Extract duration from various metadata sources
  const duration =
    (bookmark as any).duration ??
    bookmark.videoMetadata?.duration ??
    bookmark.podcastMetadata?.duration ??
    (bookmark as any).metrics?.durationSeconds ??
    undefined;

  return {
    id: bookmark.id,
    title: bookmark.title,
    thumbnailUrl: bookmark.thumbnailUrl,
    contentType: bookmark.contentType as any,
    publishedAt: bookmark.publishedAt,
    duration,
    creator: bookmark.creator ? {
      name: bookmark.creator.name,
      avatarUrl: bookmark.creator.avatarUrl,
    } : undefined,
    metadata: {
      isPaywalled: bookmark.articleMetadata?.isPaywalled,
      readingTime: bookmark.articleMetadata?.readingTime,
    },
    source: bookmark.source,
    alternateLinks: (bookmark as any).alternateLinks,
  };
}

/**
 * Converts a feed item to a Bookmark-like structure for MediaRichBookmarkCard
 */
export function feedItemToBookmark(item: FeedItemWithState): Bookmark {
  const { feedItem } = item;
  
  // Map content type to ensure it's a valid bookmark content type
  const contentType = feedItem.contentType || 'link';
  
  // Convert ISO string to timestamp if needed
  const publishedAtTimestamp = typeof feedItem.publishedAt === 'string' 
    ? new Date(feedItem.publishedAt).getTime() 
    : feedItem.publishedAt;
  
  return {
    id: item.id,
    userId: '', // Not needed for display
    title: feedItem.title,
    url: feedItem.externalUrl,
    originalUrl: feedItem.externalUrl,
    thumbnailUrl: feedItem.thumbnailUrl || null,
    contentType: contentType as any,
    publishedAt: publishedAtTimestamp,
    createdAt: publishedAtTimestamp,
    updatedAt: publishedAtTimestamp,
    creator: {
      id: feedItem.subscription.externalId,
      name: feedItem.subscription.creatorName,
      avatarUrl: feedItem.subscription.thumbnailUrl || null,
    },
    // Map duration based on content type
    ...(contentType === 'video' && feedItem.durationSeconds ? {
      videoMetadata: { duration: feedItem.durationSeconds }
    } : {}),
    ...(contentType === 'podcast' && feedItem.durationSeconds ? {
      podcastMetadata: { duration: feedItem.durationSeconds }
    } : {}),
    source: feedItem.subscription.providerId || null,
  } as Bookmark;
}
