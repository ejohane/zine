import { FilterChipPalette, Radius, Spacing, Typography, type ThemeColors } from './foundations';
import type {
  BadgeSize,
  BadgeTone,
  ButtonSize,
  ButtonTone,
  ButtonVariant,
  FilterChipSize,
  SurfaceBorder,
  SurfaceTone,
} from './primitives';

type TextMetrics = {
  fontSize: number;
  lineHeight: number;
  fontWeight: string | number;
  letterSpacing?: number;
  textTransform?: 'uppercase';
};

export type ButtonPalette = {
  backgroundColor: string;
  borderColor?: string;
  foregroundColor: string;
};

export type ButtonMetrics = TextMetrics & {
  minHeight: number;
  paddingX: number;
  paddingY: number;
  gap: number;
  borderRadius: number;
};

export type BadgePalette = {
  backgroundColor: string;
  borderColor?: string;
  foregroundColor: string;
};

export type BadgeMetrics = TextMetrics & {
  paddingX: number;
  paddingY: number;
  gap: number;
  borderRadius: number;
};

export type FilterChipToneKey = Exclude<keyof typeof FilterChipPalette, 'completed'>;

export type FilterChipPaletteState = {
  backgroundColor: string;
  borderColor: string;
  foregroundColor: string;
};

export type FilterChipMetrics = TextMetrics & {
  paddingX: number;
  paddingY: number;
  gap: number;
  borderRadius: number;
  iconSize: number;
  countMinWidth: number;
};

export const FilterChipForegrounds: Record<FilterChipToneKey, string> = {
  article: '#BFDBFE',
  podcast: '#BBF7D0',
  video: '#FCA5A5',
  post: '#F5F5F5',
};

function toTextMetrics(token: {
  fontSize: number;
  lineHeight: number;
  fontWeight: string | number;
  letterSpacing?: number;
  textTransform?: 'uppercase';
}): TextMetrics {
  return {
    fontSize: token.fontSize,
    lineHeight: token.lineHeight,
    fontWeight: token.fontWeight,
    letterSpacing: token.letterSpacing,
    textTransform: token.textTransform,
  };
}

export function getButtonPalette(
  colors: ThemeColors,
  variant: ButtonVariant,
  tone: ButtonTone,
  disabled = false
): ButtonPalette {
  if (disabled) {
    return {
      backgroundColor: variant === 'ghost' ? 'transparent' : colors.surfaceRaised,
      borderColor: variant === 'outline' ? colors.borderSubtle : undefined,
      foregroundColor: variant === 'ghost' ? colors.textTertiary : colors.textSecondary,
    };
  }

  if (tone === 'danger') {
    switch (variant) {
      case 'secondary':
        return {
          backgroundColor: colors.statusErrorSurface,
          foregroundColor: colors.statusError,
        };
      case 'outline':
        return {
          backgroundColor: colors.statusErrorSurface,
          borderColor: colors.statusError,
          foregroundColor: colors.statusError,
        };
      case 'ghost':
        return {
          backgroundColor: 'transparent',
          foregroundColor: colors.statusError,
        };
      case 'primary':
      default:
        return {
          backgroundColor: colors.statusError,
          foregroundColor: colors.overlayForeground,
        };
    }
  }

  switch (variant) {
    case 'secondary':
      return {
        backgroundColor: colors.surfaceRaised,
        foregroundColor: colors.textPrimary,
      };
    case 'outline':
      return {
        backgroundColor: 'transparent',
        borderColor: colors.borderDefault,
        foregroundColor: colors.textPrimary,
      };
    case 'ghost':
      return {
        backgroundColor: 'transparent',
        foregroundColor: colors.textSecondary,
      };
    case 'primary':
    default:
      return {
        backgroundColor: colors.accent,
        foregroundColor: colors.accentForeground,
      };
  }
}

