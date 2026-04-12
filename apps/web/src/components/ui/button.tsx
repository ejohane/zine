import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import {
  Colors,
  Radius,
  getButtonMetrics,
  getButtonPalette,
  type ButtonSize,
  type ButtonTone,
  type ButtonVariant,
} from '@zine/design-system';

import { cn } from '@/lib/utils';

type ButtonVariantProp = ButtonVariant | 'default';
type ButtonSizeProp = ButtonSize | 'icon';

type ButtonProps = React.ComponentProps<'button'> & {
  asChild?: boolean;
  variant?: ButtonVariantProp;
  tone?: ButtonTone;
  size?: ButtonSizeProp;
};

function resolveButtonVariant(variant: ButtonVariantProp | undefined): ButtonVariant {
  return variant && variant !== 'default' ? variant : 'primary';
}

function Button({
  className,
  variant,
  tone = 'default',
  size = 'md',
  asChild = false,
  style,
  disabled,
  ...props
}: ButtonProps) {
  const Comp = asChild ? Slot : 'button';
  const resolvedVariant = resolveButtonVariant(variant);
  const resolvedSize = size === 'icon' ? 'md' : size;
  const metrics = getButtonMetrics(resolvedSize);
  const palette = getButtonPalette(Colors.dark, resolvedVariant, tone, Boolean(disabled));
  const iconStyle = size === 'icon';

  return (
    <Comp
      className={cn(
        'inline-flex items-center justify-center whitespace-nowrap border-solid transition-opacity duration-150 disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-offset-2 focus-visible:ring-offset-background hover:opacity-90 [&_svg]:pointer-events-none [&_svg]:shrink-0',
        className
      )}
      style={{
        minHeight: metrics.minHeight,
        paddingInline: iconStyle ? 0 : metrics.paddingX,
        paddingBlock: iconStyle ? 0 : metrics.paddingY,
        width: iconStyle ? metrics.minHeight : undefined,
        gap: iconStyle ? 0 : metrics.gap,
        borderRadius: iconStyle ? Radius.full : metrics.borderRadius,
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
      disabled={disabled}
      {...props}
    />
  );
}

export { Button };
