import * as React from 'react';
import { cn } from '../../../lib/utils';
import { cva, type VariantProps } from 'class-variance-authority';

const textVariants = cva('', {
  variants: {
    variant: {
      h1: 'text-5xl font-bold tracking-tight',
      h2: 'text-4xl font-bold tracking-tight',
      h3: 'text-3xl font-semibold',
      h4: 'text-2xl font-semibold',
      h5: 'text-xl font-medium',
      h6: 'text-lg font-medium',
      body: 'text-base',
      bodyLarge: 'text-lg',
      bodySmall: 'text-sm',
      caption: 'text-sm text-neutral-600 dark:text-neutral-400',
      overline: 'text-xs uppercase tracking-wider font-medium',
      label: 'text-sm font-medium',
    },
    color: {
      default: 'text-neutral-900 dark:text-neutral-100',
      muted: 'text-neutral-600 dark:text-neutral-400',
      primary: 'text-brand-primary',
      secondary: 'text-brand-secondary',
      error: 'text-semantic-error',
      success: 'text-semantic-success',
      warning: 'text-semantic-warning',
    },
    align: {
      left: 'text-left',
      center: 'text-center',
      right: 'text-right',
      justify: 'text-justify',
    },
    weight: {
      normal: 'font-normal',
      medium: 'font-medium',
      semibold: 'font-semibold',
      bold: 'font-bold',
    },
  },
  defaultVariants: {
    variant: 'body',
    color: 'default',
    align: 'left',
  },
});

export interface TextProps
  extends Omit<React.HTMLAttributes<HTMLElement>, 'color'>,
    VariantProps<typeof textVariants> {
  as?: keyof JSX.IntrinsicElements;
}

const Text = React.forwardRef<HTMLElement, TextProps>(
  ({ className, variant = 'body', color, align, weight, as, ...props }, ref) => {
    // Determine the HTML element to use
    let Component: keyof JSX.IntrinsicElements = as || 'span';
    
    if (!as && variant) {
      if (variant.startsWith('h')) {
        Component = variant as keyof JSX.IntrinsicElements;
      } else if (variant === 'body' || variant === 'bodyLarge' || variant === 'bodySmall') {
        Component = 'p';
      } else if (variant === 'label') {
        Component = 'label';
      }
    }

    return React.createElement(
      Component,
      {
        ref,
        className: cn(textVariants({ variant, color, align, weight }), className),
        ...props,
      }
    );
  }
);
Text.displayName = 'Text';

export { Text, textVariants };