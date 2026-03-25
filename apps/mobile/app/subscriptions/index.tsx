import { useMemo } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Stack, useNavigation, useRouter } from 'expo-router';
import { ScrollView, StyleSheet, View } from 'react-native';

import { LoadingState } from '@/components/list-states';
import { IconButton, Surface, Text } from '@/components/primitives';
import { SourceListRow } from '@/components/subscriptions';
import { Radius, Spacing } from '@/constants/theme';
import { useAppTheme } from '@/hooks/use-app-theme';
import { useConnections, type Connection } from '@/hooks/use-connections';
import { useSubscriptions } from '@/hooks/use-subscriptions';
import { isReconnectRequired, type ConnectionStatus } from '@/lib/connection-status';
import {
  buildSubscriptionsSummary,
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
  const { colors } = useAppTheme();
  const canGoBack = navigation.canGoBack();
  const headerLeft = canGoBack
    ? () => (
        <View style={styles.headerLeftWrapper}>
          <IconButton
            size="sm"
            variant="subtle"
            colors={colors}
            style={[styles.headerBackButton, { backgroundColor: colors.backgroundSecondary }]}
            accessibilityLabel="Go back"
            onPress={() => router.back()}
          >
            <Ionicons name="chevron-back" size={20} color={colors.text} />
          </IconButton>
        </View>
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

  const totalActiveCount = youtubeCount + spotifyCount + gmailCount + rssCount;
  const connectedIntegrations =
    connections?.filter((connection: Connection) => connection.status === 'ACTIVE').length ?? 0;
  const attentionCount =
    connections?.filter((connection: Connection) => isReconnectRequired(connection.status))
      .length ?? 0;

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
        <Stack.Screen
          options={{
            headerLeft,
          }}
        />
        <Surface tone="canvas" style={styles.container}>
          <LoadingState />
        </Surface>
      </>
    );
  }

  return (
    <>
      <Stack.Screen
        options={{
          headerLeft,
        }}
      />
      <Surface tone="canvas" style={styles.container} collapsable={false}>
        <ScrollView
          contentContainerStyle={styles.content}
          contentInsetAdjustmentBehavior="automatic"
          showsVerticalScrollIndicator={false}
        >
          <Surface tone="elevated" border="subtle" radius="xl" style={styles.hero}>
            <Text variant="labelSmallPlain" tone="tertiary" transform="uppercase">
              Subscriptions
            </Text>
            <Text variant="headlineSmall">Manage each source in one place</Text>
            <Text variant="bodyMedium" tone="subheader">
              {buildSubscriptionsSummary(totalActiveCount, connectedIntegrations, attentionCount)}
            </Text>
          </Surface>

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
  content: {
    paddingHorizontal: Spacing.lg,
    gap: Spacing.lg,
    paddingBottom: Spacing['3xl'],
  },
  headerBackButton: {
    width: 40,
    height: 40,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerLeftWrapper: {
    marginLeft: Spacing.md,
    marginTop: Spacing.xs,
  },
  hero: {
    gap: Spacing.sm,
    marginTop: Spacing.sm,
    padding: Spacing.lg,
  },
  rows: {
    gap: Spacing.md,
  },
});
