import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  RefreshControl,
  StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useAuth } from '../../../contexts/auth';
import { Feather } from '@expo/vector-icons';

import { CategoryTabs, CategoryType } from '../../../components/CategoryTabs';
import { BookmarkListItem } from '../../../components/bookmark-list/BookmarkListItem';
import { useInboxBookmarks } from '../../../hooks/useInboxBookmarks';
import { useTheme } from '../../../contexts/theme';
import type { Bookmark } from '@zine/shared';

export default function InboxScreen() {
  const { isSignedIn } = useAuth();
  const { colors } = useTheme();
  const router = useRouter();

  // State
  const [selectedCategory, setSelectedCategory] = useState<CategoryType>('all');

  // Data fetching
  const { data: bookmarks, isLoading, refetch } = useInboxBookmarks({
    filter: selectedCategory,
    enabled: isSignedIn,
  });

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

  const getItemLayout = useCallback(
    (_data: Bookmark[] | null | undefined, index: number) => ({
      length: 84,
      offset: 84 * index,
      index,
    }),
    []
  );

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

      <FlatList
        data={bookmarks ?? []}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        getItemLayout={getItemLayout}
        ListEmptyComponent={renderEmpty}
        refreshControl={
          <RefreshControl
            refreshing={isLoading}
            onRefresh={handleRefresh}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        }
        contentContainerStyle={
          !bookmarks || bookmarks.length === 0
            ? styles.emptyContainer
            : styles.listContent
        }
        windowSize={10}
        maxToRenderPerBatch={10}
        updateCellsBatchingPeriod={50}
        removeClippedSubviews={true}
      />
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
});
