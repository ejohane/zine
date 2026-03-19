import { Stack, useNavigation, useRouter } from 'expo-router';
import { Surface } from 'heroui-native';
import { useCallback, useEffect, useMemo, useRef, useState, type ComponentType } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Pressable,
  FlatList,
  ActivityIndicator,
  useWindowDimensions,
} from 'react-native';
import Animated from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';

import { FilterChip } from '@/components/filter-chip';
import { ArticleIcon, HeadphonesIcon, PostIcon, SettingsIcon, VideoIcon } from '@/components/icons';
import { WeeklyRecapCard } from '@/components/insights/weekly-recap-card';
import { ItemCard, type ItemCardData } from '@/components/item-card';
import {
  Colors,
  Typography,
  Spacing,
  Radius,
  ContentColors,
  FilterChipPalette,
} from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useTabPrefetch } from '@/hooks/use-prefetch';
import { getFeaturedGridItemWidth, getVisibleFeaturedGridItems } from '@/lib/home-layout';
import {
  useInfiniteInboxItems,
  useHomeData,
  useLibraryItems,
  mapContentType,
  mapProvider,
} from '@/hooks/use-items-trpc';
import { useWeeklyRecapEntryState, useWeeklyRecapTeaser } from '@/hooks/use-insights-trpc';
import type { ContentType, Provider, UIContentType } from '@/lib/content-utils';
import { useAuthAvailability } from '@/providers/auth-provider';

// =============================================================================
// Icons
// =============================================================================

function ChevronRightIcon({ size = 16, color = '#94A3B8' }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2}>
      <Path d="M9 18l6-6-6-6" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

// =============================================================================
// Utility Functions
// =============================================================================

const INBOX_PAGE_SIZE = 20;

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

const contentTypeFilters: {
  id: UIContentType;
  label: string;
  icon: ComponentType<{ size?: number; color?: string }>;
  dotColor: string;
  selectedColor: string;
  selectedSurfaceColor: string;
}[] = [
  {
    id: 'article',
    label: 'Articles',
    icon: ArticleIcon,
    dotColor: ContentColors.article,
    selectedColor: FilterChipPalette.article.accent,
    selectedSurfaceColor: FilterChipPalette.article.surface,
  },
  {
    id: 'podcast',
    label: 'Podcasts',
    icon: HeadphonesIcon,
    dotColor: ContentColors.podcast,
    selectedColor: FilterChipPalette.podcast.accent,
    selectedSurfaceColor: FilterChipPalette.podcast.surface,
  },
  {
    id: 'video',
    label: 'Videos',
    icon: VideoIcon,
    dotColor: ContentColors.video,
    selectedColor: FilterChipPalette.video.accent,
    selectedSurfaceColor: FilterChipPalette.video.surface,
  },
  {
    id: 'post',
    label: 'Posts',
    icon: PostIcon,
    dotColor: ContentColors.post,
    selectedColor: FilterChipPalette.post.accent,
    selectedSurfaceColor: FilterChipPalette.post.surface,
  },
];

// =============================================================================
// Components
// =============================================================================

function SectionHeader({
  title,
  count,
  colors,
  onPress,
}: {
  title: string;
  count?: number;
  colors: typeof Colors.dark;
  onPress?: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={styles.sectionHeader} disabled={!onPress}>
      <View style={styles.sectionHeaderLeft}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>{title}</Text>
        {count !== undefined && (
          <Text style={[styles.sectionCount, { color: colors.textTertiary }]}>{count}</Text>
        )}
      </View>
      {onPress && <ChevronRightIcon size={20} color={colors.textTertiary} />}
    </Pressable>
  );
}

// =============================================================================
// Main Screen
// =============================================================================

type HomeTabNavigation = {
  addListener: (event: 'tabPress', listener: () => void) => () => void;
  isFocused: () => boolean;
};

