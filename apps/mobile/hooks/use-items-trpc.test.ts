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
const mockLibraryUseQuery = jest.fn();
const mockHomeUseQuery = jest.fn();
const mockToggleFinishedUseMutation = jest.fn();
const mockUseUtils = jest.fn();

jest.mock('../lib/trpc', () => ({
  trpc: {
    items: {
      inbox: {
        useQuery: mockInboxUseQuery,
      },
      library: {
        useQuery: mockLibraryUseQuery,
      },
      home: {
        useQuery: mockHomeUseQuery,
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

import { useInboxItems, useLibraryItems, useHomeData, useToggleFinished } from './use-items-trpc';

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

  const itemsById = new Map<string, ReturnType<typeof createMockItem> | undefined>(
    Object.entries(initial?.itemsById ?? {})
  );

  const mockLibraryCancel = jest.fn().mockResolvedValue(undefined);
  const mockInboxCancel = jest.fn().mockResolvedValue(undefined);
  const mockHomeCancel = jest.fn().mockResolvedValue(undefined);
  const mockGetCancel = jest.fn().mockResolvedValue(undefined);

  const mockLibraryInvalidate = jest.fn();
  const mockInboxInvalidate = jest.fn();
  const mockHomeInvalidate = jest.fn();
  const mockGetInvalidate = jest.fn();

  const utils = {
    items: {
      library: {
        cancel: mockLibraryCancel,
        invalidate: mockLibraryInvalidate,
        getData: jest.fn((input?: Parameters<typeof serializeLibraryInput>[0]) =>
          libraryDataByKey.get(serializeLibraryInput(input))
        ),
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
      },
      inbox: {
        cancel: mockInboxCancel,
        invalidate: mockInboxInvalidate,
        getData: jest.fn(() => inboxRef.current),
        setData: jest.fn((_: undefined, updater: unknown) => {
          const previous = inboxRef.current;
          const next =
            typeof updater === 'function'
              ? (updater as (value: MockListData | undefined) => MockListData | undefined)(previous)
              : (updater as MockListData | undefined);
          inboxRef.current = next;
          return next;
        }),
      },
      home: {
        cancel: mockHomeCancel,
        invalidate: mockHomeInvalidate,
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
  };

  return {
    utils,
    readLibrary: (input?: Parameters<typeof serializeLibraryInput>[0]) =>
      libraryDataByKey.get(serializeLibraryInput(input)),
    readInbox: () => inboxRef.current,
    readItem: (id: string) => itemsById.get(id),
    spies: {
      mockLibraryInvalidate,
      mockInboxInvalidate,
      mockHomeInvalidate,
      mockGetInvalidate,
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
  mockLibraryUseQuery.mockReturnValue({
    data: null,
    isLoading: false,
    error: null,
  });
  mockHomeUseQuery.mockReturnValue({
    data: null,
    isLoading: false,
    error: null,
  });

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
  });
});
