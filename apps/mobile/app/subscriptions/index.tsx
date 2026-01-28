/**
 * Subscriptions Screen
 *
 * Shows provider cards (YouTube, Spotify) that users can tap to manage
 * their subscriptions for each provider.
 */

import { useRouter, type Href } from 'expo-router';
import { Surface } from 'heroui-native';
import { View, Text, Pressable, StyleSheet, ActivityIndicator, ScrollView } from 'react-native';
import Animated from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';

import { Colors, Spacing, Radius, Typography } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useConnections, type Connection } from '@/hooks/use-connections';
import { useSubscriptions } from '@/hooks/use-subscriptions';
import { getStatusDisplay, type ConnectionStatus } from '@/lib/connection-status';

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

function ChevronRightIcon({ size = 20, color = '#6A6A6A' }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2}>
      <Path d="m9 18 6-6-6-6" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

// ============================================================================
// Types
// ============================================================================

interface ProviderCardProps {
  provider: 'YOUTUBE' | 'SPOTIFY';
  connectionStatus: ConnectionStatus;
  subscriptionCount: number;
  onPress: () => void;
  colors: typeof Colors.dark;
}

// ============================================================================
// Components
// ============================================================================

function ProviderCard({
  provider,
  connectionStatus,
  subscriptionCount,
  onPress,
  colors,
}: ProviderCardProps) {
  const config = {
    YOUTUBE: {
      name: 'YouTube',
      icon: YouTubeIcon,
      brandColor: '#FF0000',
    },
    SPOTIFY: {
      name: 'Spotify',
      icon: SpotifyIcon,
      brandColor: '#1DB954',
    },
  }[provider];

  const Icon = config.icon;

  // Get display state based on connection status
  const statusDisplay = getStatusDisplay(connectionStatus, colors);

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.providerCard, pressed && { opacity: 0.8 }]}
    >
      <View style={[styles.providerIconContainer, { backgroundColor: config.brandColor }]}>
        <Icon size={24} color="#FFFFFF" />
      </View>
      <View style={styles.providerContent}>
        <Text style={[styles.providerName, { color: colors.text }]}>{config.name}</Text>
        <View style={styles.providerStatusRow}>
          <View style={[styles.statusDot, { backgroundColor: statusDisplay.dotColor }]} />
          <Text style={[styles.providerStatus, { color: statusDisplay.textColor }]}>
            {statusDisplay.text}
          </Text>
          {statusDisplay.showCount && subscriptionCount > 0 && (
            <Text style={[styles.providerCount, { color: colors.textTertiary }]}>
              {' '}
              · {subscriptionCount} subscription{subscriptionCount !== 1 ? 's' : ''}
            </Text>
          )}
        </View>
      </View>
      <ChevronRightIcon size={20} color={colors.textTertiary} />
    </Pressable>
  );
}

function LoadingState({ colors }: { colors: typeof Colors.dark }) {
  return (
    <View style={styles.loadingContainer}>
      <ActivityIndicator size="large" color={colors.primary} />
    </View>
  );
}

// ============================================================================
// Main Screen
// ============================================================================

export default function SubscriptionsScreen() {
  const router = useRouter();
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'dark'];

  const { data: connections, isLoading: connectionsLoading } = useConnections();
  const { subscriptions, isLoading: subscriptionsLoading } = useSubscriptions();

  const isLoading = connectionsLoading || subscriptionsLoading;

  // Get connection status for each provider
  const youtubeConnection = connections?.find(
    (connection: Connection) => connection.provider === 'YOUTUBE'
  );
  const spotifyConnection = connections?.find(
    (connection: Connection) => connection.provider === 'SPOTIFY'
  );
  const youtubeStatus = (youtubeConnection?.status as ConnectionStatus) ?? null;
  const spotifyStatus = (spotifyConnection?.status as ConnectionStatus) ?? null;

  // Count subscriptions per provider
  const youtubeCount = subscriptions.filter((s) => s.provider === 'YOUTUBE').length;
  const spotifyCount = subscriptions.filter((s) => s.provider === 'SPOTIFY').length;

  const handleProviderPress = (provider: 'YOUTUBE' | 'SPOTIFY') => {
    router.push(`/subscriptions/${provider.toLowerCase()}` as Href);
  };

  if (isLoading) {
    return (
      <Surface style={[styles.container, { backgroundColor: colors.background }]}>
        <LoadingState colors={colors} />
      </Surface>
    );
  }

  return (
    <Surface style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView
        contentContainerStyle={styles.content}
        contentInsetAdjustmentBehavior="automatic"
        showsVerticalScrollIndicator={false}
      >
        <Animated.View>
          <ProviderCard
            provider="YOUTUBE"
            connectionStatus={youtubeStatus}
            subscriptionCount={youtubeCount}
            onPress={() => handleProviderPress('YOUTUBE')}
            colors={colors}
          />
        </Animated.View>

        <Animated.View>
          <ProviderCard
            provider="SPOTIFY"
            connectionStatus={spotifyStatus}
            subscriptionCount={spotifyCount}
            onPress={() => handleProviderPress('SPOTIFY')}
            colors={colors}
          />
        </Animated.View>
      </ScrollView>
    </Surface>
  );
}

// ============================================================================
// Styles
// ============================================================================

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: Spacing.lg,
    gap: Spacing.md,
  },
  providerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.md,
  },
  providerIconContainer: {
    width: 48,
    height: 48,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: Spacing.md,
  },
  providerContent: {
    flex: 1,
  },
  providerName: {
    ...Typography.titleMedium,
    marginBottom: Spacing.xs,
  },
  providerStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: Spacing.sm,
  },
  providerStatus: {
    ...Typography.bodySmall,
  },
  providerCount: {
    ...Typography.bodySmall,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
