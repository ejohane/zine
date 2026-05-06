import { useState, useMemo, useCallback, useEffect, useRef, type ComponentType } from 'react';

import * as Haptics from 'expo-haptics';
import { Surface } from 'heroui-native';
import { Stack, useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import {
  ActivityIndicator,
  View,
  Text,
  ScrollView,
  StyleSheet,
  Pressable,
  TextInput,
  FlatList,
  type ListRenderItemInfo,
} from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { ContentType as ApiContentType } from '@zine/shared';

import { FilterChip } from '@/components/filter-chip';
import {
  ArticleIcon,
  CheckOutlineIcon,
  PodcastIcon,
  PostIcon,
  VideoIcon,
} from '@/components/icons';
import { ItemCard, type ItemCardData } from '@/components/item-card';
import { LoadingState, ErrorState, EmptyState } from '@/components/list-states';
import { PersonResultRow, type PersonResultRowData } from '@/components/person-result-row';
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
import { useInfiniteLibraryItems } from '@/hooks/use-items-trpc';
import { usePeople } from '@/hooks/use-people';
import {
  mapContentType,
  mapProvider,
  type UIContentType,
  type UIProvider,
} from '@/lib/content-utils';
import {
  createLightweightHeaderScreenOptions,
  useCollapsedHeaderTitle,
} from '@/lib/native-large-title-header';

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

const LIBRARY_PAGE_SIZE = 20;
const LIBRARY_TOP_THRESHOLD = 4;

const filterOptions: {
  id: string;
  label: string;
  color: string | undefined;
  icon?: ComponentType<{ size?: number; color?: string }>;
  selectedColor?: string;
  selectedSurfaceColor?: string;
  contentType: ApiContentType | null;
}[] = [
  { id: 'all', label: 'All', color: undefined, contentType: null },
  {
    id: 'article',
    label: 'Articles',
    color: ContentColors.article,
    icon: ArticleIcon,
    selectedColor: FilterChipPalette.article.accent,
    selectedSurfaceColor: FilterChipPalette.article.surface,
    contentType: ApiContentType.ARTICLE,
  },
  {
    id: 'podcast',
    label: 'Podcasts',
    color: ContentColors.podcast,
    icon: PodcastIcon,
    selectedColor: FilterChipPalette.podcast.accent,
    selectedSurfaceColor: FilterChipPalette.podcast.surface,
    contentType: ApiContentType.PODCAST,
  },
  {
    id: 'video',
    label: 'Videos',
    color: ContentColors.video,
    icon: VideoIcon,
    selectedColor: FilterChipPalette.video.accent,
    selectedSurfaceColor: FilterChipPalette.video.surface,
    contentType: ApiContentType.VIDEO,
  },
  {
    id: 'post',
    label: 'Posts',
    color: ContentColors.post,
    icon: PostIcon,
    selectedColor: FilterChipPalette.post.accent,
    selectedSurfaceColor: FilterChipPalette.post.surface,
    contentType: ApiContentType.POST,
  },
];

type LibraryTabNavigation = {
  addListener: (event: 'tabPress', listener: () => void) => () => void;
};

type LibraryScreenNavigation = {
  addListener: LibraryTabNavigation['addListener'];
  getParent?: () => LibraryTabNavigation | undefined;
  isFocused: () => boolean;
};

type LibraryMode = 'items' | 'people';

type LibraryRow =
  | { type: 'item'; item: ItemCardData }
  | { type: 'person'; person: PersonResultRowData };

export default function LibraryScreen() {
  const router = useRouter();
  const navigation = useNavigation() as LibraryScreenNavigation;
  const listScrollRef = useRef<FlatList<LibraryRow>>(null);
  const params = useLocalSearchParams<{ contentType?: string }>();
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const { handleScroll, scrollOffsetYRef, showCollapsedTitle } = useCollapsedHeaderTitle();

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

  const [contentTypeFilter, setContentTypeFilter] = useState<ApiContentType | null>(
    () => preselectedContentType ?? null
  );
  const [libraryMode, setLibraryMode] = useState<LibraryMode>('items');
  const [showCompletedOnly, setShowCompletedOnly] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('');

  useEffect(() => {
    if (preselectedContentType !== undefined) {
      setContentTypeFilter(preselectedContentType);
    }
  }, [preselectedContentType]);

  useEffect(() => {
    const handle = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery.trim());
    }, 200);
    return () => clearTimeout(handle);
  }, [searchQuery]);

  const handleAddBookmark = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push('/add-link');
  }, [router]);

  const filter = useMemo(
    () => ({
      contentType: contentTypeFilter ?? undefined,
      ...(showCompletedOnly ? { isFinished: true } : {}),
    }),
    [contentTypeFilter, showCompletedOnly]
  );

  const { data, isLoading, error, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useInfiniteLibraryItems({
      filter,
      search: debouncedSearchQuery || undefined,
      limit: LIBRARY_PAGE_SIZE,
    });
  const {
    data: peopleData,
    isLoading: peopleLoading,
    error: peopleError,
    fetchNextPage: fetchNextPeoplePage,
    hasNextPage: hasNextPeoplePage,
    isFetchingNextPage: isFetchingNextPeoplePage,
  } = usePeople({
    query: debouncedSearchQuery || undefined,
    limit: LIBRARY_PAGE_SIZE,
    sort: 'count',
  });

  const libraryItems: ItemCardData[] = useMemo(
    () =>
      (data?.pages.flatMap((page) => page.items) ?? []).map((item) => ({
        id: item.id,
        title: item.title,
        creator: item.creator,
        creatorImageUrl: item.creatorImageUrl ?? null,
        thumbnailUrl: item.thumbnailUrl ?? null,
        contentType: mapContentType(item.contentType) as UIContentType,
        provider: mapProvider(item.provider) as UIProvider,
        duration: item.duration ?? null,
        readingTimeMinutes: item.readingTimeMinutes ?? null,
        bookmarkedAt: item.bookmarkedAt ?? null,
        publishedAt: item.publishedAt ?? null,
        isFinished: item.isFinished,
      })),
    [data?.pages]
  );
  const people: PersonResultRowData[] = useMemo(
    () =>
      (peopleData?.pages.flatMap((page) => page.people) ?? []).map((person) => ({
        id: person.id,
        displayName: person.displayName,
        profileImageUrl: person.profileImageUrl,
        itemCount: person.itemCount,
        latestItemTitle: person.latestItemTitle,
      })),
    [peopleData?.pages]
  );
  const rows: LibraryRow[] = useMemo(
    () =>
      libraryMode === 'people'
        ? people.map((person) => ({ type: 'person' as const, person }))
        : libraryItems.map((item) => ({ type: 'item' as const, item })),
    [libraryItems, libraryMode, people]
  );

  const handleEndReached = useCallback(() => {
    if (libraryMode === 'people') {
      if (!hasNextPeoplePage || isFetchingNextPeoplePage) {
        return;
      }

      void fetchNextPeoplePage();
      return;
    }

    if (!hasNextPage || isFetchingNextPage) {
      return;
    }
    void fetchNextPage();
  }, [
    fetchNextPage,
    fetchNextPeoplePage,
    hasNextPage,
    hasNextPeoplePage,
    isFetchingNextPage,
    isFetchingNextPeoplePage,
    libraryMode,
  ]);

  const renderItem = useCallback(
    ({ item, index }: ListRenderItemInfo<LibraryRow>) =>
      item.type === 'person' ? (
        <PersonResultRow person={item.person} source="library" />
      ) : (
        <ItemCard item={item.item} shape="row" index={index} />
      ),
    []
  );

  const isActiveLoading = libraryMode === 'people' ? peopleLoading : isLoading;
  const activeError = libraryMode === 'people' ? peopleError : error;
  const isActiveFetchingNextPage =
    libraryMode === 'people' ? isFetchingNextPeoplePage : isFetchingNextPage;

  useEffect(() => {
    const tabNavigation = navigation.getParent?.() ?? navigation;

    return tabNavigation.addListener('tabPress', () => {
      if (!navigation.isFocused()) return;

      const isAtTop = scrollOffsetYRef.current <= LIBRARY_TOP_THRESHOLD;

      if (isAtTop && (showCompletedOnly || contentTypeFilter !== null)) {
        setShowCompletedOnly(false);
        setContentTypeFilter(null);
        return;
      }

      listScrollRef.current?.scrollToOffset({ offset: 0, animated: true });
    });
  }, [contentTypeFilter, navigation, scrollOffsetYRef, showCompletedOnly]);

  const listEmptyComponent = isActiveLoading ? (
    <LoadingState />
  ) : activeError ? (
    <ErrorState message={activeError.message} />
  ) : (
    <EmptyState
      title={
        searchQuery.trim()
          ? 'No matches found'
          : libraryMode === 'people'
            ? 'No people yet'
            : 'No bookmarked items'
      }
      message={
        searchQuery.trim()
          ? libraryMode === 'people'
            ? 'Try a different person name.'
            : 'Try a different title or creator name.'
          : libraryMode === 'people'
            ? 'People appear here after your saved items are enriched.'
            : 'Bookmark content from your inbox to save it here for later.'
      }
    />
  );

  return (
    <Surface style={[styles.container, { backgroundColor: colors.background }]} collapsable={false}>
      <Stack.Screen
        options={createLightweightHeaderScreenOptions({
          backgroundColor: colors.background,
          tintColor: colors.text,
          screenTitle: 'Library',
          showScreenTitle: isActiveLoading || Boolean(activeError) || showCollapsedTitle,
          headerRight: () => (
            <Pressable
              onPress={handleAddBookmark}
              style={styles.addButton}
              accessibilityLabel="Add bookmark"
              accessibilityRole="button"
            >
              <PlusIcon size={22} color={colors.text} />
            </Pressable>
          ),
        })}
      />

      <FlatList
        ref={listScrollRef}
        data={isActiveLoading || activeError ? [] : rows}
        keyExtractor={(item) =>
          item.type === 'person' ? `person:${item.person.id}` : item.item.id
        }
        renderItem={renderItem}
        style={styles.listContainer}
        contentContainerStyle={styles.listContent}
        contentInsetAdjustmentBehavior="automatic"
        showsVerticalScrollIndicator={false}
        onScroll={handleScroll}
        scrollEventThrottle={32}
        onEndReached={handleEndReached}
        onEndReachedThreshold={0.6}
        ListHeaderComponent={
          <View style={styles.listHeader}>
            <Text style={[styles.headerTitle, { color: colors.text }]}>Library</Text>

            <View
              style={[
                styles.modeSwitcher,
                {
                  backgroundColor: colors.backgroundSecondary,
                  borderColor: colors.border,
                },
              ]}
            >
              {(['items', 'people'] as const).map((mode) => {
                const isSelected = libraryMode === mode;
                return (
                  <Pressable
                    key={mode}
                    accessibilityRole="button"
                    accessibilityState={{ selected: isSelected }}
                    onPress={() => setLibraryMode(mode)}
                    style={[
                      styles.modeButton,
                      isSelected && { backgroundColor: colors.surfaceRaised },
                    ]}
                  >
                    <Text
                      style={[
                        styles.modeButtonText,
                        { color: isSelected ? colors.text : colors.textTertiary },
                      ]}
                    >
                      {mode === 'items' ? 'Items' : 'People'}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <View style={styles.searchContainer}>
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
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                />
              </View>
            </View>

            {libraryMode === 'items' ? (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.filterContainer}
              >
                <FilterChip
                  label="Completed"
                  isSelected={showCompletedOnly}
                  onPress={() => setShowCompletedOnly((prev) => !prev)}
                  icon={CheckOutlineIcon}
                  selectedColor={FilterChipPalette.completed.accent}
                  selectedSurfaceColor={FilterChipPalette.completed.surface}
                />
                {filterOptions.map((option) => (
                  <FilterChip
                    key={option.id}
                    label={option.label}
                    isSelected={contentTypeFilter === option.contentType}
                    onPress={() =>
                      setContentTypeFilter((current) =>
                        current === option.contentType ? null : option.contentType
                      )
                    }
                    icon={option.icon}
                    dotColor={option.color}
                    selectedColor={option.selectedColor}
                    selectedSurfaceColor={option.selectedSurfaceColor}
                  />
                ))}
              </ScrollView>
            ) : null}
          </View>
        }
        ListEmptyComponent={listEmptyComponent}
        ListFooterComponent={
          <View style={styles.listFooter}>
            {!isActiveLoading && !activeError && isActiveFetchingNextPage ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : null}
          </View>
        }
      />
    </Surface>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  listHeader: {
    paddingTop: Spacing.sm,
  },
  headerTitle: {
    ...Typography.displayMedium,
    paddingHorizontal: Spacing.md,
    marginBottom: Spacing.md,
  },
  addButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  searchContainer: {
    paddingHorizontal: Spacing.md,
    marginBottom: Spacing.md,
  },
  modeSwitcher: {
    flexDirection: 'row',
    marginHorizontal: Spacing.md,
    marginBottom: Spacing.md,
    padding: Spacing.xs,
    borderRadius: Radius.lg,
    borderWidth: 1,
    gap: Spacing.xs,
  },
  modeButton: {
    flex: 1,
    minHeight: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Radius.md,
  },
  modeButtonText: {
    ...Typography.labelMedium,
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
  filterContainer: {
    paddingHorizontal: Spacing.md,
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  listContainer: {
    flex: 1,
  },
  listContent: {
    flexGrow: 1,
    paddingBottom: Spacing['3xl'],
  },
  listFooter: {
    minHeight: Spacing['3xl'],
    alignItems: 'center',
    justifyContent: 'center',
  },
});
