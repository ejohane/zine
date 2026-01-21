import { useRouter, type Href } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Surface, useToast } from 'heroui-native';
import { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Pressable, type ListRenderItemInfo } from 'react-native';
import Animated, { FadeInDown, FadeIn, FadeOut, LinearTransition } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { InboxArrowIcon, SubscriptionsIcon } from '@/components/icons';
import { type ItemCardData } from '@/components/item-card';
import { LoadingState, ErrorState } from '@/components/list-states';
import { SwipeableInboxItem, type EnterDirection } from '@/components/swipeable-inbox-item';
import { Colors, Typography, Spacing, Radius } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import {
  useInboxItems,
  useArchiveItem,
  useBookmarkItem,
  mapContentType,
  mapProvider,
} from '@/hooks/use-items-trpc';
import { useSyncAll } from '@/hooks/use-sync-all';
import { useNetworkStatus } from '@/hooks/use-network-status';
import { showSuccess, showWarning, showError } from '@/lib/toast-utils';
import type { ContentType, Provider } from '@/lib/content-utils';

// =============================================================================
// Constants
// =============================================================================

/** How long to wait before clearing reappeared state (ms) */
const REENTRY_CLEANUP_DELAY = 500;

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
  const router = useRouter();
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const { toast } = useToast();

  const { data, isLoading, error } = useInboxItems();

  // Track items that should animate in after a failed mutation (rollback)
  // Maps item ID to the direction they should enter from
  const [reappearingItems, setReappearingItems] = useState<Map<string, EnterDirection>>(new Map());

  // Action mutations for swipeable items with rollback handling
  const archiveMutation = useArchiveItem();
  const bookmarkMutation = useBookmarkItem();

  /**
   * Mark an item as reappearing with a specific enter direction.
   * Auto-clears after animation completes.
   */
  const markAsReappearing = useCallback((id: string, enterFrom: EnterDirection) => {
    setReappearingItems((prev) => new Map(prev).set(id, enterFrom));
    // Clear after animation completes
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
      archiveMutation.mutate(
        { id },
        {
          onError: () => {
            // Archive exits left, so reappear from left
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
      bookmarkMutation.mutate(
        { id },
        {
          onError: () => {
            // Bookmark exits right, so reappear from right
            markAsReappearing(id, 'right');
            showError(toast, new Error('Bookmark failed'), 'Failed to save item', 'bookmark');
          },
        }
      );
    },
    [bookmarkMutation, markAsReappearing, toast]
  );

  // Sync hooks
  const { syncAll, isLoading: isSyncing, progress: syncProgress, lastResult } = useSyncAll();
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
  // Handles partial failures gracefully with nuanced messaging:
  // - Full success: green success toast
  // - Partial success (some failures): yellow warning toast
  // - Complete failure: red error toast
  const lastToastResultRef = useRef<typeof lastResult>(null);
  useEffect(() => {
    if (!lastResult) return;
    // Skip if we've already shown a toast for this exact result
    if (lastResult === lastToastResultRef.current) return;
    lastToastResultRef.current = lastResult;

    const { success, synced, total, itemsFound, errors, message } = lastResult;
    const failedCount = errors.length;

    // No subscriptions to sync - don't show toast
    if (total === 0 && synced === 0) {
      return;
    }

    // Full success (no failures)
    if (success) {
      if (itemsFound > 0) {
        showSuccess(toast, message);
      } else if (synced > 0) {
        showSuccess(toast, message); // "All caught up!"
      }
      return;
    }

    // Partial success: some synced, some failed
    // Use warning tone - lead with success, mention failures
    if (synced > 0 && failedCount > 0) {
      const failedText =
        failedCount === 1 ? '1 source had issues' : `${failedCount} sources had issues`;
      showWarning(toast, `Synced ${synced} of ${total} sources`, failedText);
      return;
    }

    // Complete failure: nothing synced
    if (synced === 0 && total > 0) {
      showError(toast, new Error(message || 'Sync failed'), 'Sync failed', 'sync');
      return;
    }

    // Fallback for edge cases (e.g., rate limit errors before sync started)
    if (!success) {
      showError(toast, new Error(message || 'Sync failed'), 'Sync failed', 'sync');
    }
  }, [lastResult, toast]);

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

  return (
    <Surface style={[styles.container, { backgroundColor: colors.background }]}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerTextContainer}>
            <Text style={[styles.headerTitle, { color: colors.text }]}>Inbox</Text>
            {syncProgress && syncProgress.total > 0 ? (
              <Animated.View entering={FadeIn.duration(200)} exiting={FadeOut.duration(200)}>
                <Text style={[styles.headerSubtitle, { color: colors.primary }]}>
                  Syncing {syncProgress.completed}/{syncProgress.total}...
                </Text>
              </Animated.View>
            ) : (
              <Text style={[styles.headerSubtitle, { color: colors.textSecondary }]}>
                {inboxItems.length > 0
                  ? `${inboxItems.length} item${inboxItems.length === 1 ? '' : 's'} to triage`
                  : 'Decide what to keep'}
              </Text>
            )}
          </View>
          <Pressable
            style={[styles.subscriptionsButton, { backgroundColor: colors.backgroundSecondary }]}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              router.push('/subscriptions' as Href);
            }}
            accessibilityLabel="Manage subscriptions"
            accessibilityRole="button"
          >
            <SubscriptionsIcon size={22} color={colors.primary} />
          </Pressable>
        </View>

        {/* Content */}
        {isLoading ? (
          <LoadingState />
        ) : error ? (
          <ErrorState message={error.message} />
        ) : (
          <Animated.FlatList
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
            itemLayoutAnimation={LinearTransition.springify().damping(15).stiffness(100)}
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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.md,
  },
  headerTextContainer: {
    flex: 1,
  },
  headerTitle: {
    ...Typography.displayMedium,
    marginBottom: Spacing.xs,
  },
  headerSubtitle: {
    ...Typography.bodyMedium,
  },
  subscriptionsButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: Spacing.md,
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
