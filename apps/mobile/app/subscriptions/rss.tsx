import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Stack } from 'expo-router';
import { Surface } from 'heroui-native';

import { Colors, Radius, Spacing, Typography } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useRssFeeds, type RssFeed } from '@/hooks/use-rss-feeds';

function formatLastSync(value: number | null): string {
  if (!value) {
    return 'Never synced';
  }
  return `Synced ${new Date(value).toLocaleString()}`;
}

function FeedRow(props: {
  feed: RssFeed;
  onPause: () => void;
  onResume: () => void;
  onRemove: () => void;
  onSyncNow: () => void;
  busy: boolean;
  colors: typeof Colors.dark;
}) {
  const { feed, onPause, onResume, onRemove, onSyncNow, busy, colors } = props;
  const isPaused = feed.status === 'PAUSED' || feed.status === 'ERROR';
  const primaryActionLabel = isPaused ? 'Resume' : 'Pause';
  const primaryAction = isPaused ? onResume : onPause;

  return (
    <View style={[styles.feedRow, { borderColor: colors.border, backgroundColor: colors.card }]}>
      <View style={styles.feedHeader}>
        <Text style={[styles.feedTitle, { color: colors.text }]} numberOfLines={1}>
          {feed.title || feed.feedUrl}
        </Text>
        <Text style={[styles.feedStatus, { color: colors.textTertiary }]}>{feed.status}</Text>
      </View>

      <Text style={[styles.feedUrl, { color: colors.textSecondary }]} numberOfLines={1}>
        {feed.feedUrl}
      </Text>

      <Text style={[styles.feedMeta, { color: colors.textTertiary }]}>
        {formatLastSync(feed.lastSuccessAt)}
      </Text>

      {feed.lastError ? (
        <Text style={[styles.feedError, { color: colors.error }]} numberOfLines={2}>
          {feed.lastError}
        </Text>
      ) : null}

      <View style={styles.feedActions}>
        <Pressable
          onPress={onSyncNow}
          disabled={busy}
          accessibilityRole="button"
          accessibilityLabel={`Sync ${feed.title || feed.feedUrl} now`}
          style={({ pressed }) => [
            styles.secondaryButton,
            { backgroundColor: colors.backgroundTertiary },
            pressed && { opacity: 0.8 },
            busy && { opacity: 0.5 },
          ]}
        >
          {busy ? (
            <ActivityIndicator size="small" color={colors.text} />
          ) : (
            <Text style={[styles.secondaryButtonText, { color: colors.text }]}>Sync now</Text>
          )}
        </Pressable>

        <Pressable
          onPress={primaryAction}
          disabled={busy}
          accessibilityRole="button"
          accessibilityLabel={`${primaryActionLabel} ${feed.title || feed.feedUrl}`}
          style={({ pressed }) => [
            styles.secondaryButton,
            { backgroundColor: colors.backgroundTertiary },
            pressed && { opacity: 0.8 },
            busy && { opacity: 0.5 },
          ]}
        >
          <Text style={[styles.secondaryButtonText, { color: colors.text }]}>
            {primaryActionLabel}
          </Text>
        </Pressable>

        <Pressable
          onPress={onRemove}
          disabled={busy}
          accessibilityRole="button"
          accessibilityLabel={`Remove ${feed.title || feed.feedUrl}`}
          style={({ pressed }) => [
            styles.secondaryButton,
            { backgroundColor: colors.backgroundTertiary },
            pressed && { opacity: 0.8 },
            busy && { opacity: 0.5 },
          ]}
        >
          <Text style={[styles.secondaryButtonText, { color: colors.error }]}>Remove</Text>
        </Pressable>
      </View>
    </View>
  );
}

