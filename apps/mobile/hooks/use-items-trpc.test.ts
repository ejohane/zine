/**
 * Tests for hooks/use-items-trpc.ts
 *
 * Verifies list query hooks use placeholder data for cache-first UX,
 * plus optimistic toggle/rollback behavior for mark-as-complete.
 */

import { act, renderHook } from '@testing-library/react-hooks';
import { ContentType, Provider, UserItemState } from '@zine/shared';

// ============================================================================
// Module-level Mocks
// ============================================================================

const mockInboxUseQuery = jest.fn();
const mockInboxUseInfiniteQuery = jest.fn();
const mockLibraryUseQuery = jest.fn();
const mockLibraryUseInfiniteQuery = jest.fn();
const mockHomeUseQuery = jest.fn();
const mockBookmarkUseMutation = jest.fn();
const mockArchiveUseMutation = jest.fn();
const mockToggleFinishedUseMutation = jest.fn();
const mockUseUtils = jest.fn();

jest.mock('../lib/trpc', () => ({
  trpc: {
    items: {
      inbox: {
        useQuery: mockInboxUseQuery,
        useInfiniteQuery: mockInboxUseInfiniteQuery,
      },
      library: {
        useQuery: mockLibraryUseQuery,
        useInfiniteQuery: mockLibraryUseInfiniteQuery,
      },
      home: {
        useQuery: mockHomeUseQuery,
      },
      bookmark: {
        useMutation: (...args: unknown[]) => mockBookmarkUseMutation(...args),
      },
      archive: {
        useMutation: (...args: unknown[]) => mockArchiveUseMutation(...args),
      },
      toggleFinished: {
        useMutation: (...args: unknown[]) => mockToggleFinishedUseMutation(...args),
      },
    },
    useUtils: (...args: unknown[]) => mockUseUtils(...args),
  },
}));

// ============================================================================
// Test Setup
// ============================================================================

import {
  useInboxItems,
  useInfiniteInboxItems,
  useLibraryItems,
  useInfiniteLibraryItems,
  useHomeData,
  useBookmarkItem,
  useArchiveItem,
  useToggleFinished,
} from './use-items-trpc';

function createMockItem(overrides: Record<string, unknown> = {}) {
  return {
    id: 'item-1',
    itemId: 'canonical-1',
    title: 'Test Item',
    thumbnailUrl: null,
    canonicalUrl: 'https://example.com/item-1',
    contentType: ContentType.ARTICLE,
    provider: Provider.RSS,
    creator: 'Test Creator',
    creatorImageUrl: null,
    creatorId: null,
    publisher: null,
    summary: null,
    duration: null,
    publishedAt: null,
    wordCount: null,
    readingTimeMinutes: null,
    state: UserItemState.BOOKMARKED,
    ingestedAt: '2026-01-01T00:00:00.000Z',
    bookmarkedAt: '2026-01-01T00:00:00.000Z',
    lastOpenedAt: null,
    progress: null,
    isFinished: false,
    finishedAt: null,
    tags: [],
    ...overrides,
  };
}

type MockListData = {
  items: ReturnType<typeof createMockItem>[];
  nextCursor: string | null;
};

type MockInfiniteListData = {
  pages: MockListData[];
  pageParams: unknown[];
};

type MockHomeData = {
  recentBookmarks: ReturnType<typeof createMockItem>[];
  jumpBackIn: ReturnType<typeof createMockItem>[];
  byContentType: {
    videos: ReturnType<typeof createMockItem>[];
    podcasts: ReturnType<typeof createMockItem>[];
    articles: ReturnType<typeof createMockItem>[];
  };
};

function createMockHomeData(items: ReturnType<typeof createMockItem>[] = []): MockHomeData {
  return {
    recentBookmarks: items,
    jumpBackIn: items.filter((item) => item.lastOpenedAt !== null),
    byContentType: {
      videos: items.filter((item) => item.contentType === ContentType.VIDEO),
      podcasts: items.filter((item) => item.contentType === ContentType.PODCAST),
      articles: items.filter((item) => item.contentType === ContentType.ARTICLE),
    },
  };
}

