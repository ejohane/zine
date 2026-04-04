import { useCallback, useMemo, useState } from 'react';
import { Alert, FlatList, StyleSheet, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter, type Href } from 'expo-router';

import { ErrorState, LoadingState } from '@/components/list-states';
import { Button, Surface } from '@/components/primitives';
import {
  IntegrationCard,
  SourceEmptyState,
  SourceHero,
  SourceSearchField,
  SourceSectionHeader,
  SourceSubscriptionRow,
} from '@/components/subscriptions';
import { Spacing } from '@/constants/theme';
import { useConnections, useDisconnectConnection, type Connection } from '@/hooks/use-connections';
import { useSubscriptions } from '@/hooks/use-subscriptions';
import { validateAndConvertProvider } from '@/lib/route-validation';
import {
  formatSourceCount,
  getHubStatusText,
  getIntegrationCardCopy,
  getIntegrationState,
  getSubscriptionSourceConfig,
} from '@/lib/subscription-sources';
import { trpc } from '@/lib/trpc';
import type { NewslettersListOutput } from '@/lib/trpc-types';

type Provider = 'YOUTUBE' | 'SPOTIFY' | 'GMAIL';
type NewsletterFeed = NewslettersListOutput['items'][number];
type ProviderSubscription = ReturnType<typeof useSubscriptions>['subscriptions'][number];
type UnifiedSubscription = {
  id: string;
  title: string;
  imageUrl: string | null;
  isSubscribed: boolean;
  subscriptionId?: string;
};

const SUBSTACK_FALLBACK_ICON_URL = 'https://substack.com/favicon.ico';

