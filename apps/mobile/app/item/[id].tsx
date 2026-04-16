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
import { useRouter, type Href } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Colors, Spacing } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { upgradeSpotifyImageUrl, upgradeYouTubeImageUrl } from '@/lib/content-utils';
import {
  COLLAPSED_TITLE_THRESHOLD,
  getCollapsedHeaderTitleThreshold,
  getStickyActionRowThreshold,
  useCollapsedHeaderTitle,
} from '@/lib/native-large-title-header';

import { XPostBookmarkView } from './item-detail-components';
import { styles } from './item-detail-styles';
import { ItemDetailActions } from './detail/components/ItemDetailActions';
import { ItemDetailContent } from './detail/components/ItemDetailContent';
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
  const [actionRowStartY, setActionRowStartY] = useState<number | null>(null);
  const [showStickyActions, setShowStickyActions] = useState(false);

  const { id, isValid, message } = useItemDetailParams();
  const { item, isLoading, error, refetch, creatorData } = useItemDetailData({ id, isValid });
  const {
    handleOpenLink,
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
  const stickyActionsTop = insets.top + 56 + Spacing.sm;
  const stickyBackdropHeight = stickyActionsTop + 56 + Spacing.sm;
  const stickyActionRowThreshold = useMemo(() => {
    if (actionRowStartY === null) {
      return Number.POSITIVE_INFINITY;
    }

    return getStickyActionRowThreshold(actionRowStartY, stickyActionsTop);
  }, [actionRowStartY, stickyActionsTop]);
  const {
    handleScroll: handleTitleScroll,
    showCollapsedTitle,
    scrollOffsetYRef,
  } = useCollapsedHeaderTitle({
    threshold: collapsedTitleThreshold,
  });
  const handleScroll = useCallback(
    (event: Parameters<typeof handleTitleScroll>[0]) => {
      handleTitleScroll(event);

      const shouldShowStickyActions = event.nativeEvent.contentOffset.y > stickyActionRowThreshold;
      setShowStickyActions((current) =>
        current === shouldShowStickyActions ? current : shouldShowStickyActions
      );
    },
    [handleTitleScroll, stickyActionRowThreshold]
  );
  const handleContentLayout = useCallback((nextContentTopY: number) => {
    setContentTopY((current) => (current === nextContentTopY ? current : nextContentTopY));
  }, []);
  const handleTitleLayout = useCallback((nextTitleOffsetY: number) => {
    setTitleOffsetY((current) => (current === nextTitleOffsetY ? current : nextTitleOffsetY));
  }, []);
  const handleActionRowLayout = useCallback((nextActionRowStartY: number) => {
    setActionRowStartY((current) =>
      current === nextActionRowStartY ? current : nextActionRowStartY
    );
  }, []);

  useEffect(() => {
    const shouldShowStickyActions = scrollOffsetYRef.current > stickyActionRowThreshold;
    setShowStickyActions((current) =>
      current === shouldShowStickyActions ? current : shouldShowStickyActions
    );
  }, [scrollOffsetYRef, stickyActionRowThreshold]);

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

  const stickyActionBar = (
    <ItemDetailActions
      item={item}
      colors={colors}
      bookmarkActionIcon={viewState.bookmarkActionIcon}
      bookmarkActionColor={viewState.bookmarkActionColor}
      isBookmarkActionDisabled={viewState.isBookmarkActionDisabled}
      secondaryActionIcon={viewState.secondaryActionIcon}
      secondaryActionColor={viewState.secondaryActionColor}
      isSecondaryActionDisabled={viewState.isSecondaryActionDisabled}
      onBookmarkToggle={handleToggleBookmark}
      onSecondaryAction={handleSecondaryAction}
      onManageTags={() => router.push(`/item-tags/${item.id}` as Href)}
      onShare={handleShare}
      onOpenLink={handleOpenLink}
      useAnimatedContainer={false}
      style={styles.stickyActionRow}
    />
  );

  if (viewState.isXPost) {
    return (
      <XPostBookmarkView
        item={item}
        colors={colors}
        insets={insets}
        onBack={() => router.back()}
        onOpenLink={handleOpenLink}
        onShare={handleShare}
        onBookmarkToggle={handleToggleBookmark}
        onSecondaryAction={handleSecondaryAction}
        onManageTags={() => router.push(`/item-tags/${item.id}` as Href)}
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
        showStickyActions={showStickyActions}
        stickyActionsTop={stickyActionsTop}
        stickyBackdropHeight={stickyBackdropHeight}
        onScroll={handleScroll}
        onContentLayout={handleContentLayout}
        onTitleLayout={handleTitleLayout}
        onActionRowLayout={handleActionRowLayout}
      />
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
        showStickyActions={showStickyActions}
        stickyActions={stickyActionBar}
        stickyActionsTop={stickyActionsTop}
        stickyBackdropHeight={stickyBackdropHeight}
        headerImage={
          <Image
            source={{ uri: item.thumbnailUrl! }}
            style={styles.parallaxCoverImage}
            contentFit="cover"
            transition={300}
          />
        }
        headerAspectRatio={viewState.headerAspectRatio}
      >
        <ItemDetailContent
          item={item}
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
          onManageTags={() => router.push(`/item-tags/${item.id}` as Href)}
          onShare={handleShare}
          onOpenLink={handleOpenLink}
          useAnimatedActions
          useAnimatedDescription
          onContentLayout={handleContentLayout}
          onTitleLayout={handleTitleLayout}
          onActionRowLayout={handleActionRowLayout}
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
      showStickyActions={showStickyActions}
      stickyActions={stickyActionBar}
      stickyActionsTop={stickyActionsTop}
      stickyBackdropHeight={stickyBackdropHeight}
    >
      <ItemDetailContent
        item={item}
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
        onManageTags={() => router.push(`/item-tags/${item.id}` as Href)}
        onShare={handleShare}
        onOpenLink={handleOpenLink}
        useAnimatedActions={false}
        useAnimatedDescription={false}
        onContentLayout={handleContentLayout}
        onTitleLayout={handleTitleLayout}
        onActionRowLayout={handleActionRowLayout}
      />
    </ItemDetailScrollLayout>
  );
}
