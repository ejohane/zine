/**
 * Tests for hooks/use-creator.ts
 *
 * Tests the creator hooks including:
 * - useCreator hook behavior
 * - useCreatorBookmarks hook behavior with pagination
 * - useCreatorPublications hook behavior with pagination
 * - useCreatorLatestContent hook behavior
 * - useCreatorSubscription hook behavior with optimistic updates
 *
 * @see Task zine-8791 for requirements
 */

import { renderHook, act } from '@testing-library/react-hooks';

// ============================================================================
// Module-level Mocks
// ============================================================================

// Mock tRPC query and mutation hooks
const mockCreatorUseQuery = jest.fn();
const mockBookmarksUseInfiniteQuery = jest.fn();
const mockPublicationsUseInfiniteQuery = jest.fn();
const mockLatestContentUseQuery = jest.fn();
const mockCheckSubscriptionUseQuery = jest.fn();
const mockSubscribeMutation = jest.fn();
const mockInvalidate = jest.fn();
const mockCancel = jest.fn();
const mockGetData = jest.fn();
const mockSetData = jest.fn();

jest.mock('../lib/trpc', () => ({
  trpc: {
    creators: {
      get: {
        useQuery: mockCreatorUseQuery,
      },
      listBookmarks: {
        useInfiniteQuery: mockBookmarksUseInfiniteQuery,
      },
      listPublications: {
        useInfiniteQuery: mockPublicationsUseInfiniteQuery,
      },
      fetchLatestContent: {
        useQuery: mockLatestContentUseQuery,
      },
      checkSubscription: {
        useQuery: mockCheckSubscriptionUseQuery,
      },
      subscribe: {
        useMutation: jest.fn((options) => {
          // Store callback references for testing
          const onMutate = options?.onMutate;
          const onError = options?.onError;
          const onSettled = options?.onSettled;

          return {
            mutate: async (input: unknown) => {
              mockSubscribeMutation(input);
              // Simulate mutation lifecycle
              const context = await onMutate?.();
              try {
                // Success path - call onSettled
                onSettled?.();
              } catch (err) {
                onError?.(err, input, context);
                throw err;
              }
            },
            isPending: false,
            error: null,
          };
        }),
      },
    },
    useUtils: jest.fn(() => ({
      creators: {
        checkSubscription: {
          cancel: mockCancel,
          getData: mockGetData,
          setData: mockSetData,
          invalidate: mockInvalidate,
        },
      },
    })),
  },
}));

// ============================================================================
// Test Setup
// ============================================================================

import {
  useCreator,
  useCreatorBookmarks,
  useCreatorPublications,
  useCreatorLatestContent,
  useCreatorSubscription,
  type Creator,
  type CreatorContentItem,
} from './use-creator';

// Create mock creator data
function createMockCreator(overrides: Partial<Creator> = {}): Creator {
  return {
    id: 'creator-123',
    name: 'Test Creator',
    imageUrl: 'https://example.com/avatar.jpg',
    provider: 'YOUTUBE',
    providerCreatorId: 'UC123456',
    description: null,
    handle: null,
    externalUrl: null,
    createdAt: 1704067200000, // 2024-01-01T00:00:00.000Z
    updatedAt: 1704067200000, // 2024-01-01T00:00:00.000Z
    ...overrides,
  };
}

// Create mock bookmark item
function createMockBookmark(overrides: Record<string, unknown> = {}) {
  return {
    userItemId: 'ui-1',
    itemId: 'item-1',
    title: 'Test Video',
    creator: 'Test Creator',
    thumbnailUrl: 'https://example.com/thumb.jpg',
    duration: 300,
    provider: 'YOUTUBE',
    contentType: 'VIDEO',
    state: 'BOOKMARKED',
    bookmarkedAt: '2024-01-01T00:00:00.000Z',
    ...overrides,
  };
}

// Create mock content item (matches backend LatestContentItem shape)
function createMockContentItem(overrides: Partial<CreatorContentItem> = {}): CreatorContentItem {
  return {
    id: 'vid-123',
    title: 'New Video',
    description: null,
    thumbnailUrl: 'https://example.com/new-thumb.jpg',
    duration: 600,
    publishedAt: 1705276800000, // 2024-01-15T00:00:00.000Z as Unix ms
    externalUrl: 'https://youtube.com/watch?v=vid-123',
    itemId: null,
    isBookmarked: false,
    ...overrides,
  };
}