function serializeLibraryInput(
  input?:
    | {
        filter?: {
          isFinished?: boolean;
          provider?: Provider;
          contentType?: ContentType;
        };
        search?: string;
      }
    | undefined
): string {
  if (!input) return 'default';

  const filter = input.filter ?? {};

  return JSON.stringify({
    isFinished: filter.isFinished,
    provider: filter.provider,
    contentType: filter.contentType,
    search: input.search,
  });
}

function createToggleUtils(initial?: {
  defaultLibrary?: MockListData;
  unfinishedLibrary?: MockListData;
  finishedLibrary?: MockListData;
  inbox?: MockListData;
  home?: MockHomeData;
  itemsById?: Record<string, ReturnType<typeof createMockItem> | undefined>;
}) {
  const libraryDataByKey = new Map<string, MockListData | undefined>();

  if (initial?.defaultLibrary) {
    libraryDataByKey.set('default', initial.defaultLibrary);
  }
  if (initial?.unfinishedLibrary) {
    libraryDataByKey.set(
      serializeLibraryInput({ filter: { isFinished: false } }),
      initial.unfinishedLibrary
    );
  }
  if (initial?.finishedLibrary) {
    libraryDataByKey.set(
      serializeLibraryInput({ filter: { isFinished: true } }),
      initial.finishedLibrary
    );
  }

  const inboxRef: { current: MockListData | undefined } = {
    current: initial?.inbox,
  };
  const inboxInfiniteRef: { current: MockInfiniteListData | undefined } = {
    current: initial?.inbox
      ? {
          pages: [initial.inbox],
          pageParams: [],
        }
      : undefined,
  };
  const libraryInfiniteRef: { current: MockInfiniteListData | undefined } = {
    current: initial?.defaultLibrary
      ? {
          pages: [initial.defaultLibrary],
          pageParams: [],
        }
      : undefined,
  };

  const itemsById = new Map<string, ReturnType<typeof createMockItem> | undefined>(
    Object.entries(initial?.itemsById ?? {})
  );
  const homeRef: { current: MockHomeData | undefined } = {
    current: initial?.home,
  };

  const mockLibraryCancel = jest.fn().mockResolvedValue(undefined);
  const mockInboxCancel = jest.fn().mockResolvedValue(undefined);
  const mockHomeCancel = jest.fn().mockResolvedValue(undefined);
  const mockGetCancel = jest.fn().mockResolvedValue(undefined);

  const mockLibraryInvalidate = jest.fn();
  const mockInboxInvalidate = jest.fn();
  const mockHomeInvalidate = jest.fn();
  const mockGetInvalidate = jest.fn();
  const mockWeeklyRecapInvalidate = jest.fn();
  const mockWeeklyRecapTeaserInvalidate = jest.fn();

  const utils = {
    items: {
      library: {
        cancel: mockLibraryCancel,
        invalidate: mockLibraryInvalidate,
        getData: jest.fn((input?: Parameters<typeof serializeLibraryInput>[0]) =>
          libraryDataByKey.get(serializeLibraryInput(input))
        ),
        getInfiniteData: jest.fn(() => libraryInfiniteRef.current),
        setData: jest.fn((input: Parameters<typeof serializeLibraryInput>[0], updater: unknown) => {
          const key = serializeLibraryInput(input);
          const previous = libraryDataByKey.get(key);
          const next =
            typeof updater === 'function'
              ? (updater as (value: MockListData | undefined) => MockListData | undefined)(previous)
              : (updater as MockListData | undefined);
          libraryDataByKey.set(key, next);
          return next;
        }),
        setInfiniteData: jest.fn((_: undefined, updater: unknown) => {
          const previous = libraryInfiniteRef.current;
          const next =
            typeof updater === 'function'
              ? (
                  updater as (
                    value: MockInfiniteListData | undefined
                  ) => MockInfiniteListData | undefined
                )(previous)
              : (updater as MockInfiniteListData | undefined);
          libraryInfiniteRef.current = next;
          return next;
        }),
      },
      inbox: {
        cancel: mockInboxCancel,
        invalidate: mockInboxInvalidate,
        getData: jest.fn(() => inboxRef.current),
        getInfiniteData: jest.fn(() => inboxInfiniteRef.current),
        setData: jest.fn((_: undefined, updater: unknown) => {
          const previous = inboxRef.current;
          const next =
            typeof updater === 'function'
              ? (updater as (value: MockListData | undefined) => MockListData | undefined)(previous)
              : (updater as MockListData | undefined);
          inboxRef.current = next;
          return next;
        }),
        setInfiniteData: jest.fn((_: undefined, updater: unknown) => {
          const previous = inboxInfiniteRef.current;
          const next =
            typeof updater === 'function'
              ? (
                  updater as (
                    value: MockInfiniteListData | undefined
                  ) => MockInfiniteListData | undefined
                )(previous)
              : (updater as MockInfiniteListData | undefined);
          inboxInfiniteRef.current = next;
          return next;
        }),
      },
      home: {
        cancel: mockHomeCancel,
        invalidate: mockHomeInvalidate,
        getData: jest.fn(() => homeRef.current),
        setData: jest.fn((_: undefined, updater: unknown) => {
          const previous = homeRef.current;
          const next =
            typeof updater === 'function'
              ? (updater as (value: MockHomeData | undefined) => MockHomeData | undefined)(previous)
              : (updater as MockHomeData | undefined);
          homeRef.current = next;
          return next;
        }),
      },
      get: {
        cancel: mockGetCancel,
        invalidate: mockGetInvalidate,
        getData: jest.fn(({ id }: { id: string }) => itemsById.get(id)),
        setData: jest.fn(({ id }: { id: string }, updater: unknown) => {
          const previous = itemsById.get(id);
          const next =
            typeof updater === 'function'
              ? (
                  updater as (
                    value: ReturnType<typeof createMockItem> | undefined
                  ) => ReturnType<typeof createMockItem> | undefined
                )(previous)
              : (updater as ReturnType<typeof createMockItem> | undefined);
          itemsById.set(id, next);
          return next;
        }),
      },
    },
    insights: {
      weeklyRecap: {
        invalidate: mockWeeklyRecapInvalidate,
      },
      weeklyRecapTeaser: {
        invalidate: mockWeeklyRecapTeaserInvalidate,
      },
    },
  };

  return {
    utils,
    readLibrary: (input?: Parameters<typeof serializeLibraryInput>[0]) =>
      libraryDataByKey.get(serializeLibraryInput(input)),
    readInbox: () => inboxRef.current,
    readHome: () => homeRef.current,
    readItem: (id: string) => itemsById.get(id),
    spies: {
      mockLibraryInvalidate,
      mockInboxInvalidate,
      mockHomeInvalidate,
      mockGetInvalidate,
      mockWeeklyRecapInvalidate,
      mockWeeklyRecapTeaserInvalidate,
    },
  };
}

