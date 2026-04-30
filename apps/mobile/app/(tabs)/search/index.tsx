import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { Stack, useNavigation } from 'expo-router';
import { Surface } from 'heroui-native';
import { FlatList, type ListRenderItemInfo, StyleSheet, View } from 'react-native';
import type { SearchBarCommands } from 'react-native-screens';

import { type ItemCardData, ItemCard } from '@/components/item-card';
import { EmptyState, ErrorState, LoadingState } from '@/components/list-states';
import { Colors, Spacing } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { mapContentType, mapProvider, type ContentType, type Provider } from '@/lib/content-utils';
import { useSearchResults, type CreatorSearchResult } from '@/hooks/use-search';
import { createLightweightHeaderScreenOptions } from '@/lib/native-large-title-header';
import { CreatorResultRow } from './creator-result-row';

type SearchRow =
  | {
      type: 'creator';
      creator: CreatorSearchResult;
    }
  | {
      type: 'item';
      item: ItemCardData;
    };

export default function SearchTabScreen() {
  const navigation = useNavigation();
  const listScrollRef = useRef<FlatList<SearchRow>>(null);
  const searchBarRef = useRef<SearchBarCommands | null>(null);
  const focusSearchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
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

  const { data, isLoading, error } = useSearchResults(debouncedSearchQuery);

  const focusSearchBar = useCallback(() => {
    if (focusSearchTimeoutRef.current) {
      clearTimeout(focusSearchTimeoutRef.current);
    }

    focusSearchTimeoutRef.current = setTimeout(() => {
      searchBarRef.current?.focus();
      focusSearchTimeoutRef.current = null;
    }, 100);
  }, []);

  const searchRows: SearchRow[] = useMemo(
    () =>
      (data?.results ?? []).map((result) => {
        if (result.type === 'creator') {
          return {
            type: 'creator',
            creator: result,
          };
        }

        return {
          type: 'item',
          item: {
            id: result.id,
            title: result.title,
            creator: result.creator,
            creatorImageUrl: result.creatorImageUrl ?? null,
            thumbnailUrl: result.thumbnailUrl ?? null,
            contentType: mapContentType(result.contentType) as ContentType,
            provider: mapProvider(result.provider) as Provider,
            duration: result.duration ?? null,
            readingTimeMinutes: result.readingTimeMinutes ?? null,
            bookmarkedAt: result.bookmarkedAt ?? null,
            publishedAt: result.publishedAt ?? null,
            isFinished: result.isFinished,
          },
        };
      }),
    [data?.results]
  );

  useEffect(() => {
    const tabNavigation = navigation.getParent() ?? navigation;

    const removeTabPressListener = tabNavigation.addListener('tabPress', () => {
      if (!navigation.isFocused()) return;

      listScrollRef.current?.scrollToOffset({ offset: 0, animated: true });
      focusSearchBar();
    });

    const removeFocusListener = navigation.addListener('focus', focusSearchBar);

    return () => {
      if (focusSearchTimeoutRef.current) {
        clearTimeout(focusSearchTimeoutRef.current);
        focusSearchTimeoutRef.current = null;
      }
      removeTabPressListener();
      removeFocusListener();
    };
  }, [focusSearchBar, navigation]);

  const renderItem = useCallback(({ item, index }: ListRenderItemInfo<SearchRow>) => {
    if (item.type === 'creator') {
      return <CreatorResultRow creator={item.creator} />;
    }

    return <ItemCard item={item.item} shape="row" index={index} />;
  }, []);

  const isShowingState = isLoading || Boolean(error) || searchRows.length === 0;
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
        options={createLightweightHeaderScreenOptions({
          backgroundColor: colors.background,
          tintColor: colors.text,
          screenTitle: 'Search',
          headerSearchBarOptions: {
            ref: searchBarRef,
            autoFocus: true,
            placement: 'automatic',
            placeholder: 'Search your library',
            hideWhenScrolling: false,
            onChangeText: (event) => {
              setSearchQuery(event.nativeEvent.text);
            },
          },
        })}
      />

      <FlatList
        ref={listScrollRef}
        data={isShowingState ? [] : searchRows}
        keyExtractor={(item) =>
          item.type === 'creator' ? `creator:${item.creator.creatorId}` : `item:${item.item.id}`
        }
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
