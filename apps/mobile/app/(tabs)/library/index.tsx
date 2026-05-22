import { useState, useMemo, useCallback, useEffect, useRef, type ComponentType } from 'react';

import * as Haptics from 'expo-haptics';
import { Surface } from 'heroui-native';
import { Stack, useNavigation, useRouter, type Href } from 'expo-router';
import {
  ActivityIndicator,
  View,
  Text,
  ScrollView,
  StyleSheet,
  Pressable,
  FlatList,
  type ListRenderItemInfo,
} from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { ContentType as ApiContentType } from '@zine/shared';

import { FilterChip } from '@/components/filter-chip';
import { ArticleIcon, PodcastIcon, PostIcon, VideoIcon } from '@/components/icons';
import { ItemCard, type ItemCardData } from '@/components/item-card';
import { LoadingState, ErrorState, EmptyState } from '@/components/list-states';
import { type PersonResultRowData } from '@/components/person-result-row';
import { SourceSubscriptionRow } from '@/components/subscriptions/source-ui';
import { Colors, Typography, Spacing, Radius, ContentColors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useTabPrefetch } from '@/hooks/use-prefetch';
import { useCollections, useInfiniteLibraryItems } from '@/hooks/use-items-trpc';
import { usePeople } from '@/hooks/use-people';
import { useSubscriptions as useSubscriptionsQuery } from '@/hooks/use-subscriptions-query';
import {
  mapContentType,
  mapProvider,
  type UIContentType,
  type UIProvider,
} from '@/lib/content-utils';
import { getSubscriptionSourceConfig, type SubscriptionSource } from '@/lib/subscription-sources';
import {
  createLightweightHeaderScreenOptions,
  useCollapsedHeaderTitle,
} from '@/lib/native-large-title-header';
import { trpc } from '@/lib/trpc';

function PlusIcon({ size = 24, color = '#FFFFFF' }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2}>
      <Path d="M12 5v14M5 12h14" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

function PeopleIcon({ size = 22, color = '#FFFFFF' }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2}>
      <Path d="M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2" strokeLinecap="round" />
      <Path d="M9 11a4 4 0 100-8 4 4 0 000 8z" strokeLinecap="round" />
      <Path d="M22 21v-2a4 4 0 00-3-3.87" strokeLinecap="round" />
      <Path d="M16 3.13a4 4 0 010 7.75" strokeLinecap="round" />
    </Svg>
  );
}

function SourcesIcon({ size = 22, color = '#FFFFFF' }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2}>
      <Path d="M4 11a9 9 0 019 9" strokeLinecap="round" />
      <Path d="M4 4a16 16 0 0116 16" strokeLinecap="round" />
      <Path d="M5 20h.01" strokeLinecap="round" />
    </Svg>
  );
}

function BookmarksIcon({ size = 22, color = '#FFFFFF' }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2}>
      <Path d="M19 21l-7-4-7 4V5a2 2 0 012-2h10a2 2 0 012 2z" strokeLinecap="round" />
    </Svg>
  );
}

function CollectionsIcon({ size = 22, color = '#FFFFFF' }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2}>
      <Path d="M3 7a2 2 0 012-2h5l2 2h7a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
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
  contentType: ApiContentType | null;
}[] = [
  { id: 'all', label: 'All', color: undefined, contentType: null },
  {
    id: 'article',
    label: 'Articles',
    color: ContentColors.article,
    icon: ArticleIcon,
    contentType: ApiContentType.ARTICLE,
  },
  {
    id: 'podcast',
    label: 'Podcasts',
    color: ContentColors.podcast,
    icon: PodcastIcon,
    contentType: ApiContentType.PODCAST,
  },
  {
    id: 'video',
    label: 'Videos',
    color: ContentColors.video,
    icon: VideoIcon,
    contentType: ApiContentType.VIDEO,
  },
  {
    id: 'post',
    label: 'Posts',
    color: ContentColors.post,
    icon: PostIcon,
    contentType: ApiContentType.POST,
  },
];

const subscriptionSourceOptions: {
  id: SubscriptionSource;
  label: string;
}[] = [
  { id: 'YOUTUBE', label: 'YouTube' },
  { id: 'SPOTIFY', label: 'Spotify' },
  { id: 'GMAIL', label: 'Newsletters' },
  { id: 'X', label: 'X' },
  { id: 'RSS', label: 'RSS' },
];

