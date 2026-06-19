import { Stack, useNavigation, useRouter, type Href } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Surface } from 'heroui-native';
import { useCallback, useEffect, useMemo, useRef, useState, type ComponentType } from 'react';
import {
  View,
  Text,
  Animated,
  Modal,
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
import {
  HomeCollectionLayout,
  HomeScreenBuiltInSection,
  HomeScreenSectionKind,
  type ContentType as ApiContentType,
  type HomeScreenBuiltInSectionValue,
  type HomeScreenLayoutSection,
} from '@zine/shared';

import { FilterChip } from '@/components/filter-chip';
import { ArticleIcon, PodcastIcon, PostIcon, SettingsIcon, VideoIcon } from '@/components/icons';
import { ItemCard, type ItemCardData } from '@/components/item-card';
import { Colors, Typography, Spacing, Radius, ContentColors } from '@/constants/theme';
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
const NAVIGATION_PANE_WIDTH = 304;
const NAVIGATION_PANE_ANIMATION_MS = 220;
const HOME_HEADER_SETTINGS_BUTTON_SIZE = 36;
const HOME_HEADER_SETTINGS_AREA_WIDTH = 44;
const HOME_HEADER_FILTER_MIN_WIDTH = 180;

type BuiltInHomeSectionKey =
  | 'jump-back-in'
  | 'recently-bookmarked'
  | 'podcasts'
  | 'articles'
  | 'videos';

const contentTypeFilters: {
  id: UIContentType | null;
  label: string;
  icon?: ComponentType<{ size?: number; color?: string }>;
  dotColor?: string;
}[] = [
  {
    id: null,
    label: 'All',
  },
  {
    id: 'article',
    label: 'Articles',
    icon: ArticleIcon,
    dotColor: ContentColors.article,
  },
  {
    id: 'podcast',
    label: 'Podcasts',
    icon: PodcastIcon,
    dotColor: ContentColors.podcast,
  },
  {
    id: 'video',
    label: 'Videos',
    icon: VideoIcon,
    dotColor: ContentColors.video,
  },
  {
    id: 'post',
    label: 'Posts',
    icon: PostIcon,
    dotColor: ContentColors.post,
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
  colors,
  onPress,
}: {
  title: string;
  colors: typeof Colors.dark;
  onPress?: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={styles.sectionHeader} disabled={!onPress}>
      <View style={styles.sectionHeaderLeft}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>{title}</Text>
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
type CustomHomeSectionItem = Extract<HomeSectionItem, { collectionId: string }>;

export default function HomeScreen() {
  const router = useRouter();
  const navigation = useNavigation() as HomeScreenNavigation;
  const listRef = useRef<FlatList<HomeSectionItem>>(null);
  const scrollOffsetYRef = useRef(0);
  const navigationPaneProgress = useRef(new Animated.Value(0)).current;
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'dark'];
  const { width: windowWidth } = useWindowDimensions();
  const [contentTypeFilter, setContentTypeFilter] = useState<UIContentType | null>(null);
  const [isNavigationPaneMounted, setNavigationPaneMounted] = useState(false);
  const [isNavigationPaneOpen, setNavigationPaneOpen] = useState(false);
  const featuredGridItemWidth = getFeaturedGridItemWidth(windowWidth - Spacing.md * 2, Spacing.md);
  const headerContentWidth = Math.max(windowWidth - Spacing.md * 2, 240);
  const headerFilterWidth = Math.max(
    headerContentWidth - HOME_HEADER_SETTINGS_AREA_WIDTH,
    HOME_HEADER_FILTER_MIN_WIDTH
  );
  const headerFadeEndColor =
    (colorScheme as string | null | undefined) === 'light'
      ? 'rgba(255, 255, 255, 0)'
      : 'rgba(0, 0, 0, 0)';
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

  const customCollectionSections = useMemo((): CustomHomeSectionItem[] => {
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
        pathname: '/(tabs)/collection/[id]',
        params: { id: collectionId },
      } as unknown as Href);
    },
    [router]
  );

  const handleOpenHomeSection = useCallback(
    (section: BuiltInHomeSectionKey) => {
      const params: { section: BuiltInHomeSectionKey; contentType?: UIContentType } = { section };
      if (contentTypeFilter) {
        params.contentType = contentTypeFilter;
      }

      router.push({
        pathname: '/(tabs)/section/[section]',
        params,
      } as unknown as Href);
    },
    [contentTypeFilter, router]
  );

  const handleOpenInbox = useCallback(() => {
    if (!contentTypeFilter) {
      router.push('/(tabs)/inbox');
      return;
    }

    router.push({
      pathname: '/(tabs)/inbox',
      params: { contentType: contentTypeFilter },
    } as unknown as Href);
  }, [contentTypeFilter, router]);

  const handleOpenNavigationPane = useCallback(() => {
    setNavigationPaneMounted(true);
    setNavigationPaneOpen(true);
  }, []);

  const handleCloseNavigationPane = useCallback(() => {
    setNavigationPaneOpen(false);
  }, []);

  const handleNavigationPaneRoute = useCallback(
    (href: Href) => {
      setNavigationPaneOpen(false);
      router.push(href);
    },
    [router]
  );

  const handleScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    scrollOffsetYRef.current = event.nativeEvent.contentOffset.y;
  }, []);

  const isLoading = isInboxLoading || isHomeLoading;

  useEffect(() => {
    if (!isNavigationPaneMounted) return;

    Animated.timing(navigationPaneProgress, {
      toValue: isNavigationPaneOpen ? 1 : 0,
      duration: NAVIGATION_PANE_ANIMATION_MS,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished && !isNavigationPaneOpen) {
        setNavigationPaneMounted(false);
      }
    });
  }, [isNavigationPaneMounted, isNavigationPaneOpen, navigationPaneProgress]);

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
    const builtInSections: Partial<Record<HomeScreenBuiltInSectionValue, HomeSectionItem>> = {};

    if (filteredJumpBackInItems.length > 0) {
      builtInSections[HomeScreenBuiltInSection.JUMP_BACK_IN] = {
        key: 'jump-back-in',
        type: 'jump-back-in',
        title: 'Jump Back In',
        count: filteredJumpBackInItems.length,
        items: filteredJumpBackInItems,
      };
    }

    if (filteredRecentlyBookmarked.length > 0) {
      builtInSections[HomeScreenBuiltInSection.RECENTLY_BOOKMARKED] = {
        key: 'recently-bookmarked',
        type: 'recently-bookmarked',
        title: 'Recently Bookmarked',
        count: filteredRecentlyBookmarked.length,
        items: filteredRecentlyBookmarked,
      };
    }

    if (filteredInboxItems.length > 0) {
      builtInSections[HomeScreenBuiltInSection.INBOX] = {
        key: 'inbox',
        type: 'inbox',
        title: 'Inbox',
        count: filteredInboxItems.length,
        items: filteredInboxItems,
      };
    }

    if (showPodcastsSection && podcasts.length > 0) {
      builtInSections[HomeScreenBuiltInSection.PODCASTS] = {
        key: 'podcasts',
        type: 'cover-rail',
        title: 'Podcasts',
        count: podcasts.length,
        items: podcasts.slice(0, HOME_PODCASTS_VISIBLE_LIMIT),
      };
    }

    if (showArticlesSection && articles.length > 0) {
      builtInSections[HomeScreenBuiltInSection.ARTICLES] = {
        key: 'articles',
        type: 'stack-rail',
        title: 'Articles',
        count: articles.length,
        items: articles,
      };
    }

    if (showVideosSection && videos.length > 0) {
      builtInSections[HomeScreenBuiltInSection.VIDEOS] = {
        key: 'videos',
        type: 'stack-rail',
        title: 'Videos',
        count: videos.length,
        items: videos,
      };
    }

    const collectionSectionsById = new Map(
      customCollectionSections.map((section) => [section.collectionId, section] as const)
    );
    const fallbackOrder: HomeScreenLayoutSection[] = [
      {
        kind: HomeScreenSectionKind.BUILT_IN,
        builtInSection: HomeScreenBuiltInSection.JUMP_BACK_IN,
      },
      {
        kind: HomeScreenSectionKind.BUILT_IN,
        builtInSection: HomeScreenBuiltInSection.RECENTLY_BOOKMARKED,
      },
      { kind: HomeScreenSectionKind.BUILT_IN, builtInSection: HomeScreenBuiltInSection.INBOX },
      ...customCollectionSections.map(
        (section): HomeScreenLayoutSection => ({
          kind: HomeScreenSectionKind.COLLECTION,
          collectionId: section.collectionId,
        })
      ),
      { kind: HomeScreenSectionKind.BUILT_IN, builtInSection: HomeScreenBuiltInSection.PODCASTS },
      { kind: HomeScreenSectionKind.BUILT_IN, builtInSection: HomeScreenBuiltInSection.ARTICLES },
      { kind: HomeScreenSectionKind.BUILT_IN, builtInSection: HomeScreenBuiltInSection.VIDEOS },
    ];
    const orderedSections = homeData?.sectionOrder ?? fallbackOrder;
    const items: HomeSectionItem[] = [];

    for (const section of orderedSections) {
      if (section.kind === HomeScreenSectionKind.BUILT_IN) {
        const builtInSection = builtInSections[section.builtInSection];
        if (builtInSection) items.push(builtInSection);
        continue;
      }

      const collectionSection = collectionSectionsById.get(section.collectionId);
      if (collectionSection) items.push(collectionSection);
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
    homeData?.sectionOrder,
    videos,
  ]);

  const headerContent = useMemo(
    () => (
      <View style={[styles.headerContent, { width: headerContentWidth }]}>
        <View style={styles.headerSettingsArea}>
          <Pressable
            onPress={handleOpenNavigationPane}
            style={[styles.settingsButton, { backgroundColor: colors.surfaceSubtle }]}
            hitSlop={12}
            accessibilityLabel={
              hasSettingsAlert
                ? 'Open navigation menu. Subscription integrations need attention'
                : 'Open navigation menu'
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
          <LinearGradient
            pointerEvents="none"
            colors={[colors.background, headerFadeEndColor]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.headerFilterFade}
          />
        </View>
        <ScrollView
          horizontal
          style={[styles.headerFilterScroll, { width: headerFilterWidth }]}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.headerFilterContainer}
        >
          {contentTypeFilters.map((filter) => (
            <FilterChip
              key={filter.id ?? 'all'}
              label={filter.label}
              isSelected={contentTypeFilter === filter.id}
              onPress={() => setContentTypeFilter(filter.id)}
              icon={filter.icon}
              dotColor={filter.dotColor}
              selectedColor={colors.warning}
              selectedSurfaceColor={colors.warning}
              selectedForegroundColor={colors.statusWarningForeground}
            />
          ))}
        </ScrollView>
      </View>
    ),
    [
      colors.background,
      colors.surfaceSubtle,
      colors.statusWarningForeground,
      colors.text,
      colors.warning,
      contentTypeFilter,
      handleOpenNavigationPane,
      hasSettingsAlert,
      headerContentWidth,
      headerFadeEndColor,
      headerFilterWidth,
    ]
  );

  const renderSection = useCallback(
    ({ item }: ListRenderItemInfo<HomeSectionItem>) => {
      switch (item.type) {
        case 'jump-back-in':
          return (
            <View>
              <SectionHeader
                title={item.title}
                colors={colors}
                onPress={() => handleOpenHomeSection('jump-back-in')}
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
                        <ItemCard
                          item={sectionItem}
                          shape="row"
                          rowStyle="featured"
                          bordered={false}
                        />
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
              <SectionHeader
                title={item.title}
                colors={colors}
                onPress={() => handleOpenHomeSection('recently-bookmarked')}
              />
              <FlatList
                horizontal
                data={item.items}
                renderItem={({ item: sectionItem, index }) => (
                  <ItemCard item={sectionItem} shape="stack" index={index} bordered={false} />
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
              <SectionHeader title={item.title} colors={colors} onPress={handleOpenInbox} />
              <View
                style={[styles.inboxContainer, { backgroundColor: colors.backgroundSecondary }]}
              >
                {item.items.map((sectionItem, index) => (
                  <ItemCard
                    key={sectionItem.id}
                    item={sectionItem}
                    shape="row"
                    index={index}
                    bordered={false}
                  />
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
                colors={colors}
                onPress={
                  item.type === 'custom-cover-rail'
                    ? () => handleOpenCollection(item.collectionId)
                    : () => handleOpenHomeSection(item.key as BuiltInHomeSectionKey)
                }
              />
              <FlatList
                horizontal
                data={item.items}
                renderItem={({ item: sectionItem, index }) => (
                  <ItemCard item={sectionItem} shape="cover" index={index} bordered={false} />
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
                colors={colors}
                onPress={
                  item.type === 'custom-stack-rail'
                    ? () => handleOpenCollection(item.collectionId)
                    : () => handleOpenHomeSection(item.key as BuiltInHomeSectionKey)
                }
              />
              <FlatList
                horizontal
                data={item.items}
                renderItem={({ item: sectionItem, index }) => (
                  <ItemCard item={sectionItem} shape="stack" index={index} bordered={false} />
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
                        <ItemCard
                          item={sectionItem}
                          shape="row"
                          rowStyle="featured"
                          bordered={false}
                        />
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
                colors={colors}
                onPress={() => handleOpenCollection(item.collectionId)}
              />
              <View
                style={[styles.inboxContainer, { backgroundColor: colors.backgroundSecondary }]}
              >
                {item.items.map((sectionItem, index) => (
                  <ItemCard
                    key={sectionItem.id}
                    item={sectionItem}
                    shape="row"
                    index={index}
                    bordered={false}
                  />
                ))}
              </View>
            </View>
          );
      }
    },
    [colors, featuredGridItemWidth, handleOpenCollection, handleOpenHomeSection, handleOpenInbox]
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
          title: '',
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
          headerTitleAlign: 'left',
          headerTitle: () => headerContent,
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
      <Modal
        visible={isNavigationPaneMounted}
        transparent
        animationType="none"
        onRequestClose={handleCloseNavigationPane}
      >
        <View style={styles.navigationPaneRoot}>
          <Animated.View
            pointerEvents="none"
            style={[
              styles.navigationPaneScrim,
              {
                opacity: navigationPaneProgress.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0, 1],
                }),
              },
            ]}
          />
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={handleCloseNavigationPane}
            accessibilityLabel="Close navigation menu"
            accessibilityRole="button"
          />
          <Animated.View
            style={[
              styles.navigationPane,
              {
                backgroundColor: colors.background,
                transform: [
                  {
                    translateX: navigationPaneProgress.interpolate({
                      inputRange: [0, 1],
                      outputRange: [-NAVIGATION_PANE_WIDTH, 0],
                    }),
                  },
                ],
              },
            ]}
          >
            <View style={styles.navigationPaneHeader}>
              <Text style={[styles.navigationPaneTitle, { color: colors.text }]}>Zine</Text>
            </View>

            <View style={styles.navigationPaneRows}>
              {[
                { label: 'Edit Homescreen', href: '/settings/home-screen' as Href },
                { label: 'Settings', href: '/settings' as Href, showAlertDot: hasSettingsAlert },
                { label: 'Home', href: '/(tabs)' as Href, isActive: true },
                { label: 'Inbox', href: '/(tabs)/inbox' as Href },
                { label: 'Search', href: '/(tabs)/search' as Href },
                { label: 'Library', href: '/(tabs)/library' as Href },
              ].map((item) => (
                <Pressable
                  key={item.label}
                  onPress={() => handleNavigationPaneRoute(item.href)}
                  style={({ pressed }) => [
                    styles.navigationPaneRow,
                    item.isActive ? { backgroundColor: colors.surfaceSubtle } : null,
                    pressed ? { opacity: 0.72 } : null,
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel={`Open ${item.label}`}
                >
                  <Text style={[styles.navigationPaneRowLabel, { color: colors.text }]}>
                    {item.label}
                  </Text>
                  {item.showAlertDot ? (
                    <View
                      style={[styles.navigationPaneAlertDot, { backgroundColor: colors.warning }]}
                    />
                  ) : null}
                </Pressable>
              ))}
            </View>
          </Animated.View>
        </View>
      </Modal>
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
  navigationPaneRoot: {
    flex: 1,
  },
  navigationPaneScrim: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0, 0, 0, 0.48)',
  },
  navigationPane: {
    width: NAVIGATION_PANE_WIDTH,
    height: '100%',
    paddingTop: 72,
    paddingHorizontal: Spacing.lg,
    shadowColor: '#000',
    shadowOffset: { width: 4, height: 0 },
    shadowOpacity: 0.2,
    shadowRadius: 16,
    elevation: 12,
  },
  navigationPaneHeader: {
    marginBottom: Spacing.xl,
  },
  navigationPaneTitle: {
    ...Typography.titleLarge,
    marginBottom: Spacing.xs,
  },
  navigationPaneRows: {
    gap: Spacing.xs,
  },
  navigationPaneRow: {
    minHeight: 48,
    borderRadius: Radius.lg,
    paddingHorizontal: Spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  navigationPaneRowLabel: {
    ...Typography.bodyMedium,
    fontWeight: '600',
  },
  navigationPaneAlertDot: {
    width: 8,
    height: 8,
    borderRadius: Radius.full,
  },
  settingsButton: {
    width: HOME_HEADER_SETTINGS_BUTTON_SIZE,
    height: HOME_HEADER_SETTINGS_BUTTON_SIZE,
    borderRadius: HOME_HEADER_SETTINGS_BUTTON_SIZE / 2,
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 0,
    shadowOpacity: 0,
    elevation: 0,
    zIndex: 2,
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
  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerSettingsArea: {
    width: HOME_HEADER_SETTINGS_AREA_WIDTH,
    height: HOME_HEADER_SETTINGS_BUTTON_SIZE,
    position: 'relative',
    zIndex: 2,
  },
  headerFilterFade: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: HOME_HEADER_SETTINGS_BUTTON_SIZE,
    width: HOME_HEADER_SETTINGS_AREA_WIDTH - HOME_HEADER_SETTINGS_BUTTON_SIZE,
    zIndex: 1,
  },
  headerFilterScroll: {
    flexGrow: 0,
  },
  headerFilterContainer: {
    gap: Spacing.sm,
    paddingLeft: Spacing.sm,
    paddingRight: Spacing.sm,
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
