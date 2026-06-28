import { Stack, useLocalSearchParams } from 'expo-router';
import { Surface } from 'heroui-native';
import type { ComponentType } from 'react';
import { useCallback, useMemo, useRef } from 'react';
import {
  FlatList,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type ListRenderItemInfo,
} from 'react-native';
import { ContentType as ApiContentType } from '@zine/shared';

import { FilterChip } from '@/components/filter-chip';
import { ArticleIcon, PodcastIcon, PostIcon, VideoIcon } from '@/components/icons';
import { ItemCard, type ItemCardData } from '@/components/item-card';
import { EmptyState, ErrorState, InvalidParamState, LoadingState } from '@/components/list-states';
import { Colors, ContentColors, Spacing, Typography } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useHomeData } from '@/hooks/use-items-trpc';
import { mapContentType, mapProvider, type UIContentType } from '@/lib/content-utils';
import {
  createLightweightHeaderScreenOptions,
  useCollapsedHeaderTitle,
} from '@/lib/native-large-title-header';

type HomeSectionKey = 'jump-back-in' | 'recently-bookmarked' | 'podcasts' | 'articles' | 'videos';
type HomeData = NonNullable<ReturnType<typeof useHomeData>['data']>;
type HomeItem = HomeData['recentBookmarks'][number];

const SECTION_TITLES: Record<HomeSectionKey, string> = {
  'jump-back-in': 'Jump Back In',
  'recently-bookmarked': 'Recently Bookmarked',
  podcasts: 'Podcasts',
  articles: 'Articles',
  videos: 'Videos',
};

const VALID_SECTION_KEYS = Object.keys(SECTION_TITLES) as HomeSectionKey[];
const contentTypeFilters: {
  id: UIContentType;
  label: string;
  icon?: ComponentType<{ size?: number; color?: string }>;
  dotColor?: string;
  contentType: ApiContentType;
}[] = [
  {
    id: 'article',
    label: 'Articles',
    icon: ArticleIcon,
    dotColor: ContentColors.article,
    contentType: ApiContentType.ARTICLE,
  },
  {
    id: 'podcast',
    label: 'Podcasts',
    icon: PodcastIcon,
    dotColor: ContentColors.podcast,
    contentType: ApiContentType.PODCAST,
  },
  {
    id: 'video',
    label: 'Videos',
    icon: VideoIcon,
    dotColor: ContentColors.video,
    contentType: ApiContentType.VIDEO,
  },
  {
    id: 'post',
    label: 'Posts',
    icon: PostIcon,
    dotColor: ContentColors.post,
    contentType: ApiContentType.POST,
  },
];

function parseSectionKey(value: string | string[] | undefined): HomeSectionKey | null {
  const rawValue = Array.isArray(value) ? value[0] : value;

  return VALID_SECTION_KEYS.includes(rawValue as HomeSectionKey)
    ? (rawValue as HomeSectionKey)
    : null;
}

function parseContentTypeFilter(value: string | string[] | undefined): UIContentType | null {
  const rawValue = Array.isArray(value) ? value[0] : value;

  return contentTypeFilters.some((filter) => filter.id === rawValue)
    ? (rawValue as UIContentType)
    : null;
}

function mapHomeItemToCard(item: HomeItem, contentType?: UIContentType): ItemCardData {
  return {
    id: item.id,
    title: item.title,
    creator: item.publisher ?? item.creator,
    creatorImageUrl: item.creatorImageUrl ?? null,
    thumbnailUrl: item.thumbnailUrl ?? null,
    contentType: contentType ?? mapContentType(item.contentType),
    provider: mapProvider(item.provider),
    duration: item.duration ?? null,
    readingTimeMinutes: item.readingTimeMinutes ?? null,
  };
}

function getSectionItems(
  homeData: HomeData | undefined,
  sectionKey: HomeSectionKey
): ItemCardData[] {
  if (!homeData) {
    return [];
  }

  switch (sectionKey) {
    case 'jump-back-in':
      return homeData.jumpBackIn.map((item) => mapHomeItemToCard(item));
    case 'recently-bookmarked':
      return homeData.recentBookmarks.map((item) => mapHomeItemToCard(item));
    case 'podcasts':
      return homeData.byContentType.podcasts.map((item) => mapHomeItemToCard(item, 'podcast'));
    case 'articles':
      return homeData.byContentType.articles.map((item) => mapHomeItemToCard(item, 'article'));
    case 'videos':
      return homeData.byContentType.videos.map((item) => mapHomeItemToCard(item, 'video'));
  }
}

