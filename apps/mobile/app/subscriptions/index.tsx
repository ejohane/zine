/**
 * Subscription Management Screen
 *
 * Displays the user's subscriptions with add subscription buttons for YouTube/Spotify.
 * Shows subscription status (ACTIVE=green, PAUSED=yellow) and empty state.
 *
 * @see features/subscriptions/frontend-spec.md Section 2 (Navigation Structure)
 */

import { useRouter, type Href } from 'expo-router';
import { useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Colors, Spacing, Radius, Typography, ProviderColors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useConnections } from '@/hooks/use-connections';
import { useSubscriptions } from '@/hooks/use-subscriptions';
import type { Subscription } from '@/hooks/use-subscriptions-query';

// ============================================================================
// Types
// ============================================================================

interface ProviderButtonProps {
  provider: 'YOUTUBE' | 'SPOTIFY';
  isConnected: boolean;
  onPress: () => void;
  colors: typeof Colors.light;
}

interface SubscriptionCardProps {
  subscription: Subscription;
  colors: typeof Colors.light;
  onPress: () => void;
}

interface EmptyStateProps {
  colors: typeof Colors.light;
  hasConnections: boolean;
  onConnectYouTube: () => void;
  onConnectSpotify: () => void;
}

// ============================================================================
// Components
// ============================================================================

/**
 * Provider connection/add subscription button
 */
function ProviderButton({ provider, isConnected, onPress, colors }: ProviderButtonProps) {
  const providerConfig = {
    YOUTUBE: {
      icon: '🎬',
      name: 'YouTube',
      color: ProviderColors.youtube,
      description: isConnected ? 'Add YouTube subscriptions' : 'Connect YouTube first',
    },
    SPOTIFY: {
      icon: '🎧',
      name: 'Spotify',
      color: ProviderColors.spotify,
      description: isConnected ? 'Add Spotify podcasts' : 'Connect Spotify first',
    },
  };

  const config = providerConfig[provider];

  return (
    <Pressable
      style={[
        styles.providerButton,
        {
          backgroundColor: colors.card,
          borderColor: isConnected ? config.color : colors.border,
          opacity: isConnected ? 1 : 0.6,
        },
      ]}
      onPress={onPress}
      disabled={!isConnected}
    >
      <Text style={styles.providerIcon}>{config.icon}</Text>
      <View style={styles.providerTextContainer}>
        <Text style={[styles.providerName, { color: colors.text }]}>{config.name}</Text>
        <Text style={[styles.providerDescription, { color: colors.textSecondary }]}>
          {config.description}
        </Text>
      </View>
      <Text
        style={[styles.providerArrow, { color: isConnected ? config.color : colors.textTertiary }]}
      >
        {isConnected ? '+' : '→'}
      </Text>
    </Pressable>
  );
}

/**
 * Subscription card for FlatList item
 */
function SubscriptionCard({ subscription, colors, onPress }: SubscriptionCardProps) {
  const providerIcon = subscription.provider === 'YOUTUBE' ? '📺' : '🎧';
  const statusColor =
    subscription.status === 'ACTIVE'
      ? colors.success
      : subscription.status === 'PAUSED'
        ? colors.warning
        : colors.textTertiary;

  return (
    <Pressable
      style={[styles.subscriptionCard, { backgroundColor: colors.card }]}
      onPress={onPress}
    >
      {subscription.imageUrl ? (
        <Image source={{ uri: subscription.imageUrl }} style={styles.subscriptionImage} />
      ) : (
        <View
          style={[
            styles.subscriptionImagePlaceholder,
            { backgroundColor: colors.backgroundSecondary },
          ]}
        >
          <Text style={styles.subscriptionImagePlaceholderText}>{providerIcon}</Text>
        </View>
      )}
      <View style={styles.subscriptionContent}>
        <Text style={[styles.subscriptionName, { color: colors.text }]} numberOfLines={1}>
          {subscription.name}
        </Text>
        <View style={styles.subscriptionMeta}>
          <Text style={styles.subscriptionProvider}>{providerIcon}</Text>
          <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
          <Text style={[styles.subscriptionStatus, { color: statusColor }]}>
            {subscription.status}
          </Text>
        </View>
      </View>
      <Text style={[styles.subscriptionArrow, { color: colors.textTertiary }]}>›</Text>
    </Pressable>
  );
}

/**
 * Empty state when no subscriptions exist
 */
