/**
 * Provider Detail Screen
 *
 * Shows connection status and a unified list of channels/podcasts from the provider.
 * Users can connect/disconnect the provider and add/remove subscriptions.
 */

import { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  FlatList,
  TextInput,
  Alert,
  ActivityIndicator,
  Image,
} from 'react-native';
import { useLocalSearchParams, Stack, useRouter, type Href } from 'expo-router';
import { Surface } from 'heroui-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';

import { Colors, Spacing, Radius, Typography } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useConnections, type Connection } from '@/hooks/use-connections';
import { useSubscriptions } from '@/hooks/use-subscriptions';
import { trpc } from '@/lib/trpc';
import { validateAndConvertProvider } from '@/lib/route-validation';
import { ErrorState, LoadingState } from '@/components/list-states';

// ============================================================================
// Types
// ============================================================================

type Provider = 'YOUTUBE' | 'SPOTIFY';

interface UnifiedChannel {
  providerChannelId: string;
  name: string;
  imageUrl: string | null;
  isAddedToZine: boolean;
  subscriptionId?: string;
}

// ============================================================================
// Icons
// ============================================================================

function YouTubeIcon({ size = 24, color = '#FFFFFF' }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
      <Path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
    </Svg>
  );
}

function SpotifyIcon({ size = 24, color = '#FFFFFF' }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
      <Path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z" />
    </Svg>
  );
}

function SearchIcon({ size = 18, color = '#6A6A6A' }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2}>
      <Path
        d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