export default function ProviderDetailScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ provider: string }>();
  const utils = trpc.useUtils();

  const providerValidation = validateAndConvertProvider(params.provider);
  const provider: Provider = providerValidation.success ? providerValidation.data : 'YOUTUBE';
  const sourceConfig = getSubscriptionSourceConfig(provider);
  const connectRoute = `/subscriptions/connect/${provider.toLowerCase()}` as Href;

  const [searchQuery, setSearchQuery] = useState('');
  const [disconnectingProvider, setDisconnectingProvider] = useState<Provider | null>(null);
  const [processingIds, setProcessingIds] = useState<Set<string>>(new Set());

  const { data: connections, isLoading: connectionsLoading } = useConnections();
  const {
    subscriptions,
    subscribe,
    unsubscribe,
    isLoading: subscriptionsLoading,
  } = useSubscriptions();

  const connection = connections?.find((item: Connection) => item.provider === provider);
  const integrationState = getIntegrationState(provider, connection?.status ?? null);
  const isConnected = integrationState === 'connected';

  const discoverProvider = provider === 'SPOTIFY' ? 'SPOTIFY' : 'YOUTUBE';

  const discoverQuery = trpc.subscriptions.discover.available.useQuery(
    { provider: discoverProvider },
    {
      enabled: providerValidation.success && provider !== 'GMAIL' && isConnected,
      staleTime: 5 * 60 * 1000,
    }
  );

  const newslettersQuery = trpc.subscriptions.newsletters.list.useQuery(
    { limit: 100, search: searchQuery || undefined },
    {
      enabled: providerValidation.success && provider === 'GMAIL' && isConnected,
      staleTime: 60 * 1000,
    }
  );

  const newslettersSyncMutation = trpc.subscriptions.newsletters.syncNow.useMutation({
    onSuccess: () => {
      utils.subscriptions.newsletters.list.invalidate();
      utils.subscriptions.newsletters.stats.invalidate();
    },
    onError: (error: Error) => {
      Alert.alert('Sync failed', error.message || 'Failed to sync newsletters.');
    },
  });

  const updateNewsletterStatusMutation = trpc.subscriptions.newsletters.updateStatus.useMutation({
    onSuccess: () => {
      utils.subscriptions.newsletters.list.invalidate();
      utils.subscriptions.newsletters.stats.invalidate();
      utils.items.inbox.invalidate();
      utils.items.home.invalidate();
    },
    onError: (error: Error) => {
      Alert.alert('Update failed', error.message || 'Failed to update newsletter status.');
    },
  });

  const unsubscribeNewsletterMutation = trpc.subscriptions.newsletters.unsubscribe.useMutation({
    onSuccess: () => {
      utils.subscriptions.newsletters.list.invalidate();
      utils.subscriptions.newsletters.stats.invalidate();
    },
    onError: (error: Error) => {
      Alert.alert('Unsubscribe failed', error.message || 'Failed to unsubscribe from newsletter.');
    },
  });

  const disconnectMutation = useDisconnectConnection({
    onError: (error) => {
      Alert.alert('Disconnect failed', error.message || 'Failed to disconnect the integration.');
    },
    onSettled: () => {
      setDisconnectingProvider(null);
    },
  });

  const providerSubscriptions = useMemo(
    () => subscriptions.filter((subscription) => subscription.provider === provider),
    [provider, subscriptions]
  );

  const availableSubscriptions = useMemo(() => {
    if (!isConnected || provider === 'GMAIL') {
      return [];
    }

    const imported = providerSubscriptions.map((subscription) =>
      mapSubscriptionToUnifiedItem(subscription)
    );

    const discoverable = (discoverQuery.data?.items ?? [])
      .filter(
        (item) =>
          !providerSubscriptions.some((subscription) => subscription.providerChannelId === item.id)
      )
      .map((item) => ({
        id: item.id,
        title: item.name,
        imageUrl: item.imageUrl ?? null,
        isSubscribed: false,
      }));

    return [...imported, ...discoverable].sort((left, right) =>
      left.title.localeCompare(right.title)
    );
  }, [discoverQuery.data?.items, isConnected, provider, providerSubscriptions]);

  const filteredSubscriptions = useMemo(() => {
    if (!searchQuery.trim()) {
      return availableSubscriptions;
    }

    const normalizedQuery = searchQuery.trim().toLowerCase();
    return availableSubscriptions.filter((subscription) =>
      subscription.title.toLowerCase().includes(normalizedQuery)
    );
  }, [availableSubscriptions, searchQuery]);

  const newsletterFeeds = useMemo(
    () => newslettersQuery.data?.items ?? [],
    [newslettersQuery.data]
  );

  const displayedCount =
    provider === 'GMAIL' ? newsletterFeeds.length : availableSubscriptions.length;
  const hubSummary = getHubStatusText(provider, integrationState, displayedCount);
  const integrationCopy = getIntegrationCardCopy(provider, integrationState);
  const integrationDetail = buildIntegrationDetail(connection);

  const isLoading =
    connectionsLoading ||
    subscriptionsLoading ||
    (provider === 'GMAIL' ? newslettersQuery.isLoading : discoverQuery.isLoading);

  const isProcessingNewsletter =
    updateNewsletterStatusMutation.isPending || unsubscribeNewsletterMutation.isPending;

  const handleIntegrationAction = useCallback(() => {
    if (integrationState === 'connected') {
      Alert.alert(
        `Disconnect ${sourceConfig.providerLabel}`,
        `Disconnecting ${sourceConfig.providerLabel} will stop syncing new subscriptions until you reconnect.`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Disconnect',
            style: 'destructive',
            onPress: () => {
              setDisconnectingProvider(provider);
              disconnectMutation.mutate({ provider });
            },
          },
        ]
      );
      return;
    }

    router.push(connectRoute);
  }, [
    connectRoute,
    disconnectMutation,
    integrationState,
    provider,
    router,
    sourceConfig.providerLabel,
  ]);

  const handleSubscribe = useCallback(
    (subscription: UnifiedSubscription) => {
      if (processingIds.has(subscription.id)) {
        return;
      }

      setProcessingIds((current) => new Set(current).add(subscription.id));

      if (subscription.isSubscribed && subscription.subscriptionId) {
        unsubscribe({ subscriptionId: subscription.subscriptionId });
      } else {
        subscribe({
          provider,
          providerChannelId: subscription.id,
          name: subscription.title,
          imageUrl: subscription.imageUrl ?? undefined,
        });
      }

      setTimeout(() => {
        setProcessingIds((current) => {
          const next = new Set(current);
          next.delete(subscription.id);
          return next;
        });
      }, 1000);
    },
    [processingIds, provider, subscribe, unsubscribe]
  );

  const handleNewsletterStatus = useCallback(
    (feed: NewsletterFeed) => {
      if (!isConnected) {
        Alert.alert('Integration required', 'Reconnect Gmail before managing newsletters.');
        return;
      }

      const nextStatus = feed.status === 'ACTIVE' ? 'HIDDEN' : 'ACTIVE';
      updateNewsletterStatusMutation.mutate({
        feedId: feed.id,
        status: nextStatus,
      });
    },
    [isConnected, updateNewsletterStatusMutation]
  );

  const handleNewsletterUnsubscribe = useCallback(
    (feed: NewsletterFeed) => {
      if (!isConnected) {
        Alert.alert('Integration required', 'Reconnect Gmail before managing newsletters.');
        return;
      }

      Alert.alert(
        `Unsubscribe from ${feed.displayName}?`,
        'This keeps the sender in Zine, but marks the newsletter as unsubscribed.',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Unsubscribe',
            style: 'destructive',
            onPress: () => unsubscribeNewsletterMutation.mutate({ feedId: feed.id }),
          },
        ]
      );
    },
    [isConnected, unsubscribeNewsletterMutation]
  );

  const handleNewslettersSync = useCallback(() => {
    if (!isConnected) {
      Alert.alert('Integration required', 'Connect Gmail before syncing newsletters.');
      return;
    }

    newslettersSyncMutation.mutate();
  }, [isConnected, newslettersSyncMutation]);

  if (!providerValidation.success) {
    return (
      <>
        <Stack.Screen options={{ title: 'Invalid source' }} />
        <Surface tone="canvas" style={styles.container}>
          <ErrorState title="Invalid source" message={providerValidation.message} />
        </Surface>
      </>
    );
  }

  if (isLoading) {
    return (
      <>
        <Stack.Screen options={{ title: sourceConfig.name }} />
        <Surface tone="canvas" style={styles.container}>
          <LoadingState message={`Loading ${sourceConfig.name.toLowerCase()}...`} />
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
          data={provider === 'GMAIL' ? newsletterFeeds : filteredSubscriptions}
          keyExtractor={(item) => item.id}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.content}
          contentInsetAdjustmentBehavior="automatic"
          ListHeaderComponent={
            <View style={styles.header}>
              <SourceHero source={provider} summary={hubSummary} />

              <IntegrationCard
                source={provider}
                state={integrationState}
                title={integrationCopy.title}
                description={integrationCopy.description}
                detail={integrationDetail}
                actionLabel={integrationCopy.actionLabel}
                onAction={integrationCopy.actionLabel ? handleIntegrationAction : null}
                actionTone={integrationState === 'connected' ? 'danger' : 'default'}
                actionVariant={integrationState === 'connected' ? 'outline' : 'primary'}
                isBusy={disconnectingProvider === provider}
              />

              <View style={styles.section}>
                <SourceSectionHeader
                  eyebrow="Subscriptions"
                  title="Subscriptions"
                  summary={isConnected ? formatSourceCount(provider, displayedCount) : undefined}
                  trailing={
                    provider === 'GMAIL' && isConnected ? (
                      <Button
                        label="Sync now"
                        onPress={handleNewslettersSync}
                        loading={newslettersSyncMutation.isPending}
                        variant="secondary"
                        size="sm"
                      />
                    ) : null
                  }
                />
                {isConnected ? (
                  <SourceSearchField
                    value={searchQuery}
                    onChangeText={setSearchQuery}
                    placeholder={sourceConfig.searchPlaceholder}
                  />
                ) : null}
              </View>
            </View>
          }
          ListEmptyComponent={
            <SourceEmptyState
              title={getEmptyTitle(provider, integrationState, searchQuery)}
              message={getEmptyMessage(provider, integrationState, searchQuery)}
            />
          }
          renderItem={({ item }) =>
            provider === 'GMAIL' ? (
              <SourceSubscriptionRow
                source={provider}
                title={(item as NewsletterFeed).displayName}
                subtitle={(item as NewsletterFeed).fromAddress ?? null}
                imageUrl={getNewsletterImageUrl(item as NewsletterFeed)}
                statusLabel={getNewsletterStatusLabel(item as NewsletterFeed)}
                primaryActionLabel={getNewsletterPrimaryActionLabel(item as NewsletterFeed)}
                onPrimaryAction={() => handleNewsletterStatus(item as NewsletterFeed)}
                primaryActionVariant={getNewsletterPrimaryActionVariant(item as NewsletterFeed)}
                primaryActionLoading={isProcessingNewsletter}
                secondaryActionLabel={
                  (item as NewsletterFeed).status === 'UNSUBSCRIBED' ? null : 'Unsubscribe'
                }
                onSecondaryAction={
                  (item as NewsletterFeed).status === 'UNSUBSCRIBED'
                    ? null
                    : () => handleNewsletterUnsubscribe(item as NewsletterFeed)
                }
              />
            ) : (
              <SourceSubscriptionRow
                source={provider}
                title={(item as UnifiedSubscription).title}
                imageUrl={(item as UnifiedSubscription).imageUrl}
                statusLabel={(item as UnifiedSubscription).isSubscribed ? 'Subscribed' : null}
                primaryActionLabel={
                  (item as UnifiedSubscription).isSubscribed ? 'Remove' : 'Subscribe'
                }
                onPrimaryAction={() => handleSubscribe(item as UnifiedSubscription)}
                primaryActionVariant={
                  (item as UnifiedSubscription).isSubscribed ? 'secondary' : 'primary'
                }
                primaryActionLoading={processingIds.has((item as UnifiedSubscription).id)}
              />
            )
          }
          ItemSeparatorComponent={() => <View style={styles.separator} />}
        />
      </Surface>
    </>
  );
}