function EmptyState({
  colors,
  hasConnections,
  onConnectYouTube,
  onConnectSpotify,
}: EmptyStateProps) {
  return (
    <View style={styles.emptyContainer}>
      <Text style={styles.emptyEmoji}>📭</Text>
      <Text style={[styles.emptyTitle, { color: colors.text }]}>No subscriptions yet</Text>
      <Text style={[styles.emptyDescription, { color: colors.textSecondary }]}>
        {hasConnections
          ? 'Add your favorite YouTube channels and Spotify podcasts to get started.'
          : 'Connect your YouTube or Spotify account to start adding subscriptions.'}
      </Text>
      {!hasConnections && (
        <View style={styles.emptyActions}>
          <Pressable
            style={[styles.emptyActionButton, { backgroundColor: ProviderColors.youtube }]}
            onPress={onConnectYouTube}
          >
            <Text style={styles.emptyActionText}>Connect YouTube</Text>
          </Pressable>
          <Pressable
            style={[styles.emptyActionButton, { backgroundColor: ProviderColors.spotify }]}
            onPress={onConnectSpotify}
          >
            <Text style={styles.emptyActionText}>Connect Spotify</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

/**
 * Loading state component
 */
function LoadingState({ colors }: { colors: typeof Colors.light }) {
  return (
    <View style={styles.loadingContainer}>
      <ActivityIndicator size="large" color={colors.primary} />
      <Text style={[styles.loadingText, { color: colors.textSecondary }]}>
        Loading subscriptions...
      </Text>
    </View>
  );
}

// ErrorState component intentionally kept for future use when error handling is needed
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function _ErrorState({ colors, message }: { colors: typeof Colors.light; message: string }) {
  return (
    <View style={styles.errorContainer}>
      <Text style={styles.errorEmoji}>⚠️</Text>
      <Text style={[styles.errorTitle, { color: colors.text }]}>Something went wrong</Text>
      <Text style={[styles.errorMessage, { color: colors.textSecondary }]}>{message}</Text>
    </View>
  );
}

// ============================================================================
// Main Screen
// ============================================================================

export default function SubscriptionsScreen() {
  const router = useRouter();
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];

  // Fetch connections and subscriptions
  const { data: connections, isLoading: connectionsLoading } = useConnections();
  const { subscriptions, isLoading: subscriptionsLoading, refetch } = useSubscriptions();

  const isLoading = connectionsLoading || subscriptionsLoading;

  // Check if providers are connected
  const youtubeConnection = connections?.find(
    (c: { provider: string }) => c.provider === 'YOUTUBE'
  );
  const spotifyConnection = connections?.find(
    (c: { provider: string }) => c.provider === 'SPOTIFY'
  );
  const isYouTubeConnected = youtubeConnection?.status === 'ACTIVE';
  const isSpotifyConnected = spotifyConnection?.status === 'ACTIVE';
  const hasAnyConnection = isYouTubeConnected || isSpotifyConnected;

  // Navigation handlers
  const handleConnectYouTube = useCallback(() => {
    router.push('/subscriptions/connect/youtube' as Href);
  }, [router]);

  const handleConnectSpotify = useCallback(() => {
    router.push('/subscriptions/connect/spotify' as Href);
  }, [router]);

  const handleAddYouTube = useCallback(() => {
    router.push('/subscriptions/discover/YOUTUBE' as Href);
  }, [router]);

  const handleAddSpotify = useCallback(() => {
    router.push('/subscriptions/discover/SPOTIFY' as Href);
  }, [router]);

  const handleSubscriptionPress = useCallback(
    (subscription: Subscription) => {
      router.push(`/subscriptions/${subscription.id}` as Href);
    },
    [router]
  );

  // Render subscription item
  const renderSubscription = useCallback(
    ({ item }: { item: Subscription }) => (
      <SubscriptionCard
        subscription={item}
        colors={colors}
        onPress={() => handleSubscriptionPress(item)}
      />
    ),
    [colors, handleSubscriptionPress]
  );

  // Key extractor
  const keyExtractor = useCallback((item: Subscription) => item.id, []);

  // List header with add subscription buttons
  const ListHeader = useCallback(
    () => (
      <View style={styles.headerSection}>
        <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>ADD SUBSCRIPTION</Text>
        <View style={styles.providerButtons}>
          <ProviderButton
            provider="YOUTUBE"
            isConnected={isYouTubeConnected}
            onPress={isYouTubeConnected ? handleAddYouTube : handleConnectYouTube}
            colors={colors}
          />
          <ProviderButton
            provider="SPOTIFY"
            isConnected={isSpotifyConnected}
            onPress={isSpotifyConnected ? handleAddSpotify : handleConnectSpotify}
            colors={colors}
          />
        </View>
        {subscriptions.length > 0 && (
          <Text
            style={[styles.sectionTitle, { color: colors.textSecondary, marginTop: Spacing.xl }]}
          >
            YOUR SUBSCRIPTIONS ({subscriptions.length})
          </Text>
        )}
      </View>
    ),
    [
      colors,
      isYouTubeConnected,
      isSpotifyConnected,
      handleAddYouTube,
      handleAddSpotify,
      handleConnectYouTube,
      handleConnectSpotify,
      subscriptions.length,
    ]
  );

  // List empty component
  const ListEmpty = useCallback(
    () => (
      <EmptyState
        colors={colors}
        hasConnections={hasAnyConnection}
        onConnectYouTube={handleConnectYouTube}
        onConnectSpotify={handleConnectSpotify}
      />
    ),
    [colors, hasAnyConnection, handleConnectYouTube, handleConnectSpotify]
  );

  // Render content based on state
  if (isLoading) {
    return (
      <SafeAreaView
        style={[styles.container, { backgroundColor: colors.background }]}
        edges={['bottom']}
      >
        <LoadingState colors={colors} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: colors.background }]}
      edges={['bottom']}
    >
      <FlatList
        data={subscriptions}
        renderItem={renderSubscription}
        keyExtractor={keyExtractor}
        ListHeaderComponent={ListHeader}
        ListEmptyComponent={ListEmpty}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        onRefresh={refetch}
        refreshing={false}
      />
    </SafeAreaView>
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
    padding: Spacing.lg,
    paddingBottom: Spacing['3xl'],
  },

  // Header Section
  headerSection: {
    marginBottom: Spacing.lg,
  },
  sectionTitle: {
    ...Typography.labelSmall,
    marginBottom: Spacing.sm,
    marginLeft: Spacing.xs,
  },

  // Provider Buttons
  providerButtons: {
    gap: Spacing.sm,
  },
  providerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.md,
    borderRadius: Radius.lg,
    borderWidth: 1,
  },
  providerIcon: {
    fontSize: 28,
    marginRight: Spacing.md,
  },
  providerTextContainer: {
    flex: 1,
  },
  providerName: {
    ...Typography.titleMedium,
  },
  providerDescription: {
    ...Typography.bodySmall,
    marginTop: 2,
  },
  providerArrow: {
    fontSize: 24,
    fontWeight: '300',
  },

  // Subscription Card
  subscriptionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.md,
    borderRadius: Radius.lg,
    marginBottom: Spacing.sm,
  },
  subscriptionImage: {
    width: 48,
    height: 48,
    borderRadius: Radius.md,
  },
  subscriptionImagePlaceholder: {
    width: 48,
    height: 48,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  subscriptionImagePlaceholderText: {
    fontSize: 24,
  },
  subscriptionContent: {
    flex: 1,
    marginLeft: Spacing.md,
  },
  subscriptionName: {
    ...Typography.titleMedium,
    marginBottom: 4,
  },
  subscriptionMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  subscriptionProvider: {
    fontSize: 14,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  subscriptionStatus: {
    ...Typography.labelMedium,
    textTransform: 'capitalize',
  },
  subscriptionArrow: {
    fontSize: 24,
    marginLeft: Spacing.sm,
  },

  // Empty State
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing['4xl'],
    paddingHorizontal: Spacing.lg,
  },
  emptyEmoji: {
    fontSize: 56,
    marginBottom: Spacing.lg,
  },
  emptyTitle: {
    ...Typography.titleLarge,
    marginBottom: Spacing.sm,
    textAlign: 'center',
  },
  emptyDescription: {
    ...Typography.bodyMedium,
    textAlign: 'center',
    maxWidth: 280,
  },
  emptyActions: {
    marginTop: Spacing.xl,
    gap: Spacing.sm,
    width: '100%',
    maxWidth: 280,
  },
  emptyActionButton: {
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing['2xl'],
    borderRadius: Radius.lg,
    alignItems: 'center',
  },
  emptyActionText: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 16,
  },

  // Loading State
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.md,
  },
  loadingText: {
    ...Typography.bodyMedium,
  },

  // Error State
  errorContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing['2xl'],
  },
  errorEmoji: {
    fontSize: 48,
    marginBottom: Spacing.md,
  },
  errorTitle: {
    ...Typography.titleMedium,
    marginBottom: Spacing.sm,
  },
  errorMessage: {
    ...Typography.bodyMedium,
    textAlign: 'center',
  },
});
