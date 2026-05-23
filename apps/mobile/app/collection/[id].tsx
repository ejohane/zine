import { Stack, useLocalSearchParams } from 'expo-router';
import { Surface } from 'heroui-native';
import { useCallback, useMemo, useRef } from 'react';
import {
  ActivityIndicator,
  FlatList,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type ListRenderItemInfo,
} from 'react-native';
import {
  CollectionSort,
  type CollectionRules,
  type ContentType as ApiContentType,
  type Provider as ApiProvider,
} from '@zine/shared';

import { ItemCard, type ItemCardData } from '@/components/item-card';
import { EmptyState, ErrorState, InvalidParamState, LoadingState } from '@/components/list-states';
import { Colors, Radius, Spacing, Typography } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useCollection, useInfiniteCollectionItems, useUserTags } from '@/hooks/use-items-trpc';
import {
  getContentTypeLabel,
  getProviderLabel,
  mapContentType,
  mapProvider,
  type UIContentType,
  type UIProvider,
} from '@/lib/content-utils';
import { isValidId } from '@/lib/route-validation';
import {
  createLightweightHeaderScreenOptions,
  useCollapsedHeaderTitle,
} from '@/lib/native-large-title-header';

const COLLECTION_PAGE_SIZE = 20;

function pluralize(label: string): string {
  return label.endsWith('s') ? label : `${label}s`;
}

function getSortLabel(sort: string): string {
  switch (sort) {
    case CollectionSort.OLDEST_SAVED:
      return 'Oldest saved';
    case CollectionSort.SHORTEST:
      return 'Shortest';
    case CollectionSort.LONGEST:
      return 'Longest';
    case CollectionSort.RECENTLY_OPENED:
      return 'Recently opened';
    case CollectionSort.NEWEST_SAVED:
    default:
      return 'Newest saved';
  }
}

function getLengthLabel(rules: CollectionRules): string | null {
  const min = rules.minLengthMinutes;
  const max = rules.maxLengthMinutes;

  if (min === undefined && max === undefined) {
    return null;
  }

  if (min !== undefined && max !== undefined) {
    return `${min}-${max} min`;
  }

  if (min !== undefined) {
    return `${min}+ min`;
  }

  return max !== undefined ? `Under ${max} min` : null;
}

function buildRuleChips(
  rules: CollectionRules,
  tagNamesById: Map<string, string>,
  sort: string
): string[] {
  const chips: string[] = [];

  if (rules.contentTypes?.length) {
    chips.push(
      ...rules.contentTypes.map((contentType) =>
        pluralize(getContentTypeLabel(contentType as ApiContentType))
      )
    );
  }

  if (rules.providers?.length) {
    chips.push(
      ...rules.providers
        .map((provider) => getProviderLabel(provider as ApiProvider))
        .filter((label) => label.length > 0)
    );
  }

  if (rules.tagIds?.length) {
    chips.push(
      ...rules.tagIds.map((tagId) => tagNamesById.get(tagId) ?? `Tag ${tagId.slice(0, 6)}`)
    );
  }

  if (rules.isFinished === true) {
    chips.push('Finished');
  } else if (rules.isFinished === false) {
    chips.push('Unfinished');
  }

  const lengthLabel = getLengthLabel(rules);
  if (lengthLabel) {
    chips.push(lengthLabel);
  }

  if (rules.search) {
    chips.push(`Search: "${rules.search}"`);
  }

  if (chips.length === 0) {
    chips.push('Manual collection');
  }

  chips.push(getSortLabel(sort));
  return chips;
}

