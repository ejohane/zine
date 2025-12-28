/**
 * Connections Management Screen
 *
 * Shows connected OAuth providers (YouTube, Spotify) with status and actions.
 * Users can see connection status, connect new providers, or disconnect existing ones.
 *
 * States per provider:
 * - Not connected: "Not connected" text + Connect button
 * - Connected: Email/ID + "Connected since" date + Disconnect link
 *
 * @see features/subscriptions/frontend-spec.md Section 3.2
 */

import { useCallback, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Alert,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, type Href } from 'expo-router';

import { Colors, Typography, Spacing, Radius, ProviderColors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useConnections, type Connection, type ConnectionProvider } from '@/hooks/use-connections';
import { trpc } from '@/lib/trpc';

// ============================================================================
// Types
// ============================================================================

interface ProviderCardProps {
  provider: ConnectionProvider;
  connection: Connection | undefined;
  colors: typeof Colors.light;
  onConnect: () => void;
  onDisconnect: () => void;
  isDisconnecting: boolean;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Format a date as "Month DD, YYYY"
 */
function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

// ============================================================================
// Components
// ============================================================================

/**
 * Provider connection card
 */
function ProviderCard({
  provider,
  connection,
  colors,
  onConnect,
  onDisconnect,
  isDisconnecting,
}: ProviderCardProps) {
  const isConnected = connection?.status === 'ACTIVE';

  const providerConfig = {
    YOUTUBE: {
      icon: '🎬',
      name: 'YouTube',
      color: ProviderColors.youtube,
      description: 'Import subscriptions from your YouTube account',
    },
    SPOTIFY: {
      icon: '🎧',
      name: 'Spotify',
      color: ProviderColors.spotify,
      description: 'Import podcasts from your Spotify account',
    },
  };

  const config = providerConfig[provider];

  return (
    <View
      style={[styles.providerCard, { backgroundColor: colors.card, borderColor: colors.border }]}
    >
      {/* Header */}
      <View style={styles.providerHeader}>
        <View style={[styles.iconContainer, { backgroundColor: `${config.color}15` }]}>
          <Text style={styles.providerIcon}>{config.icon}</Text>
        </View>
        <View style={styles.providerInfo}>
          <Text style={[styles.providerName, { color: colors.text }]}>{config.name}</Text>
          <Text style={[styles.providerDescription, { color: colors.textSecondary }]}>
            {config.description}
          </Text>
        </View>
      </View>

      {/* Status Section */}
      <View style={[styles.statusSection, { borderTopColor: colors.borderLight }]}>
        {isConnected ? (
          <>
            <View style={styles.connectedInfo}>
              <View style={styles.statusRow}>
                <View style={[styles.statusDot, { backgroundColor: colors.success }]} />
                <Text style={[styles.statusText, { color: colors.success }]}>Connected</Text>
              </View>
              {connection?.providerUserId && (
                <Text style={[styles.userId, { color: colors.textSecondary }]}>
                  {connection.providerUserId}
                </Text>
              )}
              <Text style={[styles.connectedSince, { color: colors.textTertiary }]}>
                Connected since {formatDate(connection.createdAt)}
              </Text>
            </View>
            <Pressable
              style={[styles.disconnectButton, isDisconnecting && styles.buttonDisabled]}
              onPress={onDisconnect}
              disabled={isDisconnecting}
            >
              {isDisconnecting ? (
                <ActivityIndicator size="small" color={colors.error} />
              ) : (
                <Text style={[styles.disconnectText, { color: colors.error }]}>Disconnect</Text>
              )}
            </Pressable>
          </>
        ) : (
          <>
            <View style={styles.notConnectedInfo}>
              <View style={styles.statusRow}>
                <View style={[styles.statusDot, { backgroundColor: colors.textTertiary }]} />
                <Text style={[styles.statusText, { color: colors.textTertiary }]}>
                  Not connected
                </Text>
              </View>
            </View>
            <Pressable
              style={[styles.connectButton, { backgroundColor: config.color }]}
              onPress={onConnect}
            >
              <Text style={styles.connectText}>Connect</Text>
            </Pressable>
          </>
        )}
      </View>
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
        Loading connections...
      </Text>
    </View>
  );
}

// ============================================================================
// Main Screen
// ============================================================================

export default function ConnectionsScreen() {
  const router = useRouter();
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];

  const { data: connections, isLoading } = useConnections();
  const [disconnectingProvider, setDisconnectingProvider] = useState<ConnectionProvider | null>(
    null
  );

  // Get the tRPC utils for cache invalidation
  // Using type assertion until subscriptions router types are properly exported

  const utils = trpc.useUtils() as any;

  // Disconnect mutation - using type assertion until router types are updated

