import { Stack, useNavigation } from 'expo-router';
import { Surface, useToast } from 'heroui-native';
import type { ComponentType } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  View,
  Text,
  StyleSheet,
  type ListRenderItemInfo,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import Animated, { LinearTransition } from 'react-native-reanimated';
import { ContentType as ApiContentType } from '@zine/shared';

import { FilterChip } from '@/components/filter-chip';
import { ArticleIcon, InboxArrowIcon, PodcastIcon, PostIcon, VideoIcon } from '@/components/icons';
import { type ItemCardData } from '@/components/item-card';
import { LoadingState, ErrorState } from '@/components/list-states';
import { SwipeableInboxItem, type EnterDirection } from '@/components/swipeable-inbox-item';
import {
  Colors,
  Typography,
  Spacing,
  Radius,
  ContentColors,
  FilterChipPalette,
} from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useTabPrefetch } from '@/hooks/use-prefetch';
import { useInfiniteInboxItems, useArchiveItem, useBookmarkItem } from '@/hooks/use-items-trpc';
import {
  mapContentType,
  mapProvider,
  type ContentType,
  type Provider,
  type UIContentType,
} from '@/lib/content-utils';
import { useSyncAll } from '@/hooks/use-sync-all';
import {
  addPendingDismissedId,
  filterPendingDismissedItems,
  pruneResolvedPendingDismissedIds,
  removePendingDismissedId,
} from '@/lib/inbox-optimistic-dismissal';
import { useNetworkStatus } from '@/hooks/use-network-status';
import { showSuccess, showWarning, showError } from '@/lib/toast-utils';
import {
  createLightweightHeaderScreenOptions,
  useCollapsedHeaderTitle,
} from '@/lib/native-large-title-header';

const REENTRY_CLEANUP_DELAY = 500;
const INBOX_PAGE_SIZE = 20;
const INBOX_TOP_THRESHOLD = 4;

const contentTypeFilters: {
  id: UIContentType;
  label: string;
  icon: ComponentType<{ size?: number; color?: string }>;
  dotColor: string;
  selectedColor: string;
  selectedSurfaceColor: string;
  contentType: ApiContentType;
}[] = [
  {
    id: 'article',
    label: 'Articles',
    icon: ArticleIcon,
    dotColor: ContentColors.article,
    selectedColor: FilterChipPalette.article.accent,
    selectedSurfaceColor: FilterChipPalette.article.surface,
    contentType: ApiContentType.ARTICLE,
  },
  {
    id: 'podcast',
    label: 'Podcasts',
    icon: PodcastIcon,
    dotColor: ContentColors.podcast,
    selectedColor: FilterChipPalette.podcast.accent,
    selectedSurfaceColor: FilterChipPalette.podcast.surface,
    contentType: ApiContentType.PODCAST,
  },
  {
    id: 'video',
    label: 'Videos',
    icon: VideoIcon,
    dotColor: ContentColors.video,
    selectedColor: FilterChipPalette.video.accent,
    selectedSurfaceColor: FilterChipPalette.video.surface,
    contentType: ApiContentType.VIDEO,
  },
  {
    id: 'post',
    label: 'Posts',
    icon: PostIcon,
    dotColor: ContentColors.post,
    selectedColor: FilterChipPalette.post.accent,
    selectedSurfaceColor: FilterChipPalette.post.surface,
    contentType: ApiContentType.POST,
  },
];

function InboxEmptyState({
  colors,
  selectedFilterLabel,
}: {
  colors: (typeof Colors)['light'];
  selectedFilterLabel?: string;
}) {
  const title = selectedFilterLabel
    ? `No ${selectedFilterLabel.toLowerCase()}`
    : 'Your inbox is clear';
  const description = selectedFilterLabel
    ? `New ${selectedFilterLabel.toLowerCase()} from your sources will appear here.`
    : 'New content from your sources will appear here. Bookmark what you want to keep, archive the rest.';

  return (
    <Animated.View style={styles.emptyState}>
      <View style={[styles.emptyIcon, { backgroundColor: colors.backgroundSecondary }]}>
        <InboxArrowIcon size={48} color={colors.primary} />
      </View>
      <Text style={[styles.emptyTitle, { color: colors.text }]}>{title}</Text>
      <Text style={[styles.emptyDescription, { color: colors.textSubheader }]}>{description}</Text>
      <View style={[styles.emptyHint, { backgroundColor: colors.backgroundSecondary }]}>
        <Text style={[styles.emptyHintText, { color: colors.textTertiary }]}>
          Connect integrations in Settings to start receiving content
        </Text>
      </View>
    </Animated.View>
  );
}

