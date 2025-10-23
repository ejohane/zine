import React, { useCallback } from 'react';
import { FlatList, View, RefreshControl, StyleSheet } from 'react-native';
import { useTheme } from '../../contexts/theme';
import { BookmarkListItem } from './BookmarkListItem';
import { SwipeableBookmarkItem } from './SwipeableBookmarkItem';
import { BookmarkListSkeleton } from './BookmarkListSkeleton';
import { BookmarkListEmptyState } from './BookmarkListEmptyState';
import { CARD_STYLES, SPACING } from './constants';
import type { BookmarkListProps } from './types';
import type { Bookmark } from '@zine/shared';

export function BookmarkList({
  bookmarks,
  variant = 'compact',
  layout = 'vertical',
  enableSwipeActions = false,
  leftSwipeActions,
  rightSwipeActions,
  onBookmarkPress,
  ListHeaderComponent,
  ListFooterComponent,
  ListEmptyComponent,
  onRefresh,
  refreshing = false,
  onEndReached,
  onEndReachedThreshold = 0.5,
  loadingMore = false,
  LoadingMoreComponent,
  enableHaptics = true,
}: BookmarkListProps) {
  const { colors } = useTheme();

  const isLoading = bookmarks.length === 0 && refreshing;

  const getItemLayout = useCallback(
    (data: any, index: number) => {
      const itemHeight = CARD_STYLES[variant].height + SPACING.sm;
      return {
        length: itemHeight,
        offset: itemHeight * index,
        index,
      };
    },
    [variant]
  );

  const keyExtractor = useCallback((item: Bookmark) => item.id, []);

  const renderItem = useCallback(
    ({ item }: { item: Bookmark }) => {
      if (enableSwipeActions && (leftSwipeActions || rightSwipeActions)) {
        return (
          <SwipeableBookmarkItem
            bookmark={item}
            variant={variant}
            onPress={onBookmarkPress}
            enableHapticFeedback={enableHaptics}
            leftActions={leftSwipeActions}
            rightActions={rightSwipeActions}
          />
        );
      }
      return (
        <BookmarkListItem
          bookmark={item}
          variant={variant}
          onPress={onBookmarkPress}
          enableHaptics={enableHaptics}
        />
      );
    },
    [variant, onBookmarkPress, enableHaptics, enableSwipeActions, leftSwipeActions, rightSwipeActions]
  );

  const renderSeparator = useCallback(
    () => <View style={{ height: SPACING.sm }} />,
    []
  );

  const renderEmpty = useCallback(() => {
    if (isLoading) {
      return <BookmarkListSkeleton variant={variant} layout={layout} count={5} />;
    }
    if (ListEmptyComponent) {
      return <ListEmptyComponent />;
    }
    return <BookmarkListEmptyState />;
  }, [isLoading, variant, layout, ListEmptyComponent]);

  const renderFooter = useCallback(() => {
    if (loadingMore) {
      if (LoadingMoreComponent) {
        return <LoadingMoreComponent />;
      }
      return <BookmarkListSkeleton variant={variant} layout={layout} count={2} />;
    }
    if (ListFooterComponent) {
      return <ListFooterComponent />;
    }
    return null;
  }, [loadingMore, variant, layout, LoadingMoreComponent, ListFooterComponent]);

  return (
    <FlatList
      data={bookmarks}
      renderItem={renderItem}
      keyExtractor={keyExtractor}
      getItemLayout={getItemLayout}
      ItemSeparatorComponent={renderSeparator}
      ListHeaderComponent={ListHeaderComponent}
      ListFooterComponent={renderFooter}
      ListEmptyComponent={renderEmpty}
      refreshControl={
        onRefresh ? (
          <RefreshControl
            refreshing={refreshing && !isLoading}
            onRefresh={onRefresh}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        ) : undefined
      }
      onEndReached={onEndReached}
      onEndReachedThreshold={onEndReachedThreshold}
      initialNumToRender={10}
      maxToRenderPerBatch={5}
      windowSize={10}
      removeClippedSubviews={true}
      showsVerticalScrollIndicator={layout === 'vertical'}
      showsHorizontalScrollIndicator={layout === 'horizontal'}
      horizontal={layout === 'horizontal'}
      contentContainerStyle={bookmarks.length === 0 ? styles.emptyContainer : undefined}
    />
  );
}

const styles = StyleSheet.create({
  emptyContainer: {
    flexGrow: 1,
  },
});