  const disconnectMutation = (trpc as any).subscriptions.connections.disconnect.useMutation({
    onSuccess: () => {
      // Invalidate connections query to refresh the list
      utils.subscriptions?.connections?.list?.invalidate?.();
      // Also invalidate subscriptions since disconnect marks them as DISCONNECTED
      utils.subscriptions?.list?.invalidate?.();
    },
    onError: (error: Error) => {
      Alert.alert('Disconnect Failed', error.message || 'Failed to disconnect. Please try again.');
    },
    onSettled: () => {
      setDisconnectingProvider(null);
    },
  });

  // Get individual provider connections
  const youtubeConnection = connections?.find((c: Connection) => c.provider === 'YOUTUBE');
  const spotifyConnection = connections?.find((c: Connection) => c.provider === 'SPOTIFY');

  // Navigation handlers
  const handleConnectYouTube = useCallback(() => {
    router.push('/subscriptions/connect/youtube' as Href);
  }, [router]);

  const handleConnectSpotify = useCallback(() => {
    router.push('/subscriptions/connect/spotify' as Href);
  }, [router]);

  // Disconnect handlers with confirmation
  const handleDisconnectYouTube = useCallback(() => {
    Alert.alert(
      'Disconnect YouTube',
      'Are you sure you want to disconnect YouTube? Your subscriptions will be marked as disconnected.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Disconnect',
          style: 'destructive',
          onPress: () => {
            setDisconnectingProvider('YOUTUBE');
            disconnectMutation.mutate({ provider: 'YOUTUBE' });
          },
        },
      ]
    );
  }, [disconnectMutation]);

  const handleDisconnectSpotify = useCallback(() => {
    Alert.alert(
      'Disconnect Spotify',
      'Are you sure you want to disconnect Spotify? Your subscriptions will be marked as disconnected.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Disconnect',
          style: 'destructive',
          onPress: () => {
            setDisconnectingProvider('SPOTIFY');
            disconnectMutation.mutate({ provider: 'SPOTIFY' });
          },
        },
      ]
    );
  }, [disconnectMutation]);

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
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Header Description */}
        <Text style={[styles.headerDescription, { color: colors.textSecondary }]}>
          Connect your accounts to import subscriptions and get updates in your inbox.
        </Text>

        {/* YouTube Card */}
        <ProviderCard
          provider="YOUTUBE"
          connection={youtubeConnection}
          colors={colors}
          onConnect={handleConnectYouTube}
          onDisconnect={handleDisconnectYouTube}
          isDisconnecting={disconnectingProvider === 'YOUTUBE'}
        />

        {/* Spotify Card */}
        <ProviderCard
          provider="SPOTIFY"
          connection={spotifyConnection}
          colors={colors}
          onConnect={handleConnectSpotify}
          onDisconnect={handleDisconnectSpotify}
          isDisconnecting={disconnectingProvider === 'SPOTIFY'}
        />

        {/* Privacy Note */}
        <View style={styles.privacySection}>
          <Text style={[styles.privacyText, { color: colors.textTertiary }]}>
            🔒 Your data is encrypted and never shared. Disconnecting a provider removes our access
            but preserves your saved content.
          </Text>
        </View>
      </ScrollView>
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
  scrollContent: {
    padding: Spacing.lg,
    paddingBottom: Spacing['3xl'],
  },

  // Header
  headerDescription: {
    ...Typography.bodyMedium,
    marginBottom: Spacing.xl,
    textAlign: 'center',
  },

  // Provider Card
  providerCard: {
    borderRadius: Radius.lg,
    borderWidth: 1,
    marginBottom: Spacing.lg,
    overflow: 'hidden',
  },
  providerHeader: {
    flexDirection: 'row',
    padding: Spacing.lg,
  },
  iconContainer: {
    width: 56,
    height: 56,
    borderRadius: Radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  providerIcon: {
    fontSize: 28,
  },
  providerInfo: {
    flex: 1,
    marginLeft: Spacing.md,
    justifyContent: 'center',
  },
  providerName: {
    ...Typography.titleMedium,
    marginBottom: Spacing.xs,
  },
  providerDescription: {
    ...Typography.bodySmall,
    lineHeight: 18,
  },

  // Status Section
  statusSection: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: Spacing.sm,
  },
  statusText: {
    ...Typography.labelMedium,
  },

  // Connected State
  connectedInfo: {
    flex: 1,
  },
  userId: {
    ...Typography.bodySmall,
    marginTop: Spacing.xs,
  },
  connectedSince: {
    ...Typography.bodySmall,
    marginTop: 2,
    fontSize: 11,
  },
  disconnectButton: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    marginLeft: Spacing.md,
  },
  disconnectText: {
    ...Typography.labelMedium,
    fontWeight: '500',
  },

  // Not Connected State
  notConnectedInfo: {
    flex: 1,
  },
  connectButton: {
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.md,
  },
  connectText: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 14,
  },

  // Disabled state
  buttonDisabled: {
    opacity: 0.5,
  },

  // Privacy Section
  privacySection: {
    marginTop: Spacing.lg,
    paddingHorizontal: Spacing.sm,
  },
  privacyText: {
    ...Typography.bodySmall,
    textAlign: 'center',
    lineHeight: 18,
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
});
