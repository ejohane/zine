import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useAuth } from '../../../contexts/auth';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

import { CategoryTabs, CategoryType } from '../../../components/CategoryTabs';
import { BookmarkListItem } from '../../../components/bookmark-list/BookmarkListItem';
import { BookmarkListSkeleton } from '../../../components/bookmark-list/BookmarkListSkeleton';
import { SwipeableList } from '../../../components/swipeable-list';
import { useInboxBookmarks } from '../../../hooks/useInboxBookmarks';
import { useArchiveBookmark } from '../../../hooks/useArchiveBookmark';
import { useUnarchiveBookmark } from '../../../hooks/useUnarchiveBookmark';
import { useTheme } from '../../../contexts/theme';
import type { Bookmark } from '@zine/shared';
import type { SwipeAction } from '../../../components/swipeable-list/types';

export default function InboxScreen() {
  const { isSignedIn } = useAuth();
  const { colors } = useTheme();
  const router = useRouter();

  // State
  const [selectedCategory, setSelectedCategory] = useState<CategoryType>('all');
  const [archivedBookmarkId, setArchivedBookmarkId] = useState<string | null>(null);
  const [archivedBookmarkTitle, setArchivedBookmarkTitle] = useState<string>('');
  const [toastVisible, setToastVisible] = useState(false);
  const toastOpacity = React.useRef(new Animated.Value(0)).current;
  const toastTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  // Data fetching
  const { data: bookmarks, isLoading, refetch } = useInboxBookmarks({
    filter: selectedCategory,
    enabled: isSignedIn,
  });

  // Mutations
  const archiveMutation = useArchiveBookmark();
  const unarchiveMutation = useUnarchiveBookmark();

  // Handlers
  const handleBookmarkPress = useCallback(
    (bookmarkId: string) => {
      router.push(`/bookmark/${bookmarkId}`);
    },
    [router]
  );

  const handleRefresh = useCallback(async () => {
    await refetch();
  }, [refetch]);

  // Toast functions
  const showToast = useCallback((bookmarkId: string, title: string) => {
    // Clear any existing timeout
    if (toastTimeoutRef.current) {
      clearTimeout(toastTimeoutRef.current);
    }

    setArchivedBookmarkId(bookmarkId);
    setArchivedBookmarkTitle(title);
    setToastVisible(true);

    // Fade in animation
    Animated.timing(toastOpacity, {
      toValue: 1,
      duration: 300,
      useNativeDriver: true,
    }).start();

    // Auto-hide after 5 seconds
    toastTimeoutRef.current = setTimeout(() => {
      hideToast();
    }, 5000);
  }, [toastOpacity]);

  const hideToast = useCallback(() => {
    // Clear timeout if exists
    if (toastTimeoutRef.current) {
      clearTimeout(toastTimeoutRef.current);
      toastTimeoutRef.current = null;
    }

    // Fade out animation
    Animated.timing(toastOpacity, {
      toValue: 0,
      duration: 300,
      useNativeDriver: true,
    }).start(() => {
      setToastVisible(false);
      setArchivedBookmarkId(null);
      setArchivedBookmarkTitle('');
    });
  }, [toastOpacity]);

  // Archive handler with optimistic updates
  const handleArchive = useCallback((bookmarkId: string) => {
    // Execute optimistic mutation FIRST (item will disappear immediately)
    archiveMutation.mutate(bookmarkId);

    // Then handle UI updates (toast, etc.) - these don't block the visual update
    const bookmark = bookmarks?.find(b => b.id === bookmarkId);
    const title = bookmark?.title || 'Bookmark';
    
    setArchivedBookmarkId(bookmarkId);
    setArchivedBookmarkTitle(title);
    showToast(bookmarkId, title);
  }, [bookmarks, archiveMutation, showToast]);

  // Undo handler - restore item to cache (optimistic rollback)
  const handleUndo = useCallback(() => {
    if (!archivedBookmarkId) return;

    // Light haptic feedback on undo
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    // Unarchive the bookmark (will restore to cache optimistically)
    unarchiveMutation.mutate(archivedBookmarkId);

    // Hide the toast immediately
    hideToast();
  }, [archivedBookmarkId, unarchiveMutation, hideToast]);

  // Memoize the archive icon
  const archiveIcon = React.useMemo(() => (
    <Feather name="archive" size={24} color="#ffffff" />
  ), []);

  // Create archive action for SwipeableList
  const createArchiveAction = useCallback((bookmark: Bookmark): SwipeAction[] => [
    {
      key: 'archive',
      label: 'Archive',
      color: colors.primary,
      icon: archiveIcon,
      isPrimary: true, // Enable full-swipe-to-archive
      onPress: () => handleArchive(bookmark.id),
    },
  ], [colors.primary, archiveIcon, handleArchive]);

  // Render functions
  const renderItem = useCallback(
    ({ item }: { item: Bookmark }) => (
      <BookmarkListItem
        bookmark={item}
        variant="compact"
        onPress={handleBookmarkPress}
        showThumbnail={true}
        showMetadata={true}
        showPublishDate={true}
        showPlatformIcon={true}
        enableHaptics={true}
      />
    ),
    [handleBookmarkPress]
  );

  const renderEmpty = useCallback(() => {
    const emptyMessages: Record<
      CategoryType,
      { title: string; description: string }
    > = {
      all: {
        title: 'No bookmarks yet',
        description: 'Start saving content to see it here',
      },
      videos: {
        title: 'No videos saved yet',
        description: 'Save your first video to see it here',
      },
      podcasts: {
        title: 'No podcasts saved yet',
        description: 'Save your first podcast to see it here',
      },
      articles: {
        title: 'No articles saved yet',
        description: 'Save your first article to see it here',
      },
      posts: {
        title: 'No posts saved yet',
        description: 'Save your first post to see it here',
      },
    };

    const message = emptyMessages[selectedCategory];

    return (
      <View style={styles.emptyState}>
        <Feather
          name="inbox"
          size={64}
          color={colors.mutedForeground}
          style={styles.emptyIcon}
        />
        <Text style={[styles.emptyTitle, { color: colors.foreground }]}>
          {message.title}
        </Text>
        <Text
          style={[styles.emptyDescription, { color: colors.mutedForeground }]}
        >
          {message.description}
        </Text>
      </View>
    );
  }, [selectedCategory, colors]);

  const keyExtractor = useCallback((item: Bookmark) => item.id, []);

  if (!isSignedIn) {
    return (
      <SafeAreaView
        style={[styles.container, { backgroundColor: colors.background }]}
        edges={['top']}
      >
        <View style={styles.header}>
          <Text style={[styles.headerTitle, { color: colors.foreground }]}>
            Inbox
          </Text>
        </View>
        <View style={styles.authPrompt}>
          <Feather
            name="lock"
            size={48}
            color={colors.mutedForeground}
            style={styles.authIcon}
          />
          <Text
            style={[styles.authPromptText, { color: colors.mutedForeground }]}
          >
            Sign in to view your inbox
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: colors.background }]}
      edges={['top']}
    >
      <View style={styles.header}>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>
          Inbox
        </Text>
        {bookmarks && bookmarks.length > 0 && (
          <Text style={[styles.headerCount, { color: colors.mutedForeground }]}>
            {bookmarks.length} {bookmarks.length === 1 ? 'item' : 'items'}
          </Text>
        )}
      </View>

      <CategoryTabs
        selectedCategory={selectedCategory}
        onCategoryChange={setSelectedCategory}
      />

      {/* Show skeleton on initial load */}
      {isLoading && !bookmarks ? (
        <BookmarkListSkeleton variant="compact" layout="vertical" count={8} />
      ) : (
        <SwipeableList
          data={bookmarks ?? []}
          renderItem={renderItem}
          keyExtractor={keyExtractor}
          getRightActions={createArchiveAction}
          enableHaptics={true}
          refreshing={isLoading && bookmarks !== undefined}
          onRefresh={handleRefresh}
          ListEmptyComponent={renderEmpty}
        />
      )}

      {/* Toast Notification */}
      {toastVisible && (
        <Animated.View
          style={[
            styles.toast,
            {
              backgroundColor: colors.card,
              borderColor: colors.border,
              opacity: toastOpacity,
            },
          ]}
        >
          <View style={styles.toastContent}>
            <Feather name="archive" size={20} color={colors.primary} />
            <Text
              style={[styles.toastText, { color: colors.foreground }]}
              numberOfLines={1}
            >
              {archivedBookmarkTitle}
            </Text>
            <Text style={[styles.toastMessage, { color: colors.mutedForeground }]}>
              Archived
            </Text>
          </View>
          <TouchableOpacity
            onPress={handleUndo}
            style={styles.undoButton}
            activeOpacity={0.7}
          >
            <Text style={[styles.undoButtonText, { color: colors.primary }]}>
              Undo
            </Text>
          </TouchableOpacity>
        </Animated.View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  headerTitle: {
    fontSize: 32,
    fontWeight: '700',
    letterSpacing: -0.5,
  },
  headerCount: {
    fontSize: 14,
    fontWeight: '500',
  },
  listContent: {
    paddingBottom: 16,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyState: {
    alignItems: 'center',
    paddingHorizontal: 32,
    paddingVertical: 64,
  },
  emptyIcon: {
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '600',
    marginBottom: 8,
    textAlign: 'center',
  },
  emptyDescription: {
    fontSize: 16,
    textAlign: 'center',
    lineHeight: 22,
  },
  authPrompt: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  authIcon: {
    marginBottom: 16,
  },
  authPromptText: {
    fontSize: 18,
    textAlign: 'center',
    lineHeight: 24,
  },
  toast: {
    position: 'absolute',
    bottom: 90,
    left: 16,
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 8,
  },
  toastContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  toastText: {
    fontSize: 15,
    fontWeight: '600',
    flex: 1,
  },
  toastMessage: {
    fontSize: 14,
    fontWeight: '500',
    marginLeft: 8,
  },
  undoButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginLeft: 8,
  },
  undoButtonText: {
    fontSize: 15,
    fontWeight: '600',
  },
});
