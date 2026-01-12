import { useState, useMemo } from 'react';

import { Surface } from 'heroui-native';
import { View, Text, ScrollView, StyleSheet, Pressable, TextInput } from 'react-native';
import Animated, { FadeInDown, FadeInRight } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import { ContentType } from '@zine/shared';

import { ItemCard, type ItemCardData } from '@/components/item-card';
import { LoadingState, ErrorState, EmptyState } from '@/components/list-states';
import { Colors, Typography, Spacing, Radius, ContentColors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
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
// Components
// =============================================================================

interface FilterChipProps {
  label: string;
  isSelected: boolean;
  onPress: () => void;
  color?: string;
  colors: typeof Colors.light;
}

function FilterChip({ label, isSelected, onPress, color, colors }: FilterChipProps) {
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.filterChip,
        {
          backgroundColor: isSelected ? colors.primary : colors.backgroundSecondary,
          borderColor: isSelected ? colors.primary : colors.border,
        },
      ]}
    >
      {color && !isSelected && <View style={[styles.filterDot, { backgroundColor: color }]} />}
      <Text style={[styles.filterChipText, { color: isSelected ? '#fff' : colors.text }]}>
        {label}
      </Text>
    </Pressable>
  );
}

// =============================================================================
// Main Screen
// =============================================================================

export default function LibraryScreen() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];

  // Filter state
  const [contentTypeFilter, setContentTypeFilter] = useState<ContentType | null>(null);

  // Memoize filter to prevent unnecessary query key changes
  const filter = useMemo(
    () => ({
      contentType: contentTypeFilter ?? undefined,
    }),
    [contentTypeFilter]
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
          <Text style={[styles.headerTitle, { color: colors.text }]}>Library</Text>
          <Text style={[styles.headerSubtitle, { color: colors.textSecondary }]}>
            {isLoading
              ? 'Loading...'
              : `${libraryItems.length} saved item${libraryItems.length === 1 ? '' : 's'}`}
          </Text>
        </View>

        {/* Search Bar */}
        <Animated.View
          entering={FadeInDown.delay(100).duration(400)}
          style={styles.searchContainer}
        >
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
        <Animated.View entering={FadeInRight.delay(150).duration(400)}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.filterContainer}
          >
            {filterOptions.map((option) => (
              <FilterChip
                key={option.id}
                label={option.label}
                isSelected={contentTypeFilter === option.contentType}
                onPress={() => setContentTypeFilter(option.contentType)}
                color={option.color}
                colors={colors}
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
  headerTitle: {
    ...Typography.displayMedium,
    marginBottom: Spacing.xs,
  },
  headerSubtitle: {
    ...Typography.bodyMedium,
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
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.full,
    borderWidth: 1,
    gap: Spacing.xs,
  },
  filterChipText: {
    ...Typography.labelMedium,
  },
  filterDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
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
