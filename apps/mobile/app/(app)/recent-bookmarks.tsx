import { View, Text, StyleSheet } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRecentBookmarks } from '../../hooks/useRecentBookmarks';
import { BookmarkList } from '../../components/bookmark-list';
import { useTheme } from '../../contexts/theme';
import { useAuth } from '../../contexts/auth';
import { useArchiveBookmark } from '../../hooks/useArchiveBookmark';

export default function RecentBookmarksScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { isSignedIn } = useAuth();
  const archiveBookmark = useArchiveBookmark();
  const {
    data: bookmarks,
    isLoading,
    isFetching,
    error,
    refetch,
  } = useRecentBookmarks({
    enabled: isSignedIn,
    limit: 25,
  });

  const handleBookmarkPress = (bookmarkId: string) => {
    router.push(`/bookmark/${bookmarkId}` as any);
  };

  const handleArchive = (bookmarkId: string) => {
    archiveBookmark.mutate(bookmarkId);
  };

  const renderEmptyState = () => {
    if (isLoading) return null;

    return (
      <View style={styles.emptyStateContainer}>
        <View style={[styles.emptyIconContainer, { backgroundColor: colors.secondary }]}>
          <Feather name="bookmark" size={48} color={colors.mutedForeground} />
        </View>
        <Text style={[styles.emptyTitle, { color: colors.foreground }]}>
          No bookmarks yet
        </Text>
        <Text style={[styles.emptyMessage, { color: colors.mutedForeground }]}>
          Start saving articles, videos, and podcasts to see them here
        </Text>
      </View>
    );
  };

  const renderErrorState = () => (
    <View style={styles.emptyStateContainer}>
      <View style={[styles.emptyIconContainer, { backgroundColor: colors.destructive + '20' }]}>
        <Feather name="alert-circle" size={48} color={colors.destructive} />
      </View>
      <Text style={[styles.emptyTitle, { color: colors.foreground }]}>
        Failed to load bookmarks
      </Text>
      <Text style={[styles.emptyMessage, { color: colors.mutedForeground }]}>
        {error?.message || 'Please try again'}
      </Text>
    </View>
  );

  const headerOptions = {
    headerTitle: 'Recent Bookmarks',
    headerBackTitle: 'Back',
    headerStyle: { backgroundColor: colors.background },
    headerTintColor: colors.foreground,
    headerLargeTitleStyle: { color: colors.foreground },
  };

  if (!isSignedIn) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <Stack.Screen options={headerOptions} />
        <View style={styles.emptyStateContainer}>
          <View style={[styles.emptyIconContainer, { backgroundColor: colors.secondary }]}>
            <Feather name="lock" size={48} color={colors.mutedForeground} />
          </View>
          <Text style={[styles.emptyTitle, { color: colors.foreground }]}>
            Sign in required
          </Text>
          <Text style={[styles.emptyMessage, { color: colors.mutedForeground }]}>
            Please sign in to view your bookmarks
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Stack.Screen options={headerOptions} />
      
      <BookmarkList
        bookmarks={bookmarks || []}
        variant="compact"
        layout="vertical"
        enableSwipeActions={true}
        rightSwipeActions={[
          {
            id: 'archive',
            icon: 'archive',
            backgroundColor: '#6B7280',
            onPress: handleArchive,
          },
        ]}
        onBookmarkPress={handleBookmarkPress}
        onRefresh={refetch}
        refreshing={isFetching && !isLoading}
        ListEmptyComponent={error ? renderErrorState : renderEmptyState}
        enableHaptics={true}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  emptyStateContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    paddingTop: 100,
  },
  emptyIconContainer: {
    width: 96,
    height: 96,
    borderRadius: 48,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 8,
    textAlign: 'center',
  },
  emptyMessage: {
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 22,
  },
});