beforeEach(() => {
  jest.clearAllMocks();

  mockInboxUseQuery.mockReturnValue({
    data: null,
    isLoading: false,
    error: null,
  });
  mockInboxUseInfiniteQuery.mockReturnValue({
    data: null,
    isLoading: false,
    error: null,
    isFetchingNextPage: false,
    hasNextPage: false,
    fetchNextPage: jest.fn(),
  });
  mockLibraryUseQuery.mockReturnValue({
    data: null,
    isLoading: false,
    error: null,
  });
  mockLibraryUseInfiniteQuery.mockReturnValue({
    data: null,
    isLoading: false,
    error: null,
    isFetchingNextPage: false,
    hasNextPage: false,
    fetchNextPage: jest.fn(),
  });
  mockHomeUseQuery.mockReturnValue({
    data: null,
    isLoading: false,
    error: null,
  });

  mockArchiveUseMutation.mockImplementation((config: unknown) => ({
    ...(config as Record<string, unknown>),
    mutate: jest.fn(),
    mutateAsync: jest.fn(),
    isPending: false,
  }));

  mockBookmarkUseMutation.mockImplementation((config: unknown) => ({
    ...(config as Record<string, unknown>),
    mutate: jest.fn(),
    mutateAsync: jest.fn(),
    isPending: false,
  }));

  mockToggleFinishedUseMutation.mockImplementation((config: unknown) => ({
    ...(config as Record<string, unknown>),
    mutate: jest.fn(),
    mutateAsync: jest.fn(),
    isPending: false,
  }));

  mockUseUtils.mockReturnValue(createToggleUtils().utils);
});