export default function HomeSectionScreen() {
  const params = useLocalSearchParams<{ section?: string; contentType?: string | string[] }>();
  const sectionKey = parseSectionKey(params.section);
  const contentTypeFilter = parseContentTypeFilter(params.contentType);
  const selectedContentTypeFilter = contentTypeFilter
    ? contentTypeFilters.find((filter) => filter.id === contentTypeFilter)
    : undefined;
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const listRef = useRef<FlatList<ItemCardData>>(null);
  const { handleScroll, showCollapsedTitle } = useCollapsedHeaderTitle();
  const {
    data: homeData,
    isLoading,
    error,
    refetch,
  } = useHomeData(
    selectedContentTypeFilter
      ? { filter: { contentType: selectedContentTypeFilter.contentType } }
      : undefined
  );

  const sectionTitle = sectionKey ? SECTION_TITLES[sectionKey] : 'Section';
  const sectionItems = useMemo(() => {
    const items = sectionKey ? getSectionItems(homeData, sectionKey) : [];

    return contentTypeFilter
      ? items.filter((item) => item.contentType === contentTypeFilter)
      : items;
  }, [contentTypeFilter, homeData, sectionKey]);

  const renderItem = useCallback(
    ({ item, index }: ListRenderItemInfo<ItemCardData>) => (
      <ItemCard item={item} shape="row" index={index} bordered={false} />
    ),
    []
  );

  if (!sectionKey) {
    return (
      <Surface
        style={[styles.container, { backgroundColor: colors.background }]}
        collapsable={false}
      >
        <Stack.Screen
          options={createLightweightHeaderScreenOptions({
            backgroundColor: colors.background,
            tintColor: colors.text,
            screenTitle: 'Section',
            showScreenTitle: true,
          })}
        />
        <InvalidParamState message="The home section link is missing or invalid." />
      </Surface>
    );
  }

  const listEmptyComponent = isLoading ? (
    <LoadingState message={`Loading ${sectionTitle.toLowerCase()}...`} />
  ) : error ? (
    <ErrorState message={error.message} onRetry={() => void refetch()} />
  ) : (
    <EmptyState
      title={`No ${sectionTitle.toLowerCase()} yet`}
      message="Items will appear here as your library grows."
    />
  );

  return (
    <Surface style={[styles.container, { backgroundColor: colors.background }]} collapsable={false}>
      <Stack.Screen
        options={createLightweightHeaderScreenOptions({
          backgroundColor: colors.background,
          tintColor: colors.text,
          screenTitle: sectionTitle,
          showScreenTitle: isLoading || Boolean(error) || showCollapsedTitle,
        })}
      />

      <FlatList
        ref={listRef}
        data={isLoading || error ? [] : sectionItems}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        style={styles.list}
        contentContainerStyle={styles.listContent}
        contentInsetAdjustmentBehavior="automatic"
        showsVerticalScrollIndicator={false}
        onScroll={handleScroll}
        scrollEventThrottle={32}
        ListHeaderComponent={
          <View style={styles.listHeader}>
            <Text style={[styles.headerTitle, { color: colors.text }]}>{sectionTitle}</Text>
            {selectedContentTypeFilter ? (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.filterContainer}
              >
                <FilterChip
                  label={selectedContentTypeFilter.label}
                  isSelected
                  onPress={() => {}}
                  disabled
                  icon={selectedContentTypeFilter.icon}
                  dotColor={selectedContentTypeFilter.dotColor}
                  selectedColor={colors.warning}
                  selectedSurfaceColor={colors.warning}
                  selectedForegroundColor={colors.statusWarningForeground}
                />
              </ScrollView>
            ) : null}
          </View>
        }
        ListEmptyComponent={listEmptyComponent}
        ListFooterComponent={<View style={styles.listFooter} />}
      />
    </Surface>
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
    flexGrow: 1,
    paddingBottom: Spacing['3xl'],
  },
  listHeader: {
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.md,
  },
  headerTitle: {
    ...Typography.displayMedium,
    paddingHorizontal: Spacing.md,
  },
  filterContainer: {
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.md,
    gap: Spacing.sm,
  },
  listFooter: {
    minHeight: Spacing['3xl'],
    alignItems: 'center',
    justifyContent: 'center',
  },
});