export default function RssSubscriptionsScreen() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'dark'];
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

  const sortedFeeds = useMemo(
    () => [...feeds].sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0)),
    [feeds]
  );

  const handleAdd = () => {
    const trimmed = feedUrl.trim();
    if (!trimmed) {
      Alert.alert('Missing URL', 'Enter an RSS feed URL.');
      return;
    }

    addFeed(
      { feedUrl: trimmed },
      {
        onSuccess: () => setFeedUrl(''),
        onError: (error: Error) => {
          Alert.alert('Failed to add feed', error.message || 'Unable to add RSS feed.');
        },
      }
    );
  };

  const handlePause = (feed: RssFeed) => {
    pauseFeed(
      { feedId: feed.id },
      {
        onError: (error: Error) => {
          Alert.alert('Pause failed', error.message || 'Unable to pause feed.');
        },
      }
    );
  };

  const handleResume = (feed: RssFeed) => {
    resumeFeed(
      { feedId: feed.id },
      {
        onError: (error: Error) => {
          Alert.alert('Resume failed', error.message || 'Unable to resume feed.');
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
                Alert.alert('Remove failed', error.message || 'Unable to remove feed.');
              },
            }
          ),
      },
    ]);
  };

  const handleSyncNow = (feed: RssFeed) => {
    syncFeedNow(
      { feedId: feed.id },
      {
        onError: (error: Error) => {
          Alert.alert('Sync failed', error.message || 'Unable to sync RSS feed.');
        },
      }
    );
  };

  return (
    <>
      <Stack.Screen
        options={{
          title: 'RSS Feeds',
        }}
      />
      <Surface style={[styles.container, { backgroundColor: colors.background }]}>
        <FlatList
          data={sortedFeeds}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.content}
          contentInsetAdjustmentBehavior="automatic"
          keyboardShouldPersistTaps="handled"
          ListHeaderComponent={
            <View style={styles.header}>
              <Text style={[styles.heading, { color: colors.text }]}>Add RSS feed</Text>
              <TextInput
                value={feedUrl}
                onChangeText={setFeedUrl}
                placeholder="https://example.com/feed.xml"
                placeholderTextColor={colors.textTertiary}
                autoCapitalize="none"
                autoCorrect={false}
                accessibilityLabel="RSS feed URL"
                style={[
                  styles.input,
                  {
                    borderColor: colors.border,
                    color: colors.text,
                    backgroundColor: colors.backgroundSecondary,
                  },
                ]}
              />
              <Pressable
                onPress={handleAdd}
                disabled={addingFeed}
                accessibilityRole="button"
                accessibilityLabel="Add RSS feed"
                style={({ pressed }) => [
                  styles.addButton,
                  { backgroundColor: colors.buttonPrimary },
                  pressed && { opacity: 0.85 },
                  addingFeed && { opacity: 0.5 },
                ]}
              >
                {addingFeed ? (
                  <ActivityIndicator size="small" color={colors.buttonPrimaryText} />
                ) : (
                  <Text style={[styles.addButtonText, { color: colors.buttonPrimaryText }]}>
                    Add feed
                  </Text>
                )}
              </Pressable>

              <View style={styles.statsRow}>
                <Text style={[styles.statsText, { color: colors.textSecondary }]}>
                  {stats?.active ?? 0} active
                </Text>
                <Text style={[styles.statsText, { color: colors.textSecondary }]}>
                  {stats?.paused ?? 0} paused
                </Text>
                <Text style={[styles.statsText, { color: colors.textSecondary }]}>
                  {stats?.error ?? 0} error
                </Text>
              </View>
            </View>
          }
          renderItem={({ item }) => (
            <FeedRow
              feed={item}
              onPause={() => handlePause(item)}
              onResume={() => handleResume(item)}
              onRemove={() => handleRemove(item)}
              onSyncNow={() => handleSyncNow(item)}
              busy={isSyncing}
              colors={colors}
            />
          )}
          ListEmptyComponent={
            isLoading ? (
              <View style={styles.emptyState}>
                <ActivityIndicator size="large" color={colors.primary} />
              </View>
            ) : (
              <View style={styles.emptyState}>
                <Text style={[styles.emptyTitle, { color: colors.text }]}>No RSS feeds yet</Text>
                <Text style={[styles.emptyDescription, { color: colors.textSecondary }]}>
                  Add a feed URL to start receiving new articles in your inbox.
                </Text>
              </View>
            )
          }
        />
      </Surface>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: Spacing.lg,
    gap: Spacing.md,
    paddingBottom: Spacing['3xl'],
  },
  header: {
    marginBottom: Spacing.md,
    gap: Spacing.sm,
  },
  heading: {
    ...Typography.titleMedium,
    fontWeight: '700',
  },
  input: {
    borderWidth: 1,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    ...Typography.bodyMedium,
  },
  addButton: {
    borderRadius: Radius.md,
    paddingVertical: Spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addButtonText: {
    ...Typography.labelLarge,
    fontWeight: '700',
  },
  statsRow: {
    flexDirection: 'row',
    gap: Spacing.md,
    marginTop: Spacing.xs,
  },
  statsText: {
    ...Typography.bodySmall,
  },
  feedRow: {
    borderWidth: 1,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    gap: Spacing.xs,
  },
  feedHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  feedTitle: {
    ...Typography.titleSmall,
    flex: 1,
  },
  feedStatus: {
    ...Typography.labelSmall,
    textTransform: 'uppercase',
  },
  feedUrl: {
    ...Typography.bodySmall,
  },
  feedMeta: {
    ...Typography.bodySmall,
  },
  feedError: {
    ...Typography.bodySmall,
  },
  feedActions: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginTop: Spacing.sm,
  },
  secondaryButton: {
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
  },
  secondaryButtonText: {
    ...Typography.labelMedium,
    fontWeight: '600',
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing['4xl'],
    paddingHorizontal: Spacing.lg,
  },
  emptyTitle: {
    ...Typography.titleMedium,
    marginBottom: Spacing.sm,
  },
  emptyDescription: {
    ...Typography.bodyMedium,
    textAlign: 'center',
  },
});
