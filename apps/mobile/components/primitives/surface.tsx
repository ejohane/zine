import type { ReactNode } from 'react';
import { View, type ViewProps, type ViewStyle, type StyleProp, StyleSheet } from 'react-native';

import {
  Colors,
  Radius,
  Shadows,
  Spacing,
  type ThemeColors,
  type ThemeName,
} from '@/constants/theme';
import { useAppTheme } from '@/hooks/use-app-theme';

export type SurfaceTone =
  | 'canvas'
  | 'subtle'
  | 'elevated'
  | 'raised'
  | 'success'
  | 'warning'
  | 'error'
  | 'info'
  | 'transparent';

export type SurfaceBorder = 'none' | 'subtle' | 'default' | 'tone';

export interface SurfaceProps extends ViewProps {
  children?: ReactNode;
  tone?: SurfaceTone;
  border?: SurfaceBorder;
  radius?: keyof typeof Radius;
  padding?: keyof typeof Spacing;
  shadow?: keyof typeof Shadows;
  colorScheme?: ThemeName;
  colors?: ThemeColors;
  style?: StyleProp<ViewStyle>;
}

function getSurfaceBackground(colors: ThemeColors, tone: SurfaceTone): string {
  switch (tone) {
    case 'subtle':
      return colors.surfaceSubtle;
    case 'raised':
      return colors.surfaceRaised;
    case 'success':
      return colors.statusSuccessSurface;
    case 'warning':
      return colors.statusWarningSurface;
    case 'error':
      return colors.statusErrorSurface;
    case 'info':
      return colors.statusInfoSurface;
    case 'transparent':
      return 'transparent';
    case 'canvas':
      return colors.surfaceCanvas;
    case 'elevated':
    default:
      return colors.surfaceElevated;
  }
}

function getToneBorderColor(colors: ThemeColors, tone: SurfaceTone): string {
  switch (tone) {
    case 'success':
      return colors.statusSuccess;
    case 'warning':
      return colors.statusWarning;
    case 'error':
      return colors.statusError;
    case 'info':
      return colors.statusInfo;
    default:
      return colors.borderDefault;
  }
}

export function Surface({
  children,
  tone = 'elevated',
  border = 'none',
  radius = 'lg',
  padding,
  shadow,
  colorScheme,
  colors: colorsOverride,
  style,
  ...props
}: SurfaceProps) {
  const theme = useAppTheme();
  const colors = colorsOverride ?? Colors[colorScheme ?? theme.colorScheme];
  const borderWidth = border === 'none' ? 0 : 1;
  const borderColor =
    border === 'subtle'
      ? colors.borderSubtle
      : border === 'tone'
        ? getToneBorderColor(colors, tone)
        : colors.borderDefault;

  return (
    <View
      {...props}
      style={[
        styles.base,
        {
          backgroundColor: getSurfaceBackground(colors, tone),
          borderRadius: Radius[radius],
          borderWidth,
          borderColor,
          padding: padding ? Spacing[padding] : undefined,
        },
        shadow ? Shadows[shadow] : null,
        style,
      ]}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  base: {},
});

export default Surface;
