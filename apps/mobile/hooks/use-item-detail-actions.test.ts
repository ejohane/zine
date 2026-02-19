/**
 * Tests for app/item/detail/hooks/useItemDetailActions
 */

import { act, renderHook } from '@testing-library/react-hooks';

import { useItemDetailActions } from '@/app/item/detail/hooks/useItemDetailActions';
import { logger } from '@/lib/logger';
import { UserItemState } from '@/hooks/use-items-trpc';

import type { ItemDetailItem } from '@/app/item/detail/types';

// ============================================================================
// Module-level Mocks
// ============================================================================

const mockBookmarkMutation = { mutate: jest.fn(), isPending: false };
const mockUnbookmarkMutation = { mutate: jest.fn(), isPending: false };
const mockToggleFinishedMutation = { mutate: jest.fn(), isPending: false };
const mockMarkOpenedMutation = { mutate: jest.fn(), isPending: false };

const mockCanOpenURL = jest.fn();
const mockOpenURL = jest.fn();
const mockOpenBrowserAsync = jest.fn();
const mockShare = jest.fn();

jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(() => Promise.resolve()),
  ImpactFeedbackStyle: { Medium: 'Medium' },
}));

jest.mock('expo-web-browser', () => ({
  openBrowserAsync: (
    ...args: [string, { presentationStyle: string; enableBarCollapsing?: boolean }]
  ) => mockOpenBrowserAsync(...args),
  WebBrowserPresentationStyle: {
    FULL_SCREEN: 'FULL_SCREEN',
  },
}));

jest.mock('react-native', () => ({
  Linking: {
    canOpenURL: (...args: [string]) => mockCanOpenURL(...args),
    openURL: (...args: [string]) => mockOpenURL(...args),
  },
  Share: {
    share: (...args: [Record<string, string | undefined>]) => mockShare(...args),
  },
}));

jest.mock('@/lib/logger', () => ({
  logger: {
    error: jest.fn(),
  },
}));

jest.mock('@/hooks/use-items-trpc', () => ({
  ContentType: {
    ARTICLE: 'ARTICLE',
    VIDEO: 'VIDEO',
    PODCAST: 'PODCAST',
    POST: 'POST',
  },
  UserItemState: {
    BOOKMARKED: 'BOOKMARKED',
    INBOX: 'INBOX',
  },
  useBookmarkItem: () => mockBookmarkMutation,
  useUnbookmarkItem: () => mockUnbookmarkMutation,
  useToggleFinished: () => mockToggleFinishedMutation,
  useMarkItemOpened: () => mockMarkOpenedMutation,
}));

// ============================================================================
// Tests
// ============================================================================

const baseItem = {
  id: 'item-1',
  title: 'Test Item',
  canonicalUrl: 'https://example.com/item',
  state: UserItemState.INBOX,
  contentType: 'ARTICLE',
} as unknown as ItemDetailItem;

