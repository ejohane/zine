import * as Haptics from 'expo-haptics';
import * as WebBrowser from 'expo-web-browser';
import { isSubstackArticleUrl } from '@zine/shared';
import { useToast } from 'heroui-native';
import { useCallback } from 'react';
import { Linking, Share } from 'react-native';

import {
  useArchiveItem,
  useBookmarkItem,
  useMarkItemOpened,
  useToggleFinished,
  useUnbookmarkItem,
  ContentType,
  UserItemState,
} from '@/hooks/use-items-trpc';
import { logger } from '@/lib/logger';
import { showError } from '@/lib/toast-utils';

import type { ItemDetailItem } from '../types';

function isWebUrl(url: string): boolean {
  try {
    const parsedUrl = new URL(url);
    return parsedUrl.protocol === 'http:' || parsedUrl.protocol === 'https:';
  } catch {
    return false;
  }
}

export function useItemDetailActions(item?: ItemDetailItem | null) {
  const { toast } = useToast();
  const bookmarkMutation = useBookmarkItem();
  const archiveMutation = useArchiveItem();
  const unbookmarkMutation = useUnbookmarkItem();
  const toggleFinishedMutation = useToggleFinished();
  const markOpenedMutation = useMarkItemOpened();

  const handleMarkLinkOpened = useCallback(() => {
    if (item?.state === UserItemState.BOOKMARKED) {
      markOpenedMutation.mutate({ id: item.id });
    }
  }, [item?.id, item?.state, markOpenedMutation]);

  const handleOpenLink = useCallback(async () => {
    if (!item?.canonicalUrl) return;

    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      const isArticle = item.contentType === ContentType.ARTICLE;
      const isSubstack = item.provider === 'SUBSTACK' || isSubstackArticleUrl(item.canonicalUrl);
      let didOpen = false;

      if (isArticle && !isSubstack) {
        await WebBrowser.openBrowserAsync(item.canonicalUrl, {
          enableBarCollapsing: true,
          presentationStyle: WebBrowser.WebBrowserPresentationStyle.FULL_SCREEN,
        });
        didOpen = true;
      } else if (isWebUrl(item.canonicalUrl)) {
        await Linking.openURL(item.canonicalUrl);
        didOpen = true;
      } else {
        const supported = await Linking.canOpenURL(item.canonicalUrl);
        if (supported) {
          await Linking.openURL(item.canonicalUrl);
          didOpen = true;
        }
      }

      if (didOpen) {
        handleMarkLinkOpened();
      }
    } catch (err) {
      logger.error('Failed to open URL', { error: err });
      showError(toast, err, 'Failed to open link', 'itemDetail.openLink');
    }
  }, [handleMarkLinkOpened, item, toast]);

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

  const handleSecondaryAction = useCallback(() => {
    if (!item) return;

    if (item.state !== UserItemState.BOOKMARKED) {
      archiveMutation.mutate(
        { id: item.id },
        {
          onError: (error) => {
            showError(toast, error, 'Failed to archive item', 'itemDetail.archive');
          },
        }
      );
      return;
    }

    toggleFinishedMutation.mutate(
      { id: item.id },
      {
        onError: (error) => {
          showError(
            toast,
            error,
            'Failed to update completion status',
            'itemDetail.toggleFinished'
          );
        },
      }
    );
  }, [archiveMutation, item, toast, toggleFinishedMutation]);

  return {
    handleOpenLink,
    handleMarkLinkOpened,
    handleShare,
    handleToggleBookmark,
    handleSecondaryAction,
    bookmarkMutation,
    archiveMutation,
    unbookmarkMutation,
    toggleFinishedMutation,
  };
}
