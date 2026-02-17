import { useEffect, useMemo, useState } from 'react';

import { Stack } from 'expo-router';
import { Surface } from 'heroui-native';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { type ItemCardData, ItemCard } from '@/components/item-card';
import { EmptyState, ErrorState, LoadingState } from '@/components/list-states';
import { Colors, Spacing } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { mapContentType, mapProvider, useLibraryItems } from '@/hooks/use-items-trpc';
import type { ContentType, Provider } from '@/lib/content-utils';

export default function SearchTabScreen() {
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
        thumbnailUrl: item.thumbnailUrl ?? null,
        contentType: mapContentType(item.contentType) as ContentType,
        provider: mapProvider(item.provider) as Provider,
        duration: item.duration ?? null,
        bookmarkedAt: item.bookmarkedAt ?? null,
        publishedAt: item.publishedAt ?? null,
        isFinished: item.isFinished,
      })),
    [data?.items]
  );

  return (
    <Surface style={[styles.container, { backgroundColor: colors.background }]}>
      <Stack.Screen
        options={{
          title: 'Search',
          headerSearchBarOptions: {
            placeholder: 'Search your library',
            hideWhenScrolling: false,
            onChangeText: (event) => {
              setSearchQuery(event.nativeEvent.text);
            },
          },
        }}
      />

      <SafeAreaView style={styles.safeArea} edges={['left', 'right']}>
        {isLoading ? (
          <LoadingState />
        ) : error ? (
          <ErrorState message={error.message} />
        ) : libraryItems.length === 0 ? (
          <EmptyState
            title={debouncedSearchQuery ? 'No matches found' : 'Search your library'}
            message={
              debouncedSearchQuery
                ? 'Try a different title or creator name.'
                : 'Type in the search bar to find saved items by title or creator.'
            }
          />
        ) : (
          <ScrollView
            style={styles.listContainer}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
          >
            {libraryItems.map((item, index) => (
              <ItemCard key={item.id} item={item} variant="compact" index={index} />
            ))}
            <View style={styles.bottomSpacer} />
          </ScrollView>
        )}
      </SafeAreaView>
    </Surface>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  listContainer: {
    flex: 1,
  },
  listContent: {
    paddingTop: Spacing.md,
    paddingBottom: Spacing['3xl'],
  },
  bottomSpacer: {
    height: Spacing.lg,
  },
});
