/**
 * CreatorBookmarks Component
 *
 * Displays the user's bookmarked items from a specific creator.
 * Shows a list of bookmarks with infinite scroll pagination.
 */

import { View, FlatList, ActivityIndicator, StyleSheet } from 'react-native';

import { ItemCard, type ItemCardData } from '@/components/item-card';
import { ErrorState } from '@/components/list-states';
import { Text } from '@/components/primitives';
import { Radius, Typography, Spacing, type ThemeColors } from '@/constants/theme';
import { useAppTheme } from '@/hooks/use-app-theme';
import { useCreatorBookmarks } from '@/hooks/use-creator';
import { mapContentType, mapProvider } from '@/hooks/use-items-trpc';
import type { ContentType, Provider } from '@/lib/content-utils';

// ============================================================================
// Types
// ============================================================================

export interface CreatorBookmarksProps {
  /** The creator ID to fetch bookmarks for */
  creatorId: string;
  /** Optional override for deterministic tests/stories */
  stateOverride?: {
    bookmarks: ReturnType<typeof useCreatorBookmarks>['bookmarks'];
    isLoading: boolean;
    isFetchingNextPage: boolean;
    hasNextPage: boolean;
    fetchNextPage?: () => void;
    error?: Error | null;
    refetch?: () => void;
  };
}

// ============================================================================
// Skeleton Component
// ============================================================================

function BookmarksSkeleton({ colors }: { colors: ThemeColors }) {
  return (
    <View>
      {[1, 2, 3].map((i) => (
        <View key={i} style={[styles.skeletonItem, { backgroundColor: colors.surfaceRaised }]} />
      ))}
    </View>
  );
}

// ============================================================================
// Component
// ============================================================================

/**
 * CreatorBookmarks displays a paginated list of the user's bookmarks
 * from a specific creator.
 *
 * @example
 * ```tsx
 * <CreatorBookmarks creatorId="creator-123" />
 * ```
 */
export function CreatorBookmarks({ creatorId, stateOverride }: CreatorBookmarksProps) {
  const { colors } = useAppTheme();

  const bookmarksState = useCreatorBookmarks(creatorId);
  const bookmarks = stateOverride?.bookmarks ?? bookmarksState.bookmarks;
  const isLoading = stateOverride?.isLoading ?? bookmarksState.isLoading;
  const isFetchingNextPage = stateOverride?.isFetchingNextPage ?? bookmarksState.isFetchingNextPage;
  const hasNextPage = stateOverride?.hasNextPage ?? bookmarksState.hasNextPage;
  const fetchNextPage = stateOverride?.fetchNextPage ?? bookmarksState.fetchNextPage;
  const error = stateOverride?.error ?? bookmarksState.error;
  const refetch = stateOverride?.refetch ?? bookmarksState.refetch;

  const handleEndReached = () => {
    if (hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  };

  // Transform API response to ItemCardData format
  const items: ItemCardData[] = bookmarks.map((item) => ({
    id: item.id,
    title: item.title,
    creator: item.creator,
    thumbnailUrl: item.thumbnailUrl ?? null,
    contentType: mapContentType(item.contentType) as ContentType,
    provider: mapProvider(item.provider) as Provider,
    duration: item.duration ?? null,
    readingTimeMinutes: item.readingTimeMinutes ?? null,
    bookmarkedAt: item.bookmarkedAt ?? null,
    publishedAt: item.publishedAt ?? null,
    isFinished: item.isFinished,
  }));

  // Loading state
  if (isLoading) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title} tone="primary">
            Your Bookmarks
          </Text>
        </View>
        <BookmarksSkeleton colors={colors} />
      </View>
    );
  }

  // Error state
  if (error) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title} tone="primary">
            Your Bookmarks
          </Text>
        </View>
        <ErrorState
          title="Failed to load bookmarks"
          message={error.message}
          onRetry={() => refetch()}
        />
      </View>
    );
  }

  // Empty state - hide the section entirely when there are no bookmarks
  if (items.length === 0) {
    return null;
  }

  // Success state with items
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title} tone="primary">
          Your Bookmarks
        </Text>
        <Text style={styles.count} tone="secondary">
          {items.length} item{items.length === 1 ? '' : 's'}
        </Text>
      </View>

      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        renderItem={({ item, index }) => <ItemCard item={item} shape="row" index={index} />}
        onEndReached={handleEndReached}
        onEndReachedThreshold={0.5}
        ListFooterComponent={
          isFetchingNextPage ? (
            <View style={styles.loadingFooter}>
              <ActivityIndicator size="small" color={colors.accent} />
            </View>
          ) : null
        }
        scrollEnabled={false} // Scroll handled by parent ScrollView
        showsVerticalScrollIndicator={false}
        // Disable virtualization when nested in ScrollView - ensures all items render
        initialNumToRender={50}
        maxToRenderPerBatch={50}
        windowSize={21}
      />
    </View>
  );
}

// ============================================================================
// Styles
// ============================================================================

const styles = StyleSheet.create({
  container: {
    paddingTop: Spacing.lg,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    marginBottom: Spacing.md,
  },
  title: {
    ...Typography.titleMedium,
    fontWeight: '600',
  },
  count: {
    ...Typography.bodySmall,
  },
  skeletonItem: {
    height: 64,
    marginHorizontal: Spacing.md,
    marginBottom: Spacing.sm,
    borderRadius: Radius.md,
  },
  loadingFooter: {
    paddingVertical: Spacing.lg,
    alignItems: 'center',
  },
});