type LibraryTabNavigation = {
  addListener: (event: 'tabPress', listener: () => void) => () => void;
};

type LibraryScreenNavigation = {
  addListener: LibraryTabNavigation['addListener'];
  getParent?: () => LibraryTabNavigation | undefined;
  isFocused: () => boolean;
};

type LibraryObject = 'people' | 'sources' | 'bookmarks' | 'collections';

type LibraryRow =
  | { type: 'item'; item: ItemCardData }
  | { type: 'person'; person: PersonResultRowData }
  | {
      type: 'source';
      source: {
        id: string;
        name: string;
        sourceKey: SubscriptionSource;
        sourceLabel: string;
        status: string;
        imageUrl: string | null;
        detail: string;
      };
    }
  | {
      type: 'collection';
      collection: {
        id: string;
        name: string;
        description: string | null;
        ruleSummary: string;
      };
    };

type LibraryColors = (typeof Colors)['dark'];

type LibraryObjectTileModel = {
  id: LibraryObject;
  title: string;
  icon: ComponentType<{ size?: number; color?: string }>;
};

type CollectionRuleSummaryInput = {
  contentTypes?: unknown[];
  providers?: unknown[];
  tagIds?: unknown[];
  isFinished?: boolean;
  search?: string;
  minLengthMinutes?: number;
  maxLengthMinutes?: number;
};

function getInitials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

function getLibraryObjectTitle(activeObject: LibraryObject): string {
  switch (activeObject) {
    case 'people':
      return 'People with saved work';
    case 'sources':
      return 'Subscriptions';
    case 'collections':
      return 'Collections';
    case 'bookmarks':
    default:
      return 'Saved bookmarks';
  }
}

function getCollectionRuleSummary(rules: CollectionRuleSummaryInput): string {
  const parts: string[] = [];

  if (rules.contentTypes?.length) parts.push('content type');
  if (rules.providers?.length) parts.push('source');
  if (rules.tagIds?.length) parts.push('tag');
  if (rules.isFinished !== undefined) parts.push(rules.isFinished ? 'finished' : 'unfinished');
  if (rules.search) parts.push('search');
  if (rules.minLengthMinutes !== undefined || rules.maxLengthMinutes !== undefined) {
    parts.push('length');
  }

  if (parts.length === 0) {
    return 'Manual collection';
  }

  return `Saved filter: ${parts.join(', ')}`;
}

function getSourceStatusLabel(status: string): string {
  if (status === 'ACTIVE') return 'Fresh';
  if (status === 'PAUSED') return 'Paused';
  if (status === 'ERROR') return 'Error';
  if (status === 'DISCONNECTED') return 'Connect';
  if (status === 'EXPIRED' || status === 'REVOKED') return 'Fix';
  return status.toLowerCase();
}

function getProgressWidth(index: number, itemCount: number): `${number}%` {
  const base = Math.min(84, Math.max(32, itemCount * 6));
  return `${Math.max(28, base - index * 10)}%`;
}

function getSubscriptionSourceTitle(source: SubscriptionSource): string {
  return getSubscriptionSourceConfig(source).name;
}

function LibraryObjectTile({
  tile,
  isSelected,
  colors,
  onPress,
}: {
  tile: LibraryObjectTileModel;
  isSelected: boolean;
  colors: LibraryColors;
  onPress: () => void;
}) {
  const Icon = tile.icon;
  const foregroundColor = isSelected ? colors.statusWarning : colors.textSubheader;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: isSelected }}
      accessibilityLabel={`Show ${tile.title}`}
      onPress={onPress}
      style={({ pressed }) => [
        styles.objectTile,
        {
          backgroundColor: isSelected ? colors.statusWarningSurface : colors.backgroundSecondary,
          borderColor: isSelected ? colors.statusWarning : colors.border,
        },
        pressed && styles.pressed,
      ]}
    >
      <View style={styles.objectTileTitleRow}>
        <Icon size={18} color={foregroundColor} />
        <Text style={[styles.objectTileTitle, { color: colors.text }]}>{tile.title}</Text>
      </View>
    </Pressable>
  );
}