export function getButtonMetrics(size: ButtonSize): ButtonMetrics {
  switch (size) {
    case 'sm':
      return {
        minHeight: 36,
        paddingX: Spacing.md,
        paddingY: Spacing.sm,
        gap: Spacing.xs,
        borderRadius: Radius.md,
        ...toTextMetrics(Typography.labelMedium),
      };
    case 'lg':
      return {
        minHeight: 52,
        paddingX: Spacing.xl,
        paddingY: Spacing.md,
        gap: Spacing.sm,
        borderRadius: Radius.xl,
        ...toTextMetrics(Typography.labelLarge),
      };
    case 'md':
    default:
      return {
        minHeight: 44,
        paddingX: Spacing.lg,
        paddingY: Spacing.md,
        gap: Spacing.sm,
        borderRadius: Radius.lg,
        ...toTextMetrics(Typography.labelLarge),
      };
  }
}

export function getBadgePalette(colors: ThemeColors, tone: BadgeTone): BadgePalette {
  switch (tone) {
    case 'neutral':
      return {
        backgroundColor: colors.surfaceRaised,
        foregroundColor: colors.textPrimary,
      };
    case 'accent':
      return {
        backgroundColor: colors.accent,
        foregroundColor: colors.accentForeground,
      };
    case 'success':
      return {
        backgroundColor: colors.statusSuccess,
        foregroundColor: colors.overlayForeground,
      };
    case 'warning':
      return {
        backgroundColor: colors.statusWarning,
        foregroundColor: colors.statusWarningForeground,
      };
    case 'error':
      return {
        backgroundColor: colors.statusError,
        foregroundColor: colors.overlayForeground,
      };
    case 'info':
      return {
        backgroundColor: colors.statusInfo,
        foregroundColor: colors.overlayForeground,
      };
    case 'overlay':
      return {
        backgroundColor: colors.overlayHeavy,
        foregroundColor: colors.overlayForeground,
      };
    case 'subtle':
    default:
      return {
        backgroundColor: colors.surfaceSubtle,
        borderColor: colors.borderSubtle,
        foregroundColor: colors.textSecondary,
      };
  }
}

export function getBadgeMetrics(size: BadgeSize): BadgeMetrics {
  switch (size) {
    case 'md':
      return {
        paddingX: Spacing.md,
        paddingY: Spacing.xs,
        gap: Spacing.xs,
        borderRadius: Radius.md,
        ...toTextMetrics(Typography.labelMedium),
      };
    case 'sm':
    default:
      return {
        paddingX: Spacing.sm,
        paddingY: Spacing.xs,
        gap: Spacing.xs,
        borderRadius: Radius.sm,
        ...toTextMetrics(Typography.labelSmallPlain),
      };
  }
}

export function getSurfaceBackgroundColor(colors: ThemeColors, tone: SurfaceTone): string {
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

export function getSurfaceBorderColor(
  colors: ThemeColors,
  tone: SurfaceTone,
  border: SurfaceBorder
): string | undefined {
  if (border === 'none') {
    return undefined;
  }

  if (border === 'subtle') {
    return colors.borderSubtle;
  }

  if (border === 'default') {
    return colors.borderDefault;
  }

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

export function getFilterChipPalette(
  colors: ThemeColors,
  tone: FilterChipToneKey | 'default',
  selected: boolean
): FilterChipPaletteState {
  if (!selected) {
    return {
      backgroundColor: colors.surfaceSubtle,
      borderColor: colors.borderSubtle,
      foregroundColor: colors.textSubheader,
    };
  }

  if (tone === 'default') {
    return {
      backgroundColor: colors.surfaceRaised,
      borderColor: colors.borderDefault,
      foregroundColor: colors.textPrimary,
    };
  }

  return {
    backgroundColor: FilterChipPalette[tone].surface,
    borderColor: FilterChipPalette[tone].accent,
    foregroundColor: FilterChipForegrounds[tone],
  };
}

export function getFilterChipMetrics(size: FilterChipSize): FilterChipMetrics {
  switch (size) {
    case 'small':
      return {
        paddingX: Spacing.sm,
        paddingY: Spacing.xs,
        gap: Spacing.xs,
        borderRadius: Radius.full,
        iconSize: 12,
        countMinWidth: 18,
        ...toTextMetrics({ ...Typography.labelSmallPlain, textTransform: 'uppercase' }),
      };
    case 'medium':
    default:
      return {
        paddingX: Spacing.md,
        paddingY: Spacing.sm,
        gap: Spacing.xs,
        borderRadius: Radius.full,
        iconSize: 14,
        countMinWidth: 18,
        ...toTextMetrics(Typography.labelMedium),
      };
  }
}
