import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  type PressableProps,
  type StyleProp,
  StyleSheet,
  View,
  type ViewStyle,
  type TextStyle,
} from 'react-native';

import { Text, type TextTone } from '@/components/primitives/text';
import {
  Colors,
  Motion,
  Radius,
  Spacing,
  type ThemeColors,
  type ThemeName,
} from '@/constants/theme';
import { useAppTheme } from '@/hooks/use-app-theme';

export type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost';
export type ButtonTone = 'default' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends Omit<PressableProps, 'children' | 'style'> {
  label: string;
  variant?: ButtonVariant;
  tone?: ButtonTone;
  size?: ButtonSize;
  loading?: boolean;
  fullWidth?: boolean;
  leadingAccessory?: ReactNode;
  trailingAccessory?: ReactNode;
  colorScheme?: ThemeName;
  colors?: ThemeColors;
  style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
  labelStyle?: StyleProp<TextStyle>;
}

type ButtonPalette = {
  backgroundColor: string;
  borderColor: string;
  textTone: TextTone;
};

function getPalette(
  colors: ThemeColors,
  variant: ButtonVariant,
  tone: ButtonTone,
  disabled: boolean
): ButtonPalette {
  if (disabled) {
    return {
      backgroundColor: variant === 'ghost' ? 'transparent' : colors.surfaceRaised,
      borderColor: variant === 'outline' ? colors.borderSubtle : 'transparent',
      textTone: variant === 'ghost' ? 'tertiary' : 'secondary',
    };
  }

  if (tone === 'danger') {
    switch (variant) {
      case 'secondary':
        return {
          backgroundColor: colors.statusErrorSurface,
          borderColor: 'transparent',
          textTone: 'error',
        };
      case 'outline':
        return {
          backgroundColor: colors.statusErrorSurface,
          borderColor: colors.statusError,
          textTone: 'error',
        };
      case 'ghost':
        return {
          backgroundColor: 'transparent',
          borderColor: 'transparent',
          textTone: 'error',
        };
      case 'primary':
      default:
        return {
          backgroundColor: colors.statusError,
          borderColor: 'transparent',
          textTone: 'overlay',
        };
    }
  }

  switch (variant) {
    case 'secondary':
      return {
        backgroundColor: colors.surfaceRaised,
        borderColor: 'transparent',
        textTone: 'primary',
      };
    case 'outline':
      return {
        backgroundColor: 'transparent',
        borderColor: colors.borderDefault,
        textTone: 'primary',
      };
    case 'ghost':
      return {
        backgroundColor: 'transparent',
        borderColor: 'transparent',
        textTone: 'secondary',
      };
    case 'primary':
    default:
      return {
        backgroundColor: colors.accent,
        borderColor: 'transparent',
        textTone: 'accentForeground',
      };
  }
}

function getSizeStyles(size: ButtonSize) {
  switch (size) {
    case 'sm':
      return {
        minHeight: 36,
        paddingHorizontal: Spacing.md,
        paddingVertical: Spacing.sm,
        gap: Spacing.xs,
        borderRadius: Radius.md,
        labelVariant: 'labelMedium' as const,
      };
    case 'lg':
      return {
        minHeight: 52,
        paddingHorizontal: Spacing.xl,
        paddingVertical: Spacing.md,
        gap: Spacing.sm,
        borderRadius: Radius.xl,
        labelVariant: 'labelLarge' as const,
      };
    case 'md':
    default:
      return {
        minHeight: 44,
        paddingHorizontal: Spacing.lg,
        paddingVertical: Spacing.md,
        gap: Spacing.sm,
        borderRadius: Radius.lg,
        labelVariant: 'labelLarge' as const,
      };
  }
}

export function Button({
  label,
  variant = 'primary',
  tone = 'default',
  size = 'md',
  loading = false,
  disabled = false,
  fullWidth = false,
  leadingAccessory,
  trailingAccessory,
  colorScheme,
  colors: colorsOverride,
  style,
  contentStyle,
  labelStyle,
  accessibilityRole,
  accessibilityState,
  ...props
}: ButtonProps) {
  const theme = useAppTheme();
  const colors = colorsOverride ?? Colors[colorScheme ?? theme.colorScheme];
  const sizeStyles = getSizeStyles(size);
  const isDisabled = disabled || loading;
  const palette = getPalette(colors, variant, tone, isDisabled);
  const spinnerColor =
    palette.textTone === 'accentForeground' || palette.textTone === 'overlay'
      ? colors.overlayForeground
      : palette.textTone === 'error'
        ? colors.statusError
        : palette.textTone === 'accent'
          ? colors.accent
          : palette.textTone === 'secondary'
            ? colors.textSecondary
            : colors.textPrimary;

  return (
    <Pressable
      {...props}
      disabled={isDisabled}
      accessibilityRole={accessibilityRole ?? 'button'}
      accessibilityState={{ ...accessibilityState, disabled: isDisabled, busy: loading }}
      style={({ pressed }) => [
        styles.base,
        {
          minHeight: sizeStyles.minHeight,
          paddingHorizontal: sizeStyles.paddingHorizontal,
          paddingVertical: sizeStyles.paddingVertical,
          borderRadius: sizeStyles.borderRadius,
          backgroundColor: palette.backgroundColor,
          borderColor: palette.borderColor,
          opacity: pressed && !isDisabled ? Motion.opacity.pressed : 1,
        },
        palette.borderColor === 'transparent' ? styles.noBorder : styles.outlineBorder,
        fullWidth ? styles.fullWidth : null,
        style,
      ]}
    >
      <View
        style={[
          styles.content,
          { gap: sizeStyles.gap },
          fullWidth ? styles.contentCenter : null,
          contentStyle,
        ]}
      >
        {loading ? <ActivityIndicator size="small" color={spinnerColor} /> : leadingAccessory}
        <Text
          variant={sizeStyles.labelVariant}
          tone={palette.textTone}
          numberOfLines={1}
          style={labelStyle}
        >
          {label}
        </Text>
        {!loading ? trailingAccessory : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    justifyContent: 'center',
  },
  noBorder: {
    borderWidth: 0,
  },
  outlineBorder: {
    borderWidth: 1,
  },
  fullWidth: {
    width: '100%',
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  contentCenter: {
    alignSelf: 'stretch',
  },
});

export default Button;