function LibraryPersonRow({
  person,
  index,
  colors,
}: {
  person: PersonResultRowData;
  index: number;
  colors: LibraryColors;
}) {
  const router = useRouter();
  const initials = useMemo(() => getInitials(person.displayName), [person.displayName]);
  const progressColor =
    index % 3 === 0
      ? colors.statusInfo
      : index % 3 === 1
        ? colors.statusWarning
        : colors.statusSuccess;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${person.displayName}, ${person.itemCount} saved items`}
      onPress={() => router.push(`/person/${person.id}?source=library` as Href)}
      style={({ pressed }) => [
        styles.hubRow,
        { backgroundColor: colors.backgroundSecondary, borderColor: colors.border },
        pressed && styles.pressed,
      ]}
    >
      <View style={[styles.avatar, { backgroundColor: colors.surfaceRaised }]}>
        <Text style={[styles.avatarText, { color: colors.text }]}>{initials}</Text>
      </View>
      <View style={styles.hubRowContent}>
        <Text style={[styles.hubRowTitle, { color: colors.text }]} numberOfLines={1}>
          {person.displayName}
        </Text>
        <Text style={[styles.hubRowSubtitle, { color: colors.textSubheader }]} numberOfLines={1}>
          {person.itemCount} saved {person.itemCount === 1 ? 'item' : 'items'}
          {person.latestItemTitle ? ` - ${person.latestItemTitle}` : ''}
        </Text>
        <View style={[styles.progressTrack, { backgroundColor: colors.surfaceRaised }]}>
          <View
            style={[
              styles.progressFill,
              { backgroundColor: progressColor, width: getProgressWidth(index, person.itemCount) },
            ]}
          />
        </View>
      </View>
    </Pressable>
  );
}

function LibrarySourceRow({
  source,
  colors,
  onPress,
}: {
  source: Extract<LibraryRow, { type: 'source' }>['source'];
  colors: LibraryColors;
  onPress: () => void;
}) {
  const statusLabel = getSourceStatusLabel(source.status);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${source.name}, ${statusLabel}`}
      onPress={onPress}
      style={({ pressed }) => [styles.sourceSubscriptionPressable, pressed && styles.pressed]}
    >
      <SourceSubscriptionRow
        source={source.sourceKey}
        variant="card"
        title={source.name}
        subtitle={source.detail}
        meta={source.sourceLabel}
        imageUrl={source.imageUrl}
        toggleChecked
        toggleCheckedColor={colors.statusWarning}
        onToggle={onPress}
      />
    </Pressable>
  );
}

