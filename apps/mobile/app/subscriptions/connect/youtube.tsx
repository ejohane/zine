/**
 * YouTube OAuth Connect Screen
 *
 * Provides a clear explanation of YouTube permissions before initiating OAuth.
 * Uses PKCE flow via connectProvider from lib/oauth.ts.
 *
 * Per frontend-spec.md Section 7.3:
 * 1. Explains YouTube permissions (readonly access)
 * 2. Shows what we CAN access (subscriptions, channel info)
 * 3. Shows what we WON'T do (never post or modify)
 * 4. Has a "Connect with Google" button (YouTube red #EA4335)
 * 5. Shows loading state during OAuth
 * 6. Uses OAuthErrorBoundary for error handling
 */

import { useState, useCallback } from 'react';
import { View, Text, Pressable, ActivityIndicator, StyleSheet, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import Svg, { Path } from 'react-native-svg';

import { Colors, Spacing, Radius, Typography, Shadows } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { OAuthErrorBoundary } from '@/components/oauth-error-boundary';
import { connectProvider } from '@/lib/oauth';
import { trpc } from '@/lib/trpc';

// YouTube brand color
const YOUTUBE_RED = '#EA4335';

/**
 * YouTube icon component using the official YouTube logo paths
 */
function YouTubeIcon({ size = 48, color = YOUTUBE_RED }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"
        fill={color}
      />
    </Svg>
  );
}

/**
 * Check icon for permission list items
 */
function CheckIcon({ color }: { color: string }) {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
      <Path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z" fill={color} />
    </Svg>
  );
}

/**
 * X icon for "we won't" list items
 */
function XIcon({ color }: { color: string }) {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
      <Path
        d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12 19 6.41z"
        fill={color}
      />
    </Svg>
  );
}

/**
 * Shield/lock icon for security emphasis
 */
function ShieldIcon({ color }: { color: string }) {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
      <Path
        d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm0 10.99h7c-.53 4.12-3.28 7.79-7 8.94V12H5V6.3l7-3.11v8.8z"
        fill={color}
      />
    </Svg>
  );
}

interface PermissionItemProps {
  icon: React.ReactNode;
  text: string;
  colors: typeof Colors.light;
}

function PermissionItem({ icon, text, colors }: PermissionItemProps) {
  return (
    <View style={styles.permissionItem}>
      <View style={styles.permissionIcon}>{icon}</View>
      <Text style={[styles.permissionText, { color: colors.text }]}>{text}</Text>
    </View>
  );
}

function YouTubeConnectContent() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const router = useRouter();
  const utils = trpc.useUtils();

  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleConnect = useCallback(async () => {
    setIsConnecting(true);
    setError(null);

    try {
      await connectProvider('YOUTUBE');
      // Invalidate connections cache so UI shows updated state immediately
      await (utils as any).subscriptions?.connections?.list?.invalidate?.();
      // On success, navigate to subscriptions discover screen
      router.replace('/subscriptions/discover/youtube' as const);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to connect YouTube';
      // Don't show error for user cancellation
      if (!message.toLowerCase().includes('cancelled')) {
        setError(message);
      }
    } finally {
      setIsConnecting(false);
    }
  }, [router, utils]);

  const handleRetry = useCallback(() => {
    setError(null);
    handleConnect();
  }, [handleConnect]);

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: colors.background }]}
      edges={['bottom']}
    >
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Header with YouTube icon */}
        <View style={styles.header}>
          <View style={[styles.iconContainer, { backgroundColor: colors.backgroundSecondary }]}>
            <YouTubeIcon size={48} />
          </View>
          <Text style={[styles.title, { color: colors.text }]}>Connect YouTube</Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
            Import your YouTube subscriptions to see new videos from your favorite creators
          </Text>
        </View>

        {/* What we CAN access */}
        <View style={[styles.permissionSection, { backgroundColor: colors.card }]}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>What Zine can access</Text>
          <Text style={[styles.sectionSubtitle, { color: colors.textSecondary }]}>
            Read-only access to:
          </Text>

          <View style={styles.permissionList}>
            <PermissionItem
              icon={<CheckIcon color={colors.success} />}
              text="Your YouTube subscriptions"
              colors={colors}
            />
            <PermissionItem
              icon={<CheckIcon color={colors.success} />}
              text="Channel names and thumbnails"
              colors={colors}
            />
            <PermissionItem
              icon={<CheckIcon color={colors.success} />}
              text="New video notifications"
              colors={colors}
            />
          </View>
        </View>

        {/* What we WON'T do */}
        <View style={[styles.permissionSection, { backgroundColor: colors.card }]}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>What Zine will never do</Text>

          <View style={styles.permissionList}>
            <PermissionItem
              icon={<XIcon color={colors.error} />}
              text="Post videos or comments"
              colors={colors}
            />
            <PermissionItem
              icon={<XIcon color={colors.error} />}
              text="Modify your subscriptions"
              colors={colors}
            />
            <PermissionItem
              icon={<XIcon color={colors.error} />}
              text="Access your watch history"
              colors={colors}
            />
            <PermissionItem
              icon={<XIcon color={colors.error} />}
              text="Access your playlists"
              colors={colors}
            />
          </View>
        </View>

        {/* Security note */}
        <View style={styles.securityNote}>
          <ShieldIcon color={colors.textSecondary} />
          <Text style={[styles.securityText, { color: colors.textSecondary }]}>
            You can disconnect at any time from Settings. Your data is encrypted and never shared.
          </Text>
        </View>

        {/* Error message */}
        {error && (
          <View style={[styles.errorContainer, { backgroundColor: `${colors.error}15` }]}>
            <Text style={[styles.errorText, { color: colors.error }]}>{error}</Text>
            <Pressable onPress={handleRetry}>
              <Text style={[styles.errorRetry, { color: colors.error }]}>Try again</Text>
            </Pressable>
          </View>
        )}
      </ScrollView>

      {/* Connect button */}
      <View style={[styles.buttonContainer, { borderTopColor: colors.border }]}>
        <Pressable
          onPress={handleConnect}
          disabled={isConnecting}
          style={({ pressed }) => [
            styles.connectButton,
            { backgroundColor: YOUTUBE_RED },
            pressed && styles.connectButtonPressed,
            isConnecting && styles.connectButtonDisabled,
          ]}
        >
          {isConnecting ? (
            <View style={styles.buttonContent}>
              <ActivityIndicator size="small" color="#FFFFFF" />
              <Text style={styles.buttonText}>Connecting...</Text>
            </View>
          ) : (
            <View style={styles.buttonContent}>
              <Svg width={20} height={20} viewBox="0 0 24 24" fill="#FFFFFF">
                <Path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                <Path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                <Path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                <Path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
              </Svg>
              <Text style={styles.buttonText}>Connect with Google</Text>
            </View>
          )}
        </Pressable>

        <Text style={[styles.footerNote, { color: colors.textTertiary }]}>
          By connecting, you agree to our Terms of Service and Privacy Policy
        </Text>
      </View>
    </SafeAreaView>
  );
}

