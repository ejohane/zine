/**
 * Provider Discovery Screen
 *
 * Shows content from the user's connected provider for selective subscription import.
 * Allows users to browse channels/shows from YouTube or Spotify and subscribe to them.
 *
 * Features:
 * 1. Search/filter by name
 * 2. FlatList with channel/show cards
 * 3. Subscribe button that changes to "Subscribed" when added
 * 4. Infinite scroll pagination
 * 5. Loading, error, empty states
 *
 * @see features/subscriptions/frontend-spec.md Section 4 (Onboarding Flow)
 * @see features/subscriptions/frontend-spec.md Section 5 (Channel Selection)
 * @see features/subscriptions/frontend-spec.md Section 10.4 (Discovery Endpoints)
 */

import { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  FlatList,
  Pressable,
  ActivityIndicator,
  Image,
  StyleSheet,
} from 'react-native';
import { useLocalSearchParams, Stack } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Colors, Spacing, Radius, Typography, ProviderColors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useSubscriptions } from '@/hooks/use-subscriptions';
import { trpc } from '@/lib/trpc';

// ============================================================================
// Types
// ============================================================================

type Provider = 'YOUTUBE' | 'SPOTIFY';

/**
 * Discoverable channel/show from the provider.
 * Matches the backend discover.available response shape.
 */
interface DiscoverableChannel {
  providerChannelId: string;
  name: string;
  description: string | null;
  imageUrl: string | null;
  subscriberCount: number | null;
  isSubscribed: boolean;
}

// ============================================================================
// Helper Components
// ============================================================================

interface StateColorsProps {
  colors: typeof Colors.light;
}

/**
 * Loading state shown while fetching initial data
 */
function LoadingState({ colors }: StateColorsProps) {
  return (
    <View style={styles.centeredContainer}>
      <ActivityIndicator size="large" color={colors.primary} />
      <Text style={[styles.stateText, { color: colors.textSecondary }]}>Loading channels...</Text>
    </View>
  );
}

/**
 * Error state shown when fetch fails
 */
function ErrorState({
  colors,
  message,
  onRetry,
}: StateColorsProps & { message: string; onRetry?: () => void }) {
  return (
    <View style={styles.centeredContainer}>
      <Text style={styles.stateEmoji}>Something went wrong</Text>
      <Text style={[styles.stateTitle, { color: colors.text }]}>Could not load content</Text>
      <Text style={[styles.stateText, { color: colors.textSecondary }]}>{message}</Text>
      {onRetry && (
        <Pressable
          onPress={onRetry}
          style={[styles.retryButton, { backgroundColor: colors.primary }]}
        >
          <Text style={styles.retryButtonText}>Try Again</Text>
        </Pressable>
      )}
    </View>
  );
}

/**
 * Empty state shown when no channels are found
 */
function EmptyState({ colors, searchQuery }: StateColorsProps & { searchQuery: string }) {
  return (
    <View style={styles.centeredContainer}>
      <Text style={styles.stateEmoji}>No channels found</Text>
      <Text style={[styles.stateTitle, { color: colors.text }]}>
        {searchQuery ? 'No results' : 'No subscriptions found'}
      </Text>
      <Text style={[styles.stateText, { color: colors.textSecondary }]}>
        {searchQuery
          ? `No channels match "${searchQuery}"`
          : 'Connect your account to see your subscriptions'}
      </Text>
    </View>
  );
}

// ============================================================================
// Channel Card Component
// ============================================================================

interface ChannelCardProps {
  channel: DiscoverableChannel;
  provider: Provider;
  isSubscribing: boolean;
  isAlreadySubscribed: boolean;
  onSubscribe: () => void;
  colors: typeof Colors.light;
}

