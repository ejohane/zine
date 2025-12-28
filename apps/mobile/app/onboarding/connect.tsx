/**
 * Onboarding Provider Connection Screen
 *
 * Shows available providers (YouTube, Spotify) for new users to connect.
 * Includes a skip option for users who want to set up later.
 * Displays a Continue button once at least one provider is connected.
 *
 * @see features/subscriptions/frontend-spec.md Section 4 (Onboarding Flow)
 */

import { useCallback } from 'react';
import { View, Text, Pressable, StyleSheet, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import Svg, { Path } from 'react-native-svg';

import { Colors, Spacing, Radius, Typography, Shadows, ProviderColors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useConnections, type Connection } from '@/hooks/use-connections';

// ============================================================================
// Icons
// ============================================================================

function YouTubeIcon({ size = 32 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"
        fill={ProviderColors.youtube}
      />
    </Svg>
  );
}

function SpotifyIcon({ size = 32 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"
        fill={ProviderColors.spotify}
      />
    </Svg>
  );
}

function CheckIcon({ color }: { color: string }) {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
      <Path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z" fill={color} />
    </Svg>
  );
}

function ChevronRightIcon({ color }: { color: string }) {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
      <Path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6-6-6z" fill={color} />
    </Svg>
  );
}

// ============================================================================
// Provider Card Component
// ============================================================================

interface ProviderCardProps {
  icon: React.ReactNode;
  name: string;
  description: string;
  isConnected: boolean;
  onPress: () => void;
  colors: typeof Colors.light;
}

function ProviderCard({
  icon,
  name,
  description,
  isConnected,
  onPress,
  colors,
}: ProviderCardProps) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.providerCard,
        { backgroundColor: colors.card },
        pressed && styles.providerCardPressed,
      ]}
    >
      <View style={styles.providerCardLeft}>
        <View
          style={[styles.providerIconContainer, { backgroundColor: colors.backgroundSecondary }]}
        >
          {icon}
        </View>
        <View style={styles.providerInfo}>
          <Text style={[styles.providerName, { color: colors.text }]}>{name}</Text>
          <Text style={[styles.providerDescription, { color: colors.textSecondary }]}>
            {description}
          </Text>
        </View>
      </View>
      <View style={styles.providerCardRight}>
        {isConnected ? (
          <View style={[styles.connectedBadge, { backgroundColor: `${colors.success}15` }]}>
            <CheckIcon color={colors.success} />
            <Text style={[styles.connectedText, { color: colors.success }]}>Connected</Text>
          </View>
        ) : (
          <View style={[styles.connectButton, { backgroundColor: colors.primary }]}>
            <Text style={styles.connectButtonText}>Connect</Text>
          </View>
        )}
      </View>
    </Pressable>
  );
}

// ============================================================================
// Coming Soon Card Component
// ============================================================================

interface ComingSoonCardProps {
  colors: typeof Colors.light;
}

function ComingSoonCard({ colors }: ComingSoonCardProps) {
  return (
    <View style={[styles.comingSoonCard, { backgroundColor: colors.backgroundSecondary }]}>
      <Text style={[styles.comingSoonTitle, { color: colors.textSecondary }]}>
        More coming soon...
      </Text>
      <Text style={[styles.comingSoonDescription, { color: colors.textTertiary }]}>
        RSS, Substack, X (Twitter)
      </Text>
    </View>
  );
}

// ============================================================================
// Main Component
// ============================================================================

