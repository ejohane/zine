/**
 * Bookmarks Hooks for Manual Link Saving
 *
 * Provides React hooks for the mobile app to interact with the bookmarks tRPC endpoints.
 * Supports URL validation, preview fetching with debouncing, and bookmark saving with
 * cache invalidation.
 *
 * @module
 */

import { trpc } from '../lib/trpc';
import { ContentType, Provider, UserItemState } from '@zine/shared';
import * as Crypto from 'expo-crypto';

// ============================================================================
// Types
// ============================================================================

/**
 * Preview data returned from bookmarks.preview
 */
export interface LinkPreview {
  provider: Provider;
  contentType: ContentType;
  providerId: string;
  title: string;
  creator: string;
  creatorImageUrl?: string;
  thumbnailUrl: string | null;
  duration: number | null;
  canonicalUrl: string;
  source: 'provider_api' | 'oembed' | 'opengraph' | 'fallback' | 'article_extractor' | 'fxtwitter';
  description?: string;
  // Article-specific fields
  siteName?: string;
  wordCount?: number;
  readingTimeMinutes?: number;
  hasArticleContent?: boolean;
  // X/Twitter-specific fields
  publishedAt?: string;
  rawMetadata?: string;
}

/**
 * Result from bookmarks.save
 */
export interface SaveResult {
  itemId: string;
  userItemId: string;
  status: 'created' | 'already_bookmarked' | 'rebookmarked';
}

/**
 * Input for saving a bookmark
 */
export interface SaveBookmarkInput {
  url: string;
  provider: Provider;
  contentType: ContentType;
  providerId: string;
  title: string;
  creator: string;
  creatorImageUrl?: string | null;
  thumbnailUrl: string | null;
  duration: number | null;
  canonicalUrl: string;
  description?: string;
  // Article-specific fields
  siteName?: string;
  wordCount?: number;
  readingTimeMinutes?: number;
  hasArticleContent?: boolean;
  // X/Twitter-specific fields
  publishedAt?: string;
  rawMetadata?: string;
}

// ============================================================================
// Optimistic Update Types
// ============================================================================

type TrpcUtils = ReturnType<typeof trpc.useUtils>;

/** Library query data type */
type LibraryData = ReturnType<TrpcUtils['items']['library']['getData']>;

/** Home query data type */
type HomeData = ReturnType<TrpcUtils['items']['home']['getData']>;

/** Inbox query data type */
type InboxData = ReturnType<TrpcUtils['items']['inbox']['getData']>;

/** Extract item type from library data */
type LibraryItem = NonNullable<LibraryData>['items'][number];

/** Extract item type from inbox data */
type InboxItem = NonNullable<InboxData>['items'][number];

/** Context for optimistic bookmark save rollback */
type OptimisticSaveContext = {
  previousLibrary?: LibraryData;
  previousContentTypeLibrary?: LibraryData;
  previousHome?: HomeData;
  previousInbox?: InboxData;
};

const HOME_SECTION_LIMIT = 5;

// ============================================================================
// Validation
// ============================================================================

/**
 * Validates whether a string is a valid HTTP/HTTPS URL.
 *
 * @param urlString - The string to validate
 * @returns true if the string is a valid HTTP or HTTPS URL
 *
 * @example
 * ```typescript
 * isValidUrl('https://youtube.com/watch?v=abc123') // => true
 * isValidUrl('not a url') // => false
 * isValidUrl('ftp://example.com') // => false (not http/https)
 * isValidUrl('') // => false
 * isValidUrl('  https://example.com  ') // => true (whitespace trimmed)
 * ```
 */
