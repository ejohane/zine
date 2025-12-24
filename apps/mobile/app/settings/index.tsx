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

import { View, Text, ScrollView, Pressable, StyleSheet, Linking } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useClerk } from '@clerk/clerk-expo';
import Constants from 'expo-constants';

import { Colors, Spacing, Radius } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useConnections, type Connection } from '@/hooks/use-connections';
import { useSubscriptions } from '@/hooks/use-subscriptions-query';

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
            <Text style={[styles.rowSubtitle, { color: colors.textSecondary }]}>{subtitle}</Text>
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
  const router = useRouter();
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const { signOut } = useClerk();

  // Data hooks
  const { data: connections } = useConnections();
  const { data: subscriptionsData } = useSubscriptions();

  // Extract connection status
  const youtubeConnection = connections?.find((c: Connection) => c.provider === 'YOUTUBE');
  const spotifyConnection = connections?.find((c: Connection) => c.provider === 'SPOTIFY');

  // Get subscription count from items array
  const activeSubscriptionCount = subscriptionsData?.items?.length ?? 0;

  // Get app version from expo-constants
  const appVersion = Constants.expoConfig?.version ?? '1.0.0';
  const buildNumber =
    Constants.expoConfig?.ios?.buildNumber ?? Constants.expoConfig?.android?.versionCode ?? '1';

  // Handlers
  const handleSignOut = async () => {
    try {
      await signOut();
      router.replace('/(auth)/sign-in');
    } catch (error) {
      console.error('[Settings] Sign out failed:', error);
    }
  };

  const handleOpenTerms = () => {
    Linking.openURL('https://zine.app/terms');
  };

  const handleOpenPrivacy = () => {
    Linking.openURL('https://zine.app/privacy');
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={[]}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Connected Accounts Section */}
        <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>
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
        </View>

        {/* Subscriptions Section */}
        <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>SUBSCRIPTIONS</Text>

        <View style={[styles.section, { backgroundColor: colors.card }]}>
          <SettingsRow
            title="Manage Subscriptions"
            subtitle={`${activeSubscriptionCount} active subscription${activeSubscriptionCount !== 1 ? 's' : ''}`}
            rightText="→"
            onPress={() => router.push('/subscriptions')}
          />
        </View>

        {/* Account Section */}
        <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>ACCOUNT</Text>

        <View style={[styles.section, { backgroundColor: colors.card }]}>
          <SettingsRow title="Sign Out" titleColor={colors.error} onPress={handleSignOut} />
        </View>

        {/* About Section */}
        <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>ABOUT</Text>

        <View style={[styles.section, { backgroundColor: colors.card }]}>
          <SettingsRow title="Version" rightText={`${appVersion} (${buildNumber})`} />

          <SettingsRow title="Terms of Service" rightText="→" onPress={handleOpenTerms} />

          <SettingsRow title="Privacy Policy" rightText="→" onPress={handleOpenPrivacy} />
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
