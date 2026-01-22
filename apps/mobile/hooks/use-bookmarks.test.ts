/**
 * Tests for hooks/use-bookmarks.ts
 *
 * Tests the bookmark hooks including:
 * - isValidUrl() validation function
 * - usePreview hook behavior
 * - useSaveBookmark hook behavior
 *
 * @see Task zine-e40.7 for requirements
 */

import { renderHook, act } from '@testing-library/react-hooks';
import { ContentType, Provider, UserItemState } from '@zine/shared';

// ============================================================================
// Module-level Mocks
// ============================================================================

// Mock tRPC
const mockPreviewUseQuery = jest.fn();
const mockSaveMutate = jest.fn();
const mockSaveMutateAsync = jest.fn();
const mockLibraryCancel = jest.fn();
const mockLibraryGetData = jest.fn();
const mockLibrarySetData = jest.fn();
const mockLibraryInvalidate = jest.fn();
const mockHomeCancel = jest.fn();
const mockHomeGetData = jest.fn();
const mockHomeSetData = jest.fn();
const mockHomeInvalidate = jest.fn();
const mockInboxInvalidate = jest.fn();
const mockReset = jest.fn();
let shouldSaveError = false;

jest.mock('../lib/trpc', () => ({
  trpc: {
    bookmarks: {
      preview: {
        useQuery: mockPreviewUseQuery,
      },
      save: {
        useMutation: jest.fn((options) => {
          const runMutation = async (input: unknown) => {
            const context = await options?.onMutate?.(input);
            if (shouldSaveError) {
              const error = new Error('Failed to save');
              options?.onError?.(error, input, context);
              throw error;
            }
            options?.onSuccess?.(undefined, input, context);
            return {
              itemId: 'item-123',
              userItemId: 'user-item-123',
              status: 'created',
            };
          };

          return {
            mutate: (input: unknown) => {
              mockSaveMutate(input);
              void runMutation(input).catch(() => undefined);
            },
            mutateAsync: async (input: unknown) => {
              mockSaveMutateAsync(input);
              return runMutation(input);
            },
            isPending: false,
            isSuccess: false,
            isError: false,
            error: null,
            data: undefined,
            reset: mockReset,
          };
        }),
      },
    },
    items: {
      library: { invalidate: mockLibraryInvalidate },
      inbox: { invalidate: mockInboxInvalidate },
      home: { invalidate: mockHomeInvalidate },
    },
    useUtils: jest.fn(() => ({
      items: {
        library: {
          cancel: mockLibraryCancel,
          getData: mockLibraryGetData,
          setData: mockLibrarySetData,
          invalidate: mockLibraryInvalidate,
        },
        inbox: { invalidate: mockInboxInvalidate },
        home: {
          cancel: mockHomeCancel,
          getData: mockHomeGetData,
          setData: mockHomeSetData,
          invalidate: mockHomeInvalidate,
        },
      },
    })),
  },
}));

// ============================================================================
// Test Setup
// ============================================================================

import { isValidUrl, usePreview, useSaveBookmark, type LinkPreview } from './use-bookmarks';

// Create mock preview data
function createMockPreview(overrides: Partial<LinkPreview> = {}): LinkPreview {
  return {
    provider: Provider.YOUTUBE,
    contentType: ContentType.VIDEO,
    providerId: 'abc123',
    title: 'Test Video',
    creator: 'Test Creator',
    thumbnailUrl: 'https://example.com/thumb.jpg',
    duration: 300,
    canonicalUrl: 'https://youtube.com/watch?v=abc123',
    source: 'oembed',
    ...overrides,
  };
}

function createMockLibraryItem(overrides: Record<string, unknown> = {}) {
  return {
    id: 'user-item-1',
    itemId: 'item-1',
    title: 'Existing Item',
    thumbnailUrl: null,
    canonicalUrl: 'https://example.com/item',
    contentType: ContentType.VIDEO,
    provider: Provider.YOUTUBE,
    creator: 'Existing Creator',
    creatorImageUrl: null,
    creatorId: null,
    publisher: null,
    summary: null,
    duration: null,
    publishedAt: null,
    wordCount: null,
    readingTimeMinutes: null,
    state: UserItemState.BOOKMARKED,
    ingestedAt: new Date('2024-01-01').toISOString(),
    bookmarkedAt: new Date('2024-01-02').toISOString(),
    progress: null,
    isFinished: false,
    finishedAt: null,
    ...overrides,
  };
}