// Reset mocks before each test
beforeEach(() => {
  jest.clearAllMocks();

  // Default query responses
  mockCreatorUseQuery.mockReturnValue({
    data: null,
    isLoading: false,
    error: null,
    refetch: jest.fn(),
  });

  mockBookmarksUseInfiniteQuery.mockReturnValue({
    data: null,
    isLoading: false,
    isFetchingNextPage: false,
    hasNextPage: false,
    fetchNextPage: jest.fn(),
    error: null,
    refetch: jest.fn(),
  });

  mockPublicationsUseInfiniteQuery.mockReturnValue({
    data: null,
    isLoading: false,
    isFetchingNextPage: false,
    hasNextPage: false,
    fetchNextPage: jest.fn(),
    error: null,
    refetch: jest.fn(),
  });

  mockLatestContentUseQuery.mockReturnValue({
    data: null,
    isLoading: false,
    error: null,
    refetch: jest.fn(),
  });

  mockCheckSubscriptionUseQuery.mockReturnValue({
    data: null,
    isLoading: false,
    error: null,
  });

  mockGetData.mockReturnValue(null);
});

// ============================================================================
// useCreator Tests
// ============================================================================

describe('useCreator', () => {
  describe('query configuration', () => {
    it('enables query when creatorId is provided', () => {
      renderHook(() => useCreator('creator-123'));

      expect(mockCreatorUseQuery).toHaveBeenCalledWith(
        { creatorId: 'creator-123' },
        expect.objectContaining({ enabled: true })
      );
    });

    it('disables query when creatorId is empty', () => {
      renderHook(() => useCreator(''));

      expect(mockCreatorUseQuery).toHaveBeenCalledWith(
        { creatorId: '' },
        expect.objectContaining({ enabled: false })
      );
    });

    it('uses 5 minute stale time', () => {
      renderHook(() => useCreator('creator-123'));

      expect(mockCreatorUseQuery).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({ staleTime: 5 * 60 * 1000 })
      );
    });

    it('uses 30 minute gc time', () => {
      renderHook(() => useCreator('creator-123'));

      expect(mockCreatorUseQuery).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({ gcTime: 30 * 60 * 1000 })
      );
    });
  });

  describe('return value', () => {
    it('returns loading state', () => {
      mockCreatorUseQuery.mockReturnValue({
        data: null,
        isLoading: true,
        error: null,
        refetch: jest.fn(),
      });

      const { result } = renderHook(() => useCreator('creator-123'));

      expect(result.current.isLoading).toBe(true);
      expect(result.current.creator).toBeNull();
    });

    it('returns creator data when loaded', () => {
      const mockCreator = createMockCreator();
      mockCreatorUseQuery.mockReturnValue({
        data: mockCreator,
        isLoading: false,
        error: null,
        refetch: jest.fn(),
      });

      const { result } = renderHook(() => useCreator('creator-123'));

      expect(result.current.creator).toEqual(mockCreator);
      expect(result.current.isLoading).toBe(false);
    });

    it('returns error state', () => {
      const mockError = new Error('Creator not found');
      mockCreatorUseQuery.mockReturnValue({
        data: null,
        isLoading: false,
        error: mockError,
        refetch: jest.fn(),
      });

      const { result } = renderHook(() => useCreator('creator-123'));

      expect(result.current.error).toBe(mockError);
    });

    it('returns refetch function', () => {
      const mockRefetch = jest.fn();
      mockCreatorUseQuery.mockReturnValue({
        data: null,
        isLoading: false,
        error: null,
        refetch: mockRefetch,
      });

      const { result } = renderHook(() => useCreator('creator-123'));

      expect(result.current.refetch).toBe(mockRefetch);
    });
  });
});

// ============================================================================
// useCreatorBookmarks Tests
// ============================================================================

