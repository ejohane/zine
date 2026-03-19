/**
 * Settings Main Screen
 *
 * Main settings screen displaying:
 * - Connected Accounts (YouTube/Spotify connection status)
 * - Subscriptions (count and link to manage)
 * - Account (Sign Out)
 * - About (version, terms, privacy)
 *
 * @see features/subscriptions/frontend-spec.md Section 3 (Settings Screen)
 */

import { View, Text, ScrollView, Pressable, StyleSheet, Linking, Share } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useClerk } from '@clerk/clerk-expo';
import Constants from 'expo-constants';

import { Colors, Spacing, Radius } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useConnections, type Connection } from '@/hooks/use-connections';
import { useSubscriptions } from '@/hooks/use-subscriptions-query';
import { buildMobileDiagnosticBundle } from '@/lib/diagnostics';
import { settingsLogger } from '@/lib/logger';
import { useAuthAvailability } from '@/providers/auth-provider';

// ============================================================================
// Types
// ============================================================================

interface SettingsRowProps {
  title: string;
  subtitle?: string;
  icon?: string;
  rightText?: string;
  rightTextColor?: string;
  onPress?: () => void;
  titleColor?: string;
}

// ============================================================================
// Components
// ============================================================================

/**
 * Reusable settings row component
 */
function SettingsRow({
  title,
  subtitle,
  icon,
  rightText,
  rightTextColor,
  onPress,
  titleColor,
}: SettingsRowProps) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];

  const content = (
    <View style={styles.row}>
      <View style={styles.rowLeft}>
        {icon && <Text style={styles.providerIcon}>{icon}</Text>}
        <View style={icon ? undefined : styles.rowTextContainer}>
          <Text style={[styles.rowTitle, { color: titleColor ?? colors.text }]}>{title}</Text>
          {subtitle && (
            <Text style={[styles.rowSubtitle, { color: colors.textSubheader }]}>{subtitle}</Text>
          )}
        </View>
      </View>
      {rightText && (
        <Text style={{ color: rightTextColor ?? colors.textTertiary }}>{rightText}</Text>
      )}
    </View>
  );

  if (onPress) {
    return (
      <Pressable onPress={onPress} style={({ pressed }) => [pressed && styles.rowPressed]}>
        {content}
      </Pressable>
    );
  }

  return content;
}

// ============================================================================
// Main Component
// ============================================================================

export default function SettingsScreen() {
  const { isEnabled } = useAuthAvailability();

  if (!isEnabled) {
    return <SettingsScreenContent authEnabled={false} />;
  }

  return <AuthenticatedSettingsScreen />;
}

function AuthenticatedSettingsScreen() {
  const { signOut } = useClerk();
  return <SettingsScreenContent authEnabled={true} signOut={signOut} />;
}

