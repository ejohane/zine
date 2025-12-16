import { Image } from 'expo-image';
import { Surface } from 'heroui-native';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Pressable,
  TextInput,
  ActivityIndicator,
} from 'react-native';
import Animated, { FadeInDown, FadeInRight } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';

import {
  Colors,
  Typography,
  Spacing,
  Radius,
  Shadows,
  ContentColors,
  ProviderColors,
} from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import {
  useLibraryItems,
  mapContentType,
  mapProvider,
  formatDuration,
} from '@/hooks/use-items-trpc';

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
// Types
// =============================================================================

type ContentType = 'podcast' | 'video' | 'article' | 'post';
type Provider = 'youtube' | 'spotify' | 'substack' | 'rss';

interface LibraryItem {
  id: string;
  title: string;
  source: string;
  provider: Provider;
  type: ContentType;
  thumbnailUrl: string | null;
  bookmarkedAt: string;
  duration?: string;
}

const filterOptions = [
  { id: 'all', label: 'All', icon: null },
  { id: 'article', label: 'Articles', icon: ArticleIcon, color: ContentColors.article },
  { id: 'podcast', label: 'Podcasts', icon: HeadphonesIcon, color: ContentColors.podcast },
  { id: 'video', label: 'Videos', icon: VideoIcon, color: ContentColors.video },
];

// =============================================================================
// Components
// =============================================================================

function getContentIcon(type: ContentType, size = 14, color = '#fff') {
  switch (type) {
    case 'podcast':
      return <HeadphonesIcon size={size} color={color} />;
    case 'video':
      return <VideoIcon size={size} color={color} />;
    default:
      return <ArticleIcon size={size} color={color} />;
  }
}

function getProviderColor(provider: Provider): string {
  const providerColorMap: Record<Provider, string> = {
    youtube: ProviderColors.youtube,
    spotify: ProviderColors.spotify,
    substack: ProviderColors.substack,
    rss: '#6366F1', // Default color for RSS
  };
  return providerColorMap[provider] || '#6366F1';
}

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

interface LibraryCardProps {
  item: LibraryItem;
  colors: typeof Colors.light;
  index: number;
}

function LibraryCard({ item, colors, index }: LibraryCardProps) {
  const isSquare = item.type === 'podcast';
  const aspectRatio = isSquare ? 1 : item.type === 'video' ? 16 / 9 : 16 / 10;

  return (
    <Animated.View entering={FadeInDown.delay(index * 50).duration(300)}>
      <Pressable
        style={[
          styles.libraryCard,
          {
            backgroundColor: colors.card,
            borderColor: colors.borderLight,
          },
        ]}
      >
        <View style={[styles.cardThumbnail, { aspectRatio }]}>
          {item.thumbnailUrl ? (
            <Image
              source={{ uri: item.thumbnailUrl }}
              style={styles.cardImage}
              contentFit="cover"
              transition={200}
            />
          ) : (
            <View style={[styles.cardImage, { backgroundColor: colors.backgroundTertiary }]} />
          )}
          {/* Type indicator */}
          <View style={[styles.typeIndicator, { backgroundColor: ContentColors[item.type] }]}>
            {getContentIcon(item.type, 12, '#fff')}
          </View>
          {/* Duration badge */}
          {item.duration && (
            <View style={styles.durationBadge}>
              <Text style={styles.durationText}>{item.duration}</Text>
            </View>
          )}
        </View>
        <View style={styles.cardContent}>
          <Text style={[styles.cardTitle, { color: colors.text }]} numberOfLines={2}>
            {item.title}
          </Text>
          <View style={styles.cardMeta}>
            <View
              style={[styles.providerDot, { backgroundColor: getProviderColor(item.provider) }]}
            />
            <Text style={[styles.cardSource, { color: colors.textSecondary }]} numberOfLines={1}>
              {item.source}
            </Text>
            <Text style={[styles.cardTime, { color: colors.textTertiary }]}>
              · {item.bookmarkedAt}
            </Text>
          </View>
        </View>
      </Pressable>
    </Animated.View>
  );
}

// =============================================================================
// Loading & Error States
// =============================================================================

