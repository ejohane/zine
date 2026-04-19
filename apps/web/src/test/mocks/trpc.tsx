import type { PropsWithChildren } from 'react';
import type { ContentType } from '@zine/shared';
import { vi } from 'vitest';

type AuthMode = 'clerk' | 'development-bypass' | 'disabled';

type QueryResult<T> = {
  data?: T;
  isLoading: boolean;
  error: Error | null;
};

type MutationOptions<TData = unknown> = {
  onSuccess?: (data: TData) => void;
  onError?: (error: Error) => void;
  onSettled?: () => void;
};

type ItemsLibraryInput = {
  limit: number;
  filter: {
    contentType?: ContentType;
  };
};

type ItemsGetInput = {
  id: string;
};

type CreatorGetInput = {
  creatorId: string;
};

type BookmarkPreviewInput = {
  url: string;
};

type DiscoverAvailableInput = {
  provider: string;
};

type NewslettersListInput = {
  status?: string;
  search?: string;
  limit?: number;
  cursor?: string;
};

type RssDiscoverInput = {
  url: string;
  refresh?: boolean;
};

type MutationSpy<TInput = unknown, TOutput = unknown> = ReturnType<
  typeof vi.fn<(input: TInput) => Promise<TOutput>>
>;

type SessionState = {
  isLoaded: boolean;
  isSignedIn: boolean;
  getToken: () => Promise<string | null>;
  signOut: (options?: { redirectUrl?: string }) => Promise<void>;
};

const authAvailability = {
  mode: 'development-bypass' as AuthMode,
  isEnabled: true,
};

const sessionState: SessionState = {
  isLoaded: true,
  isSignedIn: true,
  getToken: async () => null,
  signOut: async () => {},
};

export const invalidateSpies = {
  itemsGetInvalidate: vi.fn(async () => undefined),
  itemsLibraryInvalidate: vi.fn(async () => undefined),
  itemsHomeInvalidate: vi.fn(async () => undefined),
  subscriptionsConnectionsInvalidate: vi.fn(async () => undefined),
  subscriptionsListInvalidate: vi.fn(async () => undefined),
  subscriptionsDiscoverInvalidate: vi.fn(async () => undefined),
  newslettersListInvalidate: vi.fn(async () => undefined),
  newslettersStatsInvalidate: vi.fn(async () => undefined),
  rssListInvalidate: vi.fn(async () => undefined),
  rssStatsInvalidate: vi.fn(async () => undefined),
};

export const mutationSpies = {
  toggleFinished: vi.fn(async (_input: unknown) => undefined),
  unbookmark: vi.fn(async (_input: unknown) => undefined),
  bookmarkSave: vi.fn(async (_input: unknown) => undefined),
  subscriptionAdd: vi.fn(async (_input: unknown) => ({ success: true })),
  newslettersSyncNow: vi.fn(async (_input: unknown) => ({ success: true })),
  newslettersUpdateStatus: vi.fn(async (_input: unknown) => ({ success: true })),
  rssAdd: vi.fn(async (_input: unknown) => ({ success: true })),
};

