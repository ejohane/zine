import { Stack } from 'expo-router';
import { ScrollView, StyleSheet, View } from 'react-native';

import { EmptyState, ErrorState, LoadingState } from '@/components/list-states';
import { WeeklyRecapChart } from '@/components/insights/weekly-recap-chart';
import { WeeklyRecapList } from '@/components/insights/weekly-recap-list';
import { Surface, Text } from '@/components/primitives';
import { ContentColors, Radius, Spacing } from '@/constants/theme';
import { useWeeklyRecap } from '@/hooks/use-insights-trpc';
import { useAppTheme } from '@/hooks/use-app-theme';
import {
  buildModeSplit,
  buildWeeklyRecapEmptyState,
  formatDeltaLabel,
  formatEstimatedMinutes,
  getDominantModeLabel,
} from '@/lib/weekly-recap';

function HighlightTile({
  label,
  value,
  description,
}: {
  label: string;
  value: string;
  description: string;
}) {
  return (
    <Surface tone="subtle" border="subtle" radius="xl" style={styles.highlightTile}>
      <Text variant="labelMedium" tone="tertiary">
        {label}
      </Text>
      <Text variant="titleMedium">{value}</Text>
      <Text variant="bodySmall" tone="subheader">
        {description}
      </Text>
    </Surface>
  );
}