// ============================================================================
// List Query Placeholder Data
// ============================================================================

describe('useItems list queries', () => {
  it('uses placeholderData for inbox items', () => {
    renderHook(() => useInboxItems({ filter: { provider: Provider.YOUTUBE } }));

    const callArgs = mockInboxUseQuery.mock.calls[0][1];
    expect(callArgs.placeholderData).toBeDefined();
    expect(typeof callArgs.placeholderData).toBe('function');
  });

  it('uses placeholderData for library items', () => {
    renderHook(() => useLibraryItems({ filter: { contentType: ContentType.ARTICLE } }));

    expect(mockLibraryUseQuery).toHaveBeenCalledWith(
      { filter: { contentType: ContentType.ARTICLE } },
      expect.objectContaining({ placeholderData: expect.any(Function) })
    );
  });

  it('trims library search query before requesting data', () => {
    renderHook(() =>
      useLibraryItems({
        search: '  all in  ',
      })
    );

    expect(mockLibraryUseQuery).toHaveBeenCalledWith(
      { search: 'all in' },
      expect.objectContaining({ placeholderData: expect.any(Function) })
    );
  });

  it('uses placeholderData for home data', () => {
    renderHook(() => useHomeData());

    expect(mockHomeUseQuery).toHaveBeenCalledWith(
      undefined,
      expect.objectContaining({ placeholderData: expect.any(Function) })
    );
  });

  it('configures infinite inbox queries with cursor pagination', () => {
    renderHook(() => useInfiniteInboxItems({ limit: 30 }));

    expect(mockInboxUseInfiniteQuery).toHaveBeenCalledWith(
      { limit: 30 },
      expect.objectContaining({
        getNextPageParam: expect.any(Function),
        placeholderData: expect.any(Function),
      })
    );

    const options = mockInboxUseInfiniteQuery.mock.calls[0][1];
    expect(options.getNextPageParam({ nextCursor: 'cursor-123', items: [] })).toBe('cursor-123');
  });

  it('configures infinite library queries with trimmed search input', () => {
    renderHook(() =>
      useInfiniteLibraryItems({
        search: '  all in  ',
      })
    );

    expect(mockLibraryUseInfiniteQuery).toHaveBeenCalledWith(
      { search: 'all in' },
      expect.objectContaining({
        getNextPageParam: expect.any(Function),
        placeholderData: expect.any(Function),
      })
    );

    const options = mockLibraryUseInfiniteQuery.mock.calls[0][1];
    expect(options.getNextPageParam({ nextCursor: 'cursor-abc', items: [] })).toBe('cursor-abc');
  });
});