export function isValidUrl(urlString: string): boolean {
  if (!urlString || urlString.trim().length === 0) return false;
  try {
    const url = new URL(urlString.trim());
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Build a temporary ItemView for optimistic bookmark saves.
 */
function createOptimisticItem(input: SaveBookmarkInput): LibraryItem {
  const now = new Date().toISOString();
  const tempUserItemId = `temp-${Crypto.randomUUID()}`;
  const tempItemId = `temp-${Crypto.randomUUID()}`;

  return {
    id: tempUserItemId,
    itemId: tempItemId,
    title: input.title,
    thumbnailUrl: input.thumbnailUrl,
    canonicalUrl: input.canonicalUrl,
    contentType: input.contentType,
    provider: input.provider,
    creator: input.creator,
    creatorImageUrl: input.creatorImageUrl ?? null,
    creatorId: null,
    publisher: input.siteName ?? null,
    summary: input.description ?? null,
    duration: input.duration,
    publishedAt: input.publishedAt ?? null,
    wordCount: input.wordCount ?? null,
    readingTimeMinutes: input.readingTimeMinutes ?? null,
    state: UserItemState.BOOKMARKED,
    ingestedAt: now,
    bookmarkedAt: now,
    lastOpenedAt: null,
    progress: null,
    isFinished: false,
    finishedAt: null,
  };
}

// ============================================================================
// Hooks
// ============================================================================

/**
 * Hook for fetching link preview metadata.
 *
 * Validates the URL before making API calls and uses React Query's
 * caching and deduplication features for optimal performance.
 *
 * Features:
 * - URL validation before fetching
 * - 5 minute stale time (previews don't change frequently)
 * - Keeps previous data while loading new preview (placeholderData)
 * - Single retry on failure
 * - Can be disabled via options.enabled
 *
 * @param url - The URL to fetch preview for
 * @param options - Optional configuration
 * @param options.enabled - Whether the query should run (default: true)
 * @returns tRPC query result with LinkPreview data
 *
 * @example
 * ```tsx
 * function LinkPreviewCard({ url }: { url: string }) {
 *   const { data: preview, isLoading, error } = usePreview(url);
 *
 *   if (isLoading) return <LoadingSpinner />;
 *   if (error) return <ErrorMessage error={error} />;
 *   if (!preview) return <InvalidUrlMessage />;
 *
 *   return (
 *     <Card>
 *       <Image source={{ uri: preview.thumbnailUrl }} />
 *       <Text>{preview.title}</Text>
 *       <Text>{preview.creator}</Text>
 *     </Card>
 *   );
 * }
 * ```
 *
 * @example
 * ```tsx
 * // Disable query until user stops typing
 * function DebouncedPreview({ url, isTyping }: { url: string; isTyping: boolean }) {
 *   const { data: preview } = usePreview(url, { enabled: !isTyping });
 *   // ...
 * }
 * ```
 */
export function usePreview(url: string, options?: { enabled?: boolean }) {
  // Normalize URL (trim whitespace)
  const normalizedUrl = url?.trim() ?? '';

  // Only enable query when URL is valid AND enabled is not explicitly false
  const isUrlValid = isValidUrl(normalizedUrl);
  const shouldFetch = isUrlValid && options?.enabled !== false;

  return trpc.bookmarks.preview.useQuery(
    { url: normalizedUrl },
    {
      enabled: shouldFetch,
      // Keep previous data while loading new preview for smoother UX
      placeholderData: (previousData) => previousData,
      // Previews don't change frequently - cache for 5 minutes
      staleTime: 5 * 60 * 1000,
      // Keep in cache for 30 minutes
      gcTime: 30 * 60 * 1000,
      // Retry once on failure
      retry: 1,
      // Don't refetch on window focus for previews
      refetchOnWindowFocus: false,
    }
  );
}

/**
 * Hook for saving a bookmark to the user's library.
 *
 * Provides mutation functions for saving bookmarks with automatic
 * cache invalidation of library and inbox queries on success.
 *
 * Features:
 * - Invalidates items.library and items.inbox on success
 * - Provides both mutate (fire-and-forget) and mutateAsync (awaitable)
 * - Exposes loading and error states
 * - Helper function to save directly from LinkPreview
 *
 * @returns Object with mutation functions and state
 *
 * @example
 * ```tsx
 * function SaveButton({ preview }: { preview: LinkPreview }) {
 *   const { saveFromPreview, isPending, isSuccess, error } = useSaveBookmark();
 *
 *   return (
 *     <Button
 *       onPress={() => saveFromPreview(preview)}
 *       disabled={isPending}
 *     >
 *       {isPending ? 'Saving...' : isSuccess ? 'Saved!' : 'Save'}
 *     </Button>
 *   );
 * }
 * ```
 *
 * @example
 * ```tsx
 * // Using mutateAsync for sequential operations
 * async function handleSave(preview: LinkPreview) {
 *   const { saveFromPreviewAsync } = useSaveBookmark();
 *
 *   try {
 *     const result = await saveFromPreviewAsync(preview);
 *     if (result.status === 'already_bookmarked') {
 *       showToast('Already in your library');
 *     } else {
 *       showToast('Saved to library');
 *     }
 *   } catch (error) {
 *     showToast('Failed to save');
 *   }
 * }
 * ```
 */
export function useSaveBookmark() {
  const utils = trpc.useUtils();

  const mutation = trpc.bookmarks.save.useMutation({
    onMutate: async (input: SaveBookmarkInput): Promise<OptimisticSaveContext> => {
      const optimisticItem = createOptimisticItem(input);

      const cancellations: Promise<void>[] = [
        utils.items.library.cancel(),
        utils.items.home.cancel(),
        utils.items.inbox.cancel(),
      ];
      if (input.contentType) {
        cancellations.push(
          utils.items.library.cancel({ filter: { contentType: input.contentType } })
        );
      }
      await Promise.all(cancellations);

      const previousLibrary = utils.items.library.getData();
      const previousContentTypeLibrary = input.contentType
        ? utils.items.library.getData({ filter: { contentType: input.contentType } })
        : undefined;
      const previousHome = utils.items.home.getData();
      const previousInbox = utils.items.inbox.getData();

      utils.items.library.setData(undefined, (old) => {
        if (!old) {
          return { items: [optimisticItem], nextCursor: null };
        }

        return {
          ...old,
          items: [optimisticItem, ...old.items],
        };
      });

      if (input.contentType) {
        utils.items.library.setData({ filter: { contentType: input.contentType } }, (old) => {
          if (!old) {
            return { items: [optimisticItem], nextCursor: null };
          }

          return {
            ...old,
            items: [optimisticItem, ...old.items],
          };
        });
      }

      utils.items.home.setData(undefined, (old) => {
        if (!old) return old;

        const recentBookmarks = [optimisticItem, ...old.recentBookmarks].slice(
          0,
          HOME_SECTION_LIMIT
        );
        const byContentType = {
          ...old.byContentType,
          videos:
            input.contentType === ContentType.VIDEO
              ? [optimisticItem, ...old.byContentType.videos].slice(0, HOME_SECTION_LIMIT)
              : old.byContentType.videos,
          podcasts:
            input.contentType === ContentType.PODCAST
              ? [optimisticItem, ...old.byContentType.podcasts].slice(0, HOME_SECTION_LIMIT)
              : old.byContentType.podcasts,
          articles:
            input.contentType === ContentType.ARTICLE
              ? [optimisticItem, ...old.byContentType.articles].slice(0, HOME_SECTION_LIMIT)
              : old.byContentType.articles,
        };

        return {
          ...old,
          recentBookmarks,
          byContentType,
        };
      });

      const shouldRemoveInboxItem = (item: InboxItem) =>
        item.itemId === input.providerId || item.id === input.providerId;

      utils.items.inbox.setData(undefined, (old) => {
        if (!old) return old;
        const filteredItems = old.items.filter((item) => !shouldRemoveInboxItem(item));
        if (filteredItems.length === old.items.length) return old;
        return {
          ...old,
          items: filteredItems,
        };
      });

      return {
        previousLibrary,
        previousContentTypeLibrary,
        previousHome,
        previousInbox,
      };
    },
    onError: (_error, input, context) => {
      if (!context) return;

      utils.items.library.setData(undefined, context.previousLibrary);
      if (input.contentType) {
        utils.items.library.setData(
          { filter: { contentType: input.contentType } },
          context.previousContentTypeLibrary
        );
      }
      utils.items.home.setData(undefined, context.previousHome);
      utils.items.inbox.setData(undefined, context.previousInbox);
    },
    onSuccess: () => {
      // Invalidate library and inbox caches to reflect the new bookmark
      utils.items.library.invalidate();
      utils.items.inbox.invalidate();
      // Also invalidate home data since it may show recent bookmarks
      utils.items.home.invalidate();
    },
  });

  /**
   * Save a bookmark from a LinkPreview object.
   *
   * Maps the preview data to the save input format and calls the mutation.
   * This is a fire-and-forget operation - use saveFromPreviewAsync for awaitable version.
   *
   * @param preview - The LinkPreview to save
   * @param originalUrl - The original URL entered by the user (optional, defaults to canonicalUrl)
   */
  const saveFromPreview = (preview: LinkPreview, originalUrl?: string) => {
    mutation.mutate({
      url: originalUrl ?? preview.canonicalUrl,
      provider: preview.provider,
      contentType: preview.contentType,
      providerId: preview.providerId,
      title: preview.title,
      creator: preview.creator,
      creatorImageUrl: preview.creatorImageUrl ?? null,
      thumbnailUrl: preview.thumbnailUrl,
      duration: preview.duration,
      canonicalUrl: preview.canonicalUrl,
      description: preview.description,
      // Article-specific fields
      siteName: preview.siteName,
      wordCount: preview.wordCount,
      readingTimeMinutes: preview.readingTimeMinutes,
      hasArticleContent: preview.hasArticleContent,
      // X/Twitter-specific fields
      publishedAt: preview.publishedAt,
      rawMetadata: preview.rawMetadata,
    });
  };

  /**
   * Save a bookmark from a LinkPreview object (async version).
   *
   * Maps the preview data to the save input format and calls the mutation.
   * Returns a promise that resolves with the SaveResult.
   *
   * @param preview - The LinkPreview to save
   * @param originalUrl - The original URL entered by the user (optional, defaults to canonicalUrl)
   * @returns Promise resolving to SaveResult
   */
  const saveFromPreviewAsync = async (
    preview: LinkPreview,
    originalUrl?: string
  ): Promise<SaveResult> => {
    return mutation.mutateAsync({
      url: originalUrl ?? preview.canonicalUrl,
      provider: preview.provider,
      contentType: preview.contentType,
      providerId: preview.providerId,
      title: preview.title,
      creator: preview.creator,
      creatorImageUrl: preview.creatorImageUrl ?? null,
      thumbnailUrl: preview.thumbnailUrl,
      duration: preview.duration,
      canonicalUrl: preview.canonicalUrl,
      description: preview.description,
      // Article-specific fields
      siteName: preview.siteName,
      wordCount: preview.wordCount,
      readingTimeMinutes: preview.readingTimeMinutes,
      hasArticleContent: preview.hasArticleContent,
      // X/Twitter-specific fields
      publishedAt: preview.publishedAt,
      rawMetadata: preview.rawMetadata,
    });
  };

  return {
    // Raw mutation functions
    mutate: mutation.mutate,
    mutateAsync: mutation.mutateAsync,

    // Convenience wrappers for LinkPreview
    saveFromPreview,
    saveFromPreviewAsync,

    // Mutation state
    isPending: mutation.isPending,
    isSuccess: mutation.isSuccess,
    isError: mutation.isError,
    error: mutation.error,
    data: mutation.data as SaveResult | undefined,

    // Reset mutation state
    reset: mutation.reset,
  };
}

// Re-export types for convenience
export { ContentType, Provider };
