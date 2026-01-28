/**
 * QuickStats Component
 *
 * Displays a row of quick statistics (Saved, In Progress, This Week).
 */

import { View, Text, StyleSheet } from 'react-native';
import Animated from 'react-native-reanimated';

import { BookmarkIcon, PlayIcon, SparklesIcon } from '@/components/icons';
import type { Colors } from '@/constants/theme';
import { Typography, Spacing, Radius, ContentColors } from '@/constants/theme';

export interface QuickStatsData {
  savedCount: number;
  inProgressCount: number;
  thisWeekCount: number;
}

export interface QuickStatsProps {
  colors: typeof Colors.light;
  stats?: QuickStatsData;
  isLoading?: boolean;
}

export function QuickStats({ colors, stats, isLoading = false }: QuickStatsProps) {
  const displayStats = [
    {
      label: 'Saved',
      value: isLoading ? '-' : String(stats?.savedCount ?? 0),
      icon: <BookmarkIcon size={18} color={colors.primary} />,
    },
    {
      label: 'In Progress',
      value: isLoading ? '-' : String(stats?.inProgressCount ?? 0),
      icon: <PlayIcon size={18} color={ContentColors.video} />,
    },
    {
      label: 'This Week',
      value: isLoading ? '-' : String(stats?.thisWeekCount ?? 0),
      icon: <SparklesIcon size={18} color={ContentColors.podcast} />,
    },
  ];

  return (
    <Animated.View style={[styles.container, { backgroundColor: colors.backgroundSecondary }]}>
      {displayStats.map((stat) => (
        <View key={stat.label} style={styles.statItem}>
          <View style={[styles.statIcon, { backgroundColor: colors.background }]}>{stat.icon}</View>
          <View style={styles.statText}>
            <Text style={[styles.statValue, { color: colors.text }]}>{stat.value}</Text>
            <Text style={[styles.statLabel, { color: colors.textSecondary }]}>{stat.label}</Text>
          </View>
        </View>
      ))}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    marginHorizontal: Spacing.xl,
    marginBottom: Spacing['2xl'],
    borderRadius: Radius.xl,
    padding: Spacing.lg,
    gap: Spacing.md,
  },
  statItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  statIcon: {
    width: 36,
    height: 36,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statText: {
    flex: 1,
  },
  statValue: {
    ...Typography.titleMedium,
  },
  statLabel: {
    ...Typography.labelSmall,
    textTransform: 'none',
    letterSpacing: 0,
  },
});