export const hookSpies = {
  itemsLibraryUseQuery: vi.fn<(input: ItemsLibraryInput) => QueryResult<unknown>>((_input) =>
    createQueryResult({})
  ),
  itemsGetUseQuery: vi.fn<(input: ItemsGetInput, options?: unknown) => QueryResult<unknown>>(
    (_input) => createQueryResult({})
  ),
  creatorsGetUseQuery: vi.fn<(input: CreatorGetInput, options?: unknown) => QueryResult<unknown>>(
    (_input) => createQueryResult({})
  ),
  bookmarksPreviewUseQuery: vi.fn<
    (input: BookmarkPreviewInput, options?: unknown) => QueryResult<unknown>
  >((_input) => createQueryResult({})),
  bookmarksSaveUseMutation: vi.fn((options?: MutationOptions) =>
    createMutationResult(mutationSpies.bookmarkSave, options)
  ),
  toggleFinishedUseMutation: vi.fn((options?: MutationOptions) =>
    createMutationResult(mutationSpies.toggleFinished, options)
  ),
  unbookmarkUseMutation: vi.fn((options?: MutationOptions) =>
    createMutationResult(mutationSpies.unbookmark, options)
  ),
  connectionsListUseQuery: vi.fn<() => QueryResult<unknown>>(() =>
    createQueryResult({
      YOUTUBE: null,
      SPOTIFY: null,
      GMAIL: null,
    })
  ),
  subscriptionsListUseQuery: vi.fn<() => QueryResult<unknown>>(() =>
    createQueryResult({ items: [], nextCursor: null, hasMore: false })
  ),
  discoverAvailableUseQuery: vi.fn<
    (input: DiscoverAvailableInput, options?: unknown) => QueryResult<unknown>
  >((_input) =>
    createQueryResult({
      items: [],
      connectionRequired: false,
    })
  ),
  subscriptionAddUseMutation: vi.fn((options?: MutationOptions) =>
    createMutationResult(mutationSpies.subscriptionAdd, options)
  ),
  newslettersStatsUseQuery: vi.fn<() => QueryResult<unknown>>(() =>
    createQueryResult({
      total: 0,
      active: 0,
      hidden: 0,
      unsubscribed: 0,
      lastSyncAt: null,
      lastSyncStatus: 'IDLE',
      lastSyncError: null,
    })
  ),
  newslettersListUseQuery: vi.fn<
    (input?: NewslettersListInput, options?: unknown) => QueryResult<unknown>
  >((_input) =>
    createQueryResult({
      items: [],
      nextCursor: null,
      hasMore: false,
    })
  ),
  newslettersSyncNowUseMutation: vi.fn((options?: MutationOptions) =>
    createMutationResult(mutationSpies.newslettersSyncNow, options)
  ),
  newslettersUpdateStatusUseMutation: vi.fn((options?: MutationOptions) =>
    createMutationResult(mutationSpies.newslettersUpdateStatus, options)
  ),
  rssStatsUseQuery: vi.fn<() => QueryResult<unknown>>(() =>
    createQueryResult({
      total: 0,
      active: 0,
      paused: 0,
      unsubscribed: 0,
      error: 0,
      lastSuccessAt: null,
    })
  ),
  rssListUseQuery: vi.fn<() => QueryResult<unknown>>(() =>
    createQueryResult({
      items: [],
      nextCursor: null,
      hasMore: false,
    })
  ),
  rssDiscoverUseQuery: vi.fn<(input: RssDiscoverInput, options?: unknown) => QueryResult<unknown>>(
    (_input) =>
      createQueryResult({
        sourceUrl: '',
        sourceOrigin: '',
        checkedAt: '',
        cached: false,
        candidates: [],
      })
  ),
  rssAddUseMutation: vi.fn((options?: MutationOptions) =>
    createMutationResult(mutationSpies.rssAdd, options)
  ),
};

function createQueryResult<T>(data?: T, overrides: Partial<QueryResult<T>> = {}): QueryResult<T> {
  return {
    data,
    isLoading: false,
    error: null,
    ...overrides,
  };
}

function createMutationResult<TInput, TData>(
  spy: MutationSpy<TInput, TData>,
  options?: MutationOptions<TData>
) {
  const run = async (input: TInput) => {
    try {
      const result = await spy(input);
      options?.onSuccess?.(result);
      options?.onSettled?.();
      return result;
    } catch (error) {
      options?.onError?.(error instanceof Error ? error : new Error(String(error)));
      options?.onSettled?.();
      throw error;
    }
  };

  return {
    isPending: false,
    mutate: (input: TInput) => {
      void run(input);
    },
    mutateAsync: run,
  };
}

