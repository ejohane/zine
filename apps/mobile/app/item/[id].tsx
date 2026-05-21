/**
 * Item Detail Page
 *
 * Displays the full content of a saved item - Spotify podcasts, YouTube videos, articles, or posts.
 * Accessible from all item cards throughout the app (Inbox, Library, Home).
 *
 * Features:
 * - Large cover image at top
 * - Provider and type badges
 * - Title, source/creator row, and metadata
 * - Action row with icon buttons and FAB for external link
 * - Full description section
 * - Loading, error, and not found states
 */

import { Image } from 'expo-image';
import * as Haptics from 'expo-haptics';
import { usePreventRemove } from '@react-navigation/native';
import { useRouter, type Href } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { ContentType } from '@/hooks/use-items-trpc';
import { upgradeSpotifyImageUrl, upgradeYouTubeImageUrl } from '@/lib/content-utils';
import {
  COLLAPSED_TITLE_THRESHOLD,
  getCollapsedHeaderTitleThreshold,
  useCollapsedHeaderTitle,
} from '@/lib/native-large-title-header';

import { XPostBookmarkView } from './item-detail-components';
import { styles } from './item-detail-styles';
import { ItemDetailArticleWebView } from './detail/components/ItemDetailArticleWebView';
import { ItemDetailContent } from './detail/components/ItemDetailContent';
import { ItemCollectionsSheet } from './detail/components/ItemCollectionsSheet';
import {
  ItemDetailParallaxLayout,
  ItemDetailScrollLayout,
} from './detail/components/ItemDetailLayouts';
import {
  ItemDetailErrorState,
  ItemDetailInvalidParamState,
  ItemDetailLoadingState,
  ItemDetailNotFoundState,
} from './detail/components/ItemDetailStates';
import { useItemDetailActions } from './detail/hooks/useItemDetailActions';
import { useItemDetailData } from './detail/hooks/useItemDetailData';
import { useItemDetailParams } from './detail/hooks/useItemDetailParams';
import { useItemDetailViewState } from './detail/hooks/useItemDetailViewState';

