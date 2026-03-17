/**
 * CreatorPublications Component
 *
 * Displays a creator's publication history across all user states
 * (INBOX, BOOKMARKED, ARCHIVED).
 */

import { View, FlatList, ActivityIndicator, StyleSheet } from 'react-native';

import { ItemCard, type ItemCardData } from '@/components/item-card';
import { ErrorState } from '@/components/list-states';
import { Text } from '@/components/primitives';
import { Radius, Typography, Spacing, type ThemeColors } from '@/constants/theme';
import { useAppTheme } from '@/hooks/use-app-theme';
import { useCreatorPublications } from '@/hooks/use-creator';
import { mapContentType, mapProvider } from '@/hooks/use-items-trpc';
import type { ContentType, Provider } from '@/lib/content-utils';

export interface CreatorPublicationsProps {
  /** The creator ID to fetch publications for */
  creatorId: string;
  /** Optional override for deterministic tests/stories */
  stateOverride?: {
    publications: ReturnType<typeof useCreatorPublications>['publications'];
    isLoading: boolean;
    isFetchingNextPage: boolean;
    hasNextPage: boolean;
    fetchNextPage?: () => void;
    error?: Error | null;
    refetch?: () => void;
  };
}

function PublicationsSkeleton({ colors }: { colors: ThemeColors }) {
  return (
    <View>
      {[1, 2, 3].map((i) => (
        <View key={i} style={[styles.skeletonItem, { backgroundColor: colors.surfaceRaised }]} />
      ))}
    </View>
  );
}

export function CreatorPublications({ creatorId, stateOverride }: CreatorPublicationsProps) {
  const { colors } = useAppTheme();

  const publicationsState = useCreatorPublications(creatorId);
  const publications = stateOverride?.publications ?? publicationsState.publications;
  const isLoading = stateOverride?.isLoading ?? publicationsState.isLoading;
  const isFetchingNextPage =
    stateOverride?.isFetchingNextPage ?? publicationsState.isFetchingNextPage;
  const hasNextPage = stateOverride?.hasNextPage ?? publicationsState.hasNextPage;
  const fetchNextPage = stateOverride?.fetchNextPage ?? publicationsState.fetchNextPage;
  const error = stateOverride?.error ?? publicationsState.error;
  const refetch = stateOverride?.refetch ?? publicationsState.refetch;

  const handleEndReached = () => {
    if (hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  };

  const items: ItemCardData[] = publications.map((item) => ({
    id: item.id,
    title: item.title,
    creator: item.creator,
    creatorImageUrl: item.creatorImageUrl ?? null,
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
          <Text style={styles.title} tone="primary">
            Past Publications
          </Text>
        </View>
        <PublicationsSkeleton colors={colors} />
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title} tone="primary">
            Past Publications
          </Text>
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
          <Text style={styles.title} tone="primary">
            Past Publications
          </Text>
        </View>
        <Text style={styles.emptyText} tone="subheader">
          No publications found yet
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title} tone="primary">
          Past Publications
        </Text>
        <Text style={styles.count} tone="subheader">
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
    borderRadius: Radius.md,
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