function LoadingState({ colors }: { colors: (typeof Colors)['light'] }) {
  return (
    <View style={styles.loadingState}>
      <ActivityIndicator size="large" color={colors.primary} />
    </View>
  );
}

function ErrorState({ colors, message }: { colors: (typeof Colors)['light']; message: string }) {
  return (
    <View style={styles.errorState}>
      <Text style={[styles.errorText, { color: colors.error }]}>{message}</Text>
    </View>
  );
}

function EmptyState({ colors }: { colors: (typeof Colors)['light'] }) {
  return (
    <View style={styles.emptyState}>
      <Text style={[styles.emptyTitle, { color: colors.text }]}>No bookmarked items</Text>
      <Text style={[styles.emptyDescription, { color: colors.textSecondary }]}>
        Bookmark content from your inbox to save it here for later.
      </Text>
    </View>
  );
}

// =============================================================================
// Transform function - API response to UI format
// =============================================================================

function formatRelativeTime(dateString: string | null | undefined): string {
  if (!dateString) return '';
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));

  if (diffHours < 1) return 'Just now';
  if (diffHours < 24) return `${diffHours} hour${diffHours === 1 ? '' : 's'} ago`;
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;
  if (diffDays < 30)
    return `${Math.floor(diffDays / 7)} week${Math.floor(diffDays / 7) === 1 ? '' : 's'} ago`;
  return date.toLocaleDateString();
}

// =============================================================================
// Main Screen
// =============================================================================

export default function LibraryScreen() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];

  // Fetch library items from tRPC
  const { data, isLoading, error } = useLibraryItems();

  // Transform API response to UI format
  const libraryItems: LibraryItem[] = (data?.items ?? []).map((item) => ({
    id: item.id,
    title: item.title,
    source: item.creator,
    provider: mapProvider(item.provider) as Provider,
    type: mapContentType(item.contentType) as ContentType,
    thumbnailUrl: item.thumbnailUrl ?? null,
    bookmarkedAt: formatRelativeTime(item.bookmarkedAt),
    duration: formatDuration(item.duration ?? null),
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
          <LoadingState colors={colors} />
        ) : error ? (
          <ErrorState colors={colors} message={error.message} />
        ) : libraryItems.length === 0 ? (
          <EmptyState colors={colors} />
        ) : (
          <ScrollView
            style={styles.listContainer}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
          >
            {libraryItems.map((item, index) => (
              <LibraryCard key={item.id} item={item} colors={colors} index={index} />
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
  headerTitle: {
    ...Typography.displayMedium,
    marginBottom: Spacing.xs,
  },
  headerSubtitle: {
    ...Typography.bodyMedium,
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

  // Card
  libraryCard: {
    flexDirection: 'row',
    borderRadius: Radius.lg,
    borderWidth: 1,
    overflow: 'hidden',
    ...Shadows.sm,
  },
  cardThumbnail: {
    width: 100,
    position: 'relative',
  },
  cardImage: {
    width: '100%',
    height: '100%',
  },
  typeIndicator: {
    position: 'absolute',
    top: Spacing.xs,
    left: Spacing.xs,
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  durationBadge: {
    position: 'absolute',
    bottom: Spacing.xs,
    right: Spacing.xs,
    backgroundColor: 'rgba(0,0,0,0.75)',
    paddingHorizontal: Spacing.xs,
    paddingVertical: 2,
    borderRadius: Radius.xs,
  },
  durationText: {
    ...Typography.labelSmall,
    color: '#fff',
    textTransform: 'none',
    letterSpacing: 0,
  },
  cardContent: {
    flex: 1,
    padding: Spacing.md,
    justifyContent: 'center',
  },
  cardTitle: {
    ...Typography.titleSmall,
    marginBottom: Spacing.xs,
  },
  cardMeta: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  providerDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: Spacing.xs,
  },
  cardSource: {
    ...Typography.bodySmall,
    flex: 1,
  },
  cardTime: {
    ...Typography.bodySmall,
  },

  // Bottom spacer
  bottomSpacer: {
    height: 40,
  },

  // Loading state
  loadingState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Error state
  errorState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing['3xl'],
  },
  errorText: {
    ...Typography.bodyMedium,
    textAlign: 'center',
  },

  // Empty state
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing['3xl'],
    paddingBottom: 100,
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
  },
});
