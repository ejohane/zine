import { useMemo, useState } from 'react';
import { Alert, FlatList, StyleSheet, TextInput, View } from 'react-native';
import { Stack } from 'expo-router';

import { LoadingState } from '@/components/list-states';
import { Button, Surface, Text } from '@/components/primitives';
import {
  IntegrationCard,
  SourceEmptyState,
  SourceHero,
  SourceSearchField,
  SourceSectionHeader,
  SourceSubscriptionRow,
} from '@/components/subscriptions';
import { Spacing } from '@/constants/theme';
import { useAppTheme } from '@/hooks/use-app-theme';
import { useRssFeeds, type RssFeed } from '@/hooks/use-rss-feeds';
import {
  formatSourceCount,
  getHubStatusText,
  getIntegrationCardCopy,
  getSubscriptionSourceConfig,
} from '@/lib/subscription-sources';

export default function RssSubscriptionsScreen() {
  const { colors } = useAppTheme();
  const {
    feeds,
    stats,
    isLoading,
    isSyncing,
    addingFeed,
    addFeed,
    pauseFeed,
    resumeFeed,
    removeFeed,
    syncFeedNow,
  } = useRssFeeds();

  const [feedUrl, setFeedUrl] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  const sourceConfig = getSubscriptionSourceConfig('RSS');
  const integrationCopy = getIntegrationCardCopy('RSS', 'manual');

  const sortedFeeds = useMemo(
    () => [...feeds].sort((left, right) => (right.updatedAt ?? 0) - (left.updatedAt ?? 0)),
    [feeds]
  );

  const filteredFeeds = useMemo(() => {
    if (!searchQuery.trim()) {
      return sortedFeeds;
    }

    const normalizedQuery = searchQuery.trim().toLowerCase();
    return sortedFeeds.filter((feed) =>
      [feed.title, feed.feedUrl].some((value) => value?.toLowerCase().includes(normalizedQuery))
    );
  }, [searchQuery, sortedFeeds]);

  const heroSummary = getHubStatusText('RSS', 'manual', stats?.active ?? feeds.length);

  const handleAdd = () => {
    const trimmedUrl = feedUrl.trim();
    if (!trimmedUrl) {
      Alert.alert('Missing URL', 'Enter an RSS feed URL.');
      return;
    }

    addFeed(
      { feedUrl: trimmedUrl },
      {
        onSuccess: () => setFeedUrl(''),
        onError: (error: Error) => {
          Alert.alert('Failed to add feed', error.message || 'Unable to add the RSS feed.');
        },
      }
    );
  };

  const handlePause = (feed: RssFeed) => {
    pauseFeed(
      { feedId: feed.id },
      {
        onError: (error: Error) => {
          Alert.alert('Pause failed', error.message || 'Unable to pause this feed.');
        },
      }
    );
  };

  const handleResume = (feed: RssFeed) => {
    resumeFeed(
      { feedId: feed.id },
      {
        onError: (error: Error) => {
          Alert.alert('Resume failed', error.message || 'Unable to resume this feed.');
        },
      }
    );
  };

  const handleSyncNow = (feed: RssFeed) => {
    syncFeedNow(
      { feedId: feed.id },
      {
        onError: (error: Error) => {
          Alert.alert('Sync failed', error.message || 'Unable to sync this feed.');
        },
      }
    );
  };

  const handleRemove = (feed: RssFeed) => {
    Alert.alert('Remove feed', `Stop syncing ${feed.title || feed.feedUrl}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: () =>
          removeFeed(
            { feedId: feed.id },
            {
              onError: (error: Error) => {
                Alert.alert('Remove failed', error.message || 'Unable to remove this feed.');
              },
            }
          ),
      },
    ]);
  };

  if (isLoading) {
    return (
      <>
        <Stack.Screen options={{ title: sourceConfig.name }} />
        <Surface tone="canvas" style={styles.container}>
          <LoadingState message="Loading RSS subscriptions..." />
        </Surface>
      </>
    );
  }

  return (
    <>
      <Stack.Screen options={{ title: sourceConfig.name }} />
      <Surface tone="canvas" style={styles.container} collapsable={false}>
        <FlatList
          style={styles.list}
          data={filteredFeeds}
          keyExtractor={(item) => item.id}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.content}
          contentInsetAdjustmentBehavior="automatic"
          ListHeaderComponent={
            <View style={styles.header}>
              <SourceHero source="RSS" summary={heroSummary} />

              <IntegrationCard
                source="RSS"
                state="manual"
                title={integrationCopy.title}
                description={integrationCopy.description}
              />

              <Surface tone="elevated" border="subtle" radius="xl" style={styles.addCard}>
                <SourceSectionHeader
                  eyebrow="Subscriptions"
                  title="Subscriptions"
                  summary={buildFeedSummary(filteredFeeds.length, stats)}
                />
                <SourceSearchField
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                  placeholder={sourceConfig.searchPlaceholder}
                />
                <Text variant="labelSmallPlain" tone="tertiary" transform="uppercase">
                  Add a subscription
                </Text>
                <Surface tone="subtle" border="default" radius="xl" style={styles.feedInputRow}>
                  <TextInput
                    value={feedUrl}
                    onChangeText={setFeedUrl}
                    placeholder="https://example.com/feed.xml"
                    placeholderTextColor={colors.textTertiary}
                    autoCapitalize="none"
                    autoCorrect={false}
                    accessibilityLabel="RSS feed URL"
                    style={[styles.feedInput, { color: colors.textPrimary }]}
                  />
                  <Button
                    label="Add"
                    onPress={handleAdd}
                    loading={addingFeed}
                    size="sm"
                    fullWidth={false}
                  />
                </Surface>
              </Surface>
            </View>
          }
          ListEmptyComponent={
            <SourceEmptyState
              title={
                searchQuery.trim()
                  ? 'No subscriptions match your search'
                  : 'No RSS subscriptions yet'
              }
              message={
                searchQuery.trim()
                  ? 'Try a different search term to find an existing feed.'
                  : 'Paste a feed URL above to start syncing new articles into your inbox.'
              }
            />
          }
          renderItem={({ item }) => (
            <SourceSubscriptionRow
              source="RSS"
              title={item.title || item.feedUrl}
              subtitle={item.title ? item.feedUrl : null}
              meta={formatLastSync(item.lastSuccessAt)}
              statusLabel={toStatusLabel(item)}
              primaryActionLabel="Sync now"
              onPrimaryAction={() => handleSyncNow(item)}
              primaryActionVariant="secondary"
              primaryActionLoading={isSyncing}
              secondaryActionLabel={
                item.status === 'PAUSED' || item.status === 'ERROR' ? 'Resume' : 'Pause'
              }
              onSecondaryAction={() =>
                item.status === 'PAUSED' || item.status === 'ERROR'
                  ? handleResume(item)
                  : handlePause(item)
              }
              tertiaryActionLabel="Remove"
              onTertiaryAction={() => handleRemove(item)}
            />
          )}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
        />
      </Surface>
    </>
  );
}

function formatLastSync(value: number | null): string {
  if (!value) {
    return 'Never synced';
  }

  return `Last synced ${new Date(value).toLocaleString()}`;
}

function buildFeedSummary(
  visibleCount: number,
  stats: { active?: number; paused?: number; error?: number } | undefined
) {
  const parts = [formatSourceCount('RSS', visibleCount)];

  if ((stats?.paused ?? 0) > 0) {
    parts.push(`${stats?.paused} paused`);
  }

  if ((stats?.error ?? 0) > 0) {
    parts.push(`${stats?.error} error`);
  }

  return parts.join(' · ');
}

function toStatusLabel(feed: RssFeed) {
  if (feed.status === 'ERROR') {
    return 'Error';
  }

  if (feed.status === 'PAUSED') {
    return 'Paused';
  }

  return 'Active';
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  list: {
    flex: 1,
  },
  content: {
    flexGrow: 1,
    padding: Spacing.lg,
    gap: Spacing.md,
    paddingBottom: Spacing['3xl'],
  },
  header: {
    gap: Spacing.md,
    marginBottom: Spacing.md,
  },
  addCard: {
    gap: Spacing.sm,
    padding: Spacing.lg,
  },
  feedInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  feedInput: {
    flex: 1,
    paddingVertical: 0,
  },
  separator: {
    height: Spacing.sm,
  },
});
