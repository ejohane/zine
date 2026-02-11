import { useCallback, useState } from 'react';
import { View, Text, Pressable, StyleSheet, ActivityIndicator, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';

import { Colors, Typography, Spacing, Radius } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { OAuthErrorBoundary } from '@/components/oauth-error-boundary';
import { OAuthErrorCode, parseOAuthError } from '@/lib/oauth-errors';
import { connectProvider } from '@/lib/oauth';
import { trpc } from '@/lib/trpc';

const GMAIL_BLUE = '#1A73E8';

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

function GmailConnectContent() {
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
      await connectProvider('GMAIL');
      await (utils as any).subscriptions?.connections?.list?.invalidate?.();
      await (utils as any).subscriptions?.newsletters?.stats?.invalidate?.();
      await (utils as any).subscriptions?.newsletters?.list?.invalidate?.();
      router.replace('/subscriptions/gmail' as const);
    } catch (err) {
      const rawMessage = err instanceof Error ? err.message : 'Connection failed';
      const parsed = parseOAuthError(rawMessage);

      if (parsed.code === OAuthErrorCode.USER_CANCELLED) {
        setError(null);
      } else {
        setError(parsed.message);
      }
    } finally {
      setIsConnecting(false);
    }
  }, [router, utils]);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <View style={[styles.iconContainer, { backgroundColor: `${GMAIL_BLUE}15` }]}>
            <Text style={styles.providerIcon}>📬</Text>
          </View>
          <Text style={[styles.title, { color: colors.text }]}>Connect Gmail</Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
            Import newsletters from your inbox into Zine
          </Text>
        </View>

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
              icon="📰"
              title="Newsletter metadata"
              description="Sender, subject, and list headers used to detect newsletters"
              colors={colors}
            />
            <PermissionItem
              icon="📥"
              title="Recent inbox messages"
              description="Read-only access to identify new newsletter issues"
              colors={colors}
            />
          </View>
        </View>

        <View
          style={[
            styles.permissionsCard,
            { backgroundColor: colors.card, borderColor: colors.border },
          ]}
        >
          <Text style={[styles.permissionsHeader, { color: colors.textSecondary }]}>
            WHAT WE WON&apos;T DO
          </Text>
          <View style={styles.permissionsList}>
            <PermissionItem
              icon="✉️"
              title="No email sending"
              description="Zine will never send mail from your account"
              colors={colors}
            />
            <PermissionItem
              icon="✍️"
              title="No inbox edits"
              description="Zine does not delete, archive, or modify your messages"
              colors={colors}
            />
          </View>
        </View>

        {error && (
          <View style={[styles.errorContainer, { backgroundColor: `${colors.error}15` }]}>
            <Text style={[styles.errorText, { color: colors.error }]}>{error}</Text>
          </View>
        )}

        <Pressable
          style={[
            styles.connectButton,
            { backgroundColor: GMAIL_BLUE },
            isConnecting && styles.buttonDisabled,
          ]}
          onPress={handleConnect}
          disabled={isConnecting}
        >
          {isConnecting ? (
            <ActivityIndicator color="#FFFFFF" size="small" />
          ) : (
            <>
              <Text style={styles.gmailIcon}>G</Text>
              <Text style={styles.connectButtonText}>Connect Gmail</Text>
            </>
          )}
        </Pressable>

        {isConnecting && (
          <Text style={[styles.loadingText, { color: colors.textSecondary }]}>
            Opening Gmail authorization...
          </Text>
        )}

        <View style={styles.footer}>
          <Text style={[styles.footerText, { color: colors.textTertiary }]}>
            You can disconnect anytime from Connections. Newsletter items render like standard web
            articles.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

export default function GmailConnectScreen() {
  const router = useRouter();

  const handleRetry = useCallback(() => {
    router.replace('/subscriptions/connect/gmail' as never);
  }, [router]);

  return (
    <OAuthErrorBoundary provider="GMAIL" onRetry={handleRetry}>
      <GmailConnectContent />
    </OAuthErrorBoundary>
  );
}

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
  gmailIcon: {
    fontSize: 20,
    color: '#FFFFFF',
    fontWeight: '700',
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
