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
import { ContentType, Provider } from '@zine/shared';

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