export default function ItemDetailScreen() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'dark'];
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [contentTopY, setContentTopY] = useState<number | null>(null);
  const [titleOffsetY, setTitleOffsetY] = useState<number | null>(null);
  const [collectionsSheetOpen, setCollectionsSheetOpen] = useState(false);
  const [articleWebViewOpen, setArticleWebViewOpen] = useState(false);

  const { id, isValid, message } = useItemDetailParams();
  const { item, enrichment, otherUnfinishedBookmarks, isLoading, error, refetch, creatorData } =
    useItemDetailData({ id, isValid });
  const {
    handleOpenLink,
    handleMarkLinkOpened,
    handleShare,
    handleToggleBookmark,
    handleSecondaryAction,
    bookmarkMutation,
    archiveMutation,
    unbookmarkMutation,
    toggleFinishedMutation,
  } = useItemDetailActions(item);

  const viewState = useItemDetailViewState({
    item,
    colors,
    bookmarkPending: bookmarkMutation.isPending,
    unbookmarkPending: unbookmarkMutation.isPending,
    archivePending: archiveMutation.isPending,
    toggleFinishedPending: toggleFinishedMutation.isPending,
  });
  const collapsedTitleThreshold = useMemo(() => {
    if (contentTopY === null || titleOffsetY === null) {
      return COLLAPSED_TITLE_THRESHOLD;
    }

    return getCollapsedHeaderTitleThreshold(contentTopY + titleOffsetY);
  }, [contentTopY, titleOffsetY]);
  const { handleScroll: handleTitleScroll, showCollapsedTitle } = useCollapsedHeaderTitle({
    threshold: collapsedTitleThreshold,
  });
  const handleScroll = useCallback(
    (event: Parameters<typeof handleTitleScroll>[0]) => {
      handleTitleScroll(event);
    },
    [handleTitleScroll]
  );
  const handleContentLayout = useCallback((nextContentTopY: number) => {
    setContentTopY((current) => (current === nextContentTopY ? current : nextContentTopY));
  }, []);
  const handleTitleLayout = useCallback((nextTitleOffsetY: number) => {
    setTitleOffsetY((current) => (current === nextTitleOffsetY ? current : nextTitleOffsetY));
  }, []);
  const handleOpenCollectionsSheet = useCallback(() => {
    setCollectionsSheetOpen(true);
  }, []);
  const handleCloseCollectionsSheet = useCallback(() => {
    setCollectionsSheetOpen(false);
  }, []);
  const shouldUsePreloadedArticleWebView =
    Platform.OS === 'ios' &&
    item?.contentType === ContentType.ARTICLE &&
    item.provider !== 'SUBSTACK' &&
    !!item.canonicalUrl;
  const handleOpenPrimaryLink = useCallback(() => {
    if (!shouldUsePreloadedArticleWebView) {
      void handleOpenLink();
      return;
    }

    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setArticleWebViewOpen(true);
    handleMarkLinkOpened();
  }, [handleMarkLinkOpened, handleOpenLink, shouldUsePreloadedArticleWebView]);
  const handleCloseArticleWebView = useCallback(() => {
    setArticleWebViewOpen(false);
  }, []);
  usePreventRemove(articleWebViewOpen, () => {
    setArticleWebViewOpen(false);
  });

  useEffect(() => {
    setArticleWebViewOpen(false);
  }, [item?.id]);

  const articleWebViewOverlay = (
    <ItemDetailArticleWebView
      url={shouldUsePreloadedArticleWebView ? item?.canonicalUrl : null}
      colors={colors}
      insets={insets}
      visible={articleWebViewOpen}
      onClose={handleCloseArticleWebView}
    />
  );

  if (!isValid) {
    return (
      <ItemDetailInvalidParamState colors={colors} message={message ?? 'Item ID is required'} />
    );
  }

  if (isLoading) {
    return <ItemDetailLoadingState colors={colors} message="Loading item..." />;
  }

  if (error) {
    return (
      <ItemDetailErrorState colors={colors} message={error.message} onRetry={() => refetch()} />
    );
  }

  if (!item) {
    return <ItemDetailNotFoundState colors={colors} />;
  }

  if (viewState.isXPost) {
    return (
      <>
        <XPostBookmarkView
          item={item}
          colors={colors}
          insets={insets}
          onBack={() => router.back()}
          onOpenLink={handleOpenPrimaryLink}
          onShare={handleShare}
          onBookmarkToggle={handleToggleBookmark}
          onSecondaryAction={handleSecondaryAction}
          onManageTags={handleOpenCollectionsSheet}
          onCreatorPress={
            item.creatorId ? () => router.push(`/creator/${item.creatorId}`) : undefined
          }
          bookmarkActionIcon={viewState.bookmarkActionIcon}
          bookmarkActionColor={viewState.bookmarkActionColor}
          isBookmarkActionDisabled={viewState.isBookmarkActionDisabled}
          secondaryActionIcon={viewState.secondaryActionIcon}
          secondaryActionColor={viewState.secondaryActionColor}
          isSecondaryActionDisabled={viewState.isSecondaryActionDisabled}
          creatorData={creatorData}
          showCollapsedTitle={showCollapsedTitle}
          onScroll={handleScroll}
          onContentLayout={handleContentLayout}
          onTitleLayout={handleTitleLayout}
          otherUnfinishedBookmarks={otherUnfinishedBookmarks}
          onOtherBookmarkPress={(bookmarkId) => router.push(`/item/${bookmarkId}` as Href)}
        />
        <ItemCollectionsSheet
          item={item}
          colors={colors}
          visible={collectionsSheetOpen}
          onClose={handleCloseCollectionsSheet}
        />
      </>
    );
  }

  if (viewState.hasThumbnail) {
    const upgradedCreatorImageUrl =
      upgradeSpotifyImageUrl(upgradeYouTubeImageUrl(item.creatorImageUrl)) ?? undefined;

    return (
      <ItemDetailParallaxLayout
        colors={colors}
        insets={insets}
        onBack={() => router.back()}
        onScroll={handleScroll}
        screenTitle={item.title}
        showCollapsedTitle={showCollapsedTitle}
        headerImage={
          <Image
            source={{ uri: item.thumbnailUrl! }}
            style={styles.parallaxCoverImage}
            contentFit="cover"
            transition={300}
          />
        }
        headerAspectRatio={viewState.headerAspectRatio}
        overlay={articleWebViewOverlay}
      >
        <ItemDetailContent
          item={item}
          enrichment={enrichment}
          colors={colors}
          creatorData={creatorData}
          creatorImageUrl={upgradedCreatorImageUrl}
          onCreatorPress={
            item.creatorId ? () => router.push(`/creator/${item.creatorId}`) : undefined
          }
          descriptionLabel={viewState.descriptionLabel}
          bookmarkActionIcon={viewState.bookmarkActionIcon}
          bookmarkActionColor={viewState.bookmarkActionColor}
          isBookmarkActionDisabled={viewState.isBookmarkActionDisabled}
          secondaryActionIcon={viewState.secondaryActionIcon}
          secondaryActionColor={viewState.secondaryActionColor}
          isSecondaryActionDisabled={viewState.isSecondaryActionDisabled}
          onBookmarkToggle={handleToggleBookmark}
          onSecondaryAction={handleSecondaryAction}
          onManageTags={handleOpenCollectionsSheet}
          onShare={handleShare}
          onOpenLink={handleOpenPrimaryLink}
          onPersonPress={(personId) => router.push(`/person/${personId}?source=item` as Href)}
          otherUnfinishedBookmarks={otherUnfinishedBookmarks}
          onOtherBookmarkPress={(bookmarkId) => router.push(`/item/${bookmarkId}` as Href)}
          useAnimatedActions
          useAnimatedDescription
          onContentLayout={handleContentLayout}
          onTitleLayout={handleTitleLayout}
        />
        <ItemCollectionsSheet
          item={item}
          colors={colors}
          visible={collectionsSheetOpen}
          onClose={handleCloseCollectionsSheet}
        />
      </ItemDetailParallaxLayout>
    );
  }

  return (
    <ItemDetailScrollLayout
      colors={colors}
      insets={insets}
      onBack={() => router.back()}
      onScroll={handleScroll}
      screenTitle={item.title}
      showCollapsedTitle={showCollapsedTitle}
      overlay={articleWebViewOverlay}
    >
      <ItemDetailContent
        item={item}
        enrichment={enrichment}
        colors={colors}
        creatorData={creatorData}
        creatorImageUrl={item.creatorImageUrl}
        onCreatorPress={
          item.creatorId ? () => router.push(`/creator/${item.creatorId}`) : undefined
        }
        descriptionLabel={viewState.descriptionLabel}
        bookmarkActionIcon={viewState.bookmarkActionIcon}
        bookmarkActionColor={viewState.bookmarkActionColor}
        isBookmarkActionDisabled={viewState.isBookmarkActionDisabled}
        secondaryActionIcon={viewState.secondaryActionIcon}
        secondaryActionColor={viewState.secondaryActionColor}
        isSecondaryActionDisabled={viewState.isSecondaryActionDisabled}
        onBookmarkToggle={handleToggleBookmark}
        onSecondaryAction={handleSecondaryAction}
        onManageTags={handleOpenCollectionsSheet}
        onShare={handleShare}
        onOpenLink={handleOpenPrimaryLink}
        onPersonPress={(personId) => router.push(`/person/${personId}?source=item` as Href)}
        otherUnfinishedBookmarks={otherUnfinishedBookmarks}
        onOtherBookmarkPress={(bookmarkId) => router.push(`/item/${bookmarkId}` as Href)}
        useAnimatedActions={false}
        useAnimatedDescription={false}
        onContentLayout={handleContentLayout}
        onTitleLayout={handleTitleLayout}
      />
      <ItemCollectionsSheet
        item={item}
        colors={colors}
        visible={collectionsSheetOpen}
        onClose={handleCloseCollectionsSheet}
      />
    </ItemDetailScrollLayout>
  );
}