export function resetTrpcMocks() {
  authAvailability.mode = 'development-bypass';
  authAvailability.isEnabled = true;

  sessionState.isLoaded = true;
  sessionState.isSignedIn = true;
  sessionState.getToken = async () => null;
  sessionState.signOut = async () => {};

  Object.values(invalidateSpies).forEach((spy) => {
    spy.mockReset();
    spy.mockResolvedValue(undefined);
  });

  mutationSpies.toggleFinished.mockReset();
  mutationSpies.unbookmark.mockReset();
  mutationSpies.bookmarkSave.mockReset();
  mutationSpies.subscriptionAdd.mockReset();
  mutationSpies.newslettersSyncNow.mockReset();
  mutationSpies.newslettersUpdateStatus.mockReset();
  mutationSpies.rssAdd.mockReset();

  mutationSpies.toggleFinished.mockResolvedValue(undefined);
  mutationSpies.unbookmark.mockResolvedValue(undefined);
  mutationSpies.bookmarkSave.mockResolvedValue(undefined);
  mutationSpies.subscriptionAdd.mockResolvedValue({ success: true });
  mutationSpies.newslettersSyncNow.mockResolvedValue({ success: true });
  mutationSpies.newslettersUpdateStatus.mockResolvedValue({ success: true });
  mutationSpies.rssAdd.mockResolvedValue({ success: true });

  hookSpies.itemsLibraryUseQuery.mockReset();
  hookSpies.itemsLibraryUseQuery.mockImplementation((_input) => createQueryResult());

  hookSpies.itemsGetUseQuery.mockReset();
  hookSpies.itemsGetUseQuery.mockImplementation((_input) => createQueryResult());

  hookSpies.creatorsGetUseQuery.mockReset();
  hookSpies.creatorsGetUseQuery.mockImplementation((_input) => createQueryResult());

  hookSpies.bookmarksPreviewUseQuery.mockReset();
  hookSpies.bookmarksPreviewUseQuery.mockImplementation((_input) => createQueryResult());

  hookSpies.bookmarksSaveUseMutation.mockReset();
  hookSpies.bookmarksSaveUseMutation.mockImplementation((options?: MutationOptions) =>
    createMutationResult(mutationSpies.bookmarkSave, options)
  );

  hookSpies.toggleFinishedUseMutation.mockReset();
  hookSpies.toggleFinishedUseMutation.mockImplementation((options?: MutationOptions) =>
    createMutationResult(mutationSpies.toggleFinished, options)
  );

  hookSpies.unbookmarkUseMutation.mockReset();
  hookSpies.unbookmarkUseMutation.mockImplementation((options?: MutationOptions) =>
    createMutationResult(mutationSpies.unbookmark, options)
  );

  hookSpies.connectionsListUseQuery.mockReset();
  hookSpies.connectionsListUseQuery.mockImplementation(() =>
    createQueryResult({
      YOUTUBE: null,
      SPOTIFY: null,
      GMAIL: null,
    })
  );

  hookSpies.subscriptionsListUseQuery.mockReset();
  hookSpies.subscriptionsListUseQuery.mockImplementation(() =>
    createQueryResult({ items: [], nextCursor: null, hasMore: false })
  );

  hookSpies.discoverAvailableUseQuery.mockReset();
  hookSpies.discoverAvailableUseQuery.mockImplementation((_input) =>
    createQueryResult({ items: [], connectionRequired: false })
  );

  hookSpies.subscriptionAddUseMutation.mockReset();
  hookSpies.subscriptionAddUseMutation.mockImplementation((options?: MutationOptions) =>
    createMutationResult(mutationSpies.subscriptionAdd, options)
  );

  hookSpies.newslettersStatsUseQuery.mockReset();
  hookSpies.newslettersStatsUseQuery.mockImplementation(() =>
    createQueryResult({
      total: 0,
      active: 0,
      hidden: 0,
      unsubscribed: 0,
      lastSyncAt: null,
      lastSyncStatus: 'IDLE',
      lastSyncError: null,
    })
  );

  hookSpies.newslettersListUseQuery.mockReset();
  hookSpies.newslettersListUseQuery.mockImplementation((_input) =>
    createQueryResult({
      items: [],
      nextCursor: null,
      hasMore: false,
    })
  );

  hookSpies.newslettersSyncNowUseMutation.mockReset();
  hookSpies.newslettersSyncNowUseMutation.mockImplementation((options?: MutationOptions) =>
    createMutationResult(mutationSpies.newslettersSyncNow, options)
  );

  hookSpies.newslettersUpdateStatusUseMutation.mockReset();
  hookSpies.newslettersUpdateStatusUseMutation.mockImplementation((options?: MutationOptions) =>
    createMutationResult(mutationSpies.newslettersUpdateStatus, options)
  );

  hookSpies.rssStatsUseQuery.mockReset();
  hookSpies.rssStatsUseQuery.mockImplementation(() =>
    createQueryResult({
      total: 0,
      active: 0,
      paused: 0,
      unsubscribed: 0,
      error: 0,
      lastSuccessAt: null,
    })
  );

  hookSpies.rssListUseQuery.mockReset();
  hookSpies.rssListUseQuery.mockImplementation(() =>
    createQueryResult({
      items: [],
      nextCursor: null,
      hasMore: false,
    })
  );

  hookSpies.rssDiscoverUseQuery.mockReset();
  hookSpies.rssDiscoverUseQuery.mockImplementation((_input) =>
    createQueryResult({
      sourceUrl: '',
      sourceOrigin: '',
      checkedAt: '',
      cached: false,
      candidates: [],
    })
  );

  hookSpies.rssAddUseMutation.mockReset();
  hookSpies.rssAddUseMutation.mockImplementation((options?: MutationOptions) =>
    createMutationResult(mutationSpies.rssAdd, options)
  );
}

