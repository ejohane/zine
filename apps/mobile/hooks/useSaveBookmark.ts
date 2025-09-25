import { useState, useEffect, useCallback, useRef } from 'react';
import { bookmarksApi } from '../lib/api';
import { validateAndNormalizeUrl } from '../lib/url-validation';
import type { Bookmark } from '@zine/shared';

interface UseSaveBookmarkOptions {
  skipDebounce?: boolean;
}

export function useSaveBookmark(options: UseSaveBookmarkOptions = {}) {
  const { skipDebounce = false } = options;
  const [preview, setPreview] = useState<Bookmark | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUrl, setLastUrl] = useState<string>('');
  const [previewedUrl, setPreviewedUrl] = useState<string>('');
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Clear any pending debounce timer on unmount
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);

  // Handle preview with debounce
  useEffect(() => {
    // Skip if we already have a preview for this URL
    if (lastUrl && lastUrl === previewedUrl) {
      return;
    }

    // Clear any existing timer
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    // If URL is empty, clear preview
    if (!lastUrl) {
      setPreview(null);
      setError(null);
      setPreviewedUrl('');
      return;
    }

    // Validate URL
    const validation = validateAndNormalizeUrl(lastUrl);
    if (!validation.isValid || !validation.normalizedUrl) {
      setError(validation.error || 'Invalid URL');
      setPreview(null);
      setPreviewedUrl('');
      return;
    }

    // Skip if we already previewed this normalized URL
    if (validation.normalizedUrl === previewedUrl) {
      return;
    }

    // For clipboard URLs or when skip debounce is true, preview immediately
    const delay = skipDebounce ? 0 : 1000;

    debounceTimerRef.current = setTimeout(async () => {
      setIsLoading(true);
      setError(null);

      try {
        const bookmarkPreview = await bookmarksApi.preview(validation.normalizedUrl);
        setPreview(bookmarkPreview);
        setPreviewedUrl(validation.normalizedUrl);
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Failed to preview bookmark';
        setError(errorMessage);
        setPreview(null);
        setPreviewedUrl('');
      } finally {
        setIsLoading(false);
      }
    }, delay);

    // Cleanup function to clear timer
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [lastUrl, previewedUrl, skipDebounce]);

  const updateUrl = useCallback((url: string, immediate = false) => {
    // If URL is cleared, reset the previewed URL as well
    if (!url) {
      setPreviewedUrl('');
    }
    
    // If immediate is true and we have a valid URL, set skipDebounce temporarily
    if (immediate && url) {
      // Clear any pending timer to ensure immediate execution
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
      // Force immediate preview by resetting previewedUrl
      setPreviewedUrl('');
    }
    
    setLastUrl(url);
  }, []);

  const retry = useCallback(() => {
    if (!lastUrl) return;
    
    // Reset the previewed URL to force a new preview
    setPreviewedUrl('');
    const currentUrl = lastUrl;
    setLastUrl('');
    
    // Use setTimeout to ensure state updates propagate
    setTimeout(() => {
      setLastUrl(currentUrl);
    }, 50);
  }, [lastUrl]);

  const saveBookmark = useCallback(async (): Promise<Bookmark | null> => {
    if (!lastUrl) {
      setError('No URL to save');
      return null;
    }

    const validation = validateAndNormalizeUrl(lastUrl);
    if (!validation.isValid || !validation.normalizedUrl) {
      setError('Invalid URL');
      return null;
    }

    setIsSaving(true);
    setError(null);

    try {
      const savedBookmark = await bookmarksApi.save(validation.normalizedUrl);
      return savedBookmark;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to save bookmark';
      setError(errorMessage);
      return null;
    } finally {
      setIsSaving(false);
    }
  }, [lastUrl]);

  const clearPreview = useCallback(() => {
    setPreview(null);
    setPreviewedUrl('');
    setLastUrl('');
    setError(null);
  }, []);

  return {
    preview,
    isLoading,
    isSaving,
    error,
    saveBookmark,
    updateUrl,
    retry,
    clearPreview,
    hasValidUrl: !!preview,
  };
}