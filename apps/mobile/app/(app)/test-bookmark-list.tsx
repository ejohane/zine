import { View, StyleSheet, Alert } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { BookmarkList } from '../../components/bookmark-list';
import { useInfiniteRecentBookmarks } from '../../hooks/useInfiniteRecentBookmarks';
import { useArchiveBookmark } from '../../hooks/useArchiveBookmark';
import { useDeleteBookmark } from '../../hooks/useDeleteBookmark';
import { useTheme } from '../../contexts/theme';
import type { SwipeAction } from '../../components/bookmark-list';

export default function TestBookmarkListScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { 
    data, 
    isLoading, 
    isFetching,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    refetch,
  } = useInfiniteRecentBookmarks({ 
    limit: 20 
  });

  const bookmarks = data?.pages?.flat() ?? [];

  const archiveMutation = useArchiveBookmark();
  const deleteMutation = useDeleteBookmark();

  const handleArchive = (bookmarkId: string) => {
    archiveMutation.mutate(bookmarkId);
  };

  const handleDelete = (bookmarkId: string) => {
    Alert.alert(
      'Delete Bookmark',
      'Are you sure you want to delete this bookmark?',
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Delete', 
          style: 'destructive',
          onPress: () => deleteMutation.mutate(bookmarkId),
        },
      ]
    );
  };

  const handleLoadMore = () => {
    if (hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  };

  const rightSwipeActions: SwipeAction[] = [
    {
      id: 'archive',
      icon: 'archive',
      backgroundColor: '#6B7280',
      onPress: handleArchive,
    },
    {
      id: 'delete',
      icon: 'trash-2',
      backgroundColor: colors.destructive,
      onPress: handleDelete,
    },
  ];

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Stack.Screen 
        options={{ 
          headerTitle: 'Test Bookmark List (Infinite Scroll)',
          headerStyle: { backgroundColor: colors.card },
          headerTintColor: colors.foreground,
        }} 
      />
      <BookmarkList
        bookmarks={bookmarks}
        variant="compact"
        layout="vertical"
        enableSwipeActions={true}
        rightSwipeActions={rightSwipeActions}
        onBookmarkPress={(id) => router.push(`/bookmark/${id}` as any)}
        onRefresh={refetch}
        refreshing={isFetching && !isLoading}
        onEndReached={handleLoadMore}
        onEndReachedThreshold={0.3}
        loadingMore={isFetchingNextPage}
        enableHaptics={true}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});