// Reset mocks before each test
beforeEach(() => {
  jest.clearAllMocks();
  shouldSaveError = false;

  mockLibraryGetData.mockReturnValue(undefined);
  mockHomeGetData.mockReturnValue(undefined);

  // Default query response
  mockPreviewUseQuery.mockReturnValue({
    data: null,
    isLoading: false,
    error: null,
    isFetching: false,
  });
});

// ============================================================================
// isValidUrl Tests
// ============================================================================

describe('isValidUrl', () => {
  describe('valid URLs', () => {
    it('returns true for https URLs', () => {
      expect(isValidUrl('https://example.com')).toBe(true);
      expect(isValidUrl('https://youtube.com/watch?v=abc123')).toBe(true);
      expect(isValidUrl('https://open.spotify.com/episode/xyz')).toBe(true);
    });

    it('returns true for http URLs', () => {
      expect(isValidUrl('http://example.com')).toBe(true);
      expect(isValidUrl('http://localhost:3000')).toBe(true);
    });

    it('trims whitespace before validation', () => {
      expect(isValidUrl('  https://example.com  ')).toBe(true);
      expect(isValidUrl('\thttps://example.com\n')).toBe(true);
    });

    it('returns true for URLs with paths and query params', () => {
      expect(isValidUrl('https://example.com/path/to/page')).toBe(true);
      expect(isValidUrl('https://example.com?foo=bar&baz=qux')).toBe(true);
      expect(isValidUrl('https://example.com/path?query=value#hash')).toBe(true);
    });

    it('returns true for URLs with ports', () => {
      expect(isValidUrl('https://example.com:8080')).toBe(true);
      expect(isValidUrl('http://localhost:3000/api')).toBe(true);
    });

    it('returns true for URLs with subdomains', () => {
      expect(isValidUrl('https://www.example.com')).toBe(true);
      expect(isValidUrl('https://api.v2.example.com')).toBe(true);
    });
  });

  describe('invalid URLs', () => {
    it('returns false for empty strings', () => {
      expect(isValidUrl('')).toBe(false);
    });

    it('returns false for whitespace-only strings', () => {
      expect(isValidUrl('   ')).toBe(false);
      expect(isValidUrl('\t\n')).toBe(false);
    });

    it('returns false for null/undefined', () => {
      expect(isValidUrl(null as unknown as string)).toBe(false);
      expect(isValidUrl(undefined as unknown as string)).toBe(false);
    });

    it('returns false for non-URL strings', () => {
      expect(isValidUrl('not a url')).toBe(false);
      expect(isValidUrl('just some text')).toBe(false);
      expect(isValidUrl('example.com')).toBe(false); // Missing protocol
    });

    it('returns false for non-http/https protocols', () => {
      expect(isValidUrl('ftp://example.com')).toBe(false);
      expect(isValidUrl('file:///path/to/file')).toBe(false);
      expect(isValidUrl('mailto:user@example.com')).toBe(false);
      expect(isValidUrl('javascript:alert(1)')).toBe(false);
    });

    it('returns false for malformed URLs', () => {
      expect(isValidUrl('https://')).toBe(false);
      expect(isValidUrl('://example.com')).toBe(false);
      expect(isValidUrl('http://')).toBe(false);
      expect(isValidUrl('https:// ')).toBe(false);
    });
  });
});

// ============================================================================
// usePreview Tests
// ============================================================================