describe('useArchiveItem', () => {
  type ArchiveHandlers = {
    onMutate: ({ id }: { id: string }) => Promise<unknown>;
    onError: (error: unknown, vars: { id: string }, context?: unknown) => void;
    onSettled: (data: unknown, error: unknown, vars: { id: string }) => void;
  };

  function getArchiveHandlers() {
    const { result } = renderHook(() => useArchiveItem());
    return result.current as unknown as ArchiveHandlers;
  }

  it('optimistically updates the single item cache when archiving from detail', async () => {
    const item = createMockItem({ id: 'archive-item', state: UserItemState.INBOX });
    const harness = createToggleUtils({
      inbox: {
        items: [item],
        nextCursor: null,
      },
      itemsById: {
        [item.id]: item,
      },
    });
    mockUseUtils.mockReturnValue(harness.utils);

    const mutation = getArchiveHandlers();

    let context: unknown;

    await act(async () => {
      context = await mutation.onMutate({ id: item.id });
    });

    expect(harness.readInbox()?.items).toHaveLength(0);
    expect(harness.readItem(item.id)?.state).toBe(UserItemState.ARCHIVED);

    act(() => {
      mutation.onError(new Error('Archive failed'), { id: item.id }, context);
    });

    expect(harness.readInbox()?.items[0]?.id).toBe(item.id);
    expect(harness.readItem(item.id)?.state).toBe(UserItemState.INBOX);

    act(() => {
      mutation.onSettled(undefined, undefined, { id: item.id });
    });

    expect(harness.spies.mockGetInvalidate).toHaveBeenCalledWith({ id: item.id });
  });

  it('applies optimistic archive state immediately without waiting for query cancellation', async () => {
    const item = createMockItem({ id: 'archive-immediate-item', state: UserItemState.INBOX });
    const harness = createToggleUtils({
      inbox: {
        items: [item],
        nextCursor: null,
      },
      defaultLibrary: {
        items: [item],
        nextCursor: null,
      },
      itemsById: {
        [item.id]: item,
      },
    });

    const neverResolves = new Promise<void>(() => {});
    (harness.utils.items.library.cancel as jest.Mock).mockReturnValue(neverResolves);
    (harness.utils.items.inbox.cancel as jest.Mock).mockReturnValue(neverResolves);
    (harness.utils.items.home.cancel as jest.Mock).mockReturnValue(neverResolves);
    (harness.utils.items.get.cancel as jest.Mock).mockReturnValue(neverResolves);

    mockUseUtils.mockReturnValue(harness.utils);

    const mutation = getArchiveHandlers();

    const mutatePromise = mutation.onMutate({ id: item.id });
    await act(async () => {
      await Promise.resolve();
    });

    expect(harness.readInbox()?.items).toHaveLength(0);
    expect(harness.readLibrary()?.items).toHaveLength(0);
    expect(harness.readItem(item.id)?.state).toBe(UserItemState.ARCHIVED);

    const pendingSentinel = Symbol('pending');
    await expect(Promise.race([mutatePromise, Promise.resolve(pendingSentinel)])).resolves.not.toBe(
      pendingSentinel
    );
  });

  it('removes archived items from home caches immediately', async () => {
    const item = createMockItem({ id: 'archive-home-item', state: UserItemState.BOOKMARKED });
    const harness = createToggleUtils({
      defaultLibrary: {
        items: [item],
        nextCursor: null,
      },
      home: createMockHomeData([item]),
      itemsById: {
        [item.id]: item,
      },
    });

    mockUseUtils.mockReturnValue(harness.utils);

    const mutation = getArchiveHandlers();

    await act(async () => {
      await mutation.onMutate({ id: item.id });
    });

    expect(harness.readHome()?.recentBookmarks).toHaveLength(0);
    expect(harness.readHome()?.byContentType.articles).toHaveLength(0);
  });
});

describe('useBookmarkItem', () => {
  type BookmarkHandlers = {
    onMutate: ({ id }: { id: string }) => Promise<unknown>;
  };

  function getBookmarkHandlers() {
    const { result } = renderHook(() => useBookmarkItem());
    return result.current as unknown as BookmarkHandlers;
  }

  it('applies optimistic bookmark state immediately without waiting for query cancellation', async () => {
    const item = createMockItem({
      id: 'bookmark-immediate-item',
      state: UserItemState.INBOX,
      bookmarkedAt: null,
    });
    const harness = createToggleUtils({
      inbox: {
        items: [item],
        nextCursor: null,
      },
      itemsById: {
        [item.id]: item,
      },
    });

    const neverResolves = new Promise<void>(() => {});
    (harness.utils.items.inbox.cancel as jest.Mock).mockReturnValue(neverResolves);
    (harness.utils.items.home.cancel as jest.Mock).mockReturnValue(neverResolves);
    (harness.utils.items.get.cancel as jest.Mock).mockReturnValue(neverResolves);

    mockUseUtils.mockReturnValue(harness.utils);

    const mutation = getBookmarkHandlers();

    const mutatePromise = mutation.onMutate({ id: item.id });
    await act(async () => {
      await Promise.resolve();
    });

    expect(harness.readInbox()?.items).toHaveLength(0);
    expect(harness.readItem(item.id)?.state).toBe(UserItemState.BOOKMARKED);
    expect(harness.readItem(item.id)?.bookmarkedAt).toEqual(expect.any(String));

    const pendingSentinel = Symbol('pending');
    await expect(Promise.race([mutatePromise, Promise.resolve(pendingSentinel)])).resolves.not.toBe(
      pendingSentinel
    );
  });
});