function SettingsScreenContent({
  authEnabled,
  signOut,
}: {
  authEnabled: boolean;
  signOut?: () => Promise<void>;
}) {
  const router = useRouter();
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const isStorybookEnabled = process.env.EXPO_PUBLIC_STORYBOOK_ENABLED === 'true';
  const isDeveloperDiagnosticsEnabled = __DEV__ || isStorybookEnabled;

  // Data hooks
  const { data: connections } = useConnections();
  const { data: subscriptionsData } = useSubscriptions();

  // Extract connection status
  const youtubeConnection = connections?.find((c: Connection) => c.provider === 'YOUTUBE');
  const spotifyConnection = connections?.find((c: Connection) => c.provider === 'SPOTIFY');
  const gmailConnection = connections?.find((c: Connection) => c.provider === 'GMAIL');

  // Get subscription count from items array
  const activeSubscriptionCount = subscriptionsData?.items?.length ?? 0;

  // Get app version from expo-constants
  const appVersion = Constants.expoConfig?.version ?? '1.0.0';
  const buildNumber =
    Constants.expoConfig?.ios?.buildNumber ?? Constants.expoConfig?.android?.versionCode ?? '1';

  // Handlers
  const handleSignOut = async () => {
    if (!signOut) {
      return;
    }

    try {
      await signOut();
      router.replace('/(auth)/sign-in');
    } catch (error) {
      settingsLogger.error('Sign out failed', { error });
    }
  };

  const handleOpenTerms = () => {
    Linking.openURL('https://zine.app/terms');
  };

  const handleOpenPrivacy = () => {
    Linking.openURL('https://zine.app/privacy');
  };

  const handleShareDiagnosticBundle = async () => {
    try {
      const bundle = await buildMobileDiagnosticBundle();
      await Share.share({
        message: JSON.stringify(bundle, null, 2),
      });
    } catch (error) {
      settingsLogger.error('Failed to share mobile diagnostic bundle', { error });
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={[]}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Connected Accounts Section */}
        <Text style={[styles.sectionTitle, { color: colors.textSubheader }]}>
          CONNECTED ACCOUNTS
        </Text>

        <View style={[styles.section, { backgroundColor: colors.card }]}>
          {/* YouTube */}
          <SettingsRow
            icon="🎬"
            title="YouTube"
            subtitle={
              youtubeConnection?.status === 'ACTIVE'
                ? youtubeConnection.providerUserId || 'Connected'
                : 'Not connected'
            }
            rightText={youtubeConnection?.status === 'ACTIVE' ? 'Connected' : 'Add'}
            rightTextColor={
              youtubeConnection?.status === 'ACTIVE' ? colors.success : colors.textTertiary
            }
            onPress={() =>
              router.push({ pathname: '/settings/connections', params: { provider: 'youtube' } })
            }
          />

          {/* Spotify */}
          <SettingsRow
            icon="🎧"
            title="Spotify"
            subtitle={
              spotifyConnection?.status === 'ACTIVE'
                ? spotifyConnection.providerUserId || 'Connected'
                : 'Not connected'
            }
            rightText={spotifyConnection?.status === 'ACTIVE' ? 'Connected' : 'Add'}
            rightTextColor={
              spotifyConnection?.status === 'ACTIVE' ? colors.success : colors.textTertiary
            }
            onPress={() =>
              router.push({ pathname: '/settings/connections', params: { provider: 'spotify' } })
            }
          />

          {/* Gmail */}
          <SettingsRow
            icon="📬"
            title="Gmail"
            subtitle={
              gmailConnection?.status === 'ACTIVE'
                ? gmailConnection.providerUserId || 'Connected'
                : 'Not connected'
            }
            rightText={gmailConnection?.status === 'ACTIVE' ? 'Connected' : 'Add'}
            rightTextColor={
              gmailConnection?.status === 'ACTIVE' ? colors.success : colors.textTertiary
            }
            onPress={() =>
              router.push({ pathname: '/settings/connections', params: { provider: 'gmail' } })
            }
          />
        </View>

        {/* Subscriptions Section */}
        <Text style={[styles.sectionTitle, { color: colors.textSubheader }]}>SUBSCRIPTIONS</Text>

        <View style={[styles.section, { backgroundColor: colors.card }]}>
          <SettingsRow
            title="Manage Subscriptions"
            subtitle={`${activeSubscriptionCount} active subscription${activeSubscriptionCount !== 1 ? 's' : ''}`}
            rightText="→"
            onPress={() => router.push('/subscriptions')}
          />
        </View>

        <Text style={[styles.sectionTitle, { color: colors.textSubheader }]}>INSIGHTS</Text>

        <View style={[styles.section, { backgroundColor: colors.card }]}>
          <SettingsRow
            title="Weekly Recap"
            subtitle="Review your reading, watching, and listening anytime"
            rightText="→"
            onPress={() => router.push('/recap/weekly')}
          />
        </View>

        {/* Account Section */}
        {authEnabled && (
          <>
            <Text style={[styles.sectionTitle, { color: colors.textSubheader }]}>ACCOUNT</Text>

            <View style={[styles.section, { backgroundColor: colors.card }]}>
              <SettingsRow title="Sign Out" titleColor={colors.error} onPress={handleSignOut} />
            </View>
          </>
        )}

        {/* About Section */}
        <Text style={[styles.sectionTitle, { color: colors.textSubheader }]}>ABOUT</Text>

        <View style={[styles.section, { backgroundColor: colors.card }]}>
          <SettingsRow title="Version" rightText={`${appVersion} (${buildNumber})`} />

          <SettingsRow title="Terms of Service" rightText="→" onPress={handleOpenTerms} />

          <SettingsRow title="Privacy Policy" rightText="→" onPress={handleOpenPrivacy} />
        </View>

        {isDeveloperDiagnosticsEnabled && (
          <>
            <Text style={[styles.sectionTitle, { color: colors.textSubheader }]}>DEVELOPER</Text>

            <View style={[styles.section, { backgroundColor: colors.card }]}>
              <SettingsRow
                title="Share Diagnostic Bundle"
                subtitle="Recent traces, queue state, and release info"
                rightText="→"
                onPress={handleShareDiagnosticBundle}
              />
              <SettingsRow
                title="Open Storybook"
                subtitle="Preview component stories"
                rightText="→"
                onPress={() => router.push('/storybook')}
              />
            </View>
          </>
        )}
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
  sectionTitle: {
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.5,
    marginTop: Spacing.xl,
    marginBottom: Spacing.sm,
    marginLeft: Spacing.sm,
  },
  section: {
    borderRadius: Radius.lg,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: Spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(0,0,0,0.1)',
  },
  rowPressed: {
    opacity: 0.7,
  },
  rowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    flex: 1,
  },
  rowTextContainer: {
    flex: 1,
  },
  providerIcon: {
    fontSize: 24,
  },
  rowTitle: {
    fontSize: 16,
    fontWeight: '500',
  },
  rowSubtitle: {
    fontSize: 13,
    marginTop: 2,
  },
});