describe('usePreview', () => {
  describe('URL validation', () => {
    it('does not fetch for invalid URLs', () => {
      renderHook(() => usePreview('not a url'));

      // Check that useQuery was called with enabled: false
      expect(mockPreviewUseQuery).toHaveBeenCalledWith(
        { url: 'not a url' },
        expect.objectContaining({ enabled: false })
      );
    });

    it('does not fetch for empty URLs', () => {
      renderHook(() => usePreview(''));

      expect(mockPreviewUseQuery).toHaveBeenCalledWith(
        { url: '' },
        expect.objectContaining({ enabled: false })
      );
    });

    it('fetches for valid URLs', () => {
      renderHook(() => usePreview('https://youtube.com/watch?v=abc123'));

      expect(mockPreviewUseQuery).toHaveBeenCalledWith(
        { url: 'https://youtube.com/watch?v=abc123' },
        expect.objectContaining({ enabled: true })
      );
    });

    it('trims whitespace from URLs', () => {
      renderHook(() => usePreview('  https://example.com  '));

      expect(mockPreviewUseQuery).toHaveBeenCalledWith(
        { url: 'https://example.com' },
        expect.objectContaining({ enabled: true })
      );
    });
  });

  describe('enabled option', () => {
    it('respects enabled: false even for valid URLs', () => {
      renderHook(() => usePreview('https://example.com', { enabled: false }));

      expect(mockPreviewUseQuery).toHaveBeenCalledWith(
        { url: 'https://example.com' },
        expect.objectContaining({ enabled: false })
      );
    });

    it('fetches when enabled is explicitly true', () => {
      renderHook(() => usePreview('https://example.com', { enabled: true }));

      expect(mockPreviewUseQuery).toHaveBeenCalledWith(
        { url: 'https://example.com' },
        expect.objectContaining({ enabled: true })
      );
    });

    it('fetches when enabled is undefined (default)', () => {
      renderHook(() => usePreview('https://example.com'));

      expect(mockPreviewUseQuery).toHaveBeenCalledWith(
        { url: 'https://example.com' },
        expect.objectContaining({ enabled: true })
      );
    });
  });

  describe('query configuration', () => {
    it('uses 5 minute stale time', () => {
      renderHook(() => usePreview('https://example.com'));

      expect(mockPreviewUseQuery).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({ staleTime: 5 * 60 * 1000 })
      );
    });

    it('uses 30 minute gc time', () => {
      renderHook(() => usePreview('https://example.com'));

      expect(mockPreviewUseQuery).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({ gcTime: 30 * 60 * 1000 })
      );
    });

    it('retries once on failure', () => {
      renderHook(() => usePreview('https://example.com'));

      expect(mockPreviewUseQuery).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({ retry: 1 })
      );
    });

    it('does not refetch on window focus', () => {
      renderHook(() => usePreview('https://example.com'));

      expect(mockPreviewUseQuery).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({ refetchOnWindowFocus: false })
      );
    });

    it('uses placeholderData for smooth transitions', () => {
      renderHook(() => usePreview('https://example.com'));

      const callArgs = mockPreviewUseQuery.mock.calls[0][1];
      expect(callArgs.placeholderData).toBeDefined();
      expect(typeof callArgs.placeholderData).toBe('function');
    });
  });

  describe('return value', () => {
    it('returns loading state', () => {
      mockPreviewUseQuery.mockReturnValue({
        data: null,
        isLoading: true,
        error: null,
        isFetching: true,
      });

      const { result } = renderHook(() => usePreview('https://example.com'));

      expect(result.current.isLoading).toBe(true);
    });

    it('returns preview data when loaded', () => {
      const mockPreview = createMockPreview();
      mockPreviewUseQuery.mockReturnValue({
        data: mockPreview,
        isLoading: false,
        error: null,
        isFetching: false,
      });

      const { result } = renderHook(() => usePreview('https://youtube.com/watch?v=abc123'));

      expect(result.current.data).toEqual(mockPreview);
      expect(result.current.isLoading).toBe(false);
    });

    it('returns error state', () => {
      const mockError = new Error('Failed to fetch preview');
      mockPreviewUseQuery.mockReturnValue({
        data: null,
        isLoading: false,
        error: mockError,
        isFetching: false,
      });

      const { result } = renderHook(() => usePreview('https://example.com'));

      expect(result.current.error).toBe(mockError);
    });
  });
});

// ============================================================================
// useSaveBookmark Tests
// ============================================================================

