import { renderHook } from '@testing-library/react-hooks';

const mockListUseQuery = jest.fn();
const mockStatsUseQuery = jest.fn();
const mockAddUseMutation = jest.fn();
const mockPauseUseMutation = jest.fn();
const mockResumeUseMutation = jest.fn();
const mockRemoveUseMutation = jest.fn();
const mockSyncNowUseMutation = jest.fn();
const mockRssListInvalidate = jest.fn();
const mockRssStatsInvalidate = jest.fn();
const mockItemsInboxInvalidate = jest.fn();
const mockItemsHomeInvalidate = jest.fn();

jest.mock('../lib/trpc', () => ({
  trpc: {
    subscriptions: {
      rss: {
        list: {
          useQuery: mockListUseQuery,
        },
        stats: {
          useQuery: mockStatsUseQuery,
        },
        add: {
          useMutation: mockAddUseMutation,
        },
        pause: {
          useMutation: mockPauseUseMutation,
        },
        resume: {
          useMutation: mockResumeUseMutation,
        },
        remove: {
          useMutation: mockRemoveUseMutation,
        },
        syncNow: {
          useMutation: mockSyncNowUseMutation,
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

import { useRssFeeds } from './use-rss-feeds';

describe('useRssFeeds', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    mockListUseQuery.mockReturnValue({
      data: { items: [] },
      isLoading: false,
    });

    mockStatsUseQuery.mockReturnValue({
      data: {
        total: 0,
        active: 0,
        paused: 0,
        unsubscribed: 0,
        error: 0,
        lastSuccessAt: null,
      },
      isLoading: false,
    });

    mockAddUseMutation.mockReturnValue({
      mutate: jest.fn(),
      isPending: false,
    });
    mockPauseUseMutation.mockReturnValue({
      mutate: jest.fn(),
      isPending: false,
    });
    mockResumeUseMutation.mockReturnValue({
      mutate: jest.fn(),
      isPending: false,
    });
    mockRemoveUseMutation.mockReturnValue({
      mutate: jest.fn(),
      isPending: false,
    });
    mockSyncNowUseMutation.mockReturnValue({
      mutate: jest.fn(),
      isPending: false,
    });
  });

  it('filters unsubscribed feeds from the rendered list', () => {
    mockListUseQuery.mockReturnValue({
      data: {
        items: [
          {
            id: 'feed-active',
            feedUrl: 'https://example.com/active.xml',
            title: 'Active Feed',
            description: null,
            siteUrl: null,
            imageUrl: null,
            status: 'ACTIVE',
            errorCount: 0,
            lastError: null,
            lastPolledAt: null,
            lastSuccessAt: null,
            createdAt: 1,
            updatedAt: 1,
          },
          {
            id: 'feed-unsubscribed',
            feedUrl: 'https://example.com/unsubscribed.xml',
            title: 'Unsubscribed Feed',
            description: null,
            siteUrl: null,
            imageUrl: null,
            status: 'UNSUBSCRIBED',
            errorCount: 0,
            lastError: null,
            lastPolledAt: null,
            lastSuccessAt: null,
            createdAt: 2,
            updatedAt: 2,
          },
          {
            id: 'feed-paused',
            feedUrl: 'https://example.com/paused.xml',
            title: 'Paused Feed',
            description: null,
            siteUrl: null,
            imageUrl: null,
            status: 'PAUSED',
            errorCount: 0,
            lastError: null,
            lastPolledAt: null,
            lastSuccessAt: null,
            createdAt: 3,
            updatedAt: 3,
          },
        ],
      },
      isLoading: false,
    });

    const { result } = renderHook(() => useRssFeeds());

    expect(result.current.feeds.map((feed) => feed.id)).toEqual(['feed-active', 'feed-paused']);
  });

  it('invalidates list and stats on add success', () => {
    let addOptions: { onSuccess?: () => void } | undefined;
    mockAddUseMutation.mockImplementation((options: { onSuccess?: () => void }) => {
      addOptions = options;
      return {
        mutate: jest.fn(),
        isPending: false,
      };
    });

    renderHook(() => useRssFeeds());
    addOptions?.onSuccess?.();

    expect(mockRssListInvalidate).toHaveBeenCalledTimes(1);
    expect(mockRssStatsInvalidate).toHaveBeenCalledTimes(1);
    expect(mockItemsInboxInvalidate).toHaveBeenCalledTimes(1);
    expect(mockItemsHomeInvalidate).toHaveBeenCalledTimes(1);
  });
});
