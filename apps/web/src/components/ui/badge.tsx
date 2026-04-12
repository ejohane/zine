import * as React from 'react';
import {
  Colors,
  Radius,
  getBadgeMetrics,
  getBadgePalette,
  type BadgeShape,
  type BadgeSize,
  type BadgeTone,
} from '@zine/design-system';

import { cn } from '@/lib/utils';

type LegacyBadgeVariant = 'default' | 'muted' | 'success' | 'warning' | 'danger' | 'info';

function resolveBadgeTone(
  tone: BadgeTone | undefined,
  variant: LegacyBadgeVariant | undefined
): BadgeTone {
  if (tone) {
    return tone;
  }

  switch (variant) {
    case 'success':
      return 'success';
    case 'warning':
      return 'warning';
    case 'danger':
      return 'error';
    case 'info':
      return 'info';
    case 'default':
    case 'muted':
    default:
      return 'subtle';
  }
}

function Badge({
  className,
  tone,
  variant,
  size = 'sm',
  shape = 'rounded',
  style,
  ...props
}: React.ComponentProps<'span'> & {
  tone?: BadgeTone;
  variant?: LegacyBadgeVariant;
  size?: BadgeSize;
  shape?: BadgeShape;
}) {
  const resolvedTone = resolveBadgeTone(tone, variant);
  const metrics = getBadgeMetrics(size);
  const palette = getBadgePalette(Colors.dark, resolvedTone);

  return (
    <span
      className={cn('inline-flex items-center border-solid align-middle', className)}
      style={{
        paddingInline: metrics.paddingX,
        paddingBlock: metrics.paddingY,
        gap: metrics.gap,
        borderRadius: shape === 'pill' ? Radius.full : metrics.borderRadius,
        backgroundColor: palette.backgroundColor,
        color: palette.foregroundColor,
        borderColor: palette.borderColor ?? 'transparent',
        borderWidth: palette.borderColor ? 1 : 0,
        fontSize: metrics.fontSize,
        lineHeight: metrics.lineHeight,
        fontWeight: metrics.fontWeight,
        letterSpacing: metrics.letterSpacing,
        textTransform: metrics.textTransform,
        ...style,
      }}
      {...props}
    />
  );
}

export { Badge };