/**
 * YouTube Connect Screen wrapped in OAuthErrorBoundary
 */
export default function YouTubeConnectScreen() {
  return (
    <OAuthErrorBoundary provider="YOUTUBE">
      <YouTubeConnectContent />
    </OAuthErrorBoundary>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    padding: Spacing.lg,
    paddingBottom: Spacing['3xl'],
  },

  // Header
  header: {
    alignItems: 'center',
    marginBottom: Spacing['2xl'],
  },
  iconContainer: {
    width: 88,
    height: 88,
    borderRadius: Radius['2xl'],
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.lg,
  },
  title: {
    ...Typography.headlineMedium,
    marginBottom: Spacing.sm,
    textAlign: 'center',
  },
  subtitle: {
    ...Typography.bodyMedium,
    textAlign: 'center',
    maxWidth: 280,
  },

  // Permission sections
  permissionSection: {
    borderRadius: Radius.lg,
    padding: Spacing.lg,
    marginBottom: Spacing.lg,
    ...Shadows.sm,
  },
  sectionTitle: {
    ...Typography.titleMedium,
    marginBottom: Spacing.xs,
  },
  sectionSubtitle: {
    ...Typography.bodySmall,
    marginBottom: Spacing.md,
  },
  permissionList: {
    gap: Spacing.md,
  },
  permissionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  permissionIcon: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  permissionText: {
    ...Typography.bodyMedium,
    flex: 1,
  },

  // Security note
  securityNote: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.sm,
  },
  securityText: {
    ...Typography.bodySmall,
    flex: 1,
  },

  // Error
  errorContainer: {
    borderRadius: Radius.md,
    padding: Spacing.md,
    marginTop: Spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.md,
  },
  errorText: {
    ...Typography.bodySmall,
    flex: 1,
  },
  errorRetry: {
    ...Typography.labelMedium,
    fontWeight: '600',
  },

  // Button
  buttonContainer: {
    padding: Spacing.lg,
    paddingBottom: Spacing.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  connectButton: {
    borderRadius: Radius.lg,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing['2xl'],
    alignItems: 'center',
    justifyContent: 'center',
    ...Shadows.md,
  },
  connectButtonPressed: {
    opacity: 0.9,
    transform: [{ scale: 0.98 }],
  },
  connectButtonDisabled: {
    opacity: 0.7,
  },
  buttonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  buttonText: {
    color: '#FFFFFF',
    ...Typography.labelLarge,
    fontWeight: '600',
  },
  footerNote: {
    ...Typography.bodySmall,
    textAlign: 'center',
    marginTop: Spacing.md,
  },
});