describe('useItemDetailActions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCanOpenURL.mockResolvedValue(true);
    mockOpenURL.mockResolvedValue(undefined);
    mockOpenBrowserAsync.mockResolvedValue({});
    mockShare.mockResolvedValue({});
  });

  it('does nothing when item is missing', async () => {
    const { result } = renderHook(() => useItemDetailActions(undefined));

    await act(async () => {
      await result.current.handleOpenLink();
      await result.current.handleShare();
      result.current.handleToggleBookmark();
      result.current.handleToggleFinished();
    });

    expect(mockCanOpenURL).not.toHaveBeenCalled();
    expect(mockShare).not.toHaveBeenCalled();
    expect(mockBookmarkMutation.mutate).not.toHaveBeenCalled();
    expect(mockUnbookmarkMutation.mutate).not.toHaveBeenCalled();
    expect(mockToggleFinishedMutation.mutate).not.toHaveBeenCalled();
  });

  it('opens in-app browser for articles and marks opened for bookmarked items', async () => {
    const item = { ...baseItem, state: UserItemState.BOOKMARKED } as unknown as ItemDetailItem;
    const { result } = renderHook(() => useItemDetailActions(item));

    await act(async () => {
      await result.current.handleOpenLink();
    });

    expect(mockOpenBrowserAsync).toHaveBeenCalledWith(item.canonicalUrl, {
      enableBarCollapsing: true,
      presentationStyle: 'FULL_SCREEN',
    });
    expect(mockMarkOpenedMutation.mutate).toHaveBeenCalledWith({ id: item.id });
  });

  it('opens external links for non-article content', async () => {
    const item = {
      ...baseItem,
      contentType: 'VIDEO',
      state: UserItemState.BOOKMARKED,
    } as unknown as ItemDetailItem;
    const { result } = renderHook(() => useItemDetailActions(item));

    await act(async () => {
      await result.current.handleOpenLink();
    });

    expect(mockCanOpenURL).toHaveBeenCalledWith(item.canonicalUrl);
    expect(mockOpenURL).toHaveBeenCalledWith(item.canonicalUrl);
    expect(mockOpenBrowserAsync).not.toHaveBeenCalled();
  });

  it('opens substack articles with Linking instead of in-app browser', async () => {
    const item = {
      ...baseItem,
      provider: 'SUBSTACK',
      contentType: 'ARTICLE',
      state: UserItemState.BOOKMARKED,
    } as unknown as ItemDetailItem;
    const { result } = renderHook(() => useItemDetailActions(item));

    await act(async () => {
      await result.current.handleOpenLink();
    });

    expect(mockCanOpenURL).toHaveBeenCalledWith(item.canonicalUrl);
    expect(mockOpenURL).toHaveBeenCalledWith(item.canonicalUrl);
    expect(mockOpenBrowserAsync).not.toHaveBeenCalled();
  });

  it('falls back to browser when substack can not be opened', async () => {
    mockCanOpenURL.mockResolvedValueOnce(false);

    const item = {
      ...baseItem,
      provider: 'SUBSTACK',
      contentType: 'ARTICLE',
      state: UserItemState.BOOKMARKED,
    } as unknown as ItemDetailItem;
    const { result } = renderHook(() => useItemDetailActions(item));

    await act(async () => {
      await result.current.handleOpenLink();
    });

    expect(mockCanOpenURL).toHaveBeenCalledWith(item.canonicalUrl);
    expect(mockOpenURL).not.toHaveBeenCalled();
    expect(mockOpenBrowserAsync).toHaveBeenCalledWith(item.canonicalUrl, {
      enableBarCollapsing: true,
      presentationStyle: 'FULL_SCREEN',
    });
  });

  it('does not mark opened when item is not bookmarked', async () => {
    const { result } = renderHook(() => useItemDetailActions(baseItem));

    await act(async () => {
      await result.current.handleOpenLink();
    });

    expect(mockMarkOpenedMutation.mutate).not.toHaveBeenCalled();
  });

  it('logs errors when link opening fails', async () => {
    const error = new Error('offline');
    mockOpenBrowserAsync.mockRejectedValueOnce(error);
    const { result } = renderHook(() => useItemDetailActions(baseItem));

    await act(async () => {
      await result.current.handleOpenLink();
    });

    expect(logger.error).toHaveBeenCalledWith('Failed to open URL', { error });
    expect(mockOpenBrowserAsync).toHaveBeenCalled();
  });

  it('shares item details', async () => {
    const { result } = renderHook(() => useItemDetailActions(baseItem));

    await act(async () => {
      await result.current.handleShare();
    });

    expect(mockShare).toHaveBeenCalledWith({
      title: baseItem.title,
      url: baseItem.canonicalUrl,
      message: `Check out "${baseItem.title}"`,
    });
  });

  it('toggles bookmark state based on current item state', () => {
    const { result: inboxResult } = renderHook(() => useItemDetailActions(baseItem));
    inboxResult.current.handleToggleBookmark();
    expect(mockBookmarkMutation.mutate).toHaveBeenCalledWith({ id: baseItem.id });

    const bookmarkedItem = {
      ...baseItem,
      state: UserItemState.BOOKMARKED,
    } as unknown as ItemDetailItem;
    const { result: bookmarkedResult } = renderHook(() => useItemDetailActions(bookmarkedItem));
    bookmarkedResult.current.handleToggleBookmark();
    expect(mockUnbookmarkMutation.mutate).toHaveBeenCalledWith({ id: baseItem.id });
  });

  it('only toggles finished for bookmarked items', () => {
    const { result: inboxResult } = renderHook(() => useItemDetailActions(baseItem));
    inboxResult.current.handleToggleFinished();
    expect(mockToggleFinishedMutation.mutate).not.toHaveBeenCalled();

    const bookmarkedItem = {
      ...baseItem,
      state: UserItemState.BOOKMARKED,
    } as unknown as ItemDetailItem;
    const { result: bookmarkedResult } = renderHook(() => useItemDetailActions(bookmarkedItem));
    bookmarkedResult.current.handleToggleFinished();
    expect(mockToggleFinishedMutation.mutate).toHaveBeenCalledWith({ id: baseItem.id });
  });
});
