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
const mockArchiveMutation = { mutate: jest.fn(), isPending: false };
const mockUnbookmarkMutation = { mutate: jest.fn(), isPending: false };
const mockToggleFinishedMutation = { mutate: jest.fn(), isPending: false };
const mockMarkOpenedMutation = { mutate: jest.fn(), isPending: false };

const mockCanOpenURL = jest.fn();
const mockOpenURL = jest.fn();
const mockOpenBrowserAsync = jest.fn();
const mockShare = jest.fn();
const mockShowError = jest.fn();
const mockToastManager = { show: jest.fn() };

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

jest.mock('heroui-native', () => ({
  useToast: () => ({ toast: mockToastManager }),
}));

jest.mock('@/lib/toast-utils', () => ({
  showError: (...args: unknown[]) => mockShowError(...args),
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
    ARCHIVED: 'ARCHIVED',
  },
  useBookmarkItem: () => mockBookmarkMutation,
  useArchiveItem: () => mockArchiveMutation,
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
      result.current.handleSecondaryAction();
    });

    expect(mockCanOpenURL).not.toHaveBeenCalled();
    expect(mockShare).not.toHaveBeenCalled();
    expect(mockBookmarkMutation.mutate).not.toHaveBeenCalled();
    expect(mockArchiveMutation.mutate).not.toHaveBeenCalled();
    expect(mockUnbookmarkMutation.mutate).not.toHaveBeenCalled();
    expect(mockToggleFinishedMutation.mutate).not.toHaveBeenCalled();
  });

  it('marks an item opened when the detail view loads', () => {
    let currentItem: ItemDetailItem | undefined = baseItem;
    const { rerender } = renderHook(() => useItemDetailActions(currentItem));

    expect(mockMarkOpenedMutation.mutate).toHaveBeenCalledTimes(1);
    expect(mockMarkOpenedMutation.mutate).toHaveBeenCalledWith({ id: baseItem.id });

    rerender();
    expect(mockMarkOpenedMutation.mutate).toHaveBeenCalledTimes(1);

    currentItem = { ...baseItem, id: 'item-2' } as unknown as ItemDetailItem;
    rerender();
    expect(mockMarkOpenedMutation.mutate).toHaveBeenCalledTimes(2);
    expect(mockMarkOpenedMutation.mutate).toHaveBeenLastCalledWith({ id: 'item-2' });
  });

  it('opens in-app browser for articles and marks opened for bookmarked items', async () => {
    const item = { ...baseItem, state: UserItemState.BOOKMARKED } as unknown as ItemDetailItem;
    const { result } = renderHook(() => useItemDetailActions(item));
    mockMarkOpenedMutation.mutate.mockClear();

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
    mockMarkOpenedMutation.mutate.mockClear();

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
    mockMarkOpenedMutation.mutate.mockClear();

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
    mockMarkOpenedMutation.mutate.mockClear();

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

  it('marks opened after a successful open even when the item is not bookmarked', async () => {
    const { result } = renderHook(() => useItemDetailActions(baseItem));
    mockMarkOpenedMutation.mutate.mockClear();

    await act(async () => {
      await result.current.handleOpenLink();
    });

    expect(mockMarkOpenedMutation.mutate).toHaveBeenCalledWith({ id: baseItem.id });
  });

  it('logs errors when link opening fails', async () => {
    const error = new Error('offline');
    mockOpenBrowserAsync.mockRejectedValueOnce(error);
    const { result } = renderHook(() => useItemDetailActions(baseItem));
    mockMarkOpenedMutation.mutate.mockClear();

    await act(async () => {
      await result.current.handleOpenLink();
    });

    expect(logger.error).toHaveBeenCalledWith('Failed to open URL', { error });
    expect(mockOpenBrowserAsync).toHaveBeenCalled();
    expect(mockMarkOpenedMutation.mutate).not.toHaveBeenCalled();
  });

  it('does not mark opened when the external URL can not be opened', async () => {
    mockCanOpenURL.mockResolvedValueOnce(false);
    const item = {
      ...baseItem,
      contentType: 'VIDEO',
    } as unknown as ItemDetailItem;
    const { result } = renderHook(() => useItemDetailActions(item));
    mockMarkOpenedMutation.mutate.mockClear();

    await act(async () => {
      await result.current.handleOpenLink();
    });

    expect(mockOpenURL).not.toHaveBeenCalled();
    expect(mockMarkOpenedMutation.mutate).not.toHaveBeenCalled();
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

  it('archives non-bookmarked items from the secondary action', () => {
    const { result: inboxResult } = renderHook(() => useItemDetailActions(baseItem));
    inboxResult.current.handleSecondaryAction();
    expect(mockArchiveMutation.mutate).toHaveBeenCalledWith(
      { id: baseItem.id },
      expect.objectContaining({
        onError: expect.any(Function),
      })
    );
    expect(mockToggleFinishedMutation.mutate).not.toHaveBeenCalled();
  });

  it('keeps the complete toggle for bookmarked items', () => {
    const bookmarkedItem = {
      ...baseItem,
      state: UserItemState.BOOKMARKED,
    } as unknown as ItemDetailItem;
    const { result: bookmarkedResult } = renderHook(() => useItemDetailActions(bookmarkedItem));
    bookmarkedResult.current.handleSecondaryAction();
    expect(mockToggleFinishedMutation.mutate).toHaveBeenCalledWith(
      { id: baseItem.id },
      expect.objectContaining({
        onError: expect.any(Function),
      })
    );
    expect(mockArchiveMutation.mutate).not.toHaveBeenCalled();
  });

  it('shows lightweight error feedback when complete toggle fails', () => {
    const bookmarkedItem = {
      ...baseItem,
      state: UserItemState.BOOKMARKED,
    } as unknown as ItemDetailItem;
    const { result } = renderHook(() => useItemDetailActions(bookmarkedItem));

    result.current.handleSecondaryAction();

    const mutateOptions = mockToggleFinishedMutation.mutate.mock.calls[0][1] as {
      onError: (error: unknown) => void;
    };

    const error = new Error('Network request failed');
    mutateOptions.onError(error);

    expect(mockShowError).toHaveBeenCalledWith(
      mockToastManager,
      error,
      'Failed to update completion status',
      'itemDetail.toggleFinished'
    );
  });

  it('shows lightweight error feedback when archiving fails', () => {
    const { result } = renderHook(() => useItemDetailActions(baseItem));

    result.current.handleSecondaryAction();

    const mutateOptions = mockArchiveMutation.mutate.mock.calls[0][1] as {
      onError: (error: unknown) => void;
    };

    const error = new Error('Archive request failed');
    mutateOptions.onError(error);

    expect(mockShowError).toHaveBeenCalledWith(
      mockToastManager,
      error,
      'Failed to archive item',
      'itemDetail.archive'
    );
  });
});