export default function WeeklyRecapScreen() {
  const { colors } = useAppTheme();
  const { data: recap, isLoading, error, refetch } = useWeeklyRecap();

  if (isLoading && !recap) {
    return (
      <Surface style={[styles.screen, { backgroundColor: colors.background }]}>
        <Stack.Screen options={{ title: 'Weekly Recap', headerBackTitle: '' }} />
        <LoadingState message="Building your weekly recap..." />
      </Surface>
    );
  }

  if (error && !recap) {
    return (
      <Surface style={[styles.screen, { backgroundColor: colors.background }]}>
        <Stack.Screen options={{ title: 'Weekly Recap', headerBackTitle: '' }} />
        <ErrorState
          title="Could not load recap"
          message={error.message}
          onRetry={() => void refetch()}
        />
      </Surface>
    );
  }

  if (!recap) {
    return null;
  }

  const deltaLabel = formatDeltaLabel(recap.headline.estimatedMinutesDeltaPct);
  const modeSplit = buildModeSplit(recap);
  const emptyState = buildWeeklyRecapEmptyState(recap);
  const topCreator = recap.highlights.topCreators[0];
  const topProvider = recap.highlights.topProviders[0];

  return (
    <Surface style={[styles.screen, { backgroundColor: colors.background }]}>
      <Stack.Screen options={{ title: 'Weekly Recap', headerBackTitle: '' }} />
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <Surface tone="raised" border="default" radius="2xl" style={styles.heroCard}>
          <Text variant="labelLarge" tone="tertiary">
            {recap.window.label}
          </Text>
          <Text variant="displayMedium">
            {recap.totals.completedCount > 0
              ? `${recap.totals.completedCount} ${recap.totals.completedCount === 1 ? 'completion' : 'completions'}`
              : 'A quieter week'}
          </Text>
          <Text variant="titleLarge">
            {formatEstimatedMinutes(recap.headline.estimatedTotalMinutes)} estimated time
          </Text>
          <Text variant="bodyLarge" tone="subheader">
            {getDominantModeLabel(recap.headline.dominantMode)}
          </Text>
          {deltaLabel ? (
            <Surface tone="success" border="tone" radius="lg" style={styles.deltaPill}>
              <Text variant="labelLarge" tone="success">
                {deltaLabel}
              </Text>
            </Surface>
          ) : null}
        </Surface>
        {recap.totals.completedCount === 0 ? (
          <EmptyState title={emptyState.title} message={emptyState.message} emoji="🗓️" />
        ) : null}

        <View style={styles.section}>
          <Text variant="titleLarge">Estimated time split</Text>
          <Surface border="default" radius="xl" style={styles.modeSplitCard}>
            <Text variant="bodySmall" tone="subheader">
              Based on finished items only
            </Text>
            <View style={styles.modeSplitColumn}>
              {modeSplit.map((row) => {
                const fillWidthPct =
                  row.minutes > 0 ? Math.max(10, Math.round(row.ratio * 100)) : 0;
                const fillColor =
                  row.key === 'reading'
                    ? ContentColors.article
                    : row.key === 'watching'
                      ? ContentColors.video
                      : ContentColors.podcast;

                return (
                  <View key={row.key} style={styles.modeSplitRow}>
                    <View style={styles.modeSplitMeta}>
                      <Text variant="titleSmall">{row.label}</Text>
                      <Text variant="bodySmall" tone="subheader">
                        {formatEstimatedMinutes(row.minutes)}
                      </Text>
                    </View>
                    <View style={[styles.modeTrack, { backgroundColor: colors.surfaceRaised }]}>
                      <View
                        style={[
                          styles.modeFill,
                          {
                            width: `${fillWidthPct}%`,
                            backgroundColor: fillColor,
                          },
                        ]}
                      />
                    </View>
                  </View>
                );
              })}
            </View>
          </Surface>
        </View>

        <WeeklyRecapChart trend={recap.trend} />

        <View style={styles.section}>
          <Text variant="titleLarge">Highlights</Text>
          <View style={styles.highlightGrid}>
            <HighlightTile
              label="Top creator"
              value={topCreator ? topCreator.creator : 'None yet'}
              description={
                topCreator
                  ? `${topCreator.completedCount} ${topCreator.completedCount === 1 ? 'completion' : 'completions'}`
                  : 'No finished items yet'
              }
            />
            <HighlightTile
              label="Top provider"
              value={topProvider ? topProvider.provider : 'None yet'}
              description={
                topProvider
                  ? `${formatEstimatedMinutes(topProvider.estimatedMinutes)} estimated time`
                  : 'No finished items yet'
              }
            />
            <HighlightTile
              label="Longest item"
              value={
                recap.highlights.longestCompletedItem
                  ? recap.highlights.longestCompletedItem.title
                  : 'Nothing finished yet'
              }
              description={
                recap.highlights.longestCompletedItem
                  ? `${formatEstimatedMinutes(recap.highlights.longestCompletedItem.estimatedMinutes)} estimated`
                  : 'Finish something this week to unlock this'
              }
            />
            <HighlightTile
              label="Median to finish"
              value={
                recap.highlights.medianBookmarkToFinishHours !== null
                  ? `${recap.highlights.medianBookmarkToFinishHours}h`
                  : 'N/A'
              }
              description="Median time from bookmark to completion"
            />
          </View>
        </View>

        {recap.completedItems.length > 0 ? (
          <WeeklyRecapList
            title="What you completed"
            variant="completed"
            items={recap.completedItems}
          />
        ) : null}

        {recap.startedItems.length > 0 ? (
          <WeeklyRecapList
            title="Started but not finished"
            variant="started"
            items={recap.startedItems}
          />
        ) : null}
      </ScrollView>
    </Surface>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: Spacing.md,
    gap: Spacing.lg,
    paddingBottom: Spacing['4xl'],
  },
  heroCard: {
    padding: Spacing.xl,
    gap: Spacing.sm,
    borderRadius: Radius['2xl'],
  },
  deltaPill: {
    alignSelf: 'flex-start',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    marginTop: Spacing.sm,
  },
  section: {
    gap: Spacing.md,
  },
  modeSplitCard: {
    padding: Spacing.lg,
    gap: Spacing.lg,
  },
  modeSplitColumn: {
    gap: Spacing.md,
  },
  modeSplitRow: {
    gap: Spacing.sm,
  },
  modeSplitMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: Spacing.md,
  },
  modeTrack: {
    height: 12,
    borderRadius: Radius.full,
    overflow: 'hidden',
  },
  modeFill: {
    height: '100%',
    borderRadius: Radius.full,
  },
  highlightGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.md,
  },
  highlightTile: {
    width: '47%',
    minWidth: 150,
    padding: Spacing.lg,
    gap: Spacing.sm,
  },
});
