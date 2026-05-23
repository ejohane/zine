import { Stack, useNavigation, useRouter, type Href } from 'expo-router';
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
  type ListRenderItemInfo,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { HomeCollectionLayout, type ContentType as ApiContentType } from '@zine/shared';

import { FilterChip } from '@/components/filter-chip';
import { ArticleIcon, PodcastIcon, PostIcon, SettingsIcon, VideoIcon } from '@/components/icons';
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
import {
  getFeaturedGridItemWidth,
  getFeaturedGridRows,
  getVisibleFeaturedGridItems,
} from '@/lib/home-layout';
import { useInfiniteInboxItems, useHomeData } from '@/hooks/use-items-trpc';
import {
  mapContentType,
  mapProvider,
  type ContentType,
  type Provider,
  type UIContentType,
} from '@/lib/content-utils';
import { useConnections } from '@/hooks/use-connections';
import { useSubscriptions } from '@/hooks/use-subscriptions-query';
import { getSubscriptionIntegrationAttention } from '@/lib/subscription-integration-attention';

function ChevronRightIcon({ size = 16, color = '#94A3B8' }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2}>
      <Path d="M9 18l6-6-6-6" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

const INBOX_PAGE_SIZE = 20;
const HOME_RECENT_BOOKMARKS_VISIBLE_LIMIT = 6;
const HOME_INBOX_VISIBLE_LIMIT = 4;
const HOME_PODCASTS_VISIBLE_LIMIT = 5;
const HOME_TOP_THRESHOLD = 4;
const HOME_COLLAPSED_TITLE_THRESHOLD = 44;

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
    icon: PodcastIcon,
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

function mapHomeItemToCard(
  item: NonNullable<ReturnType<typeof useHomeData>['data']>['recentBookmarks'][number]
): ItemCardData {
  return {
    id: item.id,
    title: item.title,
    creator: item.publisher ?? item.creator,
    creatorImageUrl: item.creatorImageUrl ?? null,
    thumbnailUrl: item.thumbnailUrl ?? null,
    contentType: mapContentType(item.contentType) as ContentType,
    provider: mapProvider(item.provider) as Provider,
    duration: item.duration ?? null,
    readingTimeMinutes: item.readingTimeMinutes ?? null,
  };
}

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
};

type HomeScreenNavigation = {
  addListener: HomeTabNavigation['addListener'];
  getParent?: () => HomeTabNavigation | undefined;
  isFocused: () => boolean;
};

type HomeSectionItem =
  | {
      key: 'jump-back-in';
      type: 'jump-back-in';
      title: string;
      count: number;
      items: ItemCardData[];
    }
  | {
      key: 'recently-bookmarked';
      type: 'recently-bookmarked';
      title: string;
      count: number;
      items: ItemCardData[];
    }
  | {
      key: 'inbox';
      type: 'inbox';
      title: string;
      count: number;
      items: ItemCardData[];
    }
  | {
      key: 'podcasts' | 'articles' | 'videos';
      type: 'cover-rail' | 'stack-rail';
      title: string;
      count: number;
      items: ItemCardData[];
    }
  | {
      key: string;
      collectionId: string;
      type: 'custom-cover-rail' | 'custom-stack-rail' | 'custom-row-grid' | 'custom-compact-list';
      title: string;
      count: number;
      items: ItemCardData[];
    };