// ============================================================================
// useToggleFinished Optimistic Behavior
// ============================================================================

describe('useToggleFinished', () => {
  type ToggleHandlers = {
    onMutate: ({ id }: { id: string }) => Promise<{ didApplyOptimisticUpdate: boolean }>;
    onError: (
      error: unknown,
      vars: { id: string },
      context?: { didApplyOptimisticUpdate: boolean }
    ) => void;
    onSettled: (data: unknown, error: unknown, vars: { id: string }) => void;
  };

  function getToggleHandlers() {
    const { result } = renderHook(() => useToggleFinished());
    return result.current as unknown as ToggleHandlers;
  }

  it('optimistically toggles from the item detail cache when list caches are empty', async () => {
    const item = createMockItem({ id: 'detail-only-item', isFinished: false });
    const harness = createToggleUtils({
      itemsById: {
        [item.id]: item,
      },
    });
    mockUseUtils.mockReturnValue(harness.utils);

    const mutation = getToggleHandlers();

    await act(async () => {
      await mutation.onMutate({ id: item.id });
    });

    expect(harness.readItem(item.id)?.isFinished).toBe(true);
  });

  it('treats the default library query as unfinished and moves items between unfinished/finished lists', async () => {
    const item = createMockItem({ id: 'library-item', isFinished: false });
    const harness = createToggleUtils({
      defaultLibrary: {
        items: [item],
        nextCursor: null,
      },
      finishedLibrary: {
        items: [],
        nextCursor: null,
      },
      itemsById: {
        [item.id]: item,
      },
    });
    mockUseUtils.mockReturnValue(harness.utils);

    const mutation = getToggleHandlers();

    let context: { didApplyOptimisticUpdate: boolean } | undefined;

    await act(async () => {
      context = await mutation.onMutate({ id: item.id });
    });

    expect(harness.readLibrary()?.items).toHaveLength(0);
    expect(harness.readLibrary({ filter: { isFinished: true } })?.items[0]?.id).toBe(item.id);
    expect(harness.readLibrary({ filter: { isFinished: true } })?.items[0]?.isFinished).toBe(true);

    act(() => {
      mutation.onError(new Error('Request failed'), { id: item.id }, context);
    });

    expect(harness.readLibrary()?.items[0]?.id).toBe(item.id);
    expect(harness.readLibrary()?.items[0]?.isFinished).toBe(false);
  });

  it('keeps state consistent for rapid toggles and invalidates only after the last settle', async () => {
    const item = createMockItem({ id: 'rapid-item', isFinished: false });
    const harness = createToggleUtils({
      defaultLibrary: {
        items: [item],
        nextCursor: null,
      },
      finishedLibrary: {
        items: [],
        nextCursor: null,
      },
      itemsById: {
        [item.id]: item,
      },
    });
    mockUseUtils.mockReturnValue(harness.utils);

    const mutation = getToggleHandlers();

    let firstContext: { didApplyOptimisticUpdate: boolean } | undefined;
    let secondContext: { didApplyOptimisticUpdate: boolean } | undefined;

    await act(async () => {
      firstContext = await mutation.onMutate({ id: item.id });
      secondContext = await mutation.onMutate({ id: item.id });
    });

    expect(harness.readLibrary()?.items[0]?.isFinished).toBe(false);

    act(() => {
      mutation.onError(new Error('First request failed'), { id: item.id }, firstContext);
    });

    expect(harness.readLibrary()?.items).toHaveLength(0);
    expect(harness.readLibrary({ filter: { isFinished: true } })?.items[0]?.id).toBe(item.id);
    expect(harness.readLibrary({ filter: { isFinished: true } })?.items[0]?.isFinished).toBe(true);

    act(() => {
      mutation.onSettled(undefined, new Error('First request failed'), { id: item.id });
    });

    expect(harness.spies.mockLibraryInvalidate).not.toHaveBeenCalled();
    expect(harness.spies.mockInboxInvalidate).not.toHaveBeenCalled();
    expect(harness.spies.mockHomeInvalidate).not.toHaveBeenCalled();
    expect(harness.spies.mockGetInvalidate).not.toHaveBeenCalled();

    act(() => {
      mutation.onSettled(undefined, undefined, { id: item.id });
    });

    expect(secondContext?.didApplyOptimisticUpdate).toBe(true);
    expect(harness.spies.mockLibraryInvalidate).toHaveBeenCalledTimes(1);
    expect(harness.spies.mockInboxInvalidate).toHaveBeenCalledTimes(1);
    expect(harness.spies.mockHomeInvalidate).toHaveBeenCalledTimes(1);
    expect(harness.spies.mockGetInvalidate).toHaveBeenCalledWith({ id: item.id });
    expect(harness.spies.mockWeeklyRecapInvalidate).toHaveBeenCalledTimes(1);
    expect(harness.spies.mockWeeklyRecapTeaserInvalidate).toHaveBeenCalledTimes(1);
  });

  it('applies optimistic complete state immediately without waiting for query cancellation', async () => {
    const item = createMockItem({ id: 'instant-item', isFinished: false });
    const harness = createToggleUtils({
      defaultLibrary: {
        items: [item],
        nextCursor: null,
      },
      finishedLibrary: {
        items: [],
        nextCursor: null,
      },
      itemsById: {
        [item.id]: item,
      },
    });

    const neverResolves = new Promise<void>(() => {});
    (harness.utils.items.library.cancel as jest.Mock).mockReturnValue(neverResolves);
    (harness.utils.items.inbox.cancel as jest.Mock).mockReturnValue(neverResolves);
    (harness.utils.items.home.cancel as jest.Mock).mockReturnValue(neverResolves);
    (harness.utils.items.get.cancel as jest.Mock).mockReturnValue(neverResolves);

    mockUseUtils.mockReturnValue(harness.utils);

    const mutation = getToggleHandlers();

    const mutatePromise = mutation.onMutate({ id: item.id });
    await act(async () => {
      await Promise.resolve();
    });

    expect(harness.readLibrary()?.items).toHaveLength(0);
    expect(harness.readLibrary({ filter: { isFinished: true } })?.items[0]?.id).toBe(item.id);
    expect(harness.readLibrary({ filter: { isFinished: true } })?.items[0]?.isFinished).toBe(true);

    await expect(
      Promise.race([mutatePromise, Promise.resolve({ didApplyOptimisticUpdate: false })])
    ).resolves.toEqual({ didApplyOptimisticUpdate: true });
  });

  it('removes completed bookmarks from home caches immediately', async () => {
    const item = createMockItem({
      id: 'home-finished-item',
      isFinished: false,
      lastOpenedAt: '2026-01-02T00:00:00.000Z',
    });
    const harness = createToggleUtils({
      defaultLibrary: {
        items: [item],
        nextCursor: null,
      },
      finishedLibrary: {
        items: [],
        nextCursor: null,
      },
      home: createMockHomeData([item]),
      itemsById: {
        [item.id]: item,
      },
    });

    mockUseUtils.mockReturnValue(harness.utils);

    const mutation = getToggleHandlers();

    await act(async () => {
      await mutation.onMutate({ id: item.id });
    });

    expect(harness.readHome()?.recentBookmarks).toHaveLength(0);
    expect(harness.readHome()?.jumpBackIn).toHaveLength(0);
    expect(harness.readHome()?.byContentType.articles).toHaveLength(0);
  });
});
