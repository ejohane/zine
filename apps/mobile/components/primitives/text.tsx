import type { ReactNode } from 'react';
import {
  Text as RNText,
  type TextProps as RNTextProps,
  type StyleProp,
  StyleSheet,
  type TextStyle,
} from 'react-native';

import { Colors, Fonts, Typography, type ThemeColors, type ThemeName } from '@/constants/theme';
import { useAppTheme } from '@/hooks/use-app-theme';

export type TextVariant = keyof typeof Typography;

export type TextTone =
  | 'primary'
  | 'secondary'
  | 'tertiary'
  | 'inverse'
  | 'accent'
  | 'accentMuted'
  | 'accentForeground'
  | 'success'
  | 'warning'
  | 'warningForeground'
  | 'error'
  | 'info'
  | 'overlay'
  | 'overlayMuted'
  | 'overlaySubtle';

export type TextFont = keyof typeof Fonts;
export type TextTransform = 'default' | 'none' | 'uppercase';

export interface TextProps extends RNTextProps {
  children?: ReactNode;
  variant?: TextVariant;
  tone?: TextTone;
  font?: TextFont;
  transform?: TextTransform;
  colorScheme?: ThemeName;
  colors?: ThemeColors;
  style?: StyleProp<TextStyle>;
}

function getToneColor(colors: ThemeColors, tone: TextTone): string {
  switch (tone) {
    case 'secondary':
      return colors.textSecondary;
    case 'tertiary':
      return colors.textTertiary;
    case 'inverse':
      return colors.textInverse;
    case 'accent':
      return colors.accent;
    case 'accentMuted':
      return colors.accentMuted;
    case 'accentForeground':
      return colors.accentForeground;
    case 'success':
      return colors.statusSuccess;
    case 'warning':
      return colors.statusWarning;
    case 'warningForeground':
      return colors.statusWarningForeground;
    case 'error':
      return colors.statusError;
    case 'info':
      return colors.statusInfo;
    case 'overlay':
      return colors.overlayForeground;
    case 'overlayMuted':
      return colors.overlayForegroundMuted;
    case 'overlaySubtle':
      return colors.overlayForegroundSubtle;
    case 'primary':
    default:
      return colors.textPrimary;
  }
}

function getResolvedTransform(
  variantStyle: (typeof Typography)[TextVariant],
  transform: TextTransform
): TextStyle['textTransform'] {
  if (transform === 'uppercase') {
    return 'uppercase';
  }

  if (transform === 'none') {
    return 'none';
  }

  return 'textTransform' in variantStyle ? variantStyle.textTransform : undefined;
}

export function Text({
  children,
  variant = 'bodyMedium',
  tone = 'primary',
  font = 'sans',
  transform = 'default',
  colorScheme,
  colors: colorsOverride,
  style,
  ...props
}: TextProps) {
  const theme = useAppTheme();
  const colors = colorsOverride ?? Colors[colorScheme ?? theme.colorScheme];
  const variantStyle = Typography[variant];
  const resolvedColor = getToneColor(colors, tone);
  const resolvedTransform = getResolvedTransform(variantStyle, transform);

  return (
    <RNText
      {...props}
      style={[
        styles.base,
        variantStyle,
        {
          color: resolvedColor,
          fontFamily: Fonts[font],
          textTransform: resolvedTransform,
        },
        style,
      ]}
    >
      {children}
    </RNText>
  );
}

const styles = StyleSheet.create({
  base: {
    includeFontPadding: false,
  },
});

export default Text;
