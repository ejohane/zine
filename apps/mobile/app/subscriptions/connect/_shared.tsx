import { useCallback, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FileText, Headphones, LockKeyhole, Play, ShieldCheck } from 'lucide-react-native';
import type { LucideIcon } from 'lucide-react-native';
import { useRouter } from 'expo-router';

import { Button, Surface, Text } from '@/components/primitives';
import { Radius, Spacing } from '@/constants/theme';
import { useAppTheme } from '@/hooks/use-app-theme';
import { connectProvider } from '@/lib/oauth';
import { getSubscriptionSourceConfig, type SubscriptionSource } from '@/lib/subscription-sources';
import { trpc } from '@/lib/trpc';

type ConnectProvider = Exclude<SubscriptionSource, 'RSS'>;
type CopyItem = {
  title: string;
  description: string;
};

const PROVIDER_ICON: Record<ConnectProvider, LucideIcon> = {
  YOUTUBE: Play,
  SPOTIFY: Headphones,
  GMAIL: FileText,
};

type IntegrationConnectScreenProps = {
  provider: ConnectProvider;
  subtitle: string;
  allowList: CopyItem[];
  restrictedList: CopyItem[];
  ctaLabel: string;
};

export function IntegrationConnectScreen({
  provider,
  subtitle,
  allowList,
  restrictedList,
  ctaLabel,
}: IntegrationConnectScreenProps) {
  const router = useRouter();
  const { colors, motion } = useAppTheme();
  const utils = trpc.useUtils();
  const sourceConfig = getSubscriptionSourceConfig(provider);
  const Icon = PROVIDER_ICON[provider];

  const [error, setError] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);

  const successRoute = sourceConfig.route;

  const handleConnect = useCallback(async () => {
    setIsConnecting(true);
    setError(null);

    try {
      await connectProvider(provider);
      await utils.subscriptions.connections.list.invalidate();
      await utils.subscriptions.list.invalidate();

      if (provider === 'GMAIL') {
        await utils.subscriptions.newsletters.list.invalidate();
        await utils.subscriptions.newsletters.stats.invalidate();
      }

      router.replace(successRoute);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Connection failed';
      if (message.toLowerCase().includes('cancel')) {
        setError(null);
      } else {
        setError(message);
      }
    } finally {
      setIsConnecting(false);
    }
  }, [provider, router, successRoute, utils]);

  const footerCopy = useMemo(() => {
    if (provider === 'GMAIL') {
      return 'Manage this integration and your newsletter subscriptions from the Newsletters source screen.';
    }

    return `Manage this integration and your ${sourceConfig.name.toLowerCase()} subscriptions from the source screen after you connect.`;
  }, [provider, sourceConfig.name]);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.surfaceCanvas }]}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.header}>
          <View style={[styles.iconContainer, { backgroundColor: colors.surfaceRaised }]}>
            <Icon size={28} color={colors.textPrimary} />
          </View>
          <Text variant="headlineSmall">{sourceConfig.integrationName}</Text>
          <Text variant="bodyMedium" tone="subheader" style={styles.headerCopy}>
            {subtitle}
          </Text>
        </View>

        <Surface tone="elevated" border="subtle" radius="xl" style={styles.card}>
          <View style={styles.cardHeader}>
            <ShieldCheck size={18} color={colors.statusSuccess} />
            <Text variant="labelSmallPlain" tone="tertiary" transform="uppercase">
              What Zine imports
            </Text>
          </View>
          <View style={styles.itemList}>
            {allowList.map((item) => (
              <CopyRow
                key={item.title}
                title={item.title}
                description={item.description}
                accentColor={colors.statusSuccess}
              />
            ))}
          </View>
        </Surface>

        <Surface tone="elevated" border="subtle" radius="xl" style={styles.card}>
          <View style={styles.cardHeader}>
            <LockKeyhole size={18} color={colors.textSecondary} />
            <Text variant="labelSmallPlain" tone="tertiary" transform="uppercase">
              What Zine won&apos;t do
            </Text>
          </View>
          <View style={styles.itemList}>
            {restrictedList.map((item) => (
              <CopyRow
                key={item.title}
                title={item.title}
                description={item.description}
                accentColor={colors.textSecondary}
              />
            ))}
          </View>
        </Surface>

        {error ? (
          <Surface tone="error" border="tone" radius="xl" style={styles.errorCard}>
            <Text variant="titleSmall" tone="error">
              Connection failed
            </Text>
            <Text variant="bodySmall" tone="error" style={styles.errorCopy}>
              {error}
            </Text>
          </Surface>
        ) : null}

        <Button
          label={isConnecting ? 'Connecting…' : ctaLabel}
          onPress={handleConnect}
          loading={isConnecting}
          style={[
            styles.cta,
            {
              opacity: isConnecting ? motion.opacity.subdued : 1,
            },
          ]}
        />

        <Text variant="bodySmall" tone="tertiary" style={styles.footer}>
          {footerCopy}
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function CopyRow({
  title,
  description,
  accentColor,
}: {
  title: string;
  description: string;
  accentColor: string;
}) {
  return (
    <View style={styles.copyRow}>
      <View style={[styles.copyMarker, { backgroundColor: accentColor }]} />
      <View style={styles.copyContent}>
        <Text variant="titleSmall">{title}</Text>
        <Text variant="bodySmall" tone="subheader">
          {description}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: Spacing.lg,
    gap: Spacing.md,
    paddingBottom: Spacing['3xl'],
  },
  header: {
    alignItems: 'flex-start',
    gap: Spacing.sm,
    paddingVertical: Spacing.sm,
  },
  iconContainer: {
    width: 56,
    height: 56,
    borderRadius: Radius.xl,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerCopy: {
    maxWidth: 520,
  },
  card: {
    gap: Spacing.md,
    padding: Spacing.lg,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  itemList: {
    gap: Spacing.md,
  },
  copyRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.sm,
  },
  copyMarker: {
    width: 8,
    height: 8,
    borderRadius: Radius.full,
    marginTop: 8,
  },
  copyContent: {
    flex: 1,
    gap: Spacing.xs,
  },
  errorCard: {
    gap: Spacing.xs,
    padding: Spacing.lg,
  },
  errorCopy: {
    marginTop: Spacing.xs,
  },
  cta: {
    marginTop: Spacing.sm,
  },
  footer: {
    marginTop: Spacing.xs,
  },
});