describe('useCreatorBookmarks', () => {
  describe('query configuration', () => {
    it('enables query when creatorId is provided', () => {
      renderHook(() => useCreatorBookmarks('creator-123'));

      expect(mockBookmarksUseInfiniteQuery).toHaveBeenCalledWith(
        { creatorId: 'creator-123', limit: 20 },
        expect.objectContaining({ enabled: true })
      );
    });

    it('disables query when creatorId is empty', () => {
      renderHook(() => useCreatorBookmarks(''));

      expect(mockBookmarksUseInfiniteQuery).toHaveBeenCalledWith(
        { creatorId: '', limit: 20 },
        expect.objectContaining({ enabled: false })
      );
    });

    it('uses custom limit when provided', () => {
      renderHook(() => useCreatorBookmarks('creator-123', { limit: 10 }));

      expect(mockBookmarksUseInfiniteQuery).toHaveBeenCalledWith(
        { creatorId: 'creator-123', limit: 10 },
        expect.any(Object)
      );
    });

    it('uses default limit of 20', () => {
      renderHook(() => useCreatorBookmarks('creator-123'));

      expect(mockBookmarksUseInfiniteQuery).toHaveBeenCalledWith(
        { creatorId: 'creator-123', limit: 20 },
        expect.any(Object)
      );
    });

    it('provides getNextPageParam function', () => {
      renderHook(() => useCreatorBookmarks('creator-123'));

      const callArgs = mockBookmarksUseInfiniteQuery.mock.calls[0][1];
      expect(callArgs.getNextPageParam).toBeDefined();

      // Test the getNextPageParam function
      const result = callArgs.getNextPageParam({ nextCursor: 'cursor-abc', items: [] });
      expect(result).toBe('cursor-abc');
    });
  });

  describe('return value', () => {
    it('returns loading state', () => {
      mockBookmarksUseInfiniteQuery.mockReturnValue({
        data: null,
        isLoading: true,
        isFetchingNextPage: false,
        hasNextPage: false,
        fetchNextPage: jest.fn(),
        error: null,
        refetch: jest.fn(),
      });

      const { result } = renderHook(() => useCreatorBookmarks('creator-123'));

      expect(result.current.isLoading).toBe(true);
      expect(result.current.bookmarks).toEqual([]);
    });

    it('returns flattened bookmarks from pages', () => {
      const bookmark1 = createMockBookmark({ userItemId: 'ui-1' });
      const bookmark2 = createMockBookmark({ userItemId: 'ui-2' });
      const bookmark3 = createMockBookmark({ userItemId: 'ui-3' });

      mockBookmarksUseInfiniteQuery.mockReturnValue({
        data: {
          pages: [
            { items: [bookmark1, bookmark2], nextCursor: 'cursor-1', hasMore: true },
            { items: [bookmark3], nextCursor: null, hasMore: false },
          ],
        },
        isLoading: false,
        isFetchingNextPage: false,
        hasNextPage: false,
        fetchNextPage: jest.fn(),
        error: null,
        refetch: jest.fn(),
      });

      const { result } = renderHook(() => useCreatorBookmarks('creator-123'));

      expect(result.current.bookmarks).toHaveLength(3);
      expect(result.current.bookmarks[0]).toEqual(bookmark1);
      expect(result.current.bookmarks[1]).toEqual(bookmark2);
      expect(result.current.bookmarks[2]).toEqual(bookmark3);
    });

    it('returns empty array when data is null', () => {
      mockBookmarksUseInfiniteQuery.mockReturnValue({
        data: null,
        isLoading: false,
        isFetchingNextPage: false,
        hasNextPage: false,
        fetchNextPage: jest.fn(),
        error: null,
        refetch: jest.fn(),
      });

      const { result } = renderHook(() => useCreatorBookmarks('creator-123'));

      expect(result.current.bookmarks).toEqual([]);
    });

    it('returns pagination controls', () => {
      const mockFetchNextPage = jest.fn();
      mockBookmarksUseInfiniteQuery.mockReturnValue({
        data: { pages: [{ items: [], nextCursor: 'cursor-1', hasMore: true }] },
        isLoading: false,
        isFetchingNextPage: true,
        hasNextPage: true,
        fetchNextPage: mockFetchNextPage,
        error: null,
        refetch: jest.fn(),
      });

      const { result } = renderHook(() => useCreatorBookmarks('creator-123'));

      expect(result.current.hasNextPage).toBe(true);
      expect(result.current.isFetchingNextPage).toBe(true);
      expect(result.current.fetchNextPage).toBe(mockFetchNextPage);
    });

    it('returns error state', () => {
      const mockError = new Error('Failed to fetch bookmarks');
      mockBookmarksUseInfiniteQuery.mockReturnValue({
        data: null,
        isLoading: false,
        isFetchingNextPage: false,
        hasNextPage: false,
        fetchNextPage: jest.fn(),
        error: mockError,
        refetch: jest.fn(),
      });

      const { result } = renderHook(() => useCreatorBookmarks('creator-123'));

      expect(result.current.error).toBe(mockError);
    });
  });
});

