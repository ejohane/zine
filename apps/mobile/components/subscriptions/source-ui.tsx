import { View, Image, Pressable, StyleSheet, TextInput } from 'react-native';
import { FileText, Headphones, Play, Rss } from 'lucide-react-native';

import { Badge, Button, Surface, Text } from '@/components/primitives';
import { ChevronRightIcon, SearchIcon } from '@/components/icons';
import { Radius, Spacing } from '@/constants/theme';
import { useAppTheme } from '@/hooks/use-app-theme';
import {
  type IntegrationState,
  type SubscriptionSource,
  getIntegrationBadgeLabel,
  getSubscriptionSourceConfig,
} from '@/lib/subscription-sources';

function SourceGlyph({ source }: { source: SubscriptionSource }) {
  const { colors } = useAppTheme();
  const iconColor = source === 'GMAIL' ? colors.statusInfo : colors.textPrimary;
  const iconSize = 20;

  if (source === 'YOUTUBE') {
    return <Play size={iconSize} color={iconColor} fill={iconColor} strokeWidth={0} />;
  }

  if (source === 'SPOTIFY') {
    return <Headphones size={iconSize} color={iconColor} fill={iconColor} strokeWidth={0} />;
  }

  if (source === 'GMAIL') {
    return <FileText size={iconSize} color={iconColor} fill={iconColor} strokeWidth={0} />;
  }

  return <Rss size={iconSize} color={iconColor} strokeWidth={2} />;
}

function getBadgeTone(state: IntegrationState): 'subtle' | 'success' | 'warning' | 'info' {
  if (state === 'connected') {
    return 'success';
  }

  if (state === 'needsAttention') {
    return 'warning';
  }

  if (state === 'manual') {
    return 'info';
  }

  return 'subtle';
}

function Avatar({ imageUrl, title }: { imageUrl?: string | null; title: string }) {
  const { colors } = useAppTheme();

  if (imageUrl) {
    return <Image source={{ uri: imageUrl }} style={styles.avatarImage} />;
  }

  return (
    <View style={[styles.avatarFallback, { backgroundColor: colors.surfaceRaised }]}>
      <Text variant="labelLarge" tone="secondary" transform="none">
        {title.charAt(0).toUpperCase()}
      </Text>
    </View>
  );
}