export default function HomeScreen() {
  const router = useRouter();
  const navigation = useNavigation() as HomeScreenNavigation;
  const listRef = useRef<FlatList<HomeSectionItem>>(null);
  const scrollOffsetYRef = useRef(0);
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'dark'];
  const { width: windowWidth } = useWindowDimensions();
  const greeting = useMemo(() => getGreeting(), []);
  const [contentTypeFilter, setContentTypeFilter] = useState<UIContentType | null>(null);
  const [showCollapsedTitle, setShowCollapsedTitle] = useState(false);
  const featuredGridItemWidth = getFeaturedGridItemWidth(windowWidth - Spacing.md * 2, Spacing.md);
  const apiContentTypeFilter = useMemo(
    () => (contentTypeFilter ? (contentTypeFilter.toUpperCase() as ApiContentType) : undefined),
    [contentTypeFilter]
  );

  useTabPrefetch('home');

  const { data: inboxPages, isLoading: isInboxLoading } = useInfiniteInboxItems({
    ...(apiContentTypeFilter ? { filter: { contentType: apiContentTypeFilter } } : {}),
    limit: INBOX_PAGE_SIZE,
  });
  const { data: homeData, isLoading: isHomeLoading } = useHomeData(
    apiContentTypeFilter ? { filter: { contentType: apiContentTypeFilter } } : undefined
  );
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
    return (homeData?.recentBookmarks ?? []).map((item) => ({
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

    return allInboxItems.map((item) => ({
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

  const customCollectionSections = useMemo((): HomeSectionItem[] => {
    return (homeData?.customCollections ?? [])
      .filter((section) => section.items.length > 0)
      .map((section) => {
        const allItems = section.items.map(mapHomeItemToCard);
        const type =
          section.layout === HomeCollectionLayout.COVER_RAIL
            ? 'custom-cover-rail'
            : section.layout === HomeCollectionLayout.ROW_GRID
              ? 'custom-row-grid'
              : section.layout === HomeCollectionLayout.COMPACT_LIST
                ? 'custom-compact-list'
                : 'custom-stack-rail';

        return {
          key: `collection-${section.collectionId}`,
          collectionId: section.collectionId,
          type,
          title: section.title,
          count: section.count,
          items:
            section.layout === HomeCollectionLayout.COMPACT_LIST
              ? allItems.slice(0, HOME_INBOX_VISIBLE_LIMIT)
              : allItems,
        };
      });
  }, [homeData?.customCollections]);

  const handleOpenCollection = useCallback(
    (collectionId: string) => {
      router.push({
        pathname: '/collection/[id]',
        params: { id: collectionId },
      } as unknown as Href);
    },
    [router]
  );

  const handleOpenSettings = useCallback(() => {
    router.push('/settings');
  }, [router]);

  const handleScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const offsetY = event.nativeEvent.contentOffset.y;
    scrollOffsetYRef.current = offsetY;

    const shouldShowCollapsedTitle = offsetY > HOME_COLLAPSED_TITLE_THRESHOLD;
    setShowCollapsedTitle((current) =>
      current === shouldShowCollapsedTitle ? current : shouldShowCollapsedTitle
    );
  }, []);

  const isLoading = isInboxLoading || isHomeLoading;

  const filteredJumpBackInItems = useMemo(
    () => getVisibleFeaturedGridItems(jumpBackInItems, contentTypeFilter),
    [contentTypeFilter, jumpBackInItems]
  );

  const filteredRecentlyBookmarked = useMemo(() => {
    const visibleItems =
      contentTypeFilter === null
        ? recentlyBookmarked
        : recentlyBookmarked.filter((item) => item.contentType === contentTypeFilter);

    return visibleItems.slice(0, HOME_RECENT_BOOKMARKS_VISIBLE_LIMIT);
  }, [contentTypeFilter, recentlyBookmarked]);

  const filteredInboxItems = useMemo(() => {
    const visibleItems =
      contentTypeFilter === null
        ? inboxItems
        : inboxItems.filter((item) => item.contentType === contentTypeFilter);

    return visibleItems.slice(0, HOME_INBOX_VISIBLE_LIMIT);
  }, [contentTypeFilter, inboxItems]);

  const showPodcastsSection = contentTypeFilter === null || contentTypeFilter === 'podcast';
  const showVideosSection = contentTypeFilter === null || contentTypeFilter === 'video';
  const showArticlesSection = contentTypeFilter === null || contentTypeFilter === 'article';

  const sections = useMemo((): HomeSectionItem[] => {
    const items: HomeSectionItem[] = [];

    if (filteredJumpBackInItems.length > 0) {
      items.push({
        key: 'jump-back-in',
        type: 'jump-back-in',
        title: 'Jump Back In',
        count: filteredJumpBackInItems.length,
        items: filteredJumpBackInItems,
      });
    }

    if (filteredRecentlyBookmarked.length > 0) {
      items.push({
        key: 'recently-bookmarked',
        type: 'recently-bookmarked',
        title: 'Recently Bookmarked',
        count: filteredRecentlyBookmarked.length,
        items: filteredRecentlyBookmarked,
      });
    }

    if (filteredInboxItems.length > 0) {
      items.push({
        key: 'inbox',
        type: 'inbox',
        title: 'Inbox',
        count: filteredInboxItems.length,
        items: filteredInboxItems,
      });
    }

    items.push(...customCollectionSections);

    if (showPodcastsSection && podcasts.length > 0) {
      items.push({
        key: 'podcasts',
        type: 'cover-rail',
        title: 'Podcasts',
        count: podcasts.length,
        items: podcasts.slice(0, HOME_PODCASTS_VISIBLE_LIMIT),
      });
    }

    if (showArticlesSection && articles.length > 0) {
      items.push({
        key: 'articles',
        type: 'stack-rail',
        title: 'Articles',
        count: articles.length,
        items: articles,
      });
    }

    if (showVideosSection && videos.length > 0) {
      items.push({
        key: 'videos',
        type: 'stack-rail',
        title: 'Videos',
        count: videos.length,
        items: videos,
      });
    }

    return items;
  }, [
    articles,
    customCollectionSections,
    filteredInboxItems,
    filteredJumpBackInItems,
    filteredRecentlyBookmarked,
    podcasts,
    showArticlesSection,
    showPodcastsSection,
    showVideosSection,
    videos,
  ]);

  const listHeader = useMemo(
    () => (
      <>
        <View style={styles.header}>
          <Text style={[styles.homeTitle, { color: colors.text }]}>Home</Text>
          <Text style={[styles.greeting, { color: colors.textSubheader }]}>{greeting}</Text>
        </View>

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
            />
          ))}
        </ScrollView>
      </>
    ),
    [colors.text, colors.textSubheader, contentTypeFilter, greeting]
  );

  const renderSection = useCallback(
    ({ item }: ListRenderItemInfo<HomeSectionItem>) => {
      switch (item.type) {
        case 'jump-back-in':
          return (
            <View>
              <SectionHeader title={item.title} count={item.count} colors={colors} />
              <View style={styles.jumpBackInGrid}>
                {getFeaturedGridRows(item.items).map((row) => (
                  <View
                    key={row.map((sectionItem) => sectionItem.id).join(':')}
                    style={styles.jumpBackInGridRow}
                  >
                    {row.map((sectionItem) => (
                      <View
                        key={sectionItem.id}
                        style={[styles.jumpBackInGridItem, { width: featuredGridItemWidth }]}
                      >
                        <ItemCard item={sectionItem} shape="row" rowStyle="featured" />
                      </View>
                    ))}
                  </View>
                ))}
              </View>
            </View>
          );
        case 'recently-bookmarked':
          return (
            <View>
              <SectionHeader title={item.title} count={item.count} colors={colors} />
              <FlatList
                horizontal
                data={item.items}
                renderItem={({ item: sectionItem, index }) => (
                  <ItemCard item={sectionItem} shape="stack" index={index} />
                )}
                keyExtractor={(sectionItem) => sectionItem.id}
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.horizontalList}
              />
            </View>
          );
        case 'inbox':
          return (
            <View style={styles.section}>
              <SectionHeader
                title={item.title}
                count={item.count}
                colors={colors}
                onPress={() => router.push('/(tabs)/inbox')}
              />
              <View
                style={[styles.inboxContainer, { backgroundColor: colors.backgroundSecondary }]}
              >
                {item.items.map((sectionItem, index) => (
                  <ItemCard key={sectionItem.id} item={sectionItem} shape="row" index={index} />
                ))}
              </View>
            </View>
          );
        case 'cover-rail':
        case 'custom-cover-rail':
          return (
            <View>
              <SectionHeader
                title={item.title}
                count={item.count}
                colors={colors}
                onPress={
                  item.type === 'custom-cover-rail'
                    ? () => handleOpenCollection(item.collectionId)
                    : undefined
                }
              />
              <FlatList
                horizontal
                data={item.items}
                renderItem={({ item: sectionItem, index }) => (
                  <ItemCard item={sectionItem} shape="cover" index={index} />
                )}
                keyExtractor={(sectionItem) => sectionItem.id}
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.horizontalList}
              />
            </View>
          );
        case 'stack-rail':
        case 'custom-stack-rail':
          return (
            <View>
              <SectionHeader
                title={item.title}
                count={item.count}
                colors={colors}
                onPress={
                  item.type === 'custom-stack-rail'
                    ? () => handleOpenCollection(item.collectionId)
                    : undefined
                }
              />
              <FlatList
                horizontal
                data={item.items}
                renderItem={({ item: sectionItem, index }) => (
                  <ItemCard item={sectionItem} shape="stack" index={index} />
                )}
                keyExtractor={(sectionItem) => sectionItem.id}
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.horizontalList}
              />
            </View>
          );
        case 'custom-row-grid':
          return (
            <View>
              <SectionHeader
                title={item.title}
                count={item.count}
                colors={colors}
                onPress={() => handleOpenCollection(item.collectionId)}
              />
              <View style={styles.jumpBackInGrid}>
                {getFeaturedGridRows(item.items).map((row) => (
                  <View
                    key={row.map((sectionItem) => sectionItem.id).join(':')}
                    style={styles.jumpBackInGridRow}
                  >
                    {row.map((sectionItem) => (
                      <View
                        key={sectionItem.id}
                        style={[styles.jumpBackInGridItem, { width: featuredGridItemWidth }]}
                      >
                        <ItemCard item={sectionItem} shape="row" rowStyle="featured" />
                      </View>
                    ))}
                  </View>
                ))}
              </View>
            </View>
          );
        case 'custom-compact-list':
          return (
            <View style={styles.section}>
              <SectionHeader
                title={item.title}
                count={item.count}
                colors={colors}
                onPress={() => handleOpenCollection(item.collectionId)}
              />
              <View
                style={[styles.inboxContainer, { backgroundColor: colors.backgroundSecondary }]}
              >
                {item.items.map((sectionItem, index) => (
                  <ItemCard key={sectionItem.id} item={sectionItem} shape="row" index={index} />
                ))}
              </View>
            </View>
          );
      }
    },
    [colors, featuredGridItemWidth, handleOpenCollection, router]
  );

  useEffect(() => {
    const tabNavigation = navigation.getParent?.() ?? navigation;

    return tabNavigation.addListener('tabPress', () => {
      if (!navigation.isFocused()) return;

      const isAtTop = scrollOffsetYRef.current <= HOME_TOP_THRESHOLD;

      if (contentTypeFilter !== null && isAtTop) {
        setContentTypeFilter(null);
        return;
      }

      listRef.current?.scrollToOffset({ offset: 0, animated: true });
    });
  }, [contentTypeFilter, navigation]);

  return (
    <Surface style={[styles.container, { backgroundColor: colors.background }]} collapsable={false}>
      <Stack.Screen
        options={{
          title: showCollapsedTitle ? 'Home' : '',
          headerLargeTitle: false,
          headerTransparent: false,
          headerShadowVisible: false,
          headerTintColor: colors.text,
          headerStyle: {
            backgroundColor: colors.background,
          },
          headerTitleStyle: {
            color: colors.text,
          },
          headerRight: () => (
            <Pressable
              onPress={handleOpenSettings}
              style={styles.settingsButton}
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
                      borderColor: colors.background,
                    },
                  ]}
                />
              ) : null}
            </Pressable>
          ),
        }}
      />

      <FlatList
        ref={listRef}
        data={sections}
        renderItem={renderSection}
        keyExtractor={(item) => item.key}
        style={styles.scrollView}
        contentContainerStyle={styles.content}
        contentInsetAdjustmentBehavior="automatic"
        onScroll={handleScroll}
        scrollEventThrottle={32}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={listHeader}
        ListFooterComponent={<View style={styles.bottomSpacer} />}
        ListEmptyComponent={
          isLoading ? (
            <View style={styles.loadingState}>
              <ActivityIndicator size="large" color={colors.primary} />
            </View>
          ) : null
        }
        initialNumToRender={3}
        maxToRenderPerBatch={4}
        updateCellsBatchingPeriod={16}
        windowSize={5}
      />
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
  homeTitle: {
    ...Typography.displayMedium,
    marginBottom: Spacing.xs,
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
    backgroundColor: 'transparent',
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
    paddingHorizontal: Spacing.md,
    gap: Spacing.md,
    marginBottom: Spacing.xl,
  },
  jumpBackInGridRow: {
    flexDirection: 'row',
    gap: Spacing.md,
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