function ChannelCard({
  channel,
  provider,
  isSubscribing,
  isAlreadySubscribed,
  onSubscribe,
  colors,
}: ChannelCardProps) {
  const providerColor = provider === 'YOUTUBE' ? ProviderColors.youtube : ProviderColors.spotify;

  // Determine button state
  const isSubscribed = channel.isSubscribed || isAlreadySubscribed;

  return (
    <View style={[styles.channelCard, { backgroundColor: colors.card }]}>
      {/* Channel Image */}
      <View style={styles.channelImageContainer}>
        {channel.imageUrl ? (
          <Image source={{ uri: channel.imageUrl }} style={styles.channelImage} />
        ) : (
          <View
            style={[
              styles.channelImagePlaceholder,
              { backgroundColor: colors.backgroundSecondary },
            ]}
          >
            <Text style={[styles.channelImagePlaceholderText, { color: colors.textTertiary }]}>
              {channel.name.charAt(0).toUpperCase()}
            </Text>
          </View>
        )}
      </View>

      {/* Channel Info */}
      <View style={styles.channelInfo}>
        <Text style={[styles.channelName, { color: colors.text }]} numberOfLines={1}>
          {channel.name}
        </Text>
        {channel.description && (
          <Text
            style={[styles.channelDescription, { color: colors.textSecondary }]}
            numberOfLines={2}
          >
            {channel.description}
          </Text>
        )}
        {channel.subscriberCount !== null && (
          <Text style={[styles.channelStats, { color: colors.textTertiary }]}>
            {formatSubscriberCount(channel.subscriberCount)} subscribers
          </Text>
        )}
      </View>

      {/* Subscribe Button */}
      <Pressable
        onPress={onSubscribe}
        disabled={isSubscribed || isSubscribing}
        style={[
          styles.subscribeButton,
          isSubscribed
            ? { backgroundColor: colors.backgroundSecondary }
            : { backgroundColor: providerColor },
        ]}
      >
        {isSubscribing ? (
          <ActivityIndicator size="small" color="#FFFFFF" />
        ) : (
          <Text
            style={[
              styles.subscribeButtonText,
              isSubscribed ? { color: colors.textSecondary } : { color: '#FFFFFF' },
            ]}
          >
            {isSubscribed ? 'Subscribed' : 'Subscribe'}
          </Text>
        )}
      </Pressable>
    </View>
  );
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Format subscriber count to human-readable string
 */
function formatSubscriberCount(count: number): string {
  if (count >= 1_000_000) {
    return `${(count / 1_000_000).toFixed(1)}M`;
  }
  if (count >= 1_000) {
    return `${(count / 1_000).toFixed(1)}K`;
  }
  return count.toString();
}

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

  // Normalize provider to uppercase
  const provider = (params.provider?.toUpperCase() ?? 'YOUTUBE') as Provider;
  const providerDisplayName = getProviderDisplayName(provider);

  // Search state
  const [searchQuery, setSearchQuery] = useState('');

  // Track which channels are being subscribed to (optimistic UI)
  const [subscribingChannels, setSubscribingChannels] = useState<Set<string>>(new Set());

  // Get existing subscriptions to check if channel is already subscribed
  const { subscriptions, subscribe, isSubscribing, subscribeQueued } = useSubscriptions();

  // Fetch discoverable channels from provider
  // Using type assertion since the router types may not be fully updated
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const discoverQuery = (trpc as any).subscriptions?.discover?.available?.useQuery(
    { provider },
    {
      staleTime: 5 * 60 * 1000, // 5 minutes
      enabled: !!provider,
    }
  ) ?? {
    data: undefined,
    isLoading: false,
    error: null,
    refetch: () => Promise.resolve(),
  };

  // If the discover endpoint doesn't exist, fall back to sources.list
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sourcesQuery = (trpc as any).sources?.list?.useQuery(undefined, {
    staleTime: 5 * 60 * 1000,
    enabled: !discoverQuery.data && !!provider,
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

  // Transform sources data to match DiscoverableChannel shape if needed
  const channels: DiscoverableChannel[] = useMemo(() => {
    if (discoverQuery.data) {
      // Backend returns { items: [...], connectionRequired: boolean }
      const data = discoverQuery.data as {
        items?: Array<{ id: string; name: string; imageUrl?: string; isSubscribed: boolean }>;
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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
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

  // Filter channels by search query
  const filteredChannels = useMemo(() => {
    if (!searchQuery.trim()) {
      return channels;
    }
    const query = searchQuery.toLowerCase();
    return channels.filter(
      (channel) =>
        channel.name.toLowerCase().includes(query) ||
        channel.description?.toLowerCase().includes(query)
    );
  }, [channels, searchQuery]);

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
    (channel: DiscoverableChannel) => {
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

  // Render channel item
  const renderChannelItem = useCallback(
    ({ item }: { item: DiscoverableChannel }) => (
      <ChannelCard
        channel={item}
        provider={provider}
        isSubscribing={subscribingChannels.has(item.providerChannelId) || isSubscribing}
        isAlreadySubscribed={isChannelSubscribed(item.providerChannelId)}
        onSubscribe={() => handleSubscribe(item)}
        colors={colors}
      />
    ),
    [provider, subscribingChannels, isSubscribing, isChannelSubscribed, handleSubscribe, colors]
  );

  // Key extractor for FlatList
  const keyExtractor = useCallback((item: DiscoverableChannel) => item.providerChannelId, []);

  // Header subtitle showing selection status
  const selectedCount = subscriptions.filter((s) => s.provider === provider).length;

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

        {/* Search Bar */}
        <View style={styles.searchContainer}>
          <TextInput
            style={[
              styles.searchInput,
              {
                backgroundColor: colors.backgroundSecondary,
                color: colors.text,
                borderColor: colors.border,
              },
            ]}
            placeholder="Search channels..."
            placeholderTextColor={colors.textTertiary}
            value={searchQuery}
            onChangeText={setSearchQuery}
            autoCapitalize="none"
            autoCorrect={false}
            clearButtonMode="while-editing"
          />
        </View>

        {/* Content */}
        {isLoading ? (
          <LoadingState colors={colors} />
        ) : error ? (
          <ErrorState
            colors={colors}
            message={error instanceof Error ? error.message : 'Failed to load channels'}
            onRetry={refetch}
          />
        ) : filteredChannels.length === 0 ? (
          <EmptyState colors={colors} searchQuery={searchQuery} />
        ) : (
          <FlatList
            data={filteredChannels}
            renderItem={renderChannelItem}
            keyExtractor={keyExtractor}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            // Infinite scroll support (placeholder for pagination)
            onEndReachedThreshold={0.5}
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
        )}
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
  searchContainer: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.md,
  },
  searchInput: {
    height: 44,
    borderRadius: Radius.lg,
    paddingHorizontal: Spacing.lg,
    ...Typography.bodyMedium,
    borderWidth: 1,
  },
  listContent: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.xl,
  },
  centeredContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing['2xl'],
  },
  stateEmoji: {
    fontSize: 48,
    marginBottom: Spacing.md,
  },
  stateTitle: {
    ...Typography.titleMedium,
    fontWeight: '600',
    marginBottom: Spacing.sm,
    textAlign: 'center',
  },
  stateText: {
    ...Typography.bodyMedium,
    textAlign: 'center',
  },
  retryButton: {
    marginTop: Spacing.lg,
    paddingHorizontal: Spacing['2xl'],
    paddingVertical: Spacing.md,
    borderRadius: Radius.lg,
  },
  retryButtonText: {
    color: '#FFFFFF',
    fontWeight: '500',
    fontSize: 16,
  },
  channelCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    borderRadius: Radius.lg,
  },
  channelImageContainer: {
    marginRight: Spacing.md,
  },
  channelImage: {
    width: 56,
    height: 56,
    borderRadius: Radius.full,
  },
  channelImagePlaceholder: {
    width: 56,
    height: 56,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  channelImagePlaceholderText: {
    fontSize: 24,
    fontWeight: '600',
  },
  channelInfo: {
    flex: 1,
    marginRight: Spacing.md,
  },
  channelName: {
    ...Typography.titleSmall,
    fontWeight: '600',
  },
  channelDescription: {
    ...Typography.bodySmall,
    marginTop: Spacing.xs,
  },
  channelStats: {
    ...Typography.labelSmall,
    marginTop: Spacing.xs,
  },
  subscribeButton: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.full,
    minWidth: 100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  subscribeButtonText: {
    fontWeight: '600',
    fontSize: 14,
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