function CheckIcon({ size = 16, color = '#FFFFFF' }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={3}>
      <Path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

function PlusIcon({ size = 16, color = '#FFFFFF' }: { size?: number; color?: string }) {
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={2.5}
    >
      <Path d="M12 5v14M5 12h14" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

// ============================================================================
// Helper Functions
// ============================================================================

function getProviderConfig(provider: Provider) {
  return {
    YOUTUBE: {
      name: 'YouTube',
      icon: YouTubeIcon,
      brandColor: '#FF0000',
      contentName: 'channels',
    },
    SPOTIFY: {
      name: 'Spotify',
      icon: SpotifyIcon,
      brandColor: '#1DB954',
      contentName: 'podcasts',
    },
  }[provider];
}

function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

// ============================================================================
// Components
// ============================================================================

interface ConnectionStatusCardProps {
  provider: Provider;
  connection: Connection | undefined;
  onConnect: () => void;
  onDisconnect: () => void;
  isDisconnecting: boolean;
  colors: typeof Colors.dark;
}

function ConnectionStatusCard({
  provider,
  connection,
  onConnect,
  onDisconnect,
  isDisconnecting,
  colors,
}: ConnectionStatusCardProps) {
  const config = getProviderConfig(provider);
  const isConnected = connection?.status === 'ACTIVE';
  const Icon = config.icon;

  return (
    <Animated.View entering={FadeInDown.duration(400)}>
      <View style={[styles.connectionCard, { backgroundColor: colors.card }]}>
        <View style={styles.connectionHeader}>
          <View style={[styles.connectionIcon, { backgroundColor: config.brandColor }]}>
            <Icon size={20} color="#FFFFFF" />
          </View>
          <View style={styles.connectionInfo}>
            {isConnected ? (
              <>
                <View style={styles.connectionStatus}>
                  <View style={[styles.statusDot, { backgroundColor: colors.success }]} />
                  <Text style={[styles.statusLabel, { color: colors.success }]}>Connected</Text>
                </View>
                {connection?.providerUserId && (
                  <Text style={[styles.connectionDetail, { color: colors.textSecondary }]}>
                    {connection.providerUserId}
                  </Text>
                )}
                <Text style={[styles.connectionDetail, { color: colors.textTertiary }]}>
                  Since {formatDate(connection.createdAt)}
                </Text>
              </>
            ) : (
              <View style={styles.connectionStatus}>
                <View style={[styles.statusDot, { backgroundColor: colors.textTertiary }]} />
                <Text style={[styles.statusLabel, { color: colors.textTertiary }]}>
                  Not connected
                </Text>
              </View>
            )}
          </View>
          {isConnected ? (
            <Pressable
              onPress={onDisconnect}
              disabled={isDisconnecting}
              style={({ pressed }) => [
                styles.disconnectButton,
                pressed && { opacity: 0.7 },
                isDisconnecting && { opacity: 0.5 },
              ]}
            >
              {isDisconnecting ? (
                <ActivityIndicator size="small" color={colors.error} />
              ) : (
                <Text style={[styles.disconnectText, { color: colors.error }]}>Disconnect</Text>
              )}
            </Pressable>
          ) : (
            <Pressable
              onPress={onConnect}
              style={({ pressed }) => [
                styles.connectButton,
                { backgroundColor: config.brandColor },
                pressed && { opacity: 0.8 },
              ]}
            >
              <Text style={styles.connectText}>Connect</Text>
            </Pressable>
          )}
        </View>
      </View>
    </Animated.View>
  );
}

interface ChannelItemProps {
  channel: UnifiedChannel;
  provider: Provider;
  onAdd: () => void;
  onRemove: () => void;
  isProcessing: boolean;
  colors: typeof Colors.dark;
  index: number;
}

function ChannelItem({
  channel,
  provider: _provider,
  onAdd,
  onRemove,
  isProcessing,
  colors,
  index,
}: ChannelItemProps) {
  return (
    <Animated.View entering={FadeInDown.delay(100 + index * 30).duration(300)}>
      <View style={styles.channelItem}>
        {channel.imageUrl ? (
          <Image source={{ uri: channel.imageUrl }} style={styles.channelImage} />
        ) : (
          <View
            style={[styles.channelImagePlaceholder, { backgroundColor: colors.backgroundTertiary }]}
          >
            <Text style={[styles.channelImagePlaceholderText, { color: colors.textSecondary }]}>
              {channel.name.charAt(0).toUpperCase()}
            </Text>
          </View>
        )}
        <View style={styles.channelContent}>
          <Text style={[styles.channelName, { color: colors.text }]} numberOfLines={1}>
            {channel.name}
          </Text>
        </View>
        <Pressable
          onPress={channel.isAddedToZine ? onRemove : onAdd}
          disabled={isProcessing}
          style={({ pressed }) => [
            styles.actionButton,
            channel.isAddedToZine
              ? { backgroundColor: colors.success }
              : { backgroundColor: colors.backgroundTertiary },
            pressed && { opacity: 0.8 },
            isProcessing && { opacity: 0.5 },
          ]}
        >
          {isProcessing ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : channel.isAddedToZine ? (
            <>
              <CheckIcon size={14} color="#FFFFFF" />
              <Text style={styles.actionButtonTextAdded}>Added</Text>
            </>
          ) : (
            <>
              <PlusIcon size={14} color={colors.text} />
              <Text style={[styles.actionButtonText, { color: colors.text }]}>Add</Text>
            </>
          )}
        </Pressable>
      </View>
    </Animated.View>
  );
}

interface EmptyChannelsStateProps {
  provider: Provider;
  isConnected: boolean;
  colors: typeof Colors.dark;
}

function EmptyChannelsState({ provider, isConnected, colors }: EmptyChannelsStateProps) {
  const config = getProviderConfig(provider);

  return (
    <View style={styles.emptyState}>
      <Text style={styles.emptyEmoji}>{isConnected ? '📭' : '🔗'}</Text>
      <Text style={[styles.emptyTitle, { color: colors.text }]}>
        {isConnected ? `No ${config.contentName} found` : `Connect ${config.name}`}
      </Text>
      <Text style={[styles.emptyDescription, { color: colors.textSecondary }]}>
        {isConnected
          ? `We couldn't find any ${config.contentName} in your ${config.name} account.`
          : `Connect your ${config.name} account to see your ${config.contentName} and add them to Zine.`}
      </Text>
    </View>
  );
}

// ============================================================================
// Main Screen
// ============================================================================

export default function ProviderDetailScreen() {
  const router = useRouter();
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'dark'];
  const params = useLocalSearchParams<{ provider: string }>();

  // Validate provider param
  const providerValidation = validateAndConvertProvider(params.provider);
  const provider: Provider = providerValidation.success ? providerValidation.data : 'YOUTUBE';
  const config = getProviderConfig(provider);

  // State
  const [searchQuery, setSearchQuery] = useState('');
  const [disconnectingProvider, setDisconnectingProvider] = useState<Provider | null>(null);
  const [processingChannels, setProcessingChannels] = useState<Set<string>>(new Set());

  // Data hooks
  const { data: connections, isLoading: connectionsLoading } = useConnections();
  const {
    subscriptions,
    subscribe,
    unsubscribe,
    isLoading: subscriptionsLoading,
  } = useSubscriptions();

  // Get connection for this provider
  const connection = connections?.find((c) => c.provider === provider);
  const isConnected = connection?.status === 'ACTIVE';

  // Fetch available channels from provider
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const discoverQuery = (trpc as any).subscriptions?.discover?.available?.useQuery(
    { provider },
    {
      staleTime: 5 * 60 * 1000,
      enabled: providerValidation.success && isConnected,
    }
  ) ?? { data: undefined, isLoading: false, error: null, refetch: () => {} };

  // tRPC utils for cache invalidation
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const utils = trpc.useUtils() as any;

  // Disconnect mutation
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const disconnectMutation = (trpc as any).subscriptions.connections.disconnect.useMutation({
    onSuccess: () => {
      utils.subscriptions?.connections?.list?.invalidate?.();
      utils.subscriptions?.list?.invalidate?.();
    },
    onError: (error: Error) => {
      Alert.alert('Disconnect Failed', error.message || 'Failed to disconnect. Please try again.');
    },
    onSettled: () => {
      setDisconnectingProvider(null);
    },
  });

  // Get subscriptions for this provider
  const providerSubscriptions = useMemo(
    () => subscriptions.filter((s) => s.provider === provider),
    [subscriptions, provider]
  );

  // Build unified channel list
  const unifiedChannels: UnifiedChannel[] = useMemo(() => {
    if (!isConnected) return [];

    // Channels already added to Zine
    const added: UnifiedChannel[] = providerSubscriptions.map((s) => ({
      providerChannelId: s.providerChannelId,
      name: s.name,
      imageUrl: s.imageUrl ?? null,
      isAddedToZine: true,
      subscriptionId: s.id,
    }));

    // Available channels from provider (not yet added)
    const availableData = discoverQuery.data as
      | {
          items?: { id: string; name: string; imageUrl?: string }[];
        }
      | undefined;

    const available: UnifiedChannel[] = (availableData?.items ?? [])
      .filter((item) => !providerSubscriptions.some((s) => s.providerChannelId === item.id))
      .map((item) => ({
        providerChannelId: item.id,
        name: item.name,
        imageUrl: item.imageUrl ?? null,
        isAddedToZine: false,
      }));

    // Merge and sort alphabetically
    return [...added, ...available].sort((a, b) => a.name.localeCompare(b.name));
  }, [isConnected, providerSubscriptions, discoverQuery.data]);

  // Filter by search query
  const filteredChannels = useMemo(() => {
    if (!searchQuery.trim()) return unifiedChannels;
    const query = searchQuery.toLowerCase();
    return unifiedChannels.filter((c) => c.name.toLowerCase().includes(query));
  }, [unifiedChannels, searchQuery]);

  // Handlers
  const handleConnect = useCallback(() => {
    router.push(`/subscriptions/connect/${provider.toLowerCase()}` as Href);
  }, [router, provider]);

  const handleDisconnect = useCallback(() => {
    Alert.alert(
      `Disconnect ${config.name}`,
      `Are you sure you want to disconnect ${config.name}? Your subscriptions will be marked as disconnected.`,
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
  }, [config.name, provider, disconnectMutation]);

  const handleAdd = useCallback(
    (channel: UnifiedChannel) => {
      if (processingChannels.has(channel.providerChannelId)) return;

      setProcessingChannels((prev) => new Set(prev).add(channel.providerChannelId));

      subscribe({
        provider,
        providerChannelId: channel.providerChannelId,
        name: channel.name,
        imageUrl: channel.imageUrl ?? undefined,
      });

      // Remove processing state after a delay
      setTimeout(() => {
        setProcessingChannels((prev) => {
          const next = new Set(prev);
          next.delete(channel.providerChannelId);
          return next;
        });
      }, 1000);
    },
    [provider, subscribe, processingChannels]
  );

  const handleRemove = useCallback(
    (channel: UnifiedChannel) => {
      if (!channel.subscriptionId || processingChannels.has(channel.providerChannelId)) return;

      setProcessingChannels((prev) => new Set(prev).add(channel.providerChannelId));

      unsubscribe({ subscriptionId: channel.subscriptionId });

      setTimeout(() => {
        setProcessingChannels((prev) => {
          const next = new Set(prev);
          next.delete(channel.providerChannelId);
          return next;
        });
      }, 1000);
    },
    [unsubscribe, processingChannels]
  );

  // Render item
  const renderItem = useCallback(
    ({ item, index }: { item: UnifiedChannel; index: number }) => (
      <ChannelItem
        channel={item}
        provider={provider}
        onAdd={() => handleAdd(item)}
        onRemove={() => handleRemove(item)}
        isProcessing={processingChannels.has(item.providerChannelId)}
        colors={colors}
        index={index}
      />
    ),
    [provider, handleAdd, handleRemove, processingChannels, colors]
  );

  const keyExtractor = useCallback((item: UnifiedChannel) => item.providerChannelId, []);

  // Invalid provider
  if (!providerValidation.success) {
    return (
      <>
        <Stack.Screen options={{ title: 'Invalid Provider' }} />
        <Surface style={[styles.container, { backgroundColor: colors.background }]}>
          <ErrorState title="Invalid Provider" message={providerValidation.message} />
        </Surface>
      </>
    );
  }

  const isLoading = connectionsLoading || subscriptionsLoading;

  return (
    <>
      <Stack.Screen
        options={{
          title: config.name,
          headerLargeTitle: true,
          headerLargeTitleShadowVisible: false,
          headerBackButtonDisplayMode: 'minimal',
        }}
      />
      <Surface style={[styles.container, { backgroundColor: colors.background }]}>
        {isLoading ? (
          <LoadingState />
        ) : (
          <FlatList
            data={filteredChannels}
            renderItem={renderItem}
            keyExtractor={keyExtractor}
            contentContainerStyle={styles.listContent}
            contentInsetAdjustmentBehavior="automatic"
            showsVerticalScrollIndicator={false}
            ListHeaderComponent={
              <View style={styles.listHeader}>
                {/* Connection Status */}
                <ConnectionStatusCard
                  provider={provider}
                  connection={connection}
                  onConnect={handleConnect}
                  onDisconnect={handleDisconnect}
                  isDisconnecting={disconnectingProvider === provider}
                  colors={colors}
                />

                {/* Search and count */}
                {isConnected && unifiedChannels.length > 0 && (
                  <Animated.View
                    entering={FadeInDown.delay(100).duration(400)}
                    style={styles.searchSection}
                  >
                    <View style={styles.sectionHeader}>
                      <Text style={[styles.sectionTitle, { color: colors.text }]}>
                        {config.contentName.charAt(0).toUpperCase() + config.contentName.slice(1)}
                      </Text>
                      <Text style={[styles.sectionCount, { color: colors.textTertiary }]}>
                        {unifiedChannels.length}
                      </Text>
                    </View>
                    <View
                      style={[
                        styles.searchBar,
                        { backgroundColor: colors.backgroundSecondary, borderColor: colors.border },
                      ]}
                    >
                      <SearchIcon size={18} color={colors.textTertiary} />
                      <TextInput
                        placeholder={`Search ${config.contentName}...`}
                        placeholderTextColor={colors.textTertiary}
                        value={searchQuery}
                        onChangeText={setSearchQuery}
                        style={[styles.searchInput, { color: colors.text }]}
                        autoCapitalize="none"
                        autoCorrect={false}
                      />
                    </View>
                  </Animated.View>
                )}
              </View>
            }
            ListEmptyComponent={
              !discoverQuery.isLoading ? (
                <EmptyChannelsState provider={provider} isConnected={isConnected} colors={colors} />
              ) : (
                <View style={styles.loadingChannels}>
                  <ActivityIndicator size="large" color={colors.primary} />
                  <Text style={[styles.loadingText, { color: colors.textSecondary }]}>
                    Loading {config.contentName}...
                  </Text>
                </View>
              )
            }
          />
        )}
      </Surface>
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
  listContent: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing['3xl'],
  },
  listHeader: {
    paddingTop: Spacing.md,
  },

  // Connection Card
  connectionCard: {
    borderRadius: Radius.lg,
    padding: Spacing.lg,
    marginBottom: Spacing.xl,
  },
  connectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  connectionIcon: {
    width: 40,
    height: 40,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: Spacing.md,
  },
  connectionInfo: {
    flex: 1,
  },
  connectionStatus: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: Spacing.sm,
  },
  statusLabel: {
    ...Typography.labelMedium,
    fontWeight: '600',
  },
  connectionDetail: {
    ...Typography.bodySmall,
    marginTop: 2,
  },
  disconnectButton: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  disconnectText: {
    ...Typography.labelMedium,
    fontWeight: '500',
  },
  connectButton: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.md,
  },
  connectText: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 14,
  },

  // Search Section
  searchSection: {
    marginBottom: Spacing.md,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  sectionTitle: {
    ...Typography.titleMedium,
  },
  sectionCount: {
    ...Typography.bodyMedium,
    marginLeft: Spacing.sm,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.lg,
    borderWidth: 1,
    gap: Spacing.sm,
  },
  searchInput: {
    flex: 1,
    ...Typography.bodyMedium,
    paddingVertical: Spacing.xs,
  },

  // Channel Item
  channelItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.md,
  },
  channelImage: {
    width: 48,
    height: 48,
    borderRadius: Radius.full,
  },
  channelImagePlaceholder: {
    width: 48,
    height: 48,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  channelImagePlaceholderText: {
    fontSize: 20,
    fontWeight: '600',
  },
  channelContent: {
    flex: 1,
    marginLeft: Spacing.md,
  },
  channelName: {
    ...Typography.titleSmall,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.full,
    gap: Spacing.xs,
    minWidth: 80,
    justifyContent: 'center',
  },
  actionButtonText: {
    fontSize: 14,
    fontWeight: '600',
  },
  actionButtonTextAdded: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
  },

  // Empty State
  emptyState: {
    alignItems: 'center',
    paddingVertical: Spacing['4xl'],
    paddingHorizontal: Spacing.lg,
  },
  emptyEmoji: {
    fontSize: 56,
    marginBottom: Spacing.lg,
  },
  emptyTitle: {
    ...Typography.titleLarge,
    textAlign: 'center',
    marginBottom: Spacing.sm,
  },
  emptyDescription: {
    ...Typography.bodyMedium,
    textAlign: 'center',
    maxWidth: 280,
  },

  // Loading
  loadingChannels: {
    alignItems: 'center',
    paddingVertical: Spacing['4xl'],
    gap: Spacing.md,
  },
  loadingText: {
    ...Typography.bodyMedium,
  },
});
