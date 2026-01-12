import { Surface, useToast } from 'heroui-native';
import { useCallback, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, FlatList } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';

import { ItemCard, type ItemCardData } from '@/components/item-card';
import { LoadingState, ErrorState } from '@/components/list-states';
import { Colors, Typography, Spacing, Radius } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import {
  useInboxItems,
  useBookmarkItem,
  useArchiveItem,
  mapContentType,
  mapProvider,
} from '@/hooks/use-items-trpc';
import { useSyncAll } from '@/hooks/use-sync-all';
import { useNetworkStatus } from '@/hooks/use-network-status';
import { showSuccess, showError } from '@/lib/toast-utils';
import type { ContentType, Provider } from '@/lib/content-utils';

// =============================================================================
// Icons
// =============================================================================

function InboxArrowIcon({ size = 64, color = '#6366F1' }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
      <Path
        fillRule="evenodd"
        d="M5.478 5.559A1.5 1.5 0 0 1 6.912 4.5H9A.75.75 0 0 0 9 3H6.912a3 3 0 0 0-2.868 2.118l-2.411 7.838a3 3 0 0 0-.133.882V18a3 3 0 0 0 3 3h15a3 3 0 0 0 3-3v-4.162a3 3 0 0 0-.133-.882l-2.412-7.838A3 3 0 0 0 17.088 3H15a.75.75 0 0 0 0 1.5h2.088a1.5 1.5 0 0 1 1.434 1.059l2.213 7.191H17.89a3 3 0 0 0-2.684 1.658l-.256.513a1.5 1.5 0 0 1-1.342.829h-3.216a1.5 1.5 0 0 1-1.342-.829l-.256-.513A3 3 0 0 0 6.11 13.75H2.765l2.213-7.191Z"
        clipRule="evenodd"
      />
      <Path
        fillRule="evenodd"
        d="M12 2.25a.75.75 0 0 1 .75.75v6.44l1.72-1.72a.75.75 0 1 1 1.06 1.06l-3 3a.75.75 0 0 1-1.06 0l-3-3a.75.75 0 0 1 1.06-1.06l1.72 1.72V3a.75.75 0 0 1 .75-.75Z"
        clipRule="evenodd"
      />
    </Svg>
  );
}

// =============================================================================
// Custom Empty State for Inbox
// =============================================================================

function InboxEmptyState({ colors }: { colors: (typeof Colors)['light'] }) {
  return (
    <Animated.View entering={FadeInDown.delay(200).duration(500)} style={styles.emptyState}>
      <View style={[styles.emptyIcon, { backgroundColor: colors.backgroundSecondary }]}>
        <InboxArrowIcon size={48} color={colors.primary} />
      </View>
      <Text style={[styles.emptyTitle, { color: colors.text }]}>Your inbox is clear</Text>
      <Text style={[styles.emptyDescription, { color: colors.textSecondary }]}>
        New content from your sources will appear here. Bookmark what you want to keep, archive the
        rest.
      </Text>
      <View style={[styles.emptyHint, { backgroundColor: colors.backgroundSecondary }]}>
        <Text style={[styles.emptyHintText, { color: colors.textTertiary }]}>
          Connect sources in Settings to start receiving content
        </Text>
      </View>
    </Animated.View>
  );
}

// =============================================================================
// Main Screen
// =============================================================================

export default function InboxScreen() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const { toast } = useToast();

  const { data, isLoading, error } = useInboxItems();
  const bookmarkMutation = useBookmarkItem();
  const archiveMutation = useArchiveItem();

  // Sync hooks
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

  // Toast for sync results - use ref to prevent duplicate toasts
  const lastToastResultRef = useRef<typeof lastResult>(null);
  useEffect(() => {
    if (!lastResult) return;
    // Skip if we've already shown a toast for this exact result
    if (lastResult === lastToastResultRef.current) return;
    lastToastResultRef.current = lastResult;

    if (lastResult.success && lastResult.itemsFound > 0) {
      showSuccess(toast, lastResult.message);
    } else if (lastResult.success && lastResult.synced > 0 && lastResult.itemsFound === 0) {
      showSuccess(toast, lastResult.message); // "All caught up!"
    } else if (!lastResult.success) {
      showError(toast, new Error(lastResult.message || 'Sync failed'), 'Sync failed', 'sync');
    }
    // Don't show toast for "No subscriptions to sync"
  }, [lastResult, toast]);

  const handleBookmark = (id: string) => {
    bookmarkMutation.mutate(
      { id },
      {
        onSuccess: () => {
          showSuccess(toast, 'Saved to library');
        },
        onError: (err) => {
          showError(toast, err, 'Failed to save item', 'bookmark');
        },
      }
    );
  };

  const handleArchive = (id: string) => {
    archiveMutation.mutate(
      { id },
      {
        onSuccess: () => {
          showSuccess(toast, 'Archived');
        },
        onError: (err) => {
          showError(toast, err, 'Failed to archive item', 'archive');
        },
      }
    );
  };

  // Transform API response to ItemCardData format
  const inboxItems: ItemCardData[] = (data?.items ?? []).map((item) => ({
    id: item.id,
    title: item.title,
    creator: item.creator,
    thumbnailUrl: item.thumbnailUrl ?? null,
    contentType: mapContentType(item.contentType) as ContentType,
    provider: mapProvider(item.provider) as Provider,
    duration: item.duration ?? null,
    bookmarkedAt: null,
    publishedAt: item.publishedAt ?? null,
    isFinished: item.isFinished,
  }));

  const renderItem = ({ item, index }: { item: ItemCardData; index: number }) => (
    <ItemCard
      item={item}
      variant="full"
      index={index}
      showActions
      onBookmark={() => handleBookmark(item.id)}
      onArchive={() => handleArchive(item.id)}
      isBookmarking={bookmarkMutation.isPending && bookmarkMutation.variables?.id === item.id}
      isArchiving={archiveMutation.isPending && archiveMutation.variables?.id === item.id}
    />
  );

  return (
    <Surface style={[styles.container, { backgroundColor: colors.background }]}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={[styles.headerTitle, { color: colors.text }]}>Inbox</Text>
          <Text style={[styles.headerSubtitle, { color: colors.textSecondary }]}>
            {inboxItems.length > 0
              ? `${inboxItems.length} item${inboxItems.length === 1 ? '' : 's'} to triage`
              : 'Decide what to keep'}
          </Text>
        </View>

        {/* Content */}
        {isLoading ? (
          <LoadingState />
        ) : error ? (
          <ErrorState message={error.message} />
        ) : (
          <FlatList
            data={inboxItems}
            renderItem={renderItem}
            keyExtractor={(item) => item.id}
            contentContainerStyle={[
              styles.listContent,
              inboxItems.length === 0 && styles.emptyListContent,
            ]}
            showsVerticalScrollIndicator={false}
            onRefresh={handleRefresh}
            refreshing={isSyncing}
            ListEmptyComponent={<InboxEmptyState colors={colors} />}
          />
        )}
      </SafeAreaView>
    </Surface>
  );
}

// =============================================================================
// Styles
// =============================================================================

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  header: {
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.md,
  },
  headerTitle: {
    ...Typography.displayMedium,
    marginBottom: Spacing.xs,
  },
  headerSubtitle: {
    ...Typography.bodyMedium,
  },
  // List
  listContent: {
    paddingBottom: Spacing['3xl'],
  },
  emptyListContent: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  // Empty state (custom for inbox)
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