export function setAuthAvailability(nextState: Partial<typeof authAvailability>) {
  Object.assign(authAvailability, nextState);
}

export function setSessionState(nextState: Partial<SessionState>) {
  Object.assign(sessionState, nextState);
}

export const trpc = {
  useUtils: () => ({
    items: {
      get: { invalidate: invalidateSpies.itemsGetInvalidate },
      library: { invalidate: invalidateSpies.itemsLibraryInvalidate },
      home: { invalidate: invalidateSpies.itemsHomeInvalidate },
    },
    subscriptions: {
      connections: {
        list: { invalidate: invalidateSpies.subscriptionsConnectionsInvalidate },
      },
      list: { invalidate: invalidateSpies.subscriptionsListInvalidate },
      discover: {
        available: { invalidate: invalidateSpies.subscriptionsDiscoverInvalidate },
      },
      newsletters: {
        list: { invalidate: invalidateSpies.newslettersListInvalidate },
        stats: { invalidate: invalidateSpies.newslettersStatsInvalidate },
      },
      rss: {
        list: { invalidate: invalidateSpies.rssListInvalidate },
        stats: { invalidate: invalidateSpies.rssStatsInvalidate },
      },
    },
  }),
  items: {
    library: {
      useQuery: (input: ItemsLibraryInput) => hookSpies.itemsLibraryUseQuery(input),
    },
    get: {
      useQuery: (input: ItemsGetInput, options?: unknown) =>
        hookSpies.itemsGetUseQuery(input, options),
    },
    toggleFinished: {
      useMutation: (options?: MutationOptions) => hookSpies.toggleFinishedUseMutation(options),
    },
    unbookmark: {
      useMutation: (options?: MutationOptions) => hookSpies.unbookmarkUseMutation(options),
    },
  },
  creators: {
    get: {
      useQuery: (input: CreatorGetInput, options?: unknown) =>
        hookSpies.creatorsGetUseQuery(input, options),
    },
  },
  bookmarks: {
    preview: {
      useQuery: (input: BookmarkPreviewInput, options?: unknown) =>
        hookSpies.bookmarksPreviewUseQuery(input, options),
    },
    save: {
      useMutation: (options?: MutationOptions) => hookSpies.bookmarksSaveUseMutation(options),
    },
  },
  subscriptions: {
    connections: {
      list: {
        useQuery: () => hookSpies.connectionsListUseQuery(),
      },
    },
    list: {
      useQuery: () => hookSpies.subscriptionsListUseQuery(),
    },
    add: {
      useMutation: (options?: MutationOptions) => hookSpies.subscriptionAddUseMutation(options),
    },
    discover: {
      available: {
        useQuery: (input: DiscoverAvailableInput, options?: unknown) =>
          hookSpies.discoverAvailableUseQuery(input, options),
      },
    },
    newsletters: {
      stats: {
        useQuery: () => hookSpies.newslettersStatsUseQuery(),
      },
      list: {
        useQuery: (input?: NewslettersListInput, options?: unknown) =>
          hookSpies.newslettersListUseQuery(input, options),
      },
      syncNow: {
        useMutation: (options?: MutationOptions) =>
          hookSpies.newslettersSyncNowUseMutation(options),
      },
      updateStatus: {
        useMutation: (options?: MutationOptions) =>
          hookSpies.newslettersUpdateStatusUseMutation(options),
      },
    },
    rss: {
      stats: {
        useQuery: () => hookSpies.rssStatsUseQuery(),
      },
      list: {
        useQuery: () => hookSpies.rssListUseQuery(),
      },
      discover: {
        useQuery: (input: RssDiscoverInput, options?: unknown) =>
          hookSpies.rssDiscoverUseQuery(input, options),
      },
      add: {
        useMutation: (options?: MutationOptions) => hookSpies.rssAddUseMutation(options),
      },
    },
  },
};

export function useAuthAvailability() {
  return authAvailability;
}

export function useAppSession() {
  return sessionState;
}

export function RootProviders({ children }: PropsWithChildren) {
  return <>{children}</>;
}

export function useRecapTimezone() {
  return undefined;
}
