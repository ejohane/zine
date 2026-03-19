import { Pressable, StyleSheet, View } from 'react-native';

import { Surface, Text } from '@/components/primitives';
import { Radius, Spacing } from '@/constants/theme';
import { useAppTheme } from '@/hooks/use-app-theme';
import {
  formatEstimatedMinutes,
  getDominantModeLabel,
  type WeeklyRecapTeaser,
} from '@/lib/weekly-recap';

type WeeklyRecapCardProps = {
  recap?: WeeklyRecapTeaser;
  isLoading?: boolean;
  onPress?: () => void;
};

export function WeeklyRecapCard({ recap, isLoading = false, onPress }: WeeklyRecapCardProps) {
  const { colors } = useAppTheme();

  if (isLoading && !recap) {
    return (
      <Surface border="default" radius="xl" style={styles.card}>
        <Text variant="labelMedium" tone="tertiary">
          Weekly recap
        </Text>
        <Text variant="headlineSmall" style={styles.loadingHeadline}>
          Loading your weekly recap
        </Text>
        <Text variant="bodyMedium" tone="subheader">
          Pulling together recent completions, estimated time, and trends.
        </Text>
      </Surface>
    );
  }

  if (!recap) {
    return null;
  }

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="Open weekly recap"
      style={({ pressed }) => [pressed ? styles.pressed : null]}
      testID="weekly-recap-card"
    >
      <Surface border="default" radius="xl" style={styles.card}>
        <View style={styles.headerRow}>
          <Text variant="labelMedium" tone="tertiary">
            Weekly recap
          </Text>
          <Text variant="labelMedium" tone="subheader">
            {recap.window.label}
          </Text>
        </View>

        <Text testID="weekly-recap-card-headline" variant="headlineSmall" style={styles.headline}>
          {recap.headline}
        </Text>
        <Text variant="bodyMedium" tone="subheader">
          Estimated time from completed items
        </Text>
        <Text
          testID="weekly-recap-card-supporting"
          variant="titleSmall"
          style={styles.supportingLine}
        >
          {recap.supportingLine}
        </Text>

        <View style={styles.metricsRow}>
          <Surface tone="subtle" radius="lg" style={styles.metricPill}>
            <Text variant="labelMedium" tone="tertiary">
              Completed
            </Text>
            <Text variant="titleMedium">{recap.completedCount}</Text>
          </Surface>
          <Surface tone="subtle" radius="lg" style={styles.metricPill}>
            <Text variant="labelMedium" tone="tertiary">
              Total
            </Text>
            <Text variant="titleMedium">{formatEstimatedMinutes(recap.estimatedTotalMinutes)}</Text>
          </Surface>
          <Surface tone="subtle" radius="lg" style={styles.metricPill}>
            <Text variant="labelMedium" tone="tertiary">
              Mode
            </Text>
            <Text variant="titleMedium" numberOfLines={1}>
              {getDominantModeLabel(recap.dominantMode)}
            </Text>
          </Surface>
        </View>

        <View style={styles.footerRow}>
          <Text
            testID="weekly-recap-card-trend"
            variant="bodySmall"
            tone={
              recap.estimatedMinutesDeltaPct && recap.estimatedMinutesDeltaPct > 0
                ? 'success'
                : 'subheader'
            }
            style={styles.footerCopy}
          >
            {recap.trendLabel ?? getDominantModeLabel(recap.dominantMode)}
          </Text>
          <Text variant="labelLarge" tone="accent" style={{ color: colors.accent }}>
            See full recap
          </Text>
        </View>
      </Surface>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pressed: {
    opacity: 0.82,
  },
  card: {
    padding: Spacing.lg,
    gap: Spacing.sm,
    borderRadius: Radius.xl,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.md,
  },
  headline: {
    marginTop: Spacing.xs,
  },
  supportingLine: {
    marginTop: -Spacing.xs,
  },
  loadingHeadline: {
    marginTop: Spacing.sm,
  },
  metricsRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginTop: Spacing.sm,
  },
  metricPill: {
    flex: 1,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.sm,
    gap: Spacing.xs,
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.md,
    marginTop: Spacing.sm,
  },
  footerCopy: {
    flex: 1,
  },
});

export default WeeklyRecapCard;
