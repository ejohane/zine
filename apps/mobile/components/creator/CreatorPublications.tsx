/**
 * CreatorPublications Component
 *
 * Displays a creator's publication history across all user states
 * (INBOX, BOOKMARKED, ARCHIVED).
 */

import { View, Text, FlatList, ActivityIndicator, StyleSheet } from 'react-native';

import { ItemCard, type ItemCardData } from '@/components/item-card';
import { ErrorState } from '@/components/list-states';
import { Colors, Typography, Spacing } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useCreatorPublications } from '@/hooks/use-creator';
import { mapContentType, mapProvider } from '@/hooks/use-items-trpc';
import type { ContentType, Provider } from '@/lib/content-utils';

export interface CreatorPublicationsProps {
  /** The creator ID to fetch publications for */
  creatorId: string;
}

function PublicationsSkeleton({ colors }: { colors: typeof Colors.light }) {
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

export function CreatorPublications({ creatorId }: CreatorPublicationsProps) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];

  const {
    publications,
    isLoading,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
    error,
    refetch,
  } = useCreatorPublications(creatorId);

  const handleEndReached = () => {
    if (hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  };

  const items: ItemCardData[] = publications.map((item) => ({
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

  if (isLoading) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={[styles.title, { color: colors.text }]}>Past Publications</Text>
        </View>
        <PublicationsSkeleton colors={colors} />
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={[styles.title, { color: colors.text }]}>Past Publications</Text>
        </View>
        <ErrorState
          title="Failed to load publications"
          message={error.message}
          onRetry={() => refetch()}
        />
      </View>
    );
  }

  if (items.length === 0) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={[styles.title, { color: colors.text }]}>Past Publications</Text>
        </View>
        <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
          No publications found yet
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.text }]}>Past Publications</Text>
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
        scrollEnabled={false}
        showsVerticalScrollIndicator={false}
        initialNumToRender={50}
        maxToRenderPerBatch={50}
        windowSize={21}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingTop: Spacing.xl,
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
  emptyText: {
    ...Typography.bodyMedium,
    paddingHorizontal: Spacing.lg,
  },
});