export default function CollectionScreen() {
  const params = useLocalSearchParams<{ id?: string }>();
  const rawId = Array.isArray(params.id) ? params.id[0] : params.id;
  const collectionId = isValidId(rawId) ? rawId : '';
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const listRef = useRef<FlatList<ItemCardData>>(null);
  const { handleScroll, showCollapsedTitle } = useCollapsedHeaderTitle();

  const collectionQuery = useCollection(collectionId);
  const tagsQuery = useUserTags();
  const { data, isLoading, error, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useInfiniteCollectionItems({
      id: collectionId,
      limit: COLLECTION_PAGE_SIZE,
    });

  const tagNamesById = useMemo(() => {
    return new Map((tagsQuery.data?.tags ?? []).map((tag) => [tag.id, tag.name]));
  }, [tagsQuery.data?.tags]);

  const collection = collectionQuery.data;
  const activeError = collectionQuery.error ?? error;
  const collectionTitle = collection?.name ?? 'Collection';
  const ruleChips = useMemo(
    () => buildRuleChips(collection?.rules ?? {}, tagNamesById, collection?.sort ?? ''),
    [collection?.rules, collection?.sort, tagNamesById]
  );

  const collectionItems: ItemCardData[] = useMemo(
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

  const handleEndReached = useCallback(() => {
    if (!hasNextPage || isFetchingNextPage) {
      return;
    }

    void fetchNextPage();
  }, [fetchNextPage, hasNextPage, isFetchingNextPage]);

  const renderItem = useCallback(
    ({ item, index }: ListRenderItemInfo<ItemCardData>) => (
      <ItemCard item={item} shape="row" index={index} />
    ),
    []
  );

  if (!collectionId) {
    return (
      <Surface
        style={[styles.container, { backgroundColor: colors.background }]}
        collapsable={false}
      >
        <Stack.Screen
          options={createLightweightHeaderScreenOptions({
            backgroundColor: colors.background,
            tintColor: colors.text,
            screenTitle: 'Collection',
            showScreenTitle: true,
          })}
        />
        <InvalidParamState message="The collection link is missing or invalid." />
      </Surface>
    );
  }

  const listEmptyComponent =
    collectionQuery.isLoading || isLoading ? (
      <LoadingState message="Loading collection..." />
    ) : activeError ? (
      <ErrorState message={activeError.message} />
    ) : (
      <EmptyState
        title="No items in this collection"
        message="Items that match these saved filters, plus manual additions, will appear here."
      />
    );

  return (
    <Surface style={[styles.container, { backgroundColor: colors.background }]} collapsable={false}>
      <Stack.Screen
        options={createLightweightHeaderScreenOptions({
          backgroundColor: colors.background,
          tintColor: colors.text,
          screenTitle: collectionTitle,
          showScreenTitle: collectionQuery.isLoading || Boolean(activeError) || showCollapsedTitle,
        })}
      />

      <FlatList
        ref={listRef}
        data={collectionQuery.isLoading || isLoading || activeError ? [] : collectionItems}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        style={styles.list}
        contentContainerStyle={styles.listContent}
        contentInsetAdjustmentBehavior="automatic"
        showsVerticalScrollIndicator={false}
        onScroll={handleScroll}
        scrollEventThrottle={32}
        onEndReached={handleEndReached}
        onEndReachedThreshold={0.6}
        ListHeaderComponent={
          <View style={styles.listHeader}>
            <Text style={[styles.headerTitle, { color: colors.text }]}>{collectionTitle}</Text>
            {collection?.description ? (
              <Text style={[styles.description, { color: colors.textSubheader }]}>
                {collection.description}
              </Text>
            ) : null}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.ruleChipContainer}
            >
              {ruleChips.map((chip, index) => (
                <View
                  key={`${chip}-${index}`}
                  style={[
                    styles.ruleChip,
                    {
                      backgroundColor: colors.backgroundSecondary,
                      borderColor: colors.border,
                    },
                  ]}
                >
                  <Text style={[styles.ruleChipText, { color: colors.textSubheader }]}>{chip}</Text>
                </View>
              ))}
            </ScrollView>
          </View>
        }
        ListEmptyComponent={listEmptyComponent}
        ListFooterComponent={
          <View style={styles.listFooter}>
            {!collectionQuery.isLoading && !isLoading && !activeError && isFetchingNextPage ? (
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
  description: {
    ...Typography.bodyMedium,
    paddingHorizontal: Spacing.md,
    marginTop: Spacing.xs,
  },
  ruleChipContainer: {
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.md,
    gap: Spacing.sm,
  },
  ruleChip: {
    borderWidth: 1,
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  ruleChipText: {
    ...Typography.labelMedium,
  },
  listFooter: {
    minHeight: Spacing['3xl'],
    alignItems: 'center',
    justifyContent: 'center',
  },
});
