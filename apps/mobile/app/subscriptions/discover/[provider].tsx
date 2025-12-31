/**
 * Provider Discovery Screen
 *
 * Shows content from the user's connected provider for selective subscription import.
 * Uses the shared ChannelSelectionList component in single-action mode.
 *
 * Features:
 * 1. Search/filter by name
 * 2. FlatList with channel/show cards
 * 3. Subscribe button that changes to "Subscribed" when added
 * 4. Loading, error, empty states
 *
 * @see features/subscriptions/frontend-spec.md Section 4 (Onboarding Flow)
 * @see features/subscriptions/frontend-spec.md Section 5 (Channel Selection)
 * @see features/subscriptions/frontend-spec.md Section 10.4 (Discovery Endpoints)
 */

import { useCallback, useMemo, useState } from 'react';
import { View, Text, ActivityIndicator, StyleSheet } from 'react-native';
import { useLocalSearchParams, Stack } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Colors, Spacing, Typography } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useSubscriptions } from '@/hooks/use-subscriptions';
import { trpc } from '@/lib/trpc';
import { validateAndConvertProvider } from '@/lib/route-validation';
import { ErrorState } from '@/components/list-states';
import { ChannelSelectionList, type Channel, type Provider } from '@/components/subscriptions';

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Get provider display name
 */
function getProviderDisplayName(provider: Provider): string {
  switch (provider) {
    case 'YOUTUBE':
      return 'YouTube';
    case 'SPOTIFY':
      return 'Spotify';
    default:
      return 'Provider';
  }
}

// ============================================================================
// Main Component
// ============================================================================

