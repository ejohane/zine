import { Stack, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  StyleSheet,
  Text,
  View,
  type ListRenderItemInfo,
} from 'react-native';
import { Surface } from 'heroui-native';

import { ItemCard, type ItemCardData } from '@/components/item-card';
import { EmptyState, ErrorState, LoadingState } from '@/components/list-states';
import { Colors, Spacing, Typography } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { usePerson, usePersonItems } from '@/hooks/use-people';
import { mapContentType, mapProvider, type ContentType, type Provider } from '@/lib/content-utils';
import {
  createLightweightHeaderScreenOptions,
  useCollapsedHeaderTitle,
} from '@/lib/native-large-title-header';

const PAGE_SIZE = 20;

function formatCount(count: number): string {
  return `${count} saved ${count === 1 ? 'item' : 'items'}`;
}

function formatLatestSeen(value: number | null): string | null {
  if (typeof value !== 'number') return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return `Latest seen ${date.toLocaleDateString()}`;
}

function getInitials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

export default function PersonScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const personId = typeof id === 'string' ? id : '';
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'dark'];
  const { handleScroll, showCollapsedTitle } = useCollapsedHeaderTitle();
  const [profileImageFailed, setProfileImageFailed] = useState(false);

  const personQuery = usePerson(personId);
  const itemsQuery = usePersonItems(personId, { limit: PAGE_SIZE });

  const items: ItemCardData[] = useMemo(
    () =>
      (itemsQuery.data?.pages.flatMap((page) => page.items) ?? []).map((item) => ({
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
    [itemsQuery.data?.pages]
  );

  const handleEndReached = useCallback(() => {
    if (!itemsQuery.hasNextPage || itemsQuery.isFetchingNextPage) return;
    void itemsQuery.fetchNextPage();
  }, [itemsQuery]);

  const renderItem = useCallback(
    ({ item, index }: ListRenderItemInfo<ItemCardData>) => (
      <ItemCard item={item} shape="row" index={index} />
    ),
    []
  );

  const person = personQuery.data;
  const latestSeen = formatLatestSeen(person?.latestSeenAt ?? null);
  const initials = useMemo(() => getInitials(person?.displayName ?? ''), [person?.displayName]);
  const showProfileImage = Boolean(person?.profileImageUrl && !profileImageFailed);
  const isLoading = personQuery.isLoading || itemsQuery.isLoading;
  const error = personQuery.error ?? itemsQuery.error;

  useEffect(() => {
    setProfileImageFailed(false);
  }, [person?.profileImageUrl]);

  const header = person ? (
    <View style={styles.header}>
      <View style={[styles.avatar, { backgroundColor: colors.surfaceRaised }]}>
        {showProfileImage ? (
          <Image
            source={{ uri: person.profileImageUrl! }}
            style={styles.avatarImage}
            onError={() => setProfileImageFailed(true)}
            accessibilityIgnoresInvertColors
          />
        ) : (
          <Text style={[styles.avatarInitials, { color: colors.textSubheader }]}>{initials}</Text>
        )}
      </View>
      <View style={styles.headerText}>
        <Text style={[styles.title, { color: colors.text }]}>{person.displayName}</Text>
        <Text style={[styles.subtitle, { color: colors.textSubheader }]}>
          {[formatCount(person.itemCount), latestSeen].filter(Boolean).join(' · ')}
        </Text>
      </View>
    </View>
  ) : null;

  const empty = isLoading ? (
    <LoadingState />
  ) : error ? (
    <ErrorState message={error.message} onRetry={() => personQuery.refetch()} />
  ) : (
    <EmptyState
      title="No saved items"
      message="This person no longer appears in your active library."
    />
  );

  return (
    <Surface style={[styles.container, { backgroundColor: colors.background }]} collapsable={false}>
      <Stack.Screen
        options={createLightweightHeaderScreenOptions({
          backgroundColor: colors.background,
          tintColor: colors.text,
          screenTitle: person?.displayName ?? 'Person',
          showScreenTitle: Boolean(error) || showCollapsedTitle,
        })}
      />

      <FlatList
        data={isLoading || error ? [] : items}
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
        ListHeaderComponent={header}
        ListEmptyComponent={empty}
        ListFooterComponent={
          <View style={styles.footer}>
            {!isLoading && !error && itemsQuery.isFetchingNextPage ? (
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
  header: {
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarImage: {
    width: '100%',
    height: '100%',
  },
  avatarInitials: {
    ...Typography.titleMedium,
  },
  headerText: {
    flex: 1,
    minWidth: 0,
    gap: Spacing.xs,
  },
  title: {
    ...Typography.displayMedium,
  },
  subtitle: {
    ...Typography.bodyMedium,
  },
  footer: {
    minHeight: Spacing['3xl'],
    alignItems: 'center',
    justifyContent: 'center',
  },
});
