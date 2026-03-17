import { StyleSheet, View } from 'react-native';

import { Surface, Text } from '@/components/primitives';
import { ContentColors, Radius, Spacing } from '@/constants/theme';
import { useAppTheme } from '@/hooks/use-app-theme';
import type { WeeklyRecap } from '@/lib/weekly-recap';

type WeeklyRecapChartProps = {
  trend: WeeklyRecap['trend'];
};

export function WeeklyRecapChart({ trend }: WeeklyRecapChartProps) {
  const { colors } = useAppTheme();
  const maxMinutes = Math.max(...trend.map((bucket) => bucket.estimatedMinutes), 1);
  const hasActivity = trend.some((bucket) => bucket.estimatedMinutes > 0);

  return (
    <Surface border="default" radius="xl" style={styles.container}>
      <View style={styles.headerRow}>
        <Text variant="titleMedium">Daily trend</Text>
        <Text variant="bodySmall" tone="subheader">
          Estimated minutes per day
        </Text>
      </View>

      {!hasActivity ? (
        <Text variant="bodyMedium" tone="subheader">
          No completed items in this window yet.
        </Text>
      ) : (
        <View style={styles.chartRow}>
          {trend.map((bucket) => {
            const totalHeight = Math.max(
              14,
              Math.round((bucket.estimatedMinutes / maxMinutes) * 92)
            );
            const totalMinutes = Math.max(bucket.estimatedMinutes, 1);
            const readingFlex = bucket.readingMinutes > 0 ? bucket.readingMinutes : 0;
            const watchingFlex = bucket.watchingMinutes > 0 ? bucket.watchingMinutes : 0;
            const listeningFlex = bucket.listeningMinutes > 0 ? bucket.listeningMinutes : 0;

            return (
              <View key={bucket.date} style={styles.barColumn}>
                <Text variant="labelSmallPlain" tone="tertiary">
                  {bucket.completedCount}
                </Text>
                <View style={[styles.barTrack, { backgroundColor: colors.surfaceRaised }]}>
                  <View style={[styles.barStack, { height: totalHeight }]}>
                    {readingFlex > 0 ? (
                      <View
                        style={[
                          styles.segment,
                          {
                            backgroundColor: ContentColors.article,
                            flex: readingFlex / totalMinutes,
                          },
                        ]}
                      />
                    ) : null}
                    {watchingFlex > 0 ? (
                      <View
                        style={[
                          styles.segment,
                          {
                            backgroundColor: ContentColors.video,
                            flex: watchingFlex / totalMinutes,
                          },
                        ]}
                      />
                    ) : null}
                    {listeningFlex > 0 ? (
                      <View
                        style={[
                          styles.segment,
                          {
                            backgroundColor: ContentColors.podcast,
                            flex: listeningFlex / totalMinutes,
                          },
                        ]}
                      />
                    ) : null}
                  </View>
                </View>
                <Text variant="labelSmallPlain" tone="subheader">
                  {bucket.label}
                </Text>
              </View>
            );
          })}
        </View>
      )}
    </Surface>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: Spacing.lg,
    gap: Spacing.lg,
  },
  headerRow: {
    gap: Spacing.xs,
  },
  chartRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: Spacing.xs,
  },
  barColumn: {
    flex: 1,
    alignItems: 'center',
    gap: Spacing.sm,
  },
  barTrack: {
    width: '100%',
    minWidth: 18,
    height: 92,
    borderRadius: Radius.lg,
    justifyContent: 'flex-end',
    overflow: 'hidden',
  },
  barStack: {
    width: '100%',
    justifyContent: 'flex-end',
    overflow: 'hidden',
    borderRadius: Radius.lg,
  },
  segment: {
    width: '100%',
  },
});

export default WeeklyRecapChart;
