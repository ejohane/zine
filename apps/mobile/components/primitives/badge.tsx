import type { ReactNode } from 'react';
import {
  View,
  type ViewProps,
  type StyleProp,
  StyleSheet,
  type TextStyle,
  type ViewStyle,
} from 'react-native';

import { Colors, Radius, Spacing, type ThemeColors, type ThemeName } from '@/constants/theme';
import { useAppTheme } from '@/hooks/use-app-theme';

import { Text, type TextTone, type TextVariant } from './text';

export type BadgeTone =
  | 'subtle'
  | 'neutral'
  | 'accent'
  | 'success'
  | 'warning'
  | 'error'
  | 'info'
  | 'overlay';

export type BadgeSize = 'sm' | 'md';
export type BadgeShape = 'rounded' | 'pill';

export interface BadgeProps extends ViewProps {
  label: string;
  tone?: BadgeTone;
  size?: BadgeSize;
  shape?: BadgeShape;
  leadingAccessory?: ReactNode;
  trailingAccessory?: ReactNode;
  colorScheme?: ThemeName;
  colors?: ThemeColors;
  backgroundColor?: string;
  borderColor?: string;
  textTone?: TextTone;
  style?: StyleProp<ViewStyle>;
  labelStyle?: StyleProp<TextStyle>;
}

type BadgePalette = {
  backgroundColor: string;
  borderColor?: string;
  textTone: TextTone;
};

function getPalette(colors: ThemeColors, tone: BadgeTone): BadgePalette {
  switch (tone) {
    case 'neutral':
      return {
        backgroundColor: colors.surfaceRaised,
        textTone: 'primary',
      };
    case 'accent':
      return {
        backgroundColor: colors.accent,
        textTone: 'accentForeground',
      };
    case 'success':
      return {
        backgroundColor: colors.statusSuccess,
        textTone: 'overlay',
      };
    case 'warning':
      return {
        backgroundColor: colors.statusWarning,
        textTone: 'warningForeground',
      };
    case 'error':
      return {
        backgroundColor: colors.statusError,
        textTone: 'overlay',
      };
    case 'info':
      return {
        backgroundColor: colors.statusInfo,
        textTone: 'overlay',
      };
    case 'overlay':
      return {
        backgroundColor: colors.overlayHeavy,
        textTone: 'overlay',
      };
    case 'subtle':
    default:
      return {
        backgroundColor: colors.surfaceSubtle,
        borderColor: colors.borderSubtle,
        textTone: 'secondary',
      };
  }
}

function getSizeStyles(size: BadgeSize): {
  paddingHorizontal: number;
  paddingVertical: number;
  gap: number;
  radius: number;
  textVariant: TextVariant;
} {
  switch (size) {
    case 'md':
      return {
        paddingHorizontal: Spacing.md,
        paddingVertical: Spacing.xs,
        gap: Spacing.xs,
        radius: Radius.md,
        textVariant: 'labelMedium',
      };
    case 'sm':
    default:
      return {
        paddingHorizontal: Spacing.sm,
        paddingVertical: Spacing.xs,
        gap: Spacing.xs,
        radius: Radius.sm,
        textVariant: 'labelSmallPlain',
      };
  }
}

export function Badge({
  label,
  tone = 'subtle',
  size = 'sm',
  shape = 'rounded',
  leadingAccessory,
  trailingAccessory,
  colorScheme,
  colors: colorsOverride,
  backgroundColor,
  borderColor,
  textTone,
  style,
  labelStyle,
  ...props
}: BadgeProps) {
  const theme = useAppTheme();
  const colors = colorsOverride ?? Colors[colorScheme ?? theme.colorScheme];
  const palette = getPalette(colors, tone);
  const sizeStyles = getSizeStyles(size);
  const resolvedBackgroundColor = backgroundColor ?? palette.backgroundColor;
  const resolvedBorderColor = borderColor ?? palette.borderColor;
  const resolvedTextTone = textTone ?? palette.textTone;

  return (
    <View
      {...props}
      style={[
        styles.base,
        {
          paddingHorizontal: sizeStyles.paddingHorizontal,
          paddingVertical: sizeStyles.paddingVertical,
          gap: sizeStyles.gap,
          borderRadius: shape === 'pill' ? Radius.full : sizeStyles.radius,
          backgroundColor: resolvedBackgroundColor,
          borderWidth: resolvedBorderColor ? 1 : 0,
          borderColor: resolvedBorderColor,
        },
        style,
      ]}
    >
      {leadingAccessory}
      <Text
        variant={sizeStyles.textVariant}
        tone={resolvedTextTone}
        numberOfLines={1}
        style={labelStyle}
      >
        {label}
      </Text>
      {trailingAccessory}
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
  },
});

export default Badge;
