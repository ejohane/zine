/**
 * FilterChip Component
 *
 * A reusable chip component for filtering content by type or category.
 * Supports selected/unselected states with color-coded dots.
 */

import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Colors, Radius, Spacing, Typography } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

// =============================================================================
// Types
// =============================================================================

export interface FilterChipProps {
  /** Label text displayed on the chip */
  label: string;

  /** Whether this chip is currently selected */
  isSelected: boolean;

  /** Handler called when chip is pressed */
  onPress: () => void;

  /** Optional dot color (shown when not selected) */
  dotColor?: string;

  /** Optional count badge (e.g., "12") */
  count?: number;

  /** Size variant */
  size?: 'small' | 'medium';
}

// =============================================================================
// Component
// =============================================================================

/**
 * FilterChip displays a selectable chip with optional color dot and count.
 * Used for filtering content by type (Articles, Podcasts, Videos, etc.).
 *
 * @example
 * ```tsx
 * // Basic filter chip
 * <FilterChip
 *   label="Podcasts"
 *   isSelected={false}
 *   onPress={() => setFilter('podcast')}
 *   dotColor={ContentColors.podcast}
 * />
 *
 * // Selected state
 * <FilterChip
 *   label="All"
 *   isSelected={true}
 *   onPress={() => setFilter(null)}
 * />
 * ```
 */
export function FilterChip({
  label,
  isSelected,
  onPress,
  dotColor,
  count,
  size = 'medium',
}: FilterChipProps) {
  const colorScheme = useColorScheme() ?? 'light';
  const colors = Colors[colorScheme];

  const sizeStyles = size === 'small' ? styles.chipSmall : styles.chipMedium;
  const textStyles = size === 'small' ? styles.textSmall : styles.textMedium;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        sizeStyles,
        {
          backgroundColor: isSelected ? colors.primary : colors.backgroundSecondary,
          borderColor: isSelected ? colors.primary : colors.border,
        },
        pressed && { opacity: 0.8 },
      ]}
    >
      {dotColor && !isSelected && <View style={[styles.dot, { backgroundColor: dotColor }]} />}
      <Text style={[textStyles, { color: isSelected ? colors.buttonPrimaryText : colors.text }]}>
        {label}
      </Text>
      {count !== undefined && (
        <Text
          style={[
            styles.count,
            { color: isSelected ? colors.buttonPrimaryText : colors.textTertiary },
          ]}
        >
          {count}
        </Text>
      )}
    </Pressable>
  );
}

// =============================================================================
// Styles
// =============================================================================

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: Radius.full,
    borderWidth: 1,
    gap: Spacing.xs,
  },
  chipSmall: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
  },
  chipMedium: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  textSmall: {
    ...Typography.labelSmall,
    textTransform: 'none',
    letterSpacing: 0,
  },
  textMedium: {
    ...Typography.labelMedium,
  },
  count: {
    ...Typography.bodySmall,
  },
});
