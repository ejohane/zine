import { Surface } from 'heroui-native';
import { useRouter } from 'expo-router';
import { View, Text, ScrollView, StyleSheet, Pressable, TextInput } from 'react-native';
import Animated, { FadeInDown, FadeInRight } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';

import { PlusIcon } from '@/components/icons';
import { ItemCard, type ItemCardData } from '@/components/item-card';
import { LoadingState, ErrorState, EmptyState } from '@/components/list-states';
import { Colors, Typography, Spacing, Radius, ContentColors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useLibraryItems, mapContentType, mapProvider } from '@/hooks/use-items-trpc';
import type { ContentType, Provider } from '@/lib/content-utils';

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

function HeadphonesIcon({ size = 16, color = '#fff' }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
      <Path d="M12 1c-4.97 0-9 4.03-9 9v7c0 1.66 1.34 3 3 3h3v-8H5v-2c0-3.87 3.13-7 7-7s7 3.13 7 7v2h-4v8h3c1.66 0 3-1.34 3-3v-7c0-4.97-4.03-9-9-9z" />
    </Svg>
  );
}

function VideoIcon({ size = 16, color = '#fff' }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
      <Path d="M18 4l2 4h-3l-2-4h-2l2 4h-3l-2-4H8l2 4H7L5 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V4h-4z" />
    </Svg>
  );
}

function ArticleIcon({ size = 16, color = '#fff' }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
      <Path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-5 14H7v-2h7v2zm3-4H7v-2h10v2zm0-4H7V7h10v2z" />
    </Svg>
  );
}

function FilterIcon({ size = 20, color = '#94A3B8' }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
      <Path d="M3 4a1 1 0 0 1 1-1h16a1 1 0 0 1 1 1v2.586a1 1 0 0 1-.293.707l-6.414 6.414a1 1 0 0 0-.293.707V17l-4 4v-6.586a1 1 0 0 0-.293-.707L3.293 7.293A1 1 0 0 1 3 6.586V4z" />
    </Svg>
  );
}

// =============================================================================
// Filter Options
// =============================================================================

const filterOptions = [
  { id: 'all', label: 'All', icon: null },
  { id: 'article', label: 'Articles', icon: ArticleIcon, color: ContentColors.article },
  { id: 'podcast', label: 'Podcasts', icon: HeadphonesIcon, color: ContentColors.podcast },
  { id: 'video', label: 'Videos', icon: VideoIcon, color: ContentColors.video },
];

// =============================================================================
// Components
// =============================================================================

interface FilterChipProps {
  label: string;
  isSelected: boolean;
  onPress: () => void;
  icon?: React.ComponentType<{ size?: number; color?: string }>;
  iconColor?: string;
  colors: typeof Colors.light;
}

function FilterChip({
  label,
  isSelected,
  onPress,
  icon: Icon,
  iconColor,
  colors,
}: FilterChipProps) {
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
      {Icon && <Icon size={14} color={isSelected ? '#fff' : iconColor || colors.textSecondary} />}
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
  const router = useRouter();

  // Fetch library items from tRPC
  const { data, isLoading, error } = useLibraryItems();

  // Transform API response to ItemCardData format
  const libraryItems: ItemCardData[] = (data?.items ?? []).map((item) => ({
    id: item.id,
    title: item.title,
    creator: item.creator,
    thumbnailUrl: item.thumbnailUrl ?? null,
    contentType: mapContentType(item.contentType) as ContentType,
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
          <View style={styles.headerContent}>
            <View>
              <Text style={[styles.headerTitle, { color: colors.text }]}>Library</Text>
              <Text style={[styles.headerSubtitle, { color: colors.textSecondary }]}>
                {isLoading
                  ? 'Loading...'
                  : `${libraryItems.length} saved item${libraryItems.length === 1 ? '' : 's'}`}
              </Text>
            </View>
            <Pressable
              onPress={() => router.push('/add-link')}
              style={[styles.addButton, { backgroundColor: colors.primary }]}
              accessibilityLabel="Add link"
              accessibilityRole="button"
            >
              <PlusIcon size={20} color="#fff" />
            </Pressable>
          </View>
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
          <Pressable
            style={[
              styles.filterButton,
              {
                backgroundColor: colors.backgroundSecondary,
                borderColor: colors.border,
              },
            ]}
          >
            <FilterIcon size={18} color={colors.textSecondary} />
          </Pressable>
        </Animated.View>

        {/* Filter Chips */}
        <Animated.View entering={FadeInRight.delay(150).duration(400)}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.filterContainer}
          >
            {filterOptions.map((filter, index) => (
              <FilterChip
                key={filter.id}
                label={filter.label}
                isSelected={index === 0}
                onPress={() => {}}
                icon={filter.icon ?? undefined}
                iconColor={filter.color}
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
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.lg,
  },
  headerContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerTitle: {
    ...Typography.displayMedium,
    marginBottom: Spacing.xs,
  },
  headerSubtitle: {
    ...Typography.bodyMedium,
  },
  addButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Search
  searchContainer: {
    flexDirection: 'row',
    paddingHorizontal: Spacing.xl,
    marginBottom: Spacing.lg,
    gap: Spacing.sm,
  },
  searchBar: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    borderRadius: Radius.lg,
    borderWidth: 1,
    gap: Spacing.sm,
  },
  searchInput: {
    flex: 1,
    ...Typography.bodyMedium,
    paddingVertical: 0,
  },
  filterButton: {
    width: 44,
    height: 44,
    borderRadius: Radius.lg,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Filters
  filterContainer: {
    paddingHorizontal: Spacing.xl,
    gap: Spacing.sm,
    marginBottom: Spacing.lg,
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

  // List
  listContainer: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: Spacing.xl,
    gap: Spacing.md,
  },

  // Bottom spacer
  bottomSpacer: {
    height: 40,
  },
});
