import * as Haptics from 'expo-haptics';
import * as WebBrowser from 'expo-web-browser';
import { useCallback } from 'react';
import { Linking, Share } from 'react-native';

import {
  useBookmarkItem,
  useMarkItemOpened,
  useToggleFinished,
  useUnbookmarkItem,
  ContentType,
  UserItemState,
} from '@/hooks/use-items-trpc';
import { logger } from '@/lib/logger';

import type { ItemDetailItem } from '../types';

export function useItemDetailActions(item?: ItemDetailItem | null) {
  const bookmarkMutation = useBookmarkItem();
  const unbookmarkMutation = useUnbookmarkItem();
  const toggleFinishedMutation = useToggleFinished();
  const markOpenedMutation = useMarkItemOpened();

  const handleOpenLink = useCallback(async () => {
    if (!item?.canonicalUrl) return;

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    try {
      const isArticle = item.contentType === ContentType.ARTICLE;
      const isSubstack = item.provider === 'SUBSTACK' || item.provider === 'substack';

      if (isArticle && !isSubstack) {
        await WebBrowser.openBrowserAsync(item.canonicalUrl, {
          enableBarCollapsing: true,
          presentationStyle: WebBrowser.WebBrowserPresentationStyle.FULL_SCREEN,
        });
      } else {
        const supported = await Linking.canOpenURL(item.canonicalUrl);
        if (supported) {
          await Linking.openURL(item.canonicalUrl);
        } else if (isSubstack) {
          await WebBrowser.openBrowserAsync(item.canonicalUrl, {
            enableBarCollapsing: true,
            presentationStyle: WebBrowser.WebBrowserPresentationStyle.FULL_SCREEN,
          });
        }
      }

      if (item.state === UserItemState.BOOKMARKED) {
        markOpenedMutation.mutate({ id: item.id });
      }
    } catch (err) {
      logger.error('Failed to open URL', { error: err });
    }
  }, [item, markOpenedMutation]);

  const handleShare = useCallback(async () => {
    if (!item) return;

    try {
      await Share.share({
        title: item.title,
        url: item.canonicalUrl,
        message: `Check out "${item.title}"`,
      });
    } catch (err) {
      logger.error('Failed to share', { error: err });
    }
  }, [item]);

  const handleToggleBookmark = useCallback(() => {
    if (!item) return;

    if (item.state === UserItemState.BOOKMARKED) {
      unbookmarkMutation.mutate({ id: item.id });
    } else {
      bookmarkMutation.mutate({ id: item.id });
    }
  }, [bookmarkMutation, item, unbookmarkMutation]);

  const handleToggleFinished = useCallback(() => {
    if (!item) return;
    if (item.state !== UserItemState.BOOKMARKED) return;

    toggleFinishedMutation.mutate({ id: item.id });
  }, [item, toggleFinishedMutation]);

  return {
    handleOpenLink,
    handleShare,
    handleToggleBookmark,
    handleToggleFinished,
    bookmarkMutation,
    unbookmarkMutation,
    toggleFinishedMutation,
  };
}
