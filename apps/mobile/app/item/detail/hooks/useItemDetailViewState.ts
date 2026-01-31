import type { Ionicons } from '@expo/vector-icons';

import { UserItemState } from '@/hooks/use-items-trpc';

import type { ItemDetailColors, ItemDetailItem } from '../types';

type ItemDetailViewStateInput = {
  item?: ItemDetailItem | null;
  colors: ItemDetailColors;
  bookmarkPending: boolean;
  unbookmarkPending: boolean;
  toggleFinishedPending: boolean;
};

export function useItemDetailViewState({
  item,
  colors,
  bookmarkPending,
  unbookmarkPending,
  toggleFinishedPending,
}: ItemDetailViewStateInput) {
  if (!item) {
    return {
      isXPost: false,
      hasThumbnail: false,
      headerAspectRatio: 1,
      descriptionLabel: 'Description',
      bookmarkActionIcon: 'bookmark-outline' as keyof typeof Ionicons.glyphMap,
      bookmarkActionColor: colors.textSecondary,
      completeActionIcon: 'checkmark-circle-outline' as keyof typeof Ionicons.glyphMap,
      completeActionColor: colors.textSecondary,
      isBookmarkActionDisabled: true,
      isCompleteActionDisabled: true,
    };
  }

  const isBookmarked = item.state === UserItemState.BOOKMARKED;
  const isBookmarkActionDisabled = isBookmarked ? unbookmarkPending : bookmarkPending;
  const isFinished = item.isFinished;

  const bookmarkActionIcon: keyof typeof Ionicons.glyphMap = isBookmarked
    ? 'bookmark'
    : 'bookmark-outline';
  const bookmarkActionColor = isBookmarked ? colors.primary : colors.textSecondary;

  const completeActionIcon: keyof typeof Ionicons.glyphMap = isFinished
    ? 'checkmark-circle'
    : 'checkmark-circle-outline';
  const completeActionColor = isBookmarked && isFinished ? colors.success : colors.textSecondary;
  const isCompleteActionDisabled = !isBookmarked || toggleFinishedPending;

  const descriptionLabel = (() => {
    switch (item.contentType) {
      case 'VIDEO':
        return 'About this video';
      case 'PODCAST':
        return 'About this episode';
      case 'ARTICLE':
        return 'About this article';
      case 'POST':
        return 'About this post';
      default:
        return 'Description';
    }
  })();

  return {
    isXPost: item.provider === 'X' && item.contentType === 'POST',
    hasThumbnail: !!item.thumbnailUrl,
    headerAspectRatio: item.contentType === 'VIDEO' ? 16 / 9 : 1,
    descriptionLabel,
    bookmarkActionIcon,
    bookmarkActionColor,
    completeActionIcon,
    completeActionColor,
    isBookmarkActionDisabled,
    isCompleteActionDisabled,
  };
}
