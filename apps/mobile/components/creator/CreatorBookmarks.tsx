/**
 * CreatorBookmarks Component
 *
 * Displays the user's bookmarked items from a specific creator.
 * Shows a list of bookmarks with infinite scroll pagination.
 */

import { View, Text, FlatList, ActivityIndicator, StyleSheet } from 'react-native';

import { ItemCard, type ItemCardData } from '@/components/item-card';
import { EmptyState, ErrorState } from '@/components/list-states';
import { Colors, Typography, Spacing } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useCreatorBookmarks } from '@/hooks/use-creator';
import { mapContentType, mapProvider } from '@/hooks/use-items-trpc';
import type { ContentType, Provider } from '@/lib/content-utils';

// ============================================================================
// Types
// ============================================================================

export interface CreatorBookmarksProps {
  /** The creator ID to fetch bookmarks for */
  creatorId: string;
}

// ============================================================================
// Skeleton Component
// ============================================================================

function BookmarksSkeleton({ colors }: { colors: typeof Colors.light }) {
  return (
    <View>
      {[1, 2, 3].map((i) => (
        <View
          key={i}
          style={[styles.skeletonItem, { backgroundColor: colors.backgroundTertiary }]}
        />
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
export function CreatorBookmarks({ creatorId }: CreatorBookmarksProps) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];

  const { bookmarks, isLoading, isFetchingNextPage, hasNextPage, fetchNextPage, error, refetch } =
    useCreatorBookmarks(creatorId);

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
          <Text style={[styles.title, { color: colors.text }]}>Your Bookmarks</Text>
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
          <Text style={[styles.title, { color: colors.text }]}>Your Bookmarks</Text>
        </View>
        <ErrorState
          title="Failed to load bookmarks"
          message={error.message}
          onRetry={() => refetch()}
        />
      </View>
    );
  }

  // Empty state
  if (items.length === 0) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={[styles.title, { color: colors.text }]}>Your Bookmarks</Text>
        </View>
        <EmptyState
          emoji="🔖"
          title="No bookmarks yet"
          message="Your bookmarks from this creator will appear here"
        />
      </View>
    );
  }

  // Success state with items
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.text }]}>Your Bookmarks</Text>
        <Text style={[styles.count, { color: colors.textSecondary }]}>
          {items.length} item{items.length === 1 ? '' : 's'}
        </Text>
      </View>

      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        renderItem={({ item, index }) => <ItemCard item={item} variant="compact" index={index} />}
        onEndReached={handleEndReached}
        onEndReachedThreshold={0.5}
        ListFooterComponent={
          isFetchingNextPage ? (
            <View style={styles.loadingFooter}>
              <ActivityIndicator size="small" color={colors.primary} />
            </View>
          ) : null
        }
        scrollEnabled={false} // Scroll handled by parent ScrollView
        showsVerticalScrollIndicator={false}
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
    borderRadius: 8,
  },
  loadingFooter: {
    paddingVertical: Spacing.lg,
    alignItems: 'center',
  },
});