// ============================================================================
// useCreatorPublications Tests
// ============================================================================

describe('useCreatorPublications', () => {
  describe('query configuration', () => {
    it('enables query when creatorId is provided', () => {
      renderHook(() => useCreatorPublications('creator-123'));

      expect(mockPublicationsUseInfiniteQuery).toHaveBeenCalledWith(
        { creatorId: 'creator-123', limit: 20 },
        expect.objectContaining({ enabled: true })
      );
    });

    it('disables query when creatorId is empty', () => {
      renderHook(() => useCreatorPublications(''));

      expect(mockPublicationsUseInfiniteQuery).toHaveBeenCalledWith(
        { creatorId: '', limit: 20 },
        expect.objectContaining({ enabled: false })
      );
    });

    it('uses custom limit when provided', () => {
      renderHook(() => useCreatorPublications('creator-123', { limit: 10 }));

      expect(mockPublicationsUseInfiniteQuery).toHaveBeenCalledWith(
        { creatorId: 'creator-123', limit: 10 },
        expect.any(Object)
      );
    });

    it('provides getNextPageParam function', () => {
      renderHook(() => useCreatorPublications('creator-123'));

      const callArgs = mockPublicationsUseInfiniteQuery.mock.calls[0][1];
      expect(callArgs.getNextPageParam).toBeDefined();

      const result = callArgs.getNextPageParam({ nextCursor: 'cursor-abc', items: [] });
      expect(result).toBe('cursor-abc');
    });
  });

  describe('return value', () => {
    it('returns loading state', () => {
      mockPublicationsUseInfiniteQuery.mockReturnValue({
        data: null,
        isLoading: true,
        isFetchingNextPage: false,
        hasNextPage: false,
        fetchNextPage: jest.fn(),
        error: null,
        refetch: jest.fn(),
      });

      const { result } = renderHook(() => useCreatorPublications('creator-123'));

      expect(result.current.isLoading).toBe(true);
      expect(result.current.publications).toEqual([]);
    });

    it('returns flattened publications from pages', () => {
      const publication1 = createMockBookmark({ userItemId: 'ui-1', state: 'INBOX' });
      const publication2 = createMockBookmark({ userItemId: 'ui-2', state: 'BOOKMARKED' });
      const publication3 = createMockBookmark({ userItemId: 'ui-3', state: 'ARCHIVED' });

      mockPublicationsUseInfiniteQuery.mockReturnValue({
        data: {
          pages: [
            { items: [publication1, publication2], nextCursor: 'cursor-1', hasMore: true },
            { items: [publication3], nextCursor: null, hasMore: false },
          ],
        },
        isLoading: false,
        isFetchingNextPage: false,
        hasNextPage: false,
        fetchNextPage: jest.fn(),
        error: null,
        refetch: jest.fn(),
      });

      const { result } = renderHook(() => useCreatorPublications('creator-123'));

      expect(result.current.publications).toHaveLength(3);
      expect(result.current.publications[0]).toEqual(publication1);
      expect(result.current.publications[1]).toEqual(publication2);
      expect(result.current.publications[2]).toEqual(publication3);
    });

    it('returns error state', () => {
      const mockError = new Error('Failed to fetch publications');
      mockPublicationsUseInfiniteQuery.mockReturnValue({
        data: null,
        isLoading: false,
        isFetchingNextPage: false,
        hasNextPage: false,
        fetchNextPage: jest.fn(),
        error: mockError,
        refetch: jest.fn(),
      });

      const { result } = renderHook(() => useCreatorPublications('creator-123'));

      expect(result.current.error).toBe(mockError);
    });
  });
});

