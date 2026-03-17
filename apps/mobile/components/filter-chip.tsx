/**
 * FilterChip Component
 *
 * A reusable chip component for filtering content by type or category.
 * Supports selected/unselected states with restrained editorial styling.
 */

import type { ComponentType } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Radius, Spacing, Typography } from '@/constants/theme';
import { useAppTheme } from '@/hooks/use-app-theme';
import { Text } from '@/components/primitives/text';

// =============================================================================
// Types
// =============================================================================

type FilterChipIconProps = {
  size?: number;
  color?: string;
};

export interface FilterChipProps {
  /** Label text displayed on the chip */
  label: string;

  /** Whether this chip is currently selected */
  isSelected: boolean;

  /** Handler called when chip is pressed */
  onPress: () => void;

  /** Optional leading icon component */
  icon?: ComponentType<FilterChipIconProps>;

  /** Optional dot color (shown when not selected) */
  dotColor?: string;

  /** Optional selected accent color for restrained border/text emphasis */
  selectedColor?: string;

  /** Optional selected surface color for type-associated selection states */
  selectedSurfaceColor?: string;

  /** Optional count badge (e.g., "12") */
  count?: number;

  /** Size variant */
  size?: 'small' | 'medium';
}

// =============================================================================
// Component
// =============================================================================

/**
 * FilterChip displays a selectable chip with optional icon and count.
 * Used for filtering content by type (Articles, Podcasts, Videos, etc.).
 *
 * @example
 * ```tsx
 * // Basic filter chip
 * <FilterChip
 *   label="Podcasts"
 *   isSelected={false}
 *   onPress={() => setFilter('podcast')}
 *   icon={HeadphonesIcon}
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
  icon: Icon,
  dotColor,
  selectedColor,
  selectedSurfaceColor,
  count,
  size = 'medium',
}: FilterChipProps) {
  const { colors, motion } = useAppTheme();
  const hasTintedSelection = Boolean(selectedColor && selectedSurfaceColor);
  const chipBackgroundColor = isSelected
    ? (selectedSurfaceColor ?? colors.surfaceRaised)
    : colors.surfaceSubtle;
  const chipBorderColor = isSelected
    ? (selectedColor ?? colors.borderDefault)
    : colors.borderSubtle;
  const selectedForegroundColor = hasTintedSelection ? selectedColor : colors.textPrimary;
  const unselectedForegroundColor = colors.textSubheader;
  const iconColor = isSelected ? selectedForegroundColor : unselectedForegroundColor;
  const displayedCount = count && count > 0 ? (count > 99 ? '99+' : String(count)) : null;

  const sizeStyles = size === 'small' ? styles.chipSmall : styles.chipMedium;
  const textStyles = size === 'small' ? styles.textSmall : styles.textMedium;
  const iconSize = size === 'small' ? 12 : 14;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        sizeStyles,
        {
          backgroundColor: chipBackgroundColor,
          borderColor: chipBorderColor,
        },
        pressed && { opacity: motion.opacity.pressed },
      ]}
    >
      {Icon ? <Icon size={iconSize} color={iconColor} /> : null}
      {!Icon && dotColor && !isSelected ? (
        <View style={[styles.dot, { backgroundColor: dotColor }]} />
      ) : null}
      <Text
        variant={size === 'small' ? 'labelSmallPlain' : 'labelMedium'}
        tone={isSelected ? 'primary' : 'subheader'}
        style={[
          textStyles,
          { color: isSelected ? selectedForegroundColor : unselectedForegroundColor },
        ]}
      >
        {label}
      </Text>
      {displayedCount ? (
        <Text
          variant="bodySmall"
          tone={isSelected ? 'primary' : 'subheader'}
          style={[
            styles.count,
            { color: isSelected ? selectedForegroundColor : unselectedForegroundColor },
          ]}
        >
          {displayedCount}
        </Text>
      ) : null}
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
    width: 6,
    height: 6,
    borderRadius: Radius.full,
  },
  textSmall: {
    ...Typography.labelSmallPlain,
    textTransform: 'uppercase',
  },
  textMedium: {
    ...Typography.labelMedium,
  },
  count: {
    ...Typography.bodySmall,
    minWidth: 18,
  },
});