describe('useSaveBookmark', () => {
  describe('saveFromPreview', () => {
    it('calls mutation with preview data', () => {
      const { result } = renderHook(() => useSaveBookmark());
      const preview = createMockPreview();

      act(() => {
        result.current.saveFromPreview(preview);
      });

      expect(mockSaveMutate).toHaveBeenCalledWith(
        expect.objectContaining({
          url: preview.canonicalUrl,
          provider: preview.provider,
          contentType: preview.contentType,
          providerId: preview.providerId,
          title: preview.title,
          creator: preview.creator,
          thumbnailUrl: preview.thumbnailUrl,
          duration: preview.duration,
          canonicalUrl: preview.canonicalUrl,
          description: preview.description,
        })
      );
    });

    it('uses original URL when provided', () => {
      const { result } = renderHook(() => useSaveBookmark());
      const preview = createMockPreview();
      const originalUrl = 'https://youtu.be/abc123';

      act(() => {
        result.current.saveFromPreview(preview, originalUrl);
      });

      expect(mockSaveMutate).toHaveBeenCalledWith(
        expect.objectContaining({
          url: originalUrl,
          canonicalUrl: preview.canonicalUrl,
        })
      );
    });

    it('handles preview without description', () => {
      const { result } = renderHook(() => useSaveBookmark());
      const preview = createMockPreview({ description: undefined });

      act(() => {
        result.current.saveFromPreview(preview);
      });

      expect(mockSaveMutate).toHaveBeenCalledWith(
        expect.objectContaining({
          description: undefined,
        })
      );
    });

    it('handles preview with null thumbnailUrl', () => {
      const { result } = renderHook(() => useSaveBookmark());
      const preview = createMockPreview({ thumbnailUrl: null });

      act(() => {
        result.current.saveFromPreview(preview);
      });

      expect(mockSaveMutate).toHaveBeenCalledWith(
        expect.objectContaining({
          thumbnailUrl: null,
        })
      );
    });

    it('handles preview with null duration', () => {
      const { result } = renderHook(() => useSaveBookmark());
      const preview = createMockPreview({ duration: null });

      act(() => {
        result.current.saveFromPreview(preview);
      });

      expect(mockSaveMutate).toHaveBeenCalledWith(
        expect.objectContaining({
          duration: null,
        })
      );
    });
  });

  describe('saveFromPreviewAsync', () => {
    it('returns SaveResult on success', async () => {
      const { result } = renderHook(() => useSaveBookmark());
      const preview = createMockPreview();

      let saveResult;
      await act(async () => {
        saveResult = await result.current.saveFromPreviewAsync(preview);
      });

      expect(saveResult).toEqual({
        itemId: 'item-123',
        userItemId: 'user-item-123',
        status: 'created',
      });
    });

    it('calls mutateAsync with preview data', async () => {
      const { result } = renderHook(() => useSaveBookmark());
      const preview = createMockPreview();

      await act(async () => {
        await result.current.saveFromPreviewAsync(preview);
      });

      expect(mockSaveMutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          url: preview.canonicalUrl,
          provider: preview.provider,
          contentType: preview.contentType,
          providerId: preview.providerId,
          title: preview.title,
          creator: preview.creator,
          thumbnailUrl: preview.thumbnailUrl,
          duration: preview.duration,
          canonicalUrl: preview.canonicalUrl,
          description: preview.description,
        })
      );
    });
  });

  describe('cache invalidation', () => {
    it('invalidates library cache on success', async () => {
      const { result } = renderHook(() => useSaveBookmark());
      const preview = createMockPreview();

      await act(async () => {
        await result.current.saveFromPreviewAsync(preview);
      });

      // The mock calls onSuccess which should trigger invalidation
      expect(mockLibraryInvalidate).toHaveBeenCalled();
      expect(mockInboxInvalidate).toHaveBeenCalled();
      expect(mockHomeInvalidate).toHaveBeenCalled();
    });
  });

  describe('optimistic updates', () => {
    it('applies optimistic updates to library and home', async () => {
      const preview = createMockPreview();
      const existingItem = createMockLibraryItem();

      mockLibraryGetData.mockReturnValue({ items: [existingItem], nextCursor: null });
      mockHomeGetData.mockReturnValue({
        recentBookmarks: [existingItem],
        jumpBackIn: [],
        byContentType: {
          videos: [existingItem],
          podcasts: [],
          articles: [],
        },
      });

      const { result } = renderHook(() => useSaveBookmark());

      await act(async () => {
        await result.current.saveFromPreviewAsync(preview);
      });

      const libraryCall = mockLibrarySetData.mock.calls.find((call) => call[0] === undefined);
      expect(libraryCall).toBeDefined();
      const libraryUpdater = libraryCall?.[1];
      const updatedLibrary = libraryUpdater({ items: [existingItem], nextCursor: null });

      expect(updatedLibrary.items[0].title).toBe(preview.title);
      expect(updatedLibrary.items[0].state).toBe(UserItemState.BOOKMARKED);

      const homeUpdater = mockHomeSetData.mock.calls[0][1];
      const updatedHome = homeUpdater({
        recentBookmarks: [existingItem],
        jumpBackIn: [],
        byContentType: {
          videos: [existingItem],
          podcasts: [],
          articles: [],
        },
      });

      expect(updatedHome.recentBookmarks[0].title).toBe(preview.title);
      expect(updatedHome.byContentType.videos[0].title).toBe(preview.title);
    });

    it('rolls back optimistic updates on error', async () => {
      shouldSaveError = true;
      const preview = createMockPreview();
      const existingItem = createMockLibraryItem();
      const previousLibrary = { items: [existingItem], nextCursor: null };
      const previousHome = {
        recentBookmarks: [existingItem],
        jumpBackIn: [],
        byContentType: {
          videos: [existingItem],
          podcasts: [],
          articles: [],
        },
      };

      mockLibraryGetData.mockReturnValue(previousLibrary);
      mockHomeGetData.mockReturnValue(previousHome);

      const { result } = renderHook(() => useSaveBookmark());

      await act(async () => {
        await expect(result.current.saveFromPreviewAsync(preview)).rejects.toThrow(
          'Failed to save'
        );
      });

      const rollbackLibraryCall = mockLibrarySetData.mock.calls
        .filter((call) => call[0] === undefined)
        .pop();
      expect(rollbackLibraryCall?.[1]).toBe(previousLibrary);

      const rollbackHomeCall = mockHomeSetData.mock.calls[mockHomeSetData.mock.calls.length - 1];
      expect(rollbackHomeCall[1]).toBe(previousHome);
    });
  });

  describe('mutation state', () => {
    it('exposes isPending state', () => {
      const { result } = renderHook(() => useSaveBookmark());

      expect(typeof result.current.isPending).toBe('boolean');
    });

    it('exposes isSuccess state', () => {
      const { result } = renderHook(() => useSaveBookmark());

      expect(typeof result.current.isSuccess).toBe('boolean');
    });

    it('exposes isError state', () => {
      const { result } = renderHook(() => useSaveBookmark());

      expect(typeof result.current.isError).toBe('boolean');
    });

    it('exposes error state', () => {
      const { result } = renderHook(() => useSaveBookmark());

      expect(result.current.error).toBeNull();
    });

    it('exposes reset function', () => {
      const { result } = renderHook(() => useSaveBookmark());

      expect(typeof result.current.reset).toBe('function');

      act(() => {
        result.current.reset();
      });

      expect(mockReset).toHaveBeenCalled();
    });
  });

  describe('different providers', () => {
    it('handles Spotify podcasts', () => {
      const { result } = renderHook(() => useSaveBookmark());
      const preview = createMockPreview({
        provider: Provider.SPOTIFY,
        contentType: ContentType.PODCAST,
        providerId: 'episode-xyz',
        canonicalUrl: 'https://open.spotify.com/episode/xyz',
      });

      act(() => {
        result.current.saveFromPreview(preview);
      });

      expect(mockSaveMutate).toHaveBeenCalledWith(
        expect.objectContaining({
          provider: Provider.SPOTIFY,
          contentType: ContentType.PODCAST,
        })
      );
    });

    it('handles RSS articles', () => {
      const { result } = renderHook(() => useSaveBookmark());
      const preview = createMockPreview({
        provider: Provider.RSS,
        contentType: ContentType.ARTICLE,
        providerId: 'article-123',
        canonicalUrl: 'https://example.com/article',
      });

      act(() => {
        result.current.saveFromPreview(preview);
      });

      expect(mockSaveMutate).toHaveBeenCalledWith(
        expect.objectContaining({
          provider: Provider.RSS,
          contentType: ContentType.ARTICLE,
        })
      );
    });

    it('handles Substack posts', () => {
      const { result } = renderHook(() => useSaveBookmark());
      const preview = createMockPreview({
        provider: Provider.SUBSTACK,
        contentType: ContentType.POST,
        providerId: 'post-456',
        canonicalUrl: 'https://example.substack.com/p/post',
      });

      act(() => {
        result.current.saveFromPreview(preview);
      });

      expect(mockSaveMutate).toHaveBeenCalledWith(
        expect.objectContaining({
          provider: Provider.SUBSTACK,
          contentType: ContentType.POST,
        })
      );
    });
  });
});
