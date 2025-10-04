import { View, Text, FlatList, StyleSheet, ActivityIndicator, RefreshControl } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRecentBookmarks } from '../../hooks/useRecentBookmarks';
import { CompactBookmarkCard } from '../../components/CompactBookmarkCard';
import { useTheme } from '../../contexts/theme';
import { useAuth } from '../../contexts/auth';
import type { Bookmark } from '@zine/shared';

export default function RecentBookmarksScreen() {
  const router = useRouter();
  const { colors, isDark } = useTheme();
  const { isSignedIn } = useAuth();
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

  const renderBookmarkItem = ({ item }: { item: Bookmark }) => (
    <CompactBookmarkCard
      bookmark={item}
      onPress={() => handleBookmarkPress(item.id)}
    />
  );

  const renderItemSeparator = () => (
    <View style={{ height: 12 }} />
  );

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

  if (!isSignedIn) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <Stack.Screen
          options={{
            headerTitle: 'Recent Bookmarks',
            headerBackTitle: 'Back',
            headerStyle: { backgroundColor: colors.background },
            headerTintColor: colors.foreground,
            headerLargeTitleStyle: { color: colors.foreground },
          }}
        />
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
      <Stack.Screen
        options={{
          headerTitle: 'Recent Bookmarks',
          headerBackTitle: 'Back',
          headerStyle: { backgroundColor: colors.background },
          headerTintColor: colors.foreground,
          headerLargeTitleStyle: { color: colors.foreground },
        }}
      />

      {isLoading && !bookmarks ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[styles.loadingText, { color: colors.mutedForeground }]}>
            Loading bookmarks...
          </Text>
        </View>
      ) : error ? (
        <FlatList
          data={[]}
          ListEmptyComponent={renderErrorState}
          contentContainerStyle={styles.flatListContent}
          refreshControl={
            <RefreshControl
              refreshing={isFetching && !isLoading}
              onRefresh={refetch}
              tintColor={colors.primary}
              colors={[colors.primary]}
            />
          }
        />
      ) : (
        <FlatList
          data={bookmarks || []}
          keyExtractor={(item) => item.id}
          renderItem={renderBookmarkItem}
          ItemSeparatorComponent={renderItemSeparator}
          ListEmptyComponent={renderEmptyState}
          contentContainerStyle={styles.flatListContent}
          showsVerticalScrollIndicator={true}
          refreshControl={
            <RefreshControl
              refreshing={isFetching && !isLoading}
              onRefresh={refetch}
              tintColor={colors.primary}
              colors={[colors.primary]}
            />
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },
  loadingText: {
    fontSize: 15,
    fontWeight: '500',
  },
  flatListContent: {
    padding: 16,
    paddingBottom: 100,
    flexGrow: 1,
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
