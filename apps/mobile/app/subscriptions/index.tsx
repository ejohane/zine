import { useMemo } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Stack, useNavigation, useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { LoadingState } from '@/components/list-states';
import { Surface, Text } from '@/components/primitives';
import { SourceListRow } from '@/components/subscriptions';
import { Spacing } from '@/constants/theme';
import { useAppTheme } from '@/hooks/use-app-theme';
import { useConnections, type Connection } from '@/hooks/use-connections';
import { useSubscriptions } from '@/hooks/use-subscriptions';
import { type ConnectionStatus } from '@/lib/connection-status';
import {
  createLightweightHeaderScreenOptions,
  useCollapsedHeaderTitle,
} from '@/lib/native-large-title-header';
import { getSubscriptionIntegrationAttention } from '@/lib/subscription-integration-attention';
import {
  getHubStatusText,
  getIntegrationState,
  getSubscriptionSourceConfig,
  type SubscriptionSource,
} from '@/lib/subscription-sources';
import { trpc } from '@/lib/trpc';

const SUBSCRIPTION_SOURCES: SubscriptionSource[] = ['YOUTUBE', 'SPOTIFY', 'GMAIL', 'X', 'RSS'];

export default function SubscriptionsScreen() {
  const navigation = useNavigation();
  const router = useRouter();
  const { colors } = useAppTheme();
  const { handleScroll, showCollapsedTitle } = useCollapsedHeaderTitle();
  const canGoBack = navigation.canGoBack();
  const headerLeft = canGoBack
    ? () => (
        <Pressable
          accessibilityLabel="Go back"
          onPress={() => router.back()}
          hitSlop={8}
          style={styles.headerBack}
        >
          <Ionicons name="chevron-back" size={28} color={colors.textPrimary} />
        </Pressable>
      )
    : undefined;

  const { data: connections, isLoading: connectionsLoading } = useConnections();
  const { subscriptions, isLoading: subscriptionsLoading } = useSubscriptions();
  const newsletterStatsQuery = trpc.subscriptions.newsletters.stats.useQuery(undefined, {
    staleTime: 60 * 1000,
  });
  const rssStatsQuery = trpc.subscriptions.rss.stats.useQuery(undefined, {
    staleTime: 60 * 1000,
  });
  const xBookmarksStatusQuery = trpc.subscriptions.xBookmarks.status.useQuery(undefined, {
    staleTime: 60 * 1000,
  });

  const isLoading =
    connectionsLoading ||
    subscriptionsLoading ||
    newsletterStatsQuery.isLoading ||
    rssStatsQuery.isLoading ||
    xBookmarksStatusQuery.isLoading;

  const youtubeStatus = getConnectionStatus(connections, 'YOUTUBE');
  const spotifyStatus = getConnectionStatus(connections, 'SPOTIFY');
  const gmailStatus = getConnectionStatus(connections, 'GMAIL');
  const xStatus = getConnectionStatus(connections, 'X');

  const youtubeCount = subscriptions.filter(
    (subscription) => subscription.provider === 'YOUTUBE'
  ).length;
  const spotifyCount = subscriptions.filter(
    (subscription) => subscription.provider === 'SPOTIFY'
  ).length;
  const gmailCount = newsletterStatsQuery.data?.active ?? 0;
  const xCount = xBookmarksStatusQuery.data?.importedCount ?? 0;
  const rssCount = rssStatsQuery.data?.active ?? 0;
  const attentionProviders = useMemo(
    () => new Set(getSubscriptionIntegrationAttention(connections, subscriptions).providers),
    [connections, subscriptions]
  );

  const sourceRows = useMemo(
    () =>
      SUBSCRIPTION_SOURCES.map((source) => {
        const count =
          source === 'YOUTUBE'
            ? youtubeCount
            : source === 'SPOTIFY'
              ? spotifyCount
              : source === 'GMAIL'
                ? gmailCount
                : source === 'X'
                  ? xCount
                  : rssCount;
        const status =
          source === 'YOUTUBE'
            ? youtubeStatus
            : source === 'SPOTIFY'
              ? spotifyStatus
              : source === 'GMAIL'
                ? gmailStatus
                : source === 'X'
                  ? xStatus
                  : null;
        const needsAttention = source !== 'RSS' && attentionProviders.has(source);
        const integrationState = needsAttention
          ? 'needsAttention'
          : getIntegrationState(source, status);

        return {
          source,
          route: getSubscriptionSourceConfig(source).route,
          summary: getHubStatusText(source, integrationState, count),
          needsAttention,
        };
      }),
    [
      attentionProviders,
      gmailCount,
      gmailStatus,
      rssCount,
      spotifyCount,
      spotifyStatus,
      xCount,
      xStatus,
      youtubeCount,
      youtubeStatus,
    ]
  );

  return (
    <Surface tone="canvas" style={styles.container} collapsable={false}>
      <Stack.Screen
        options={createLightweightHeaderScreenOptions({
          backgroundColor: colors.surfaceCanvas,
          tintColor: colors.textPrimary,
          screenTitle: 'Subscriptions',
          showScreenTitle: isLoading || showCollapsedTitle,
          headerLeft,
        })}
      />
      {isLoading ? (
        <LoadingState />
      ) : (
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.content}
          contentInsetAdjustmentBehavior="automatic"
          onScroll={handleScroll}
          scrollEventThrottle={32}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.screenHeader}>
            <Text variant="displayMedium">Subscriptions</Text>
            <Text variant="bodyMedium" tone="subheader">
              Manage your sources and integrations.
            </Text>
          </View>

          <View style={styles.rows}>
            {sourceRows.map((row) => (
              <SourceListRow
                key={row.source}
                source={row.source}
                summary={row.summary}
                needsAttention={row.needsAttention}
                attentionTestID={`subscriptions-${row.source.toLowerCase()}-attention-dot`}
                onPress={() => router.push(row.route)}
              />
            ))}
          </View>
        </ScrollView>
      )}
    </Surface>
  );
}

function getConnectionStatus(
  connections: Connection[] | undefined,
  provider: Connection['provider']
): ConnectionStatus {
  return connections?.find((connection) => connection.provider === provider)?.status ?? null;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  content: {
    flexGrow: 1,
    paddingHorizontal: Spacing.lg,
    gap: Spacing.md,
    paddingBottom: Spacing['3xl'],
    paddingTop: Spacing.sm,
  },
  screenHeader: {
    gap: Spacing.xs,
  },
  headerBack: {
    marginLeft: -Spacing.xs,
  },
  rows: {
    gap: Spacing.sm,
  },
});