export default function HomeScreen() {
  const router = useRouter();
  const navigation = useNavigation() as HomeTabNavigation;
  const scrollViewRef = useRef<ScrollView>(null);
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'dark'];
  const { width: windowWidth } = useWindowDimensions();
  const greeting = useMemo(() => getGreeting(), []);
  const [contentTypeFilter, setContentTypeFilter] = useState<UIContentType | null>(null);
  const featuredGridItemWidth = getFeaturedGridItemWidth(windowWidth - Spacing.md * 2, Spacing.md);
  const { isEnabled: isAuthEnabled } = useAuthAvailability();
  const { shouldShowEntry: shouldShowWeeklyRecapTeaser, weekAnchorDate } =
    useWeeklyRecapEntryState();

  useTabPrefetch('home');

  // Data hooks
  const { data: inboxPages, isLoading: isInboxLoading } = useInfiniteInboxItems({
    limit: INBOX_PAGE_SIZE,
  });
  const { data: homeData, isLoading: isHomeLoading } = useHomeData();
  const { data: libraryData } = useLibraryItems();
  const { data: weeklyRecapTeaser, isLoading: isWeeklyRecapLoading } = useWeeklyRecapTeaser({
    enabled: isAuthEnabled && shouldShowWeeklyRecapTeaser,
    weekAnchorDate,
  });

  // Transform to ItemCardData format for use with ItemCard component
  const jumpBackInItems = useMemo((): ItemCardData[] => {
    return (homeData?.jumpBackIn ?? []).map((item) => ({
      id: item.id,
      title: item.title,
      creator: item.publisher ?? item.creator,
      creatorImageUrl: item.creatorImageUrl ?? null,
      thumbnailUrl: item.thumbnailUrl ?? null,
      contentType: mapContentType(item.contentType) as ContentType,
      provider: mapProvider(item.provider) as Provider,
      duration: item.duration ?? null,
      readingTimeMinutes: item.readingTimeMinutes ?? null,
    }));
  }, [homeData?.jumpBackIn]);

  const recentlyBookmarked = useMemo((): ItemCardData[] => {
    return (homeData?.recentBookmarks ?? []).slice(0, 6).map((item) => ({
      id: item.id,
      title: item.title,
      creator: item.publisher ?? item.creator,
      creatorImageUrl: item.creatorImageUrl ?? null,
      thumbnailUrl: item.thumbnailUrl ?? null,
      contentType: mapContentType(item.contentType) as ContentType,
      provider: mapProvider(item.provider) as Provider,
      duration: item.duration ?? null,
      readingTimeMinutes: item.readingTimeMinutes ?? null,
    }));
  }, [homeData?.recentBookmarks]);

  const inboxItems = useMemo((): ItemCardData[] => {
    const allInboxItems = inboxPages?.pages.flatMap((page) => page.items) ?? [];

    return allInboxItems.slice(0, 4).map((item) => ({
      id: item.id,
      title: item.title,
      creator: item.creator,
      creatorImageUrl: item.creatorImageUrl ?? null,
      thumbnailUrl: item.thumbnailUrl ?? null,
      contentType: mapContentType(item.contentType) as ContentType,
      provider: mapProvider(item.provider) as Provider,
      duration: item.duration ?? null,
      readingTimeMinutes: item.readingTimeMinutes ?? null,
    }));
  }, [inboxPages?.pages]);

  const podcasts = useMemo((): ItemCardData[] => {
    return (homeData?.byContentType.podcasts ?? []).map((item) => ({
      id: item.id,
      title: item.title,
      creator: item.publisher ?? item.creator,
      creatorImageUrl: item.creatorImageUrl ?? null,
      thumbnailUrl: item.thumbnailUrl ?? null,
      contentType: 'podcast' as ContentType,
      provider: mapProvider(item.provider) as Provider,
      duration: item.duration ?? null,
      readingTimeMinutes: item.readingTimeMinutes ?? null,
    }));
  }, [homeData?.byContentType.podcasts]);

  const videos = useMemo((): ItemCardData[] => {
    return (homeData?.byContentType.videos ?? []).map((item) => ({
      id: item.id,
      title: item.title,
      creator: item.publisher ?? item.creator,
      creatorImageUrl: item.creatorImageUrl ?? null,
      thumbnailUrl: item.thumbnailUrl ?? null,
      contentType: 'video' as ContentType,
      provider: mapProvider(item.provider) as Provider,
      duration: item.duration ?? null,
      readingTimeMinutes: item.readingTimeMinutes ?? null,
    }));
  }, [homeData?.byContentType.videos]);

  const articles = useMemo((): ItemCardData[] => {
    return (homeData?.byContentType.articles ?? []).map((item) => ({
      id: item.id,
      title: item.title,
      creator: item.publisher ?? item.creator,
      creatorImageUrl: item.creatorImageUrl ?? null,
      thumbnailUrl: item.thumbnailUrl ?? null,
      contentType: 'article' as ContentType,
      provider: mapProvider(item.provider) as Provider,
      duration: item.duration ?? null,
      readingTimeMinutes: item.readingTimeMinutes ?? null,
    }));
  }, [homeData?.byContentType.articles]);

  // Category counts
  const categoryCounts = useMemo(() => {
    const items = libraryData?.items ?? [];
    return {
      podcast: items.filter((item) => item.contentType === 'PODCAST').length,
      video: items.filter((item) => item.contentType === 'VIDEO').length,
      article: items.filter((item) => item.contentType === 'ARTICLE').length,
      post: items.filter((item) => item.contentType === 'POST').length,
    };
  }, [libraryData?.items]);

  const handleOpenSettings = useCallback(() => {
    router.push('/settings');
  }, [router]);

  const isLoading = isInboxLoading || isHomeLoading;

  const filteredJumpBackInItems = useMemo(
    () => getVisibleFeaturedGridItems(jumpBackInItems, contentTypeFilter),
    [contentTypeFilter, jumpBackInItems]
  );

  const filteredRecentlyBookmarked = useMemo(
    () =>
      contentTypeFilter === null
        ? recentlyBookmarked
        : recentlyBookmarked.filter((item) => item.contentType === contentTypeFilter),
    [contentTypeFilter, recentlyBookmarked]
  );

  const filteredInboxItems = useMemo(
    () =>
      contentTypeFilter === null
        ? inboxItems
        : inboxItems.filter((item) => item.contentType === contentTypeFilter),
    [contentTypeFilter, inboxItems]
  );

  const showPodcastsSection = contentTypeFilter === null || contentTypeFilter === 'podcast';
  const showVideosSection = contentTypeFilter === null || contentTypeFilter === 'video';
  const showArticlesSection = contentTypeFilter === null || contentTypeFilter === 'article';

  useEffect(() => {
    return navigation.addListener('tabPress', () => {
      if (!navigation.isFocused()) return;

      scrollViewRef.current?.scrollTo({ y: 0, animated: true });
    });
  }, [navigation]);

  return (
    <Surface style={[styles.container, { backgroundColor: colors.background }]}>
      <Stack.Screen options={{ headerShown: false }} />
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <ScrollView
          ref={scrollViewRef}
          style={styles.scrollView}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
          {/* Header */}
          <Animated.View style={styles.header}>
            <View style={styles.headerTopRow}>
              <View style={styles.headerTitleWrap}>
                <Text style={[styles.greeting, { color: colors.textSubheader }]}>{greeting}</Text>
                <Text style={[styles.headerTitle, { color: colors.text }]}>Home</Text>
              </View>
              <Pressable
                onPress={handleOpenSettings}
                style={({ pressed }) => [
                  styles.settingsButton,
                  { backgroundColor: colors.backgroundSecondary, borderColor: colors.border },
                  pressed && { opacity: 0.75 },
                ]}
                accessibilityLabel="Open settings"
                accessibilityRole="button"
              >
                <SettingsIcon size={20} color={colors.text} />
              </Pressable>
            </View>
          </Animated.View>

          <Animated.View>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.filterContainer}
            >
              {contentTypeFilters.map((filter) => (
                <FilterChip
                  key={filter.id}
                  label={filter.label}
                  isSelected={contentTypeFilter === filter.id}
                  onPress={() =>
                    setContentTypeFilter((current) => (current === filter.id ? null : filter.id))
                  }
                  icon={filter.icon}
                  dotColor={filter.dotColor}
                  selectedColor={filter.selectedColor}
                  selectedSurfaceColor={filter.selectedSurfaceColor}
                  count={categoryCounts[filter.id]}
                />
              ))}
            </ScrollView>
          </Animated.View>

          {isAuthEnabled &&
            shouldShowWeeklyRecapTeaser &&
            (weeklyRecapTeaser || isWeeklyRecapLoading) && (
              <Animated.View style={styles.recapCardSection}>
                <WeeklyRecapCard
                  recap={weeklyRecapTeaser}
                  isLoading={isWeeklyRecapLoading}
                  onPress={() => router.push('/recap/weekly')}
                />
              </Animated.View>
            )}

          {isLoading ? (
            <View style={styles.loadingState}>
              <ActivityIndicator size="large" color={colors.primary} />
            </View>
          ) : (
            <>
              {/* Jump Back In - Recently Opened Bookmarks */}
              {filteredJumpBackInItems.length > 0 && (
                <Animated.View>
                  <SectionHeader
                    title="Jump Back In"
                    count={filteredJumpBackInItems.length}
                    colors={colors}
                  />
                  <View style={styles.jumpBackInGrid}>
                    {filteredJumpBackInItems.map((item) => (
                      <View
                        key={item.id}
                        style={[styles.jumpBackInGridItem, { width: featuredGridItemWidth }]}
                      >
                        <ItemCard item={item} shape="row" rowStyle="featured" />
                      </View>
                    ))}
                  </View>
                </Animated.View>
              )}

              {/* Recently Bookmarked - Horizontal Cards */}
              {filteredRecentlyBookmarked.length > 0 && (
                <Animated.View>
                  <SectionHeader
                    title="Recently Bookmarked"
                    count={filteredRecentlyBookmarked.length}
                    colors={colors}
                  />
                  <FlatList
                    horizontal
                    data={filteredRecentlyBookmarked}
                    renderItem={({ item, index }) => (
                      <ItemCard item={item} shape="stack" index={index} />
                    )}
                    keyExtractor={(item) => item.id}
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.horizontalList}
                  />
                </Animated.View>
              )}

              {/* Inbox Section - Condensed List using compact ItemCard */}
              {filteredInboxItems.length > 0 && (
                <Animated.View style={styles.section}>
                  <SectionHeader
                    title="Inbox"
                    count={filteredInboxItems.length}
                    colors={colors}
                    onPress={() => router.push('/(tabs)/inbox')}
                  />
                  <View
                    style={[styles.inboxContainer, { backgroundColor: colors.backgroundSecondary }]}
                  >
                    {filteredInboxItems.map((item, index) => (
                      <ItemCard key={item.id} item={item} shape="row" index={index} />
                    ))}
                  </View>
                </Animated.View>
              )}

              {/* Category Collection - Large Cards with overlay */}
              {showPodcastsSection && podcasts.length > 0 && (
                <Animated.View>
                  <SectionHeader title="Podcasts" count={podcasts.length} colors={colors} />
                  <FlatList
                    horizontal
                    data={podcasts.slice(0, 5)}
                    renderItem={({ item, index }) => (
                      <ItemCard item={item} shape="cover" index={index} />
                    )}
                    keyExtractor={(item) => item.id}
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.horizontalList}
                  />
                </Animated.View>
              )}

              {showArticlesSection && articles.length > 0 && (
                <Animated.View>
                  <SectionHeader title="Articles" count={articles.length} colors={colors} />
                  <FlatList
                    horizontal
                    data={articles}
                    renderItem={({ item, index }) => (
                      <ItemCard item={item} shape="stack" index={index} />
                    )}
                    keyExtractor={(item) => item.id}
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.horizontalList}
                  />
                </Animated.View>
              )}

              {/* Videos - Horizontal Cards */}
              {showVideosSection && videos.length > 0 && (
                <Animated.View>
                  <SectionHeader title="Videos" count={videos.length} colors={colors} />
                  <FlatList
                    horizontal
                    data={videos}
                    renderItem={({ item, index }) => (
                      <ItemCard item={item} shape="stack" index={index} />
                    )}
                    keyExtractor={(item) => item.id}
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.horizontalList}
                  />
                </Animated.View>
              )}
            </>
          )}

          {/* Bottom spacing for tab bar */}
          <View style={styles.bottomSpacer} />
        </ScrollView>
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
  scrollView: {
    flex: 1,
  },
  content: {
    paddingBottom: 32,
  },

  // Header
  header: {
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.xl,
  },
  headerTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.md,
  },
  headerTitleWrap: {
    flex: 1,
  },
  greeting: {
    ...Typography.labelMedium,
    marginBottom: Spacing.xs,
  },
  headerTitle: {
    ...Typography.displayMedium,
  },
  settingsButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  filterContainer: {
    paddingHorizontal: Spacing.md,
    gap: Spacing.sm,
    marginBottom: Spacing.lg,
  },
  recapCardSection: {
    paddingHorizontal: Spacing.md,
    marginBottom: Spacing.xl,
  },

  // Section
  section: {
    marginBottom: Spacing.xl,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    marginBottom: Spacing.md,
  },
  sectionHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  sectionTitle: {
    ...Typography.titleLarge,
  },
  sectionCount: {
    ...Typography.bodySmall,
  },

  // Horizontal List
  horizontalList: {
    paddingHorizontal: Spacing.md,
    gap: Spacing.md,
    marginBottom: Spacing.xl,
  },

  // Jump Back In Grid
  jumpBackInGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: Spacing.md,
    gap: Spacing.md,
    marginBottom: Spacing.xl,
  },
  jumpBackInGridItem: {
    minWidth: 0,
  },

  // Inbox Container
  inboxContainer: {
    marginHorizontal: Spacing.md,
    borderRadius: Radius.lg,
    overflow: 'hidden',
  },

  // Loading state
  loadingState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing['5xl'],
  },

  // Bottom spacer
  bottomSpacer: {
    height: 40,
  },
});
