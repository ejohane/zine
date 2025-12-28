/**
 * SectionHeader Component
 *
 * Header for content sections with title, optional icon, and "See all" button.
 */

import { View, Text, Pressable, StyleSheet } from 'react-native';
import { ChevronRightIcon } from '@/components/icons';
import type { Colors } from '@/constants/theme';
import { Typography, Spacing, Radius } from '@/constants/theme';

export interface SectionHeaderProps {
  title: string;
  icon?: React.ReactNode;
  onPress?: () => void;
  colors: typeof Colors.light;
}

export function SectionHeader({ title, icon, onPress, colors }: SectionHeaderProps) {
  return (
    <Pressable style={styles.container} onPress={onPress}>
      <View style={styles.left}>
        {icon}
        <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
      </View>
      <View style={[styles.seeAllButton, { backgroundColor: colors.backgroundTertiary }]}>
        <Text style={[styles.seeAllText, { color: colors.textSecondary }]}>See all</Text>
        <ChevronRightIcon size={16} color={colors.textSecondary} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.xl,
    marginBottom: Spacing.lg,
  },
  left: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  title: {
    ...Typography.titleLarge,
  },
  seeAllButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.xs,
    paddingLeft: Spacing.md,
    paddingRight: Spacing.sm,
    borderRadius: Radius.full,
    gap: 2,
  },
  seeAllText: {
    ...Typography.labelMedium,
  },
});