// ============================================================================
// useCreatorLatestContent Tests
// ============================================================================

describe('useCreatorLatestContent', () => {
  describe('query configuration', () => {
    it('enables query when creatorId is provided', () => {
      renderHook(() => useCreatorLatestContent('creator-123'));

      expect(mockLatestContentUseQuery).toHaveBeenCalledWith(
        { creatorId: 'creator-123' },
        expect.objectContaining({ enabled: true })
      );
    });

    it('disables query when creatorId is empty', () => {
      renderHook(() => useCreatorLatestContent(''));

      expect(mockLatestContentUseQuery).toHaveBeenCalledWith(
        { creatorId: '' },
        expect.objectContaining({ enabled: false })
      );
    });

    it('uses 10 minute stale time to match server cache', () => {
      renderHook(() => useCreatorLatestContent('creator-123'));

      expect(mockLatestContentUseQuery).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({ staleTime: 10 * 60 * 1000 })
      );
    });

    it('disables refetch on window focus', () => {
      renderHook(() => useCreatorLatestContent('creator-123'));

      expect(mockLatestContentUseQuery).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({ refetchOnWindowFocus: false })
      );
    });
  });

  describe('return value', () => {
    it('returns loading state', () => {
      mockLatestContentUseQuery.mockReturnValue({
        data: null,
        isLoading: true,
        error: null,
        refetch: jest.fn(),
      });

      const { result } = renderHook(() => useCreatorLatestContent('creator-123'));

      expect(result.current.isLoading).toBe(true);
      expect(result.current.content).toEqual([]);
    });

    it('returns content items', () => {
      const content1 = createMockContentItem({ id: 'vid-1' });
      const content2 = createMockContentItem({ id: 'vid-2' });

      mockLatestContentUseQuery.mockReturnValue({
        data: { items: [content1, content2] },
        isLoading: false,
        error: null,
        refetch: jest.fn(),
      });

      const { result } = renderHook(() => useCreatorLatestContent('creator-123'));

      expect(result.current.content).toHaveLength(2);
      expect(result.current.content[0]).toEqual(content1);
    });

    it('returns provider info', () => {
      mockLatestContentUseQuery.mockReturnValue({
        data: {
          items: [],
          provider: 'YOUTUBE',
        },
        isLoading: false,
        error: null,
        refetch: jest.fn(),
      });

      const { result } = renderHook(() => useCreatorLatestContent('creator-123'));

      expect(result.current.provider).toBe('YOUTUBE');
    });

    it('returns cache status when provided', () => {
      mockLatestContentUseQuery.mockReturnValue({
        data: {
          items: [],
          cacheStatus: 'HIT',
        },
        isLoading: false,
        error: null,
        refetch: jest.fn(),
      });

      const { result } = renderHook(() => useCreatorLatestContent('creator-123'));

      expect(result.current.cacheStatus).toBe('HIT');
    });

    it('returns reason and connectUrl when content unavailable', () => {
      mockLatestContentUseQuery.mockReturnValue({
        data: {
          items: [],
          reason: 'YouTube account not connected',
          connectUrl: 'https://example.com/connect/youtube',
        },
        isLoading: false,
        error: null,
        refetch: jest.fn(),
      });

      const { result } = renderHook(() => useCreatorLatestContent('creator-123'));

      expect(result.current.content).toEqual([]);
      expect(result.current.reason).toBe('YouTube account not connected');
      expect(result.current.connectUrl).toBe('https://example.com/connect/youtube');
    });

    it('returns empty content array when data is null', () => {
      mockLatestContentUseQuery.mockReturnValue({
        data: null,
        isLoading: false,
        error: null,
        refetch: jest.fn(),
      });

      const { result } = renderHook(() => useCreatorLatestContent('creator-123'));

      expect(result.current.content).toEqual([]);
      expect(result.current.provider).toBeUndefined();
    });
  });
});

// ============================================================================
// useCreatorSubscription Tests
// ============================================================================

