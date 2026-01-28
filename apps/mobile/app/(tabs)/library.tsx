import { useState, useMemo, useCallback, useEffect } from 'react';

import * as Haptics from 'expo-haptics';
import { Surface } from 'heroui-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { View, Text, ScrollView, StyleSheet, Pressable, TextInput } from 'react-native';
import Animated from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import { ContentType } from '@zine/shared';

import { FilterChip } from '@/components/filter-chip';
import { ItemCard, type ItemCardData } from '@/components/item-card';
import { LoadingState, ErrorState, EmptyState } from '@/components/list-states';
import { Colors, Typography, Spacing, Radius, ContentColors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useTabPrefetch } from '@/hooks/use-prefetch';
import { useLibraryItems, mapContentType, mapProvider } from '@/hooks/use-items-trpc';
import type { ContentType as UIContentType, Provider } from '@/lib/content-utils';

// =============================================================================
// Icons
// =============================================================================

function SearchIcon({ size = 20, color = '#94A3B8' }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2}>
      <Path
        d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

function PlusIcon({ size = 24, color = '#FFFFFF' }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2}>
      <Path d="M12 5v14M5 12h14" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

// =============================================================================
// Filter Options
// =============================================================================

const filterOptions = [
  { id: 'all', label: 'All', color: undefined, contentType: null },
  {
    id: 'article',
    label: 'Articles',
    color: ContentColors.article,
    contentType: ContentType.ARTICLE,
  },
  {
    id: 'podcast',
    label: 'Podcasts',
    color: ContentColors.podcast,
    contentType: ContentType.PODCAST,
  },
  {
    id: 'video',
    label: 'Videos',
    color: ContentColors.video,
    contentType: ContentType.VIDEO,
  },
  {
    id: 'post',
    label: 'Posts',
    color: ContentColors.post,
    contentType: ContentType.POST,
  },
];

// =============================================================================
// Main Screen
// =============================================================================

export default function LibraryScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ contentType?: string }>();
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];

  useTabPrefetch('library');

  const contentTypeParam = useMemo(() => {
    const rawContentType = Array.isArray(params.contentType)
      ? params.contentType[0]
      : params.contentType;
    if (typeof rawContentType !== 'string' || rawContentType.length === 0) {
      return undefined;
    }

    return rawContentType.toLowerCase();
  }, [params.contentType]);

  const preselectedContentType = useMemo(() => {
    if (!contentTypeParam) {
      return undefined;
    }

    const matchedOption = filterOptions.find((option) => option.id === contentTypeParam);
    return matchedOption ? matchedOption.contentType : undefined;
  }, [contentTypeParam]);

  // Filter state
  const [contentTypeFilter, setContentTypeFilter] = useState<ContentType | null>(
    () => preselectedContentType ?? null
  );
  const [showCompletedOnly, setShowCompletedOnly] = useState(false);

  useEffect(() => {
    if (preselectedContentType !== undefined) {
      setContentTypeFilter(preselectedContentType);
    }
  }, [preselectedContentType]);

  // Handle add bookmark
  const handleAddBookmark = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push('/add-link');
  }, [router]);

  // Memoize filter to prevent unnecessary query key changes
  const filter = useMemo(
    () => ({
      contentType: contentTypeFilter ?? undefined,
      ...(showCompletedOnly ? { isFinished: true } : {}),
    }),
    [contentTypeFilter, showCompletedOnly]
  );

  // Fetch library items from tRPC with memoized filter
  const { data, isLoading, error } = useLibraryItems({ filter });

  // Transform API response to ItemCardData format
  const libraryItems: ItemCardData[] = (data?.items ?? []).map((item) => ({
    id: item.id,
    title: item.title,
    creator: item.creator,
    thumbnailUrl: item.thumbnailUrl ?? null,
    contentType: mapContentType(item.contentType) as UIContentType,
    provider: mapProvider(item.provider) as Provider,
    duration: item.duration ?? null,
    bookmarkedAt: item.bookmarkedAt ?? null,
    publishedAt: item.publishedAt ?? null,
    isFinished: item.isFinished,
  }));

  return (
    <Surface style={[styles.container, { backgroundColor: colors.background }]}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerTitleRow}>
            <Text style={[styles.headerTitle, { color: colors.text }]}>Library</Text>
            <Pressable
              onPress={handleAddBookmark}
              style={[styles.addButton, { backgroundColor: colors.backgroundSecondary }]}
              accessibilityLabel="Add bookmark"
              accessibilityRole="button"
            >
              <PlusIcon size={22} color={colors.text} />
            </Pressable>
          </View>
          <Text style={[styles.headerSubtitle, { color: colors.textSecondary }]}>
            {isLoading
              ? 'Loading...'
              : `${libraryItems.length} saved item${libraryItems.length === 1 ? '' : 's'}`}
          </Text>
        </View>

        {/* Search Bar */}
        <Animated.View style={styles.searchContainer}>
          <View
            style={[
              styles.searchBar,
              {
                backgroundColor: colors.backgroundSecondary,
                borderColor: colors.border,
              },
            ]}
          >
            <SearchIcon size={18} color={colors.textTertiary} />
            <TextInput
              placeholder="Search your library..."
              placeholderTextColor={colors.textTertiary}
              style={[styles.searchInput, { color: colors.text }]}
            />
          </View>
        </Animated.View>

        {/* Filter Chips */}
        <Animated.View>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.filterContainer}
          >
            <FilterChip
              label="Completed"
              isSelected={showCompletedOnly}
              onPress={() => setShowCompletedOnly((prev) => !prev)}
              dotColor={colors.success}
              selectedColor={colors.success}
            />
            {filterOptions.map((option) => (
              <FilterChip
                key={option.id}
                label={option.label}
                isSelected={contentTypeFilter === option.contentType}
                onPress={() => setContentTypeFilter(option.contentType)}
                dotColor={option.color}
              />
            ))}
          </ScrollView>
        </Animated.View>

        {/* Content */}
        {isLoading ? (
          <LoadingState />
        ) : error ? (
          <ErrorState message={error.message} />
        ) : libraryItems.length === 0 ? (
          <EmptyState
            title="No bookmarked items"
            message="Bookmark content from your inbox to save it here for later."
          />
        ) : (
          <ScrollView
            style={styles.listContainer}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
          >
            {libraryItems.map((item, index) => (
              <ItemCard key={item.id} item={item} variant="compact" index={index} />
            ))}
            <View style={styles.bottomSpacer} />
          </ScrollView>
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
  headerTitleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.xs,
  },
  headerTitle: {
    ...Typography.displayMedium,
  },
  headerSubtitle: {
    ...Typography.bodyMedium,
  },
  addButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Search
  searchContainer: {
    paddingHorizontal: Spacing.md,
    marginBottom: Spacing.md,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.lg,
    borderWidth: 1,
    gap: Spacing.sm,
  },
  searchInput: {
    flex: 1,
    ...Typography.bodyMedium,
    paddingVertical: 0,
  },

  // Filters
  filterContainer: {
    paddingHorizontal: Spacing.md,
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },

  // List
  listContainer: {
    flex: 1,
  },
  listContent: {
    paddingBottom: Spacing['3xl'],
  },

  // Bottom spacer
  bottomSpacer: {
    height: 40,
  },
});
