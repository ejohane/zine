/**
 * Tests for app/item/detail/hooks/useItemDetailViewState
 */

import { Colors } from '@/constants/theme';
import { UserItemState } from '@/hooks/use-items-trpc';

import { useItemDetailViewState } from '@/app/item/detail/hooks/useItemDetailViewState';
import type { ItemDetailItem } from '@/app/item/detail/types';

const baseItem = {
  id: 'item-1',
  state: UserItemState.INBOX,
  isFinished: false,
  provider: 'YOUTUBE',
  contentType: 'VIDEO',
  thumbnailUrl: 'https://example.com/thumb.jpg',
} as unknown as ItemDetailItem;

describe('useItemDetailViewState', () => {
  it('returns disabled defaults when item is missing', () => {
    const viewState = useItemDetailViewState({
      item: null,
      colors: Colors.dark,
      bookmarkPending: false,
      unbookmarkPending: false,
    });

    expect(viewState.isXPost).toBe(false);
    expect(viewState.hasThumbnail).toBe(false);
    expect(viewState.headerAspectRatio).toBe(1);
    expect(viewState.isBookmarkActionDisabled).toBe(true);
    expect(viewState.isCompleteActionDisabled).toBe(true);
    expect(viewState.bookmarkActionIcon).toBe('bookmark-outline');
  });

  it('marks X posts and uses post description label', () => {
    const xPostItem = {
      ...baseItem,
      provider: 'X',
      contentType: 'POST',
      thumbnailUrl: null,
    } as unknown as ItemDetailItem;

    const viewState = useItemDetailViewState({
      item: xPostItem,
      colors: Colors.dark,
      bookmarkPending: false,
      unbookmarkPending: false,
    });

    expect(viewState.isXPost).toBe(true);
    expect(viewState.descriptionLabel).toBe('About this post');
    expect(viewState.hasThumbnail).toBe(false);
  });

  it('uses bookmarked visuals and enables actions', () => {
    const viewState = useItemDetailViewState({
      item: {
        ...baseItem,
        state: UserItemState.BOOKMARKED,
        isFinished: false,
      },
      colors: Colors.dark,
      bookmarkPending: false,
      unbookmarkPending: false,
    });

    expect(viewState.bookmarkActionIcon).toBe('bookmark');
    expect(viewState.bookmarkActionColor).toBe(Colors.dark.primary);
    expect(viewState.isBookmarkActionDisabled).toBe(false);
    expect(viewState.isCompleteActionDisabled).toBe(false);
    expect(viewState.descriptionLabel).toBe('About this video');
    expect(viewState.headerAspectRatio).toBeCloseTo(16 / 9);
  });

  it('uses success colors for finished bookmarks', () => {
    const viewState = useItemDetailViewState({
      item: {
        ...baseItem,
        state: UserItemState.BOOKMARKED,
        isFinished: true,
      },
      colors: Colors.dark,
      bookmarkPending: false,
      unbookmarkPending: false,
    });

    expect(viewState.completeActionIcon).toBe('checkmark-circle');
    expect(viewState.completeActionColor).toBe(Colors.dark.success);
  });
});