function mapSubscriptionToUnifiedItem(subscription: ProviderSubscription): UnifiedSubscription {
  return {
    id: subscription.providerChannelId,
    title: subscription.name,
    imageUrl: subscription.imageUrl ?? null,
    isSubscribed: true,
    subscriptionId: subscription.id,
  };
}

function buildIntegrationDetail(connection: Connection | undefined): string | null {
  if (!connection) {
    return null;
  }

  const detailParts = [];

  if (connection.providerUserId) {
    detailParts.push(connection.providerUserId);
  }

  detailParts.push(`Connected ${formatDate(connection.createdAt)}`);

  return detailParts.join(' · ');
}

function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function getNewsletterImageUrl(feed: NewsletterFeed): string | null {
  if (feed.imageUrl) {
    return feed.imageUrl;
  }

  const candidates: string[] = [];

  if (feed.unsubscribeUrl) {
    try {
      const unsubscribeDomain = new URL(feed.unsubscribeUrl).hostname.toLowerCase();
      if (unsubscribeDomain) {
        candidates.push(unsubscribeDomain);
      }
    } catch {
      // Ignore malformed URLs and continue through the fallback chain.
    }
  }

  if (feed.listId) {
    const matches = feed.listId.toLowerCase().match(/[a-z0-9.-]+\.[a-z]{2,}/g);
    if (matches && matches.length > 0) {
      candidates.push(matches[matches.length - 1]);
    }
  }

  const domainFromAddress = feed.fromAddress?.split('@')[1]?.trim().toLowerCase();
  if (domainFromAddress) {
    candidates.push(domainFromAddress);
  }

  const domain = candidates.find(Boolean);
  if (!domain) {
    return isSubstackNewsletter(feed) ? SUBSTACK_FALLBACK_ICON_URL : null;
  }

  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=128`;
}

function isSubstackNewsletter(feed: NewsletterFeed): boolean {
  return Boolean(
    feed.fromAddress?.toLowerCase().endsWith('@substack.com') ||
    feed.listId?.toLowerCase().includes('substack.com') ||
    feed.unsubscribeUrl?.toLowerCase().includes('substack.com')
  );
}

function getNewsletterStatusLabel(feed: NewsletterFeed): string {
  if (feed.status === 'UNSUBSCRIBED') {
    return 'Not subscribed';
  }

  if (feed.status === 'HIDDEN') {
    return 'Hidden';
  }

  return 'Subscribed';
}

function getNewsletterPrimaryActionLabel(feed: NewsletterFeed): string {
  if (feed.status === 'UNSUBSCRIBED') {
    return 'Subscribe';
  }

  return feed.status === 'ACTIVE' ? 'Hide' : 'Show';
}

function getNewsletterPrimaryActionVariant(
  feed: NewsletterFeed
): 'primary' | 'secondary' | 'outline' | 'ghost' {
  if (feed.status === 'UNSUBSCRIBED') {
    return 'primary';
  }

  return 'secondary';
}

function getEmptyTitle(
  provider: Provider,
  state: ReturnType<typeof getIntegrationState>,
  query: string
) {
  if (state !== 'connected') {
    return state === 'needsAttention' ? 'Reconnect integration' : 'Connect integration';
  }

  if (query.trim()) {
    return 'No subscriptions match your search';
  }

  return provider === 'GMAIL' ? 'No newsletters found' : 'No subscriptions imported yet';
}

function getEmptyMessage(
  provider: Provider,
  state: ReturnType<typeof getIntegrationState>,
  query: string
) {
  const config = getSubscriptionSourceConfig(provider);

  if (state !== 'connected') {
    return `Connect ${config.providerLabel} to import and manage subscriptions from this source.`;
  }

  if (query.trim()) {
    return `Try a different search to find ${config.name.toLowerCase()} subscriptions.`;
  }

  return provider === 'GMAIL'
    ? 'When newsletter senders are detected in Gmail, they will appear here so you can keep or hide them.'
    : `Connected ${config.providerLabel} subscriptions will appear here once we can import them.`;
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
  section: {
    gap: Spacing.sm,
  },
  separator: {
    height: Spacing.sm,
  },
});
