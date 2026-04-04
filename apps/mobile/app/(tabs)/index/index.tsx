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
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import Animated from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';

import { FilterChip } from '@/components/filter-chip';
import { ArticleIcon, HeadphonesIcon, PostIcon, SettingsIcon, VideoIcon } from '@/components/icons';
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
import { useConnections } from '@/hooks/use-connections';
import { useSubscriptions } from '@/hooks/use-subscriptions-query';
import { getSubscriptionIntegrationAttention } from '@/lib/subscription-integration-attention';
import type { ContentType, Provider, UIContentType } from '@/lib/content-utils';

function ChevronRightIcon({ size = 16, color = '#94A3B8' }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2}>
      <Path d="M9 18l6-6-6-6" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

const INBOX_PAGE_SIZE = 20;
const HOME_TOP_THRESHOLD = 4;

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

type HomeTabNavigation = {
  addListener: (event: 'tabPress', listener: () => void) => () => void;
  isFocused: () => boolean;
};

export default function HomeScreen() {
  const router = useRouter();
  const navigation = useNavigation() as HomeTabNavigation;
  const scrollViewRef = useRef<ScrollView>(null);
  const scrollOffsetYRef = useRef(0);
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'dark'];
  const { width: windowWidth } = useWindowDimensions();
  const greeting = useMemo(() => getGreeting(), []);
  const [contentTypeFilter, setContentTypeFilter] = useState<UIContentType | null>(null);
  const featuredGridItemWidth = getFeaturedGridItemWidth(windowWidth - Spacing.md * 2, Spacing.md);

  useTabPrefetch('home');

  const { data: inboxPages, isLoading: isInboxLoading } = useInfiniteInboxItems({
    limit: INBOX_PAGE_SIZE,
  });
  const { data: homeData, isLoading: isHomeLoading } = useHomeData();
  const { data: libraryData } = useLibraryItems();
  const { data: connections } = useConnections();
  const { data: subscriptionsData } = useSubscriptions();
  const { hasAttention: hasSettingsAlert } = useMemo(
    () => getSubscriptionIntegrationAttention(connections, subscriptionsData?.items),
    [connections, subscriptionsData?.items]
  );

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

  const handleScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    scrollOffsetYRef.current = event.nativeEvent.contentOffset.y;
  }, []);

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

      const isAtTop = scrollOffsetYRef.current <= HOME_TOP_THRESHOLD;

      if (contentTypeFilter !== null && isAtTop) {
        setContentTypeFilter(null);
        return;
      }

      scrollViewRef.current?.scrollTo({ y: 0, animated: true });
    });
  }, [contentTypeFilter, navigation]);

  return (
    <Surface style={[styles.container, { backgroundColor: colors.background }]} collapsable={false}>
      <Stack.Screen
        options={{
          headerRight: () => (
            <Pressable
              onPress={handleOpenSettings}
              style={({ pressed }) => [
                styles.settingsButton,
                { backgroundColor: colors.backgroundSecondary, borderColor: colors.border },
                pressed && { opacity: 0.75 },
              ]}
              accessibilityLabel={
                hasSettingsAlert
                  ? 'Open settings. Subscription integrations need attention'
                  : 'Open settings'
              }
              accessibilityRole="button"
            >
              <SettingsIcon size={20} color={colors.text} />
              {hasSettingsAlert ? (
                <View
                  testID="home-settings-alert-dot"
                  pointerEvents="none"
                  style={[
                    styles.settingsAlertDot,
                    {
                      backgroundColor: colors.warning,
                      borderColor: colors.backgroundSecondary,
                    },
                  ]}
                />
              ) : null}
            </Pressable>
          ),
        }}
      />

      <ScrollView
        ref={scrollViewRef}
        style={styles.scrollView}
        contentContainerStyle={styles.content}
        contentInsetAdjustmentBehavior="automatic"
        onScroll={handleScroll}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
      >
        <Animated.View style={styles.header}>
          <Text style={[styles.greeting, { color: colors.textSubheader }]}>{greeting}</Text>
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
        {isLoading ? (
          <View style={styles.loadingState}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        ) : (
          <>
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

        <View style={styles.bottomSpacer} />
      </ScrollView>
    </Surface>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  content: {
    flexGrow: 1,
    paddingBottom: 32,
  },
  header: {
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.xl,
  },
  greeting: {
    ...Typography.labelMedium,
  },
  settingsButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  settingsAlertDot: {
    position: 'absolute',
    top: 5,
    right: 5,
    width: 10,
    height: 10,
    borderRadius: Radius.full,
    borderWidth: 2,
  },
  filterContainer: {
    paddingHorizontal: Spacing.md,
    gap: Spacing.sm,
    marginBottom: Spacing.lg,
  },
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
  horizontalList: {
    paddingHorizontal: Spacing.md,
    gap: Spacing.md,
    marginBottom: Spacing.xl,
  },
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
  inboxContainer: {
    marginHorizontal: Spacing.md,
    borderRadius: Radius.lg,
    overflow: 'hidden',
  },
  loadingState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing['5xl'],
  },
  bottomSpacer: {
    height: 40,
  },
});
