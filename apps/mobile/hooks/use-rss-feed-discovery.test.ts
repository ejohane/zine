import { renderHook } from '@testing-library/react-hooks';

const mockDiscoverUseQuery = jest.fn();
const mockAddUseMutation = jest.fn();
const mockRssListInvalidate = jest.fn();
const mockRssStatsInvalidate = jest.fn();
const mockItemsInboxInvalidate = jest.fn();
const mockItemsHomeInvalidate = jest.fn();

jest.mock('../lib/trpc', () => ({
  trpc: {
    subscriptions: {
      rss: {
        discover: {
          useQuery: mockDiscoverUseQuery,
        },
        add: {
          useMutation: mockAddUseMutation,
        },
      },
    },
    useUtils: jest.fn(() => ({
      subscriptions: {
        rss: {
          list: {
            invalidate: mockRssListInvalidate,
          },
          stats: {
            invalidate: mockRssStatsInvalidate,
          },
        },
      },
      items: {
        inbox: {
          invalidate: mockItemsInboxInvalidate,
        },
        home: {
          invalidate: mockItemsHomeInvalidate,
        },
      },
    })),
  },
}));

import { useRssFeedDiscovery } from './use-rss-feed-discovery';

describe('useRssFeedDiscovery', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    mockDiscoverUseQuery.mockReturnValue({
      data: undefined,
      isLoading: false,
      isFetching: false,
      error: null,
      refetch: jest.fn(),
    });

    mockAddUseMutation.mockReturnValue({
      mutate: jest.fn(),
      mutateAsync: jest.fn(),
      isPending: false,
      error: null,
    });
  });

  it('disables discovery for invalid URLs', () => {
    renderHook(() => useRssFeedDiscovery('not-a-url', true));

    expect(mockDiscoverUseQuery).toHaveBeenCalledWith(
      { url: 'not-a-url' },
      expect.objectContaining({
        enabled: false,
      })
    );
  });

  it('returns discovered candidates', () => {
    mockDiscoverUseQuery.mockReturnValue({
      data: {
        sourceUrl: 'https://example.com/post',
        sourceOrigin: 'https://example.com',
        checkedAt: 123,
        cached: false,
        candidates: [
          {
            feedUrl: 'https://example.com/feed.xml',
            title: 'Example Feed',
            description: null,
            siteUrl: 'https://example.com',
            discoveredFrom: 'page_link',
            score: 100,
            subscription: null,
          },
        ],
      },
      isLoading: false,
      isFetching: false,
      error: null,
      refetch: jest.fn(),
    });

    const { result } = renderHook(() => useRssFeedDiscovery('https://example.com/post', true));

    expect(result.current.candidates).toHaveLength(1);
    expect(result.current.candidates[0]?.feedUrl).toBe('https://example.com/feed.xml');
    expect(result.current.sourceOrigin).toBe('https://example.com');
  });

  it('invalidates rss and item queries when subscribe succeeds', () => {
    let mutationOptions: { onSuccess?: () => void } | undefined;
    mockAddUseMutation.mockImplementation((options: { onSuccess?: () => void }) => {
      mutationOptions = options;
      return {
        mutate: jest.fn(),
        mutateAsync: jest.fn(),
        isPending: false,
        error: null,
      };
    });

    renderHook(() => useRssFeedDiscovery('https://example.com/post', true));
    mutationOptions?.onSuccess?.();

    expect(mockRssListInvalidate).toHaveBeenCalledTimes(1);
    expect(mockRssStatsInvalidate).toHaveBeenCalledTimes(1);
    expect(mockItemsInboxInvalidate).toHaveBeenCalledTimes(1);
    expect(mockItemsHomeInvalidate).toHaveBeenCalledTimes(1);
  });
});