export default function InboxScreen() {
  const navigation = useNavigation();
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const { toast } = useToast();
  const { handleScroll, showCollapsedTitle } = useCollapsedHeaderTitle();
  const [contentTypeFilter, setContentTypeFilter] = useState<UIContentType | null>(null);

  useTabPrefetch('inbox');

  const apiContentTypeFilter = contentTypeFilter
    ? contentTypeFilters.find((filter) => filter.id === contentTypeFilter)?.contentType
    : undefined;

  const { data, isLoading, error, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useInfiniteInboxItems({
      limit: INBOX_PAGE_SIZE,
      ...(apiContentTypeFilter ? { filter: { contentType: apiContentTypeFilter } } : {}),
    });

  const [reappearingItems, setReappearingItems] = useState<Map<string, EnterDirection>>(new Map());
  const [pendingDismissedItemIds, setPendingDismissedItemIds] = useState<Set<string>>(new Set());
  const listRef = useRef<Animated.FlatList<ItemCardData>>(null);
  const scrollOffsetYRef = useRef(0);
  const selectedContentTypeFilter = contentTypeFilters.find(
    (filter) => filter.id === contentTypeFilter
  );

  const archiveMutation = useArchiveItem();
  const bookmarkMutation = useBookmarkItem();

  const handleContentTypeFilterPress = useCallback((id: UIContentType) => {
    setContentTypeFilter((current) => (current === id ? null : id));
    listRef.current?.scrollToOffset({ offset: 0, animated: true });
  }, []);

  const handleInboxScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      scrollOffsetYRef.current = event.nativeEvent.contentOffset.y;
      handleScroll(event);
    },
    [handleScroll]
  );

  const markAsReappearing = useCallback((id: string, enterFrom: EnterDirection) => {
    setReappearingItems((prev) => new Map(prev).set(id, enterFrom));
    setTimeout(() => {
      setReappearingItems((prev) => {
        const next = new Map(prev);
        next.delete(id);
        return next;
      });
    }, REENTRY_CLEANUP_DELAY);
  }, []);

  const handleArchive = useCallback(
    (id: string) => {
      setPendingDismissedItemIds((prev) => addPendingDismissedId(prev, id));
      archiveMutation.mutate(
        { id },
        {
          onError: () => {
            setPendingDismissedItemIds((prev) => removePendingDismissedId(prev, id));
            markAsReappearing(id, 'left');
            showError(toast, new Error('Archive failed'), 'Failed to archive item', 'archive');
          },
        }
      );
    },
    [archiveMutation, markAsReappearing, toast]
  );

  const handleBookmark = useCallback(
    (id: string) => {
      setPendingDismissedItemIds((prev) => addPendingDismissedId(prev, id));
      bookmarkMutation.mutate(
        { id },
        {
          onError: () => {
            setPendingDismissedItemIds((prev) => removePendingDismissedId(prev, id));
            markAsReappearing(id, 'right');
            showError(toast, new Error('Bookmark failed'), 'Failed to save item', 'bookmark');
          },
        }
      );
    },
    [bookmarkMutation, markAsReappearing, toast]
  );

  const { syncAll, isLoading: isSyncing, lastResult } = useSyncAll();
  const { isConnected, isInternetReachable } = useNetworkStatus();
  const isOffline = !isConnected || isInternetReachable === false;

  const handleRefresh = useCallback(() => {
    if (isOffline) {
      showError(toast, new Error('No internet connection'), 'Cannot sync while offline', 'sync');
      return;
    }
    syncAll();
  }, [syncAll, isOffline, toast]);

  const lastToastResultRef = useRef<typeof lastResult>(null);
  useEffect(() => {
    if (!lastResult) return;
    if (lastResult === lastToastResultRef.current) return;
    lastToastResultRef.current = lastResult;

    const { success, synced, total, itemsFound, errors, message } = lastResult;
    const failedCount = errors.length;

    if (total === 0 && synced === 0) {
      return;
    }

    if (success) {
      if (itemsFound > 0) {
        showSuccess(toast, message);
      } else if (synced > 0) {
        showSuccess(toast, message);
      }
      return;
    }

    if (synced > 0 && failedCount > 0) {
      const failedText =
        failedCount === 1 ? '1 source had issues' : `${failedCount} sources had issues`;
      showWarning(toast, `Synced ${synced} of ${total} sources`, failedText);
      return;
    }

    if (synced === 0 && total > 0) {
      showError(toast, new Error(message || 'Sync failed'), 'Sync failed', 'sync');
      return;
    }

    if (!success) {
      showError(toast, new Error(message || 'Sync failed'), 'Sync failed', 'sync');
    }
  }, [lastResult, toast]);

  const inboxItems: ItemCardData[] = useMemo(
    () =>
      (data?.pages.flatMap((page) => page.items) ?? []).map((item) => ({
        id: item.id,
        title: item.title,
        creator: item.creator,
        creatorImageUrl: item.creatorImageUrl ?? null,
        thumbnailUrl: item.thumbnailUrl ?? null,
        contentType: mapContentType(item.contentType) as ContentType,
        provider: mapProvider(item.provider) as Provider,
        duration: item.duration ?? null,
        readingTimeMinutes: item.readingTimeMinutes ?? null,
        bookmarkedAt: null,
        publishedAt: item.publishedAt ?? null,
        isFinished: item.isFinished,
      })),
    [data?.pages]
  );

  const visibleInboxItems = useMemo(
    () => filterPendingDismissedItems(inboxItems, pendingDismissedItemIds),
    [inboxItems, pendingDismissedItemIds]
  );

  useEffect(() => {
    setPendingDismissedItemIds((prev) => pruneResolvedPendingDismissedIds(prev, inboxItems));
  }, [inboxItems]);

  const handleEndReached = useCallback(() => {
    if (!hasNextPage || isFetchingNextPage) {
      return;
    }

    void fetchNextPage();
  }, [fetchNextPage, hasNextPage, isFetchingNextPage]);

  const renderItem = useCallback(
    ({ item, index }: ListRenderItemInfo<ItemCardData>) => (
      <SwipeableInboxItem
        item={item}
        index={index}
        onArchive={handleArchive}
        onBookmark={handleBookmark}
        enterFrom={reappearingItems.get(item.id)}
      />
    ),
    [handleArchive, handleBookmark, reappearingItems]
  );

  useEffect(() => {
    const tabNavigation = navigation.getParent?.() ?? navigation;

    return tabNavigation.addListener('tabPress', () => {
      if (!navigation.isFocused()) return;

      const isAtTop = scrollOffsetYRef.current <= INBOX_TOP_THRESHOLD;

      if (contentTypeFilter !== null && isAtTop) {
        setContentTypeFilter(null);
        return;
      }

      listRef.current?.scrollToOffset({ offset: 0, animated: true });
    });
  }, [contentTypeFilter, navigation]);

  const listEmptyComponent = isLoading ? (
    <LoadingState />
  ) : error ? (
    <ErrorState message={error.message} />
  ) : (
    <InboxEmptyState colors={colors} selectedFilterLabel={selectedContentTypeFilter?.label} />
  );

  return (
    <Surface style={[styles.container, { backgroundColor: colors.background }]} collapsable={false}>
      <Stack.Screen
        options={createLightweightHeaderScreenOptions({
          backgroundColor: colors.background,
          tintColor: colors.text,
          screenTitle: 'Inbox',
          showScreenTitle: isLoading || showCollapsedTitle,
        })}
      />
      <Animated.FlatList
        ref={listRef}
        style={styles.list}
        data={isLoading || error ? [] : visibleInboxItems}
        renderItem={renderItem}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        contentInsetAdjustmentBehavior="automatic"
        showsVerticalScrollIndicator={false}
        onScroll={handleInboxScroll}
        scrollEventThrottle={32}
        onRefresh={handleRefresh}
        refreshing={isSyncing}
        ListHeaderComponent={
          <View style={styles.listHeader}>
            <Text style={[styles.headerTitle, { color: colors.text }]}>Inbox</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.filterContainer}
            >
              {contentTypeFilters.map((filter) => (
                <FilterChip
                  key={filter.id}
                  label={filter.label}
                  isSelected={contentTypeFilter === filter.id}
                  onPress={() => handleContentTypeFilterPress(filter.id)}
                  icon={filter.icon}
                  dotColor={filter.dotColor}
                  selectedColor={filter.selectedColor}
                  selectedSurfaceColor={filter.selectedSurfaceColor}
                />
              ))}
            </ScrollView>
          </View>
        }
        ListEmptyComponent={listEmptyComponent}
        itemLayoutAnimation={LinearTransition.springify().damping(15).stiffness(100)}
        onEndReached={handleEndReached}
        onEndReachedThreshold={0.6}
        ListFooterComponent={
          !isLoading && !error && isFetchingNextPage ? (
            <View style={styles.loadingFooter}>
              <ActivityIndicator size="small" color={colors.primary} />
            </View>
          ) : null
        }
      />
    </Surface>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  list: {
    flex: 1,
  },
  listHeader: {
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.md,
  },
  headerTitle: {
    ...Typography.displayMedium,
  },
  filterContainer: {
    paddingTop: Spacing.md,
    gap: Spacing.sm,
  },
  listContent: {
    flexGrow: 1,
    paddingBottom: Spacing['3xl'],
  },
  loadingFooter: {
    paddingVertical: Spacing.lg,
    alignItems: 'center',
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing['3xl'],
    paddingBottom: 100,
  },
  emptyIcon: {
    width: 100,
    height: 100,
    borderRadius: 50,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing['2xl'],
  },
  emptyTitle: {
    ...Typography.headlineSmall,
    textAlign: 'center',
    marginBottom: Spacing.md,
  },
  emptyDescription: {
    ...Typography.bodyMedium,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: Spacing['2xl'],
  },
  emptyHint: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderRadius: Radius.lg,
  },
  emptyHintText: {
    ...Typography.bodySmall,
    textAlign: 'center',
  },
});
