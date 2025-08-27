import * as React from 'react';
import { Text as RNText } from 'react-native';
import type { TextStyle, TextProps as RNTextProps } from 'react-native';
import { cn } from '../../../lib/utils';
import { cva, type VariantProps } from 'class-variance-authority';

const textVariants = cva('', {
  variants: {
    variant: {
      h1: 'text-5xl font-bold',
      h2: 'text-4xl font-bold',
      h3: 'text-3xl font-semibold',
      h4: 'text-2xl font-semibold',
      h5: 'text-xl font-medium',
      h6: 'text-lg font-medium',
      body: 'text-base',
      bodyLarge: 'text-lg',
      bodySmall: 'text-sm',
      caption: 'text-sm text-neutral-600 dark:text-neutral-400',
      overline: 'text-xs uppercase font-medium',
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
  extends Omit<RNTextProps, 'style'>,
    VariantProps<typeof textVariants> {
  className?: string;
  style?: TextStyle;
  children?: React.ReactNode;
}

const Text = React.forwardRef<RNText, TextProps>(
  ({ className, variant, color, align, weight, style, children, ...props }, ref) => {
    return (
      <RNText
        ref={ref}
        style={style}
        {...props}
        {...{ className: cn(textVariants({ variant, color, align, weight }), className) } as any}
      >
        {children}
      </RNText>
    );
  }
);
Text.displayName = 'Text';

// Additional typography components for convenience
export const H1: React.FC<Omit<TextProps, 'variant'>> = (props) => (
  <Text variant="h1" {...props} />
);

export const H2: React.FC<Omit<TextProps, 'variant'>> = (props) => (
  <Text variant="h2" {...props} />
);

export const H3: React.FC<Omit<TextProps, 'variant'>> = (props) => (
  <Text variant="h3" {...props} />
);

export const H4: React.FC<Omit<TextProps, 'variant'>> = (props) => (
  <Text variant="h4" {...props} />
);

export const H5: React.FC<Omit<TextProps, 'variant'>> = (props) => (
  <Text variant="h5" {...props} />
);

export const H6: React.FC<Omit<TextProps, 'variant'>> = (props) => (
  <Text variant="h6" {...props} />
);

export const Body: React.FC<Omit<TextProps, 'variant'>> = (props) => (
  <Text variant="body" {...props} />
);

export const Caption: React.FC<Omit<TextProps, 'variant'>> = (props) => (
  <Text variant="caption" {...props} />
);

export const Label: React.FC<Omit<TextProps, 'variant'>> = (props) => (
  <Text variant="label" {...props} />
);

export { Text, textVariants };