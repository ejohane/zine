import type { ReactNode } from 'react';
import {
  Pressable,
  type PressableProps,
  StyleSheet,
  type StyleProp,
  View,
  type ViewStyle,
} from 'react-native';

import { Colors, Motion, Radius, type ThemeColors, type ThemeName } from '@/constants/theme';
import { useAppTheme } from '@/hooks/use-app-theme';

export type IconButtonVariant = 'solid' | 'subtle' | 'outline' | 'ghost';
export type IconButtonTone = 'default' | 'danger';
export type IconButtonSize = 'sm' | 'md' | 'lg';

export interface IconButtonProps extends Omit<PressableProps, 'children' | 'style'> {
  children: ReactNode;
  variant?: IconButtonVariant;
  tone?: IconButtonTone;
  size?: IconButtonSize;
  colorScheme?: ThemeName;
  colors?: ThemeColors;
  style?: StyleProp<ViewStyle>;
}

function getPalette(
  colors: ThemeColors,
  variant: IconButtonVariant,
  tone: IconButtonTone,
  disabled: boolean
) {
  if (disabled) {
    return {
      backgroundColor: variant === 'ghost' ? 'transparent' : colors.surfaceRaised,
      borderColor: variant === 'outline' ? colors.borderSubtle : 'transparent',
    };
  }

  if (tone === 'danger') {
    switch (variant) {
      case 'subtle':
        return {
          backgroundColor: colors.statusErrorSurface,
          borderColor: 'transparent',
        };
      case 'outline':
        return {
          backgroundColor: colors.statusErrorSurface,
          borderColor: colors.statusError,
        };
      case 'ghost':
        return {
          backgroundColor: 'transparent',
          borderColor: 'transparent',
        };
      case 'solid':
      default:
        return {
          backgroundColor: colors.statusError,
          borderColor: 'transparent',
        };
    }
  }

  switch (variant) {
    case 'subtle':
      return {
        backgroundColor: colors.surfaceRaised,
        borderColor: 'transparent',
      };
    case 'outline':
      return {
        backgroundColor: 'transparent',
        borderColor: colors.borderDefault,
      };
    case 'ghost':
      return {
        backgroundColor: 'transparent',
        borderColor: 'transparent',
      };
    case 'solid':
    default:
      return {
        backgroundColor: colors.accent,
        borderColor: 'transparent',
      };
  }
}

function getDimensions(size: IconButtonSize) {
  switch (size) {
    case 'sm':
      return {
        width: 40,
        height: 40,
        borderRadius: Radius.md,
      };
    case 'lg':
      return {
        width: 56,
        height: 56,
        borderRadius: Radius.full,
      };
    case 'md':
    default:
      return {
        width: 48,
        height: 48,
        borderRadius: Radius.full,
      };
  }
}

export function IconButton({
  children,
  variant = 'subtle',
  tone = 'default',
  size = 'md',
  disabled = false,
  colorScheme,
  colors: colorsOverride,
  style,
  accessibilityRole,
  accessibilityState,
  ...props
}: IconButtonProps) {
  const theme = useAppTheme();
  const colors = colorsOverride ?? Colors[colorScheme ?? theme.colorScheme];
  const dimensions = getDimensions(size);
  const isDisabled = disabled === true;
  const palette = getPalette(colors, variant, tone, isDisabled);

  return (
    <Pressable
      {...props}
      disabled={isDisabled}
      accessibilityRole={accessibilityRole ?? 'button'}
      accessibilityState={{ ...accessibilityState, disabled: isDisabled }}
      style={({ pressed }) => [
        styles.base,
        dimensions,
        {
          backgroundColor: palette.backgroundColor,
          borderColor: palette.borderColor,
          borderWidth: palette.borderColor === 'transparent' ? 0 : 1,
          opacity: pressed && !isDisabled ? Motion.opacity.pressed : 1,
        },
        style,
      ]}
    >
      <View pointerEvents="none">{children}</View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export default IconButton;
