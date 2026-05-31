/**
 * FilterChip Component
 *
 * A reusable chip component for filtering content by type or category.
 * Supports selected/unselected states with restrained editorial styling.
 */

import type { ComponentType } from 'react';

import * as Haptics from 'expo-haptics';
import { Pressable, StyleSheet, View } from 'react-native';

import { Radius, Spacing, Typography } from '@/constants/theme';
import { useAppTheme } from '@/hooks/use-app-theme';
import { Text } from '@/components/primitives/text';

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

  /** Whether the chip should render as static/non-interactive */
  disabled?: boolean;

  /** Optional leading icon component */
  icon?: ComponentType<FilterChipIconProps>;

  /** Optional dot color (shown when not selected) */
  dotColor?: string;

  /** Optional selected accent color for restrained border/text emphasis */
  selectedColor?: string;

  /** Optional selected surface color for type-associated selection states */
  selectedSurfaceColor?: string;

  /** Optional selected foreground color for filled selection states */
  selectedForegroundColor?: string;

  /** Size variant */
  size?: 'small' | 'medium';
}

/**
 * FilterChip displays a selectable chip with an optional icon.
 * Used for filtering content by type (Articles, Podcasts, Videos, etc.).
 *
 * @example
 * ```tsx
 * // Basic filter chip
 * <FilterChip
 *   label="Podcasts"
 *   isSelected={false}
 *   onPress={() => setFilter('podcast')}
 *   icon={PodcastIcon}
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
  disabled = false,
  icon: Icon,
  dotColor,
  selectedColor,
  selectedSurfaceColor,
  selectedForegroundColor,
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
  const resolvedSelectedForegroundColor =
    selectedForegroundColor ?? (hasTintedSelection ? selectedColor : colors.textPrimary);
  const unselectedForegroundColor = colors.textSubheader;
  const iconColor = isSelected ? resolvedSelectedForegroundColor : unselectedForegroundColor;

  const sizeStyles = size === 'small' ? styles.chipSmall : styles.chipMedium;
  const textStyles = size === 'small' ? styles.textSmall : styles.textMedium;
  const iconSize = size === 'small' ? 12 : 14;
  const handlePress = () => {
    if (disabled) return;

    void Haptics.selectionAsync();
    onPress();
  };

  return (
    <Pressable
      onPress={handlePress}
      disabled={disabled}
      accessibilityState={disabled ? { disabled: true } : undefined}
      style={({ pressed }) => [
        styles.chip,
        sizeStyles,
        {
          backgroundColor: chipBackgroundColor,
          borderColor: chipBorderColor,
        },
        pressed && !disabled && { opacity: motion.opacity.pressed },
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
          { color: isSelected ? resolvedSelectedForegroundColor : unselectedForegroundColor },
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

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
});
