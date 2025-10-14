import { useCallback, useMemo } from 'react';
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { useFocusEffect } from '@react-navigation/native';

import { useTheme } from '../../../../contexts/theme';
import {
  useSearch,
  type SearchResult,
} from '../../../../hooks/useSearch';
import { useNavigationSearch } from '../../../../hooks/useNavigationSearch';
import { OptimizedCompactBookmarkCard } from '../../../../components/OptimizedCompactBookmarkCard';
import { SearchHistory } from '../../../../components/SearchHistory';
import type { Bookmark } from '../../../../types/bookmark';

const SEARCH_LIMIT = 20;

type BookmarkSearchResult = SearchResult & { type: 'bookmark' };

const isBookmarkResult = (result: SearchResult): result is BookmarkSearchResult =>
  result.type === 'bookmark';

const transformResultToBookmark = (result: BookmarkSearchResult): Bookmark => ({
  id: result.id,
  userId: '',
  url: result.url,
  originalUrl: result.url,
  title: result.title,
  description: result.description,
  source: undefined,
  contentType: result.contentType as Bookmark['contentType'],
  thumbnailUrl: result.thumbnailUrl,
  faviconUrl: undefined,
  publishedAt: result.publishedAt ? new Date(result.publishedAt).getTime() : undefined,
  language: undefined,
  status: 'active',
  creatorId: result.creator?.id,
  videoMetadata: undefined,
  podcastMetadata: undefined,
  articleMetadata: undefined,
  postMetadata: undefined,
  tags: undefined,
  notes: result.notes,
  createdAt: undefined,
  updatedAt: undefined,
  archivedAt: undefined,
  creator: result.creator
    ? {
        id: result.creator.id,
        name: result.creator.name,
        avatarUrl: result.creator.avatarUrl,
      }
    : null,
  alternateLinks: [],
  existingBookmarkId: undefined,
});

export default function SearchScreen() {
  const { colors } = useTheme();

  const {
    searchQuery,
    setSearchQuery,
    results,
    loading,
    loadingMore,
    error,
    hasResults,
    canLoadMore,
    loadMore,
    clearSearch,
    refetch,
    isSearching,
  } = useSearch({
    initialFilters: {
      type: 'bookmarks',
      limit: SEARCH_LIMIT,
      offset: 0,
    },
  });

  const { setSearchText, focusSearchBar } = useNavigationSearch({
    colors,
    placeholder: 'Search bookmarks',
    onQueryChange: setSearchQuery,
    onSubmit: setSearchQuery,
    onCancel: () => {
      clearSearch();
    },
  });

  useFocusEffect(
    useCallback(() => {
      focusSearchBar();
      return undefined;
    }, [focusSearchBar]),
  );

  const bookmarkResults = useMemo(
    () => (results?.results ?? []).filter(isBookmarkResult),
    [results],
  );

  const handleSelectHistory = useCallback(
    (query: string) => {
      setSearchText(query);
      setSearchQuery(query);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    },
    [setSearchText, setSearchQuery],
  );

  const handleRetry = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    refetch();
  }, [refetch]);

  const handleEndReached = useCallback(() => {
    if (canLoadMore && !loadingMore) {
      loadMore();
    }
  }, [canLoadMore, loadingMore, loadMore]);

  const renderItem = useCallback(
    ({ item }: { item: BookmarkSearchResult }) => (
      <View style={styles.cardWrapper}>
        <OptimizedCompactBookmarkCard bookmark={transformResultToBookmark(item)} />
      </View>
    ),
    [],
  );

  const listHeader = useMemo(() => {
    if (bookmarkResults.length > 0) {
      return (
        <View style={styles.headerContainer}>
          <Text style={[styles.headerTitle, { color: colors.foreground }]}>Search</Text>
          {typeof results?.totalCount === 'number' ? (
            <Text style={[styles.headerSubtitle, { color: colors.mutedForeground }]}>
              {results.totalCount} {results.totalCount === 1 ? 'bookmark' : 'bookmarks'}
            </Text>
          ) : null}
        </View>
      );
    }

    if (!isSearching) {
      return (
        <View style={styles.historyContainer}>
          <SearchHistory
            onSelectQuery={handleSelectHistory}
            currentQuery={results?.query}
          />
        </View>
      );
    }

    return null;
  }, [bookmarkResults.length, colors, handleSelectHistory, isSearching, results]);

  const listEmptyComponent = useMemo(() => {
    if (loading) {
      return (
        <View style={styles.stateContainer}>
          <ActivityIndicator color={colors.primary} />
          <Text style={[styles.stateTitle, { color: colors.foreground }]}>Searching…</Text>
        </View>
      );
    }

    if (error) {
      return (
        <View style={styles.stateContainer}>
          <Text style={[styles.stateTitle, { color: colors.foreground }]}>Search unavailable</Text>
          <Text style={[styles.stateSubtitle, { color: colors.mutedForeground }]}>
            {error}
          </Text>
          <TouchableOpacity
            accessibilityRole="button"
            style={[styles.retryButton, { backgroundColor: colors.primary }]}
            onPress={handleRetry}
          >
            <Text style={[styles.retryButtonText, { color: colors.primaryForeground }]}>Try again</Text>
          </TouchableOpacity>
        </View>
      );
    }

    if (!isSearching) {
      return (
        <View style={styles.stateContainer}>
          <Text style={[styles.stateTitle, { color: colors.foreground }]}>Type to search</Text>
          <Text style={[styles.stateSubtitle, { color: colors.mutedForeground }]}>
            Find bookmarks by title or creator.
          </Text>
        </View>
      );
    }

    if (!hasResults) {
      return (
        <View style={styles.stateContainer}>
          <Text style={[styles.stateTitle, { color: colors.foreground }]}>No results</Text>
          <Text style={[styles.stateSubtitle, { color: colors.mutedForeground }]}>
            Try a different title or creator name.
          </Text>
        </View>
      );
    }

    return null;
  }, [colors, error, handleRetry, hasResults, isSearching, loading]);

  const listFooter = useMemo(() => {
    if (!loadingMore) {
      return <View style={styles.footerSpacer} />;
    }

    return (
      <View style={styles.footerLoading}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }, [colors.primary, loadingMore]);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <FlatList
        data={bookmarkResults}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        ListHeaderComponent={listHeader}
        ListEmptyComponent={listEmptyComponent}
        ListFooterComponent={listFooter}
        contentContainerStyle={styles.listContent}
        style={styles.list}
        contentInsetAdjustmentBehavior="automatic"
        onEndReached={handleEndReached}
        onEndReachedThreshold={0.3}
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  list: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 32,
  },
  cardWrapper: {
    marginBottom: 12,
  },
  headerContainer: {
    paddingBottom: 8,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '700',
    letterSpacing: -0.4,
  },
  headerSubtitle: {
    fontSize: 14,
    marginTop: 4,
  },
  historyContainer: {
    paddingBottom: 16,
  },
  stateContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    gap: 8,
    marginTop: 80,
  },
  stateTitle: {
    fontSize: 18,
    fontWeight: '600',
    textAlign: 'center',
  },
  stateSubtitle: {
    fontSize: 14,
    textAlign: 'center',
  },
  retryButton: {
    marginTop: 12,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
  },
  retryButtonText: {
    fontSize: 14,
    fontWeight: '600',
  },
  footerLoading: {
    paddingVertical: 24,
    alignItems: 'center',
  },
  footerSpacer: {
    height: 24,
  },
});