describe('useCreatorSubscription', () => {
  describe('query configuration', () => {
    it('enables query when creatorId is provided', () => {
      renderHook(() => useCreatorSubscription('creator-123'));

      expect(mockCheckSubscriptionUseQuery).toHaveBeenCalledWith(
        { creatorId: 'creator-123' },
        expect.objectContaining({ enabled: true })
      );
    });

    it('disables query when creatorId is empty', () => {
      renderHook(() => useCreatorSubscription(''));

      expect(mockCheckSubscriptionUseQuery).toHaveBeenCalledWith(
        { creatorId: '' },
        expect.objectContaining({ enabled: false })
      );
    });
  });

  describe('subscription status', () => {
    it('returns isSubscribed false by default', () => {
      mockCheckSubscriptionUseQuery.mockReturnValue({
        data: null,
        isLoading: false,
        error: null,
      });

      const { result } = renderHook(() => useCreatorSubscription('creator-123'));

      expect(result.current.isSubscribed).toBe(false);
    });

    it('returns isSubscribed true when subscribed', () => {
      mockCheckSubscriptionUseQuery.mockReturnValue({
        data: {
          isSubscribed: true,
          subscribedAt: '2024-01-01T00:00:00.000Z',
        },
        isLoading: false,
        error: null,
      });

      const { result } = renderHook(() => useCreatorSubscription('creator-123'));

      expect(result.current.isSubscribed).toBe(true);
      expect(result.current.subscribedAt).toBe('2024-01-01T00:00:00.000Z');
    });

    it('returns canSubscribe status', () => {
      mockCheckSubscriptionUseQuery.mockReturnValue({
        data: {
          isSubscribed: false,
          subscribedAt: null,
          canSubscribe: false,
          reason: 'Provider not supported',
        },
        isLoading: false,
        error: null,
      });

      const { result } = renderHook(() => useCreatorSubscription('creator-123'));

      expect(result.current.canSubscribe).toBe(false);
      expect(result.current.reason).toBe('Provider not supported');
    });

    it('returns loading state', () => {
      mockCheckSubscriptionUseQuery.mockReturnValue({
        data: null,
        isLoading: true,
        error: null,
      });

      const { result } = renderHook(() => useCreatorSubscription('creator-123'));

      expect(result.current.isLoading).toBe(true);
    });
  });

  describe('subscribe mutation', () => {
    it('calls mutation with creatorId', async () => {
      const { result } = renderHook(() => useCreatorSubscription('creator-123'));

      await act(async () => {
        result.current.subscribe();
      });

      expect(mockSubscribeMutation).toHaveBeenCalledWith({ creatorId: 'creator-123' });
    });

    it('cancels pending queries on mutate', async () => {
      mockCancel.mockResolvedValue(undefined);

      const { result } = renderHook(() => useCreatorSubscription('creator-123'));

      await act(async () => {
        result.current.subscribe();
      });

      expect(mockCancel).toHaveBeenCalled();
    });

    it('performs optimistic update on mutate', async () => {
      mockGetData.mockReturnValue({
        isSubscribed: false,
        subscribedAt: null,
      });

      const { result } = renderHook(() => useCreatorSubscription('creator-123'));

      await act(async () => {
        result.current.subscribe();
      });

      expect(mockSetData).toHaveBeenCalled();

      // Check that the optimistic update sets isSubscribed to true
      const setDataCall = mockSetData.mock.calls[0];
      expect(setDataCall[0]).toEqual({ creatorId: 'creator-123' });

      const updateFn = setDataCall[1];
      const updatedData = updateFn({ isSubscribed: false, subscribedAt: null });
      expect(updatedData.isSubscribed).toBe(true);
      expect(updatedData.subscribedAt).toBeDefined();
    });

    it('invalidates cache on settled', async () => {
      const { result } = renderHook(() => useCreatorSubscription('creator-123'));

      await act(async () => {
        result.current.subscribe();
      });

      expect(mockInvalidate).toHaveBeenCalled();
    });
  });

  describe('error handling', () => {
    it('returns query error', () => {
      const mockError = new Error('Failed to check subscription');
      mockCheckSubscriptionUseQuery.mockReturnValue({
        data: null,
        isLoading: false,
        error: mockError,
      });

      const { result } = renderHook(() => useCreatorSubscription('creator-123'));

      expect(result.current.error).toBe(mockError);
    });
  });
});
