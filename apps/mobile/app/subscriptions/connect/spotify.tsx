/**
 * Spotify Connect Screen
 *
 * OAuth connect screen for Spotify. Explains what permissions are requested
 * and initiates the OAuth flow using connectProvider from lib/oauth.
 *
 * Features:
 * - Explains Spotify permissions (saved shows, podcast info)
 * - "Connect with Spotify" button with Spotify green branding (#1DB954)
 * - Loading state during OAuth flow
 * - OAuthErrorBoundary for graceful error handling
 *
 * @see features/subscriptions/frontend-spec.md Section 7.4
 */

import { useState, useCallback } from 'react';
import { View, Text, Pressable, StyleSheet, ActivityIndicator, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';

import { Colors, Typography, Spacing, Radius, ProviderColors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { OAuthErrorBoundary } from '@/components/oauth-error-boundary';
import { connectProvider } from '@/lib/oauth';
import { trpc } from '@/lib/trpc';

// Spotify brand color
const SPOTIFY_GREEN = ProviderColors.spotify;

/**
 * Permission item component for displaying OAuth scopes
 */
function PermissionItem({
  icon,
  title,
  description,
  colors,
}: {
  icon: string;
  title: string;
  description: string;
  colors: typeof Colors.light;
}) {
  return (
    <View style={styles.permissionItem}>
      <Text style={styles.permissionIcon}>{icon}</Text>
      <View style={styles.permissionText}>
        <Text style={[styles.permissionTitle, { color: colors.text }]}>{title}</Text>
        <Text style={[styles.permissionDescription, { color: colors.textSecondary }]}>
          {description}
        </Text>
      </View>
    </View>
  );
}

/**
 * Main content component - separated for error boundary
 */
function SpotifyConnectContent() {
  const router = useRouter();
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const utils = trpc.useUtils();

  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleConnect = useCallback(async () => {
    setIsConnecting(true);
    setError(null);

    try {
      await connectProvider('SPOTIFY');
      // Invalidate connections cache so UI shows updated state immediately
      await (utils as any).subscriptions?.connections?.list?.invalidate?.();
      // On success, navigate back to subscriptions screen
      // TODO: Navigate to /subscriptions/discover/spotify when discover screen is implemented
      router.replace('/subscriptions' as never);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Connection failed';
      // Handle user cancellation gracefully
      if (message.includes('cancelled') || message.includes('cancel')) {
        setError(null); // Don't show error for cancellation
      } else {
        setError(message);
      }
    } finally {
      setIsConnecting(false);
    }
  }, [router, utils]);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.header}>
          <View style={[styles.iconContainer, { backgroundColor: `${SPOTIFY_GREEN}15` }]}>
            <Text style={styles.providerIcon}>🎧</Text>
          </View>
          <Text style={[styles.title, { color: colors.text }]}>Connect Spotify</Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
            Import your saved podcasts and shows to Zine
          </Text>
        </View>

        {/* Permissions Section */}
        <View
          style={[
            styles.permissionsCard,
            { backgroundColor: colors.card, borderColor: colors.border },
          ]}
        >
          <Text style={[styles.permissionsHeader, { color: colors.textSecondary }]}>
            WHAT WE&apos;LL ACCESS
          </Text>
          <View style={styles.permissionsList}>
            <PermissionItem
              icon="📚"
              title="Your Saved Shows"
              description="See your saved podcasts and shows"
              colors={colors}
            />
            <PermissionItem
              icon="📋"
              title="Show Information"
              description="Read podcast names, descriptions, and artwork"
              colors={colors}
            />
          </View>
        </View>

        {/* Privacy Note */}
        <View style={styles.privacySection}>
          <Text style={[styles.privacyText, { color: colors.textTertiary }]}>
            🔒 We only read your podcast subscriptions. We cannot modify your Spotify library, play
            content, or access your listening history.
          </Text>
        </View>

        {/* Error Message */}
        {error && (
          <View style={[styles.errorContainer, { backgroundColor: `${colors.error}15` }]}>
            <Text style={[styles.errorText, { color: colors.error }]}>{error}</Text>
          </View>
        )}

        {/* Connect Button */}
        <Pressable
          style={[
            styles.connectButton,
            { backgroundColor: SPOTIFY_GREEN },
            isConnecting && styles.buttonDisabled,
          ]}
          onPress={handleConnect}
          disabled={isConnecting}
        >
          {isConnecting ? (
            <ActivityIndicator color="#FFFFFF" size="small" />
          ) : (
            <>
              <Text style={styles.spotifyLogo}>🎵</Text>
              <Text style={styles.connectButtonText}>Connect with Spotify</Text>
            </>
          )}
        </Pressable>

        {/* Loading State Message */}
        {isConnecting && (
          <Text style={[styles.loadingText, { color: colors.textSecondary }]}>
            Opening Spotify authorization...
          </Text>
        )}

        {/* Footer */}
        <View style={styles.footer}>
          <Text style={[styles.footerText, { color: colors.textTertiary }]}>
            By connecting, you agree to allow Zine to access your Spotify data as described above.
            You can disconnect at any time from Settings.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

/**
 * Spotify OAuth Connect Screen
 *
 * Wrapped in OAuthErrorBoundary for graceful error handling.
 */
export default function SpotifyConnectScreen() {
  const router = useRouter();

  const handleRetry = useCallback(() => {
    // Reset the screen to allow retry
    router.replace('/subscriptions/connect/spotify' as never);
  }, [router]);

  return (
    <OAuthErrorBoundary provider="SPOTIFY" onRetry={handleRetry}>
      <SpotifyConnectContent />
    </OAuthErrorBoundary>
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
    flexGrow: 1,
    paddingHorizontal: Spacing['2xl'],
    paddingTop: Spacing['3xl'],
    paddingBottom: Spacing['2xl'],
  },
  header: {
    alignItems: 'center',
    marginBottom: Spacing['3xl'],
  },
  iconContainer: {
    width: 80,
    height: 80,
    borderRadius: Radius['2xl'],
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.lg,
  },
  providerIcon: {
    fontSize: 40,
  },
  title: {
    ...Typography.headlineMedium,
    marginBottom: Spacing.sm,
    textAlign: 'center',
  },
  subtitle: {
    ...Typography.bodyLarge,
    textAlign: 'center',
    paddingHorizontal: Spacing.lg,
  },
  permissionsCard: {
    borderRadius: Radius.lg,
    borderWidth: 1,
    padding: Spacing.lg,
    marginBottom: Spacing.xl,
  },
  permissionsHeader: {
    ...Typography.labelSmall,
    marginBottom: Spacing.md,
  },
  permissionsList: {
    gap: Spacing.lg,
  },
  permissionItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.md,
  },
  permissionIcon: {
    fontSize: 24,
    marginTop: 2,
  },
  permissionText: {
    flex: 1,
  },
  permissionTitle: {
    ...Typography.titleSmall,
    marginBottom: Spacing.xs,
  },
  permissionDescription: {
    ...Typography.bodySmall,
  },
  privacySection: {
    marginBottom: Spacing.xl,
  },
  privacyText: {
    ...Typography.bodySmall,
    textAlign: 'center',
    lineHeight: 18,
  },
  errorContainer: {
    borderRadius: Radius.md,
    padding: Spacing.md,
    marginBottom: Spacing.lg,
  },
  errorText: {
    ...Typography.bodyMedium,
    textAlign: 'center',
  },
  connectButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.lg,
    borderRadius: Radius.lg,
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  spotifyLogo: {
    fontSize: 20,
  },
  connectButtonText: {
    ...Typography.titleMedium,
    color: '#FFFFFF',
  },
  loadingText: {
    ...Typography.bodySmall,
    textAlign: 'center',
    marginBottom: Spacing.lg,
  },
  footer: {
    marginTop: 'auto',
    paddingTop: Spacing.xl,
  },
  footerText: {
    ...Typography.bodySmall,
    textAlign: 'center',
    lineHeight: 18,
  },
});
