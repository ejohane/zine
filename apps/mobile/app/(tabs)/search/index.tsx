import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { Stack, useNavigation } from 'expo-router';
import { Surface } from 'heroui-native';
import { FlatList, type ListRenderItemInfo, StyleSheet, View } from 'react-native';

import { type ItemCardData, ItemCard } from '@/components/item-card';
import { EmptyState, ErrorState, LoadingState } from '@/components/list-states';
import { Colors, Spacing } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { mapContentType, mapProvider, useLibraryItems } from '@/hooks/use-items-trpc';
import type { ContentType, Provider } from '@/lib/content-utils';

export default function SearchTabScreen() {
  const navigation = useNavigation();
  const listScrollRef = useRef<FlatList<ItemCardData>>(null);
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];

  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('');

  useEffect(() => {
    const handle = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery.trim());
    }, 200);
    return () => clearTimeout(handle);
  }, [searchQuery]);

  const { data, isLoading, error } = useLibraryItems({
    search: debouncedSearchQuery || undefined,
  });

  const libraryItems: ItemCardData[] = useMemo(
    () =>
      (data?.items ?? []).map((item) => ({
        id: item.id,
        title: item.title,
        creator: item.creator,
        creatorImageUrl: item.creatorImageUrl ?? null,
        thumbnailUrl: item.thumbnailUrl ?? null,
        contentType: mapContentType(item.contentType) as ContentType,
        provider: mapProvider(item.provider) as Provider,
        duration: item.duration ?? null,
        readingTimeMinutes: item.readingTimeMinutes ?? null,
        bookmarkedAt: item.bookmarkedAt ?? null,
        publishedAt: item.publishedAt ?? null,
        isFinished: item.isFinished,
      })),
    [data?.items]
  );

  useEffect(() => {
    const tabNavigation = navigation.getParent() ?? navigation;

    return tabNavigation.addListener('tabPress', () => {
      if (!navigation.isFocused()) return;

      listScrollRef.current?.scrollToOffset({ offset: 0, animated: true });
    });
  }, [navigation]);

  const renderItem = useCallback(
    ({ item, index }: ListRenderItemInfo<ItemCardData>) => (
      <ItemCard item={item} shape="row" index={index} />
    ),
    []
  );

  const isShowingState = isLoading || Boolean(error) || libraryItems.length === 0;
  const listEmptyComponent = isLoading ? (
    <LoadingState />
  ) : error ? (
    <ErrorState message={error.message} />
  ) : (
    <EmptyState
      title={debouncedSearchQuery ? 'No matches found' : 'Search your library'}
      message={
        debouncedSearchQuery
          ? 'Try a different title or creator name.'
          : 'Type in the search bar to find saved items by title or creator.'
      }
    />
  );

  return (
    <Surface style={[styles.container, { backgroundColor: colors.background }]} collapsable={false}>
      <Stack.Screen
        options={{
          headerSearchBarOptions: {
            placement: 'automatic',
            placeholder: 'Search your library',
            hideWhenScrolling: false,
            onChangeText: (event) => {
              setSearchQuery(event.nativeEvent.text);
            },
          },
        }}
      />

      <FlatList
        ref={listScrollRef}
        data={isShowingState ? [] : libraryItems}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        style={styles.listContainer}
        contentContainerStyle={[styles.listContent, isShowingState && styles.emptyListContent]}
        contentInsetAdjustmentBehavior="automatic"
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={listEmptyComponent}
        ListFooterComponent={!isShowingState ? <View style={styles.bottomSpacer} /> : null}
      />
    </Surface>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  listContainer: {
    flex: 1,
  },
  listContent: {
    flexGrow: 1,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing['3xl'],
  },
  emptyListContent: {
    justifyContent: 'center',
  },
  bottomSpacer: {
    height: Spacing.lg,
  },
});