function LibraryCollectionRow({
  collection,
  colors,
  onPress,
}: {
  collection: Extract<LibraryRow, { type: 'collection' }>['collection'];
  colors: LibraryColors;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Open ${collection.name}`}
      onPress={onPress}
      style={({ pressed }) => [
        styles.hubRow,
        { backgroundColor: colors.backgroundSecondary, borderColor: colors.border },
        pressed && styles.pressed,
      ]}
    >
      <View style={[styles.collectionIcon, { backgroundColor: colors.surfaceRaised }]}>
        <CollectionsIcon size={24} color={colors.textSubheader} />
      </View>
      <View style={styles.hubRowContent}>
        <Text style={[styles.hubRowTitle, { color: colors.text }]} numberOfLines={1}>
          {collection.name}
        </Text>
        <Text style={[styles.hubRowSubtitle, { color: colors.textSubheader }]} numberOfLines={1}>
          {collection.description || collection.ruleSummary}
        </Text>
      </View>
    </Pressable>
  );
}

export default function LibraryScreen() {
  const router = useRouter();
  const navigation = useNavigation() as LibraryScreenNavigation;
  const listScrollRef = useRef<FlatList<LibraryRow>>(null);
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const { handleScroll, scrollOffsetYRef, showCollapsedTitle } = useCollapsedHeaderTitle();

  useTabPrefetch('library');

  const [contentTypeFilter, setContentTypeFilter] = useState<ApiContentType | null>(null);
  const [activeObject, setActiveObject] = useState<LibraryObject>('bookmarks');
  const [subscriptionSourceFilter, setSubscriptionSourceFilter] =
    useState<SubscriptionSource>('YOUTUBE');

  const handleSelectObject = useCallback((object: LibraryObject) => {
    setActiveObject(object);
    if (object === 'bookmarks') {
      setContentTypeFilter(null);
    }
    if (object === 'sources') {
      setSubscriptionSourceFilter('YOUTUBE');
    }
  }, []);

  const handleAddBookmark = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push('/add-link');
  }, [router]);

  const filter = useMemo(
    () => ({
      contentType: contentTypeFilter ?? undefined,
    }),
    [contentTypeFilter]
  );

  const { data, isLoading, error, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useInfiniteLibraryItems({
      filter,
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
    limit: LIBRARY_PAGE_SIZE,
    sort: 'count',
  });
  const collectionsQuery = useCollections();
  const subscriptionsQuery = useSubscriptionsQuery();
  const newslettersQuery = trpc.subscriptions.newsletters.list.useQuery(
    { limit: 100 },
    { staleTime: 60 * 1000 }
  );
  const rssFeedsQuery = trpc.subscriptions.rss.list.useQuery(
    { limit: 100 },
    { staleTime: 60 * 1000 }
  );
  const xBookmarksStatusQuery = trpc.subscriptions.xBookmarks.status.useQuery(undefined, {
    staleTime: 60 * 1000,
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
  const collections = useMemo(
    () =>
      (collectionsQuery.data?.collections ?? []).map((collection) => ({
        id: collection.id,
        name: collection.name,
        description: collection.description,
        ruleSummary: getCollectionRuleSummary(collection.rules),
      })),
    [collectionsQuery.data?.collections]
  );
  const subscriptionRows = useMemo(() => {
    const rows: Extract<LibraryRow, { type: 'source' }>['source'][] = [];

    for (const subscription of subscriptionsQuery.data?.items ?? []) {
      const sourceKey = subscription.provider;
      const sourceLabel = getSubscriptionSourceTitle(sourceKey);
      rows.push({
        id: `subscription:${subscription.id}`,
        name: subscription.name,
        sourceKey,
        sourceLabel,
        status: subscription.status,
        imageUrl: subscription.imageUrl,
        detail: `${sourceLabel} subscription`,
      });
    }

    for (const newsletter of newslettersQuery.data?.items ?? []) {
      rows.push({
        id: `newsletter:${newsletter.id}`,
        name: newsletter.displayName,
        sourceKey: 'GMAIL',
        sourceLabel: getSubscriptionSourceTitle('GMAIL'),
        status: newsletter.status,
        imageUrl: newsletter.imageUrl,
        detail: newsletter.fromAddress ?? newsletter.listId ?? 'Newsletter',
      });
    }

    for (const feed of rssFeedsQuery.data?.items ?? []) {
      if (feed.status === 'UNSUBSCRIBED') {
        continue;
      }

      rows.push({
        id: `rss:${feed.id}`,
        name: feed.title,
        sourceKey: 'RSS',
        sourceLabel: getSubscriptionSourceTitle('RSS'),
        status: feed.status,
        imageUrl: feed.imageUrl,
        detail: feed.siteUrl ?? feed.feedUrl,
      });
    }

    const xStatus = xBookmarksStatusQuery.data;
    if (xStatus?.connected || xStatus?.importedCount) {
      rows.push({
        id: 'x-bookmarks',
        name: 'X Bookmarks',
        sourceKey: 'X',
        sourceLabel: getSubscriptionSourceTitle('X'),
        status: xStatus.connected ? 'ACTIVE' : (xStatus.connectionStatus ?? 'DISCONNECTED'),
        imageUrl: null,
        detail: `${xStatus.importedCount} imported ${
          xStatus.importedCount === 1 ? 'bookmark' : 'bookmarks'
        }`,
      });
    }

    return rows;
  }, [
    newslettersQuery.data?.items,
    rssFeedsQuery.data?.items,
    subscriptionsQuery.data?.items,
    xBookmarksStatusQuery.data,
  ]);
  const sourceRows: Extract<LibraryRow, { type: 'source' }>[] = useMemo(() => {
    return subscriptionRows
      .filter((row) => row.sourceKey === subscriptionSourceFilter)
      .map((source) => ({ type: 'source' as const, source }));
  }, [subscriptionRows, subscriptionSourceFilter]);
  const rows: LibraryRow[] = useMemo(() => {
    if (activeObject === 'people') {
      return people.map((person) => ({ type: 'person' as const, person }));
    }

    if (activeObject === 'sources') {
      return sourceRows;
    }

    if (activeObject === 'collections') {
      return collections.map((collection) => ({ type: 'collection' as const, collection }));
    }

    return libraryItems.map((item) => ({ type: 'item' as const, item }));
  }, [activeObject, collections, libraryItems, people, sourceRows]);

  const handleEndReached = useCallback(() => {
    if (activeObject === 'people') {
      if (!hasNextPeoplePage || isFetchingNextPeoplePage) {
        return;
      }

      void fetchNextPeoplePage();
      return;
    }

    if (activeObject !== 'bookmarks') {
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
    activeObject,
  ]);

  const handleOpenCollection = useCallback(
    (collectionId: string) => {
      router.push({
        pathname: '/(tabs)/collection/[id]',
        params: { id: collectionId },
      } as unknown as Href);
    },
    [router]
  );

  const handleOpenSource = useCallback(
    (source: SubscriptionSource) => {
      router.push(getSubscriptionSourceConfig(source).route);
    },
    [router]
  );

  const renderItem = useCallback(
    ({ item, index }: ListRenderItemInfo<LibraryRow>) => {
      if (item.type === 'person') {
        return <LibraryPersonRow person={item.person} index={index} colors={colors} />;
      }

      if (item.type === 'source') {
        return (
          <LibrarySourceRow
            source={item.source}
            colors={colors}
            onPress={() => handleOpenSource(item.source.sourceKey)}
          />
        );
      }

      if (item.type === 'collection') {
        return (
          <LibraryCollectionRow
            collection={item.collection}
            colors={colors}
            onPress={() => handleOpenCollection(item.collection.id)}
          />
        );
      }

      return <ItemCard item={item.item} shape="row" index={index} />;
    },
    [colors, handleOpenCollection, handleOpenSource]
  );

  const isActiveLoading =
    activeObject === 'people'
      ? peopleLoading
      : activeObject === 'sources'
        ? subscriptionsQuery.isLoading ||
          newslettersQuery.isLoading ||
          rssFeedsQuery.isLoading ||
          xBookmarksStatusQuery.isLoading
        : activeObject === 'collections'
          ? collectionsQuery.isLoading
          : isLoading;
  const activeError =
    activeObject === 'people'
      ? peopleError
      : activeObject === 'sources'
        ? (subscriptionsQuery.error ??
          newslettersQuery.error ??
          rssFeedsQuery.error ??
          xBookmarksStatusQuery.error)
        : activeObject === 'collections'
          ? collectionsQuery.error
          : error;
  const isActiveFetchingNextPage =
    activeObject === 'people'
      ? isFetchingNextPeoplePage
      : activeObject === 'bookmarks'
        ? isFetchingNextPage
        : false;

  useEffect(() => {
    const tabNavigation = navigation.getParent?.() ?? navigation;

    return tabNavigation.addListener('tabPress', () => {
      if (!navigation.isFocused()) return;

      const isAtTop = scrollOffsetYRef.current <= LIBRARY_TOP_THRESHOLD;

      if (isAtTop && (contentTypeFilter !== null || activeObject !== 'bookmarks')) {
        setContentTypeFilter(null);
        setActiveObject('bookmarks');
        return;
      }

      listScrollRef.current?.scrollToOffset({ offset: 0, animated: true });
    });
  }, [activeObject, contentTypeFilter, navigation, scrollOffsetYRef]);

  const activeObjectTitle = getLibraryObjectTitle(activeObject);
  const objectTiles = useMemo(
    () => [
      {
        id: 'bookmarks' as const,
        title: 'Bookmarks',
        icon: BookmarksIcon,
      },
      {
        id: 'collections' as const,
        title: 'Collections',
        icon: CollectionsIcon,
      },
      {
        id: 'sources' as const,
        title: 'Subscriptions',
        icon: SourcesIcon,
      },
      {
        id: 'people' as const,
        title: 'People',
        icon: PeopleIcon,
      },
    ],
    []
  );

  const listEmptyComponent = isActiveLoading ? (
    <LoadingState />
  ) : activeError ? (
    <ErrorState message={activeError.message} />
  ) : (
    <EmptyState
      title={
        activeObject === 'people'
          ? 'No people yet'
          : activeObject === 'sources'
            ? `No ${getSubscriptionSourceConfig(subscriptionSourceFilter).subscriptionNoun}s yet`
            : activeObject === 'collections'
              ? 'No collections yet'
              : 'No bookmarked items'
      }
      message={
        activeObject === 'people'
          ? 'People appear here after your saved items are enriched.'
          : activeObject === 'sources'
            ? 'Connect sources to keep new work flowing into Zine.'
            : activeObject === 'collections'
              ? 'Create collections from Settings or from a saved item.'
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
        keyExtractor={(item) => {
          if (item.type === 'person') return `person:${item.person.id}`;
          if (item.type === 'source') return `source:${item.source.id}`;
          if (item.type === 'collection') return `collection:${item.collection.id}`;
          return item.item.id;
        }}
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

            <View style={styles.objectGrid}>
              {objectTiles.map((tile) => (
                <LibraryObjectTile
                  key={tile.id}
                  tile={tile}
                  isSelected={activeObject === tile.id}
                  colors={colors}
                  onPress={() => handleSelectObject(tile.id)}
                />
              ))}
            </View>

            <View style={styles.sectionHeader}>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>{activeObjectTitle}</Text>
              {activeObject === 'sources' ? (
                <Pressable onPress={() => router.push('/subscriptions')} hitSlop={8}>
                  <Text style={[styles.sectionAction, { color: colors.textTertiary }]}>Manage</Text>
                </Pressable>
              ) : null}
            </View>

            {activeObject === 'bookmarks' ? (
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
                    onPress={() =>
                      setContentTypeFilter((current) =>
                        current === option.contentType ? null : option.contentType
                      )
                    }
                    icon={option.icon}
                    dotColor={option.color}
                    selectedColor={colors.statusWarningForeground}
                    selectedSurfaceColor={colors.statusWarning}
                  />
                ))}
              </ScrollView>
            ) : null}

            {activeObject === 'sources' ? (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.filterContainer}
              >
                {subscriptionSourceOptions.map((option) => (
                  <FilterChip
                    key={option.id}
                    label={option.label}
                    isSelected={subscriptionSourceFilter === option.id}
                    onPress={() => setSubscriptionSourceFilter(option.id)}
                    selectedColor={colors.statusWarningForeground}
                    selectedSurfaceColor={colors.statusWarning}
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
  objectGrid: {
    paddingHorizontal: Spacing.md,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
    marginBottom: Spacing.lg,
  },
  objectTile: {
    flexBasis: '48%',
    flexGrow: 1,
    minHeight: 72,
    borderRadius: Radius.lg,
    borderWidth: 1,
    padding: Spacing.md,
    justifyContent: 'center',
  },
  objectTileTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  objectTileTitle: {
    ...Typography.titleMedium,
  },
  sectionHeader: {
    paddingHorizontal: Spacing.md,
    marginBottom: Spacing.md,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sectionTitle: {
    ...Typography.titleLarge,
  },
  sectionAction: {
    ...Typography.bodySmall,
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
  hubRow: {
    minHeight: 88,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    marginHorizontal: Spacing.md,
    marginBottom: Spacing.sm,
    padding: Spacing.md,
    borderRadius: Radius.lg,
    borderWidth: 1,
  },
  hubRowContent: {
    flex: 1,
    minWidth: 0,
  },
  hubRowTitle: {
    ...Typography.titleMedium,
  },
  hubRowSubtitle: {
    ...Typography.bodyMedium,
    marginTop: Spacing.xs,
  },
  sourceSubscriptionPressable: {
    marginHorizontal: Spacing.md,
    marginBottom: Spacing.sm,
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  collectionIcon: {
    width: 56,
    height: 56,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    ...Typography.titleMedium,
  },
  progressTrack: {
    height: 6,
    borderRadius: Radius.full,
    overflow: 'hidden',
    marginTop: Spacing.sm,
  },
  progressFill: {
    height: '100%',
    borderRadius: Radius.full,
  },
  pressed: {
    opacity: 0.72,
  },
  listFooter: {
    minHeight: Spacing['3xl'],
    alignItems: 'center',
    justifyContent: 'center',
  },
});