export function SourceListRow({
  source,
  summary,
  onPress,
}: {
  source: SubscriptionSource;
  summary: string;
  onPress: () => void;
}) {
  const { colors, motion } = useAppTheme();
  const config = getSubscriptionSourceConfig(source);

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Open ${config.name} subscriptions`}
      style={({ pressed }) => [pressed && { opacity: motion.opacity.pressed }]}
    >
      <Surface tone="elevated" border="subtle" radius="xl" style={styles.sourceRow}>
        <View style={[styles.glyphContainer, { backgroundColor: colors.surfaceRaised }]}>
          <SourceGlyph source={source} />
        </View>
        <View style={styles.sourceRowCopy}>
          <Text variant="titleMedium">{config.name}</Text>
          <Text variant="bodySmall" tone="subheader">
            {summary}
          </Text>
        </View>
        <ChevronRightIcon size={18} color={colors.textTertiary} />
      </Surface>
    </Pressable>
  );
}

export function SourceHero({
  source,
  title,
  summary,
}: {
  source: SubscriptionSource;
  title?: string;
  summary: string;
}) {
  const { colors } = useAppTheme();
  const config = getSubscriptionSourceConfig(source);

  return (
    <Surface tone="elevated" border="subtle" radius="xl" style={styles.hero}>
      <View style={[styles.heroGlyph, { backgroundColor: colors.surfaceRaised }]}>
        <SourceGlyph source={source} />
      </View>
      <View style={styles.heroCopy}>
        <Text variant="labelSmallPlain" tone="tertiary" transform="uppercase">
          Subscriptions
        </Text>
        <Text variant="headlineSmall">{title ?? config.name}</Text>
        <Text variant="bodyMedium" tone="subheader">
          {summary}
        </Text>
      </View>
    </Surface>
  );
}

export function IntegrationCard({
  source,
  state,
  title,
  description,
  detail,
  actionLabel,
  onAction,
  actionTone = 'default',
  actionVariant = 'primary',
  secondaryActionLabel,
  onSecondaryAction,
  secondaryActionTone = 'danger',
  secondaryActionVariant = 'ghost',
  isBusy = false,
}: {
  source: SubscriptionSource;
  state: IntegrationState;
  title: string;
  description: string;
  detail?: string | null;
  actionLabel?: string | null;
  onAction?: (() => void) | null;
  actionTone?: 'default' | 'danger';
  actionVariant?: 'primary' | 'secondary' | 'outline' | 'ghost';
  secondaryActionLabel?: string | null;
  onSecondaryAction?: (() => void) | null;
  secondaryActionTone?: 'default' | 'danger';
  secondaryActionVariant?: 'primary' | 'secondary' | 'outline' | 'ghost';
  isBusy?: boolean;
}) {
  const config = getSubscriptionSourceConfig(source);

  return (
    <Surface tone="elevated" border="subtle" radius="xl" style={styles.sectionCard}>
      <View style={styles.sectionHeaderRow}>
        <View style={styles.sectionHeaderCopy}>
          <Text variant="labelSmallPlain" tone="tertiary" transform="uppercase">
            {state === 'manual' ? 'Setup' : 'Integration'}
          </Text>
          <Text variant="titleLarge">
            {state === 'manual' ? 'No integration required' : config.integrationName}
          </Text>
        </View>
        <Badge label={getIntegrationBadgeLabel(state)} tone={getBadgeTone(state)} size="sm" />
      </View>

      <Text variant="titleMedium">{title}</Text>
      <Text variant="bodyMedium" tone="subheader" style={styles.sectionDescription}>
        {description}
      </Text>

      {detail ? (
        <Text variant="bodySmall" tone="tertiary" style={styles.sectionDetail}>
          {detail}
        </Text>
      ) : null}

      {(actionLabel && onAction) || (secondaryActionLabel && onSecondaryAction) ? (
        <View style={styles.integrationActions}>
          {actionLabel && onAction ? (
            <Button
              label={actionLabel}
              onPress={onAction}
              loading={isBusy}
              variant={actionVariant}
              tone={actionTone}
              size="sm"
            />
          ) : null}
          {secondaryActionLabel && onSecondaryAction ? (
            <Button
              label={secondaryActionLabel}
              onPress={onSecondaryAction}
              disabled={isBusy}
              variant={secondaryActionVariant}
              tone={secondaryActionTone}
              size="sm"
            />
          ) : null}
        </View>
      ) : null}
    </Surface>
  );
}

export function SourceSectionHeader({
  eyebrow,
  title,
  summary,
  trailing,
}: {
  eyebrow?: string;
  title: string;
  summary?: string;
  trailing?: React.ReactNode;
}) {
  return (
    <View style={styles.sectionHeader}>
      <View style={styles.sectionHeaderCopy}>
        {eyebrow ? (
          <Text variant="labelSmallPlain" tone="tertiary" transform="uppercase">
            {eyebrow}
          </Text>
        ) : null}
        <Text variant="titleLarge">{title}</Text>
        {summary ? (
          <Text variant="bodySmall" tone="subheader">
            {summary}
          </Text>
        ) : null}
      </View>
      {trailing}
    </View>
  );
}

export function SourceSearchField({
  value,
  onChangeText,
  placeholder,
}: {
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
}) {
  const { colors } = useAppTheme();

  return (
    <Surface tone="subtle" border="default" radius="xl" style={styles.searchField}>
      <SearchIcon size={18} color={colors.textTertiary} />
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.textTertiary}
        style={[styles.searchInput, { color: colors.textPrimary }]}
        autoCapitalize="none"
        autoCorrect={false}
      />
    </Surface>
  );
}

export function SourceSubscriptionRow({
  title,
  subtitle,
  meta,
  imageUrl,
  statusLabel,
  primaryActionLabel,
  onPrimaryAction,
  primaryActionVariant = 'secondary',
  primaryActionTone = 'default',
  primaryActionLoading = false,
  primaryActionDisabled = false,
  secondaryActionLabel,
  onSecondaryAction,
  secondaryActionTone = 'danger',
  tertiaryActionLabel,
  onTertiaryAction,
  tertiaryActionTone = 'danger',
}: {
  title: string;
  subtitle?: string | null;
  meta?: string | null;
  imageUrl?: string | null;
  statusLabel?: string | null;
  primaryActionLabel: string;
  onPrimaryAction: () => void;
  primaryActionVariant?: 'primary' | 'secondary' | 'outline' | 'ghost';
  primaryActionTone?: 'default' | 'danger';
  primaryActionLoading?: boolean;
  primaryActionDisabled?: boolean;
  secondaryActionLabel?: string | null;
  onSecondaryAction?: (() => void) | null;
  secondaryActionTone?: 'default' | 'danger';
  tertiaryActionLabel?: string | null;
  onTertiaryAction?: (() => void) | null;
  tertiaryActionTone?: 'default' | 'danger';
}) {
  const { colors } = useAppTheme();

  return (
    <Surface tone="elevated" border="subtle" radius="xl" style={styles.subscriptionRow}>
      <Avatar imageUrl={imageUrl} title={title} />

      <View style={styles.subscriptionCopy}>
        <View style={styles.subscriptionTitleRow}>
          <Text variant="titleMedium" numberOfLines={1} style={styles.subscriptionTitle}>
            {title}
          </Text>
          {statusLabel ? (
            <Badge label={statusLabel} tone="subtle" size="sm" style={styles.statusBadge} />
          ) : null}
        </View>

        {subtitle ? (
          <Text variant="bodySmall" tone="subheader" numberOfLines={2}>
            {subtitle}
          </Text>
        ) : null}

        {meta ? (
          <Text variant="bodySmall" tone="tertiary" numberOfLines={1}>
            {meta}
          </Text>
        ) : null}
      </View>

      <View style={styles.rowActions}>
        <Button
          label={primaryActionLabel}
          onPress={onPrimaryAction}
          variant={primaryActionVariant}
          tone={primaryActionTone}
          size="sm"
          loading={primaryActionLoading}
          disabled={primaryActionDisabled}
        />
        {secondaryActionLabel && onSecondaryAction ? (
          <Button
            label={secondaryActionLabel}
            onPress={onSecondaryAction}
            variant="ghost"
            tone={secondaryActionTone}
            size="sm"
            labelStyle={{
              color: secondaryActionTone === 'danger' ? colors.statusError : colors.textSecondary,
            }}
          />
        ) : null}
        {tertiaryActionLabel && onTertiaryAction ? (
          <Button
            label={tertiaryActionLabel}
            onPress={onTertiaryAction}
            variant="ghost"
            tone={tertiaryActionTone}
            size="sm"
            labelStyle={{
              color: tertiaryActionTone === 'danger' ? colors.statusError : colors.textSecondary,
            }}
          />
        ) : null}
      </View>
    </Surface>
  );
}

export function SourceEmptyState({ title, message }: { title: string; message: string }) {
  return (
    <Surface tone="subtle" border="subtle" radius="xl" style={styles.emptyState}>
      <Text variant="titleLarge" style={styles.emptyTitle}>
        {title}
      </Text>
      <Text variant="bodyMedium" tone="subheader" style={styles.emptyMessage}>
        {message}
      </Text>
    </Surface>
  );
}

const styles = StyleSheet.create({
  sourceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    padding: Spacing.lg,
  },
  glyphContainer: {
    width: 48,
    height: 48,
    borderRadius: Radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sourceRowCopy: {
    flex: 1,
    gap: Spacing.xs,
  },
  hero: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.lg,
    padding: Spacing.lg,
  },
  heroGlyph: {
    width: 56,
    height: 56,
    borderRadius: Radius.xl,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroCopy: {
    flex: 1,
    gap: Spacing.xs,
  },
  sectionCard: {
    gap: Spacing.sm,
    padding: Spacing.lg,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: Spacing.md,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: Spacing.md,
  },
  sectionHeaderCopy: {
    flex: 1,
    gap: Spacing.xs,
  },
  sectionDescription: {
    marginTop: Spacing.xs,
  },
  sectionDetail: {
    marginTop: Spacing.xs,
  },
  integrationActions: {
    flexDirection: 'row',
    gap: Spacing.sm,
    flexWrap: 'wrap',
    marginTop: Spacing.sm,
  },
  searchField: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  searchInput: {
    flex: 1,
    paddingVertical: 0,
  },
  subscriptionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    padding: Spacing.md,
  },
  avatarImage: {
    width: 48,
    height: 48,
    borderRadius: Radius.full,
  },
  avatarFallback: {
    width: 48,
    height: 48,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  subscriptionCopy: {
    flex: 1,
    gap: Spacing.xs,
  },
  subscriptionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  subscriptionTitle: {
    flex: 1,
  },
  statusBadge: {
    maxWidth: 150,
  },
  rowActions: {
    alignItems: 'flex-end',
    gap: Spacing.xs,
  },
  emptyState: {
    alignItems: 'center',
    padding: Spacing.xl,
  },
  emptyTitle: {
    marginBottom: Spacing.xs,
    textAlign: 'center',
  },
  emptyMessage: {
    textAlign: 'center',
  },
});