export default function OnboardingConnectScreen() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const router = useRouter();

  // Fetch connection status
  const { data: connections } = useConnections();

  // Check if providers are connected
  const youtubeConnection = connections?.find((c: Connection) => c.provider === 'YOUTUBE');
  const spotifyConnection = connections?.find((c: Connection) => c.provider === 'SPOTIFY');

  const isYouTubeConnected = youtubeConnection?.status === 'ACTIVE';
  const isSpotifyConnected = spotifyConnection?.status === 'ACTIVE';
  const hasAnyConnection = isYouTubeConnected || isSpotifyConnected;

  // Navigation handlers
  const handleConnectYouTube = useCallback(() => {
    router.push('/subscriptions/connect/youtube');
  }, [router]);

  const handleConnectSpotify = useCallback(() => {
    router.push('/subscriptions/connect/spotify');
  }, [router]);

  const handleSkip = useCallback(() => {
    // Navigate to main app (tabs)
    router.replace('/(tabs)');
  }, [router]);

  const handleContinue = useCallback(() => {
    // Navigate to main app (tabs)
    router.replace('/(tabs)');
  }, [router]);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={[styles.title, { color: colors.text }]}>Connect your favorite sources</Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
            Import your subscriptions from YouTube and Spotify to get started
          </Text>
        </View>

        {/* Provider Cards */}
        <View style={styles.providersContainer}>
          <ProviderCard
            icon={<YouTubeIcon />}
            name="YouTube"
            description="Connect your subscriptions"
            isConnected={isYouTubeConnected}
            onPress={handleConnectYouTube}
            colors={colors}
          />

          <ProviderCard
            icon={<SpotifyIcon />}
            name="Spotify"
            description="Connect your podcasts"
            isConnected={isSpotifyConnected}
            onPress={handleConnectSpotify}
            colors={colors}
          />

          <ComingSoonCard colors={colors} />
        </View>

        {/* Connection status hint */}
        {hasAnyConnection && (
          <View style={styles.statusHint}>
            <Text style={[styles.statusHintText, { color: colors.success }]}>
              You&apos;re all set! Tap Continue to start browsing.
            </Text>
          </View>
        )}
      </ScrollView>

      {/* Bottom Actions */}
      <View style={[styles.bottomActions, { borderTopColor: colors.border }]}>
        {hasAnyConnection ? (
          <Pressable
            onPress={handleContinue}
            style={({ pressed }) => [
              styles.continueButton,
              { backgroundColor: colors.primary },
              pressed && styles.buttonPressed,
            ]}
          >
            <Text style={styles.continueButtonText}>Continue</Text>
            <ChevronRightIcon color="#FFFFFF" />
          </Pressable>
        ) : (
          <Pressable
            onPress={handleSkip}
            style={({ pressed }) => [styles.skipButton, pressed && styles.buttonPressed]}
          >
            <Text style={[styles.skipButtonText, { color: colors.textSecondary }]}>
              Skip for now
            </Text>
          </Pressable>
        )}
      </View>
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
    paddingTop: Spacing['3xl'],
  },

  // Header
  header: {
    marginBottom: Spacing['2xl'],
  },
  title: {
    ...Typography.headlineLarge,
    marginBottom: Spacing.sm,
    textAlign: 'center',
  },
  subtitle: {
    ...Typography.bodyMedium,
    textAlign: 'center',
    maxWidth: 300,
    alignSelf: 'center',
  },

  // Provider Cards
  providersContainer: {
    gap: Spacing.md,
  },
  providerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: Spacing.lg,
    borderRadius: Radius.lg,
    ...Shadows.sm,
  },
  providerCardPressed: {
    opacity: 0.9,
    transform: [{ scale: 0.98 }],
  },
  providerCardLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    flex: 1,
  },
  providerIconContainer: {
    width: 56,
    height: 56,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  providerInfo: {
    flex: 1,
  },
  providerName: {
    ...Typography.titleMedium,
    marginBottom: Spacing.xs,
  },
  providerDescription: {
    ...Typography.bodySmall,
  },
  providerCardRight: {
    marginLeft: Spacing.md,
  },

  // Connected badge
  connectedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.full,
  },
  connectedText: {
    ...Typography.labelMedium,
    fontWeight: '600',
  },

  // Connect button
  connectButton: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.full,
  },
  connectButtonText: {
    color: '#FFFFFF',
    ...Typography.labelMedium,
    fontWeight: '600',
  },

  // Coming soon card
  comingSoonCard: {
    padding: Spacing.lg,
    borderRadius: Radius.lg,
    alignItems: 'center',
  },
  comingSoonTitle: {
    ...Typography.titleSmall,
    marginBottom: Spacing.xs,
  },
  comingSoonDescription: {
    ...Typography.bodySmall,
  },

  // Status hint
  statusHint: {
    marginTop: Spacing['2xl'],
    alignItems: 'center',
  },
  statusHintText: {
    ...Typography.bodyMedium,
    fontWeight: '500',
  },

  // Bottom actions
  bottomActions: {
    padding: Spacing.lg,
    paddingBottom: Spacing.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  continueButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing['2xl'],
    borderRadius: Radius.lg,
    ...Shadows.md,
  },
  continueButtonText: {
    color: '#FFFFFF',
    ...Typography.labelLarge,
    fontWeight: '600',
  },
  skipButton: {
    paddingVertical: Spacing.md,
    alignItems: 'center',
  },
  skipButtonText: {
    ...Typography.labelLarge,
  },
  buttonPressed: {
    opacity: 0.9,
    transform: [{ scale: 0.98 }],
  },
});