export default function ProviderDiscoverScreen() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const params = useLocalSearchParams<{ provider: string }>();

  // Validate and normalize provider to uppercase
  const providerValidation = validateAndConvertProvider(params.provider);

  // Use validated provider or default to YOUTUBE for hook consistency
  // (hooks must be called unconditionally)
  const provider: Provider = providerValidation.success ? providerValidation.data : 'YOUTUBE';
  const providerDisplayName = getProviderDisplayName(provider);

  // Track which channels are being subscribed to (optimistic UI)
  const [subscribingChannels, setSubscribingChannels] = useState<Set<string>>(new Set());

  // Get existing subscriptions to check if channel is already subscribed
  const { subscriptions, subscribe, subscribeQueued } = useSubscriptions();

  // Fetch discoverable channels from provider
  const discoverQuery = (trpc as any).subscriptions?.discover?.available?.useQuery(
    { provider },
    {
      staleTime: 5 * 60 * 1000, // 5 minutes
      enabled: providerValidation.success && !!provider,
    }
  ) ?? {
    data: undefined,
    isLoading: false,
    error: null,
    refetch: () => Promise.resolve(),
  };

  // If the discover endpoint doesn't exist, fall back to sources.list
  const sourcesQuery = (trpc as any).sources?.list?.useQuery(undefined, {
    staleTime: 5 * 60 * 1000,
    enabled: providerValidation.success && !discoverQuery.data && !!provider,
  }) ?? {
    data: undefined,
    isLoading: false,
    error: null,
    refetch: () => Promise.resolve(),
  };

  // Determine which data source to use
  const isLoading = discoverQuery.isLoading || sourcesQuery.isLoading;
  const error = discoverQuery.error || sourcesQuery.error;
  const refetch = discoverQuery.refetch || sourcesQuery.refetch;

  // Transform data to Channel shape
  const channels: Channel[] = useMemo(() => {
    if (discoverQuery.data) {
      // Backend returns { items: [...], connectionRequired: boolean }
      const data = discoverQuery.data as {
        items?: { id: string; name: string; imageUrl?: string; isSubscribed: boolean }[];
        connectionRequired?: boolean;
      };
      if (data.items) {
        return data.items.map((item) => ({
          providerChannelId: item.id,
          name: item.name,
          description: null,
          imageUrl: item.imageUrl ?? null,
          subscriberCount: null,
          isSubscribed: item.isSubscribed,
        }));
      }
      return [];
    }

    // Transform sources data if discover endpoint not available
    if (sourcesQuery.data) {
      return (sourcesQuery.data as any[])
        .filter((source) => source.provider === provider)
        .map((source) => ({
          providerChannelId: source.providerId,
          name: source.name,
          description: null,
          imageUrl: null,
          subscriberCount: null,
          isSubscribed: true, // If it's in sources, it's already subscribed
        }));
    }

    return [];
  }, [discoverQuery.data, sourcesQuery.data, provider]);

  // Check if a channel is already in user's subscriptions
  const isChannelSubscribed = useCallback(
    (providerChannelId: string): boolean => {
      return subscriptions.some(
        (sub) => sub.provider === provider && sub.providerChannelId === providerChannelId
      );
    },
    [subscriptions, provider]
  );

  // Handle subscribe action
  const handleSubscribe = useCallback(
    (channel: Channel) => {
      if (subscribingChannels.has(channel.providerChannelId)) {
        return;
      }

      // Add to subscribing set for UI feedback
      setSubscribingChannels((prev) => new Set(prev).add(channel.providerChannelId));

      // Call subscribe mutation
      subscribe({
        provider,
        providerChannelId: channel.providerChannelId,
        name: channel.name,
        imageUrl: channel.imageUrl ?? undefined,
      });

      // Remove from subscribing set after a delay (optimistic update should handle state)
      setTimeout(() => {
        setSubscribingChannels((prev) => {
          const next = new Set(prev);
          next.delete(channel.providerChannelId);
          return next;
        });
      }, 1000);
    },
    [provider, subscribe, subscribingChannels]
  );

  // Header subtitle showing selection status
  const selectedCount = subscriptions.filter((s) => s.provider === provider).length;

  // If provider is invalid, show error state with helpful message
  // (checked after all hooks to follow Rules of Hooks)
  if (!providerValidation.success) {
    return (
      <>
        <Stack.Screen options={{ title: 'Invalid Provider' }} />
        <SafeAreaView
          style={[styles.container, { backgroundColor: colors.background }]}
          edges={['bottom']}
        >
          <ErrorState title="Invalid Provider" message={providerValidation.message} />
        </SafeAreaView>
      </>
    );
  }

  return (
    <>
      <Stack.Screen
        options={{
          title: `Discover ${providerDisplayName}`,
        }}
      />
      <SafeAreaView
        style={[styles.container, { backgroundColor: colors.background }]}
        edges={['bottom']}
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={[styles.headerTitle, { color: colors.text }]}>
            Your {providerDisplayName} Subscriptions
          </Text>
          <Text style={[styles.headerSubtitle, { color: colors.textSecondary }]}>
            Select channels to follow in Zine
            {selectedCount > 0 && ` (${selectedCount} selected)`}
          </Text>
        </View>

        {/* Channel Selection List */}
        <ChannelSelectionList
          provider={provider}
          channels={channels}
          isLoading={isLoading}
          error={error}
          onRetry={refetch}
          onSubscribe={handleSubscribe}
          subscribingIds={subscribingChannels}
          isChannelSubscribed={isChannelSubscribed}
          mode="single"
          emptyTitle="No subscriptions found"
          emptyMessage="Connect your account to see your subscriptions"
          ListFooterComponent={
            subscribeQueued ? (
              <View style={styles.footerLoader}>
                <ActivityIndicator size="small" color={colors.primary} />
                <Text style={[styles.footerText, { color: colors.textSecondary }]}>
                  Changes will sync when online...
                </Text>
              </View>
            ) : null
          }
        />
      </SafeAreaView>
    </>
  );
}

// ============================================================================
// Styles
// ============================================================================

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.sm,
  },
  headerTitle: {
    ...Typography.titleLarge,
    fontWeight: '700',
  },
  headerSubtitle: {
    ...Typography.bodyMedium,
    marginTop: Spacing.xs,
  },
  footerLoader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.lg,
    gap: Spacing.sm,
  },
  footerText: {
    ...Typography.bodySmall,
  },
});
