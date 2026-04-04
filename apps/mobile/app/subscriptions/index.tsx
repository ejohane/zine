import { useMemo } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Stack, useNavigation, useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { LoadingState } from '@/components/list-states';
import { Surface } from '@/components/primitives';
import { SourceListRow } from '@/components/subscriptions';
import { Spacing } from '@/constants/theme';
import { useConnections, type Connection } from '@/hooks/use-connections';
import { useSubscriptions } from '@/hooks/use-subscriptions';
import { type ConnectionStatus } from '@/lib/connection-status';
import {
  getHubStatusText,
  getIntegrationState,
  getSubscriptionSourceConfig,
  type SubscriptionSource,
} from '@/lib/subscription-sources';
import { trpc } from '@/lib/trpc';

const SUBSCRIPTION_SOURCES: SubscriptionSource[] = ['YOUTUBE', 'SPOTIFY', 'GMAIL', 'RSS'];

export default function SubscriptionsScreen() {
  const navigation = useNavigation();
  const router = useRouter();
  const canGoBack = navigation.canGoBack();
  const headerLeft = canGoBack
    ? () => (
        <Pressable
          accessibilityLabel="Go back"
          onPress={() => router.back()}
          hitSlop={8}
          style={styles.headerBack}
        >
          <Ionicons name="chevron-back" size={28} color="#FFFFFF" />
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

  const isLoading =
    connectionsLoading ||
    subscriptionsLoading ||
    newsletterStatsQuery.isLoading ||
    rssStatsQuery.isLoading;

  const youtubeStatus = getConnectionStatus(connections, 'YOUTUBE');
  const spotifyStatus = getConnectionStatus(connections, 'SPOTIFY');
  const gmailStatus = getConnectionStatus(connections, 'GMAIL');

  const youtubeCount = subscriptions.filter(
    (subscription) => subscription.provider === 'YOUTUBE'
  ).length;
  const spotifyCount = subscriptions.filter(
    (subscription) => subscription.provider === 'SPOTIFY'
  ).length;
  const gmailCount = newsletterStatsQuery.data?.active ?? 0;
  const rssCount = rssStatsQuery.data?.active ?? 0;

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
                : rssCount;
        const status =
          source === 'YOUTUBE'
            ? youtubeStatus
            : source === 'SPOTIFY'
              ? spotifyStatus
              : source === 'GMAIL'
                ? gmailStatus
                : null;

        return {
          source,
          route: getSubscriptionSourceConfig(source).route,
          summary: getHubStatusText(source, getIntegrationState(source, status), count),
        };
      }),
    [gmailCount, gmailStatus, rssCount, spotifyCount, spotifyStatus, youtubeCount, youtubeStatus]
  );

  if (isLoading) {
    return (
      <>
        <Stack.Screen options={{ headerLeft }} />
        <Surface tone="canvas" style={styles.container}>
          <LoadingState />
        </Surface>
      </>
    );
  }

  return (
    <>
      <Stack.Screen options={{ headerLeft }} />
      <Surface tone="canvas" style={styles.container} collapsable={false}>
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.content}
          contentInsetAdjustmentBehavior="automatic"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.rows}>
            {sourceRows.map((row) => (
              <SourceListRow
                key={row.source}
                source={row.source}
                summary={row.summary}
                onPress={() => router.push(row.route)}
              />
            ))}
          </View>
        </ScrollView>
      </Surface>
    </>
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
  headerBack: {
    marginLeft: -Spacing.xs,
  },
  rows: {
    gap: Spacing.sm,
  },
});
