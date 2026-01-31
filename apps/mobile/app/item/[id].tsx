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
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { upgradeSpotifyImageUrl, upgradeYouTubeImageUrl } from '@/lib/content-utils';

import { XPostBookmarkView } from './item-detail-components';
import { styles } from './item-detail-styles';
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

  const { id, isValid, message } = useItemDetailParams();
  const { item, isLoading, error, refetch, creatorData } = useItemDetailData({ id, isValid });
  const {
    handleOpenLink,
    handleShare,
    handleToggleBookmark,
    handleToggleFinished,
    bookmarkMutation,
    unbookmarkMutation,
    toggleFinishedMutation,
  } = useItemDetailActions(item);

  const viewState = useItemDetailViewState({
    item,
    colors,
    bookmarkPending: bookmarkMutation.isPending,
    unbookmarkPending: unbookmarkMutation.isPending,
    toggleFinishedPending: toggleFinishedMutation.isPending,
  });

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
      <XPostBookmarkView
        item={item}
        colors={colors}
        insets={insets}
        onBack={() => router.back()}
        onOpenLink={handleOpenLink}
        onShare={handleShare}
        onBookmarkToggle={handleToggleBookmark}
        onComplete={handleToggleFinished}
        onCreatorPress={
          item.creatorId ? () => router.push(`/creator/${item.creatorId}`) : undefined
        }
        bookmarkActionIcon={viewState.bookmarkActionIcon}
        bookmarkActionColor={viewState.bookmarkActionColor}
        isBookmarkActionDisabled={viewState.isBookmarkActionDisabled}
        completeActionIcon={viewState.completeActionIcon}
        completeActionColor={viewState.completeActionColor}
        isCompleteActionDisabled={viewState.isCompleteActionDisabled}
        creatorData={creatorData}
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
          completeActionIcon={viewState.completeActionIcon}
          completeActionColor={viewState.completeActionColor}
          isCompleteActionDisabled={viewState.isCompleteActionDisabled}
          onBookmarkToggle={handleToggleBookmark}
          onComplete={handleToggleFinished}
          onShare={handleShare}
          onOpenLink={handleOpenLink}
          useAnimatedActions
          useAnimatedDescription
        />
      </ItemDetailParallaxLayout>
    );
  }

  return (
    <ItemDetailScrollLayout colors={colors} insets={insets} onBack={() => router.back()}>
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
        completeActionIcon={viewState.completeActionIcon}
        completeActionColor={viewState.completeActionColor}
        isCompleteActionDisabled={viewState.isCompleteActionDisabled}
        onBookmarkToggle={handleToggleBookmark}
        onComplete={handleToggleFinished}
        onShare={handleShare}
        onOpenLink={handleOpenLink}
        useAnimatedActions={false}
        useAnimatedDescription={false}
      />
    </ItemDetailScrollLayout>
  );
}
