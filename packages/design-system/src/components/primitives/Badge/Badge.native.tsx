import * as React from 'react';
import { View, Text } from 'react-native';
import type { ViewStyle, TextStyle } from 'react-native';
import { cn } from '../../../lib/utils';
import { cva, type VariantProps } from 'class-variance-authority';

const badgeVariants = cva(
  'inline-flex items-center justify-center rounded-full px-2.5 py-0.5',
  {
    variants: {
      variant: {
        default: 'bg-neutral-100 dark:bg-neutral-800',
        primary: 'bg-brand-primary/10',
        secondary: 'bg-brand-secondary/10',
        success: 'bg-semantic-success/10',
        warning: 'bg-semantic-warning/10',
        error: 'bg-semantic-error/10',
        destructive: 'bg-semantic-error/10',
        outline: 'border border-neutral-200 bg-transparent dark:border-neutral-800',
        // Platform-specific variants
        spotify: 'bg-spotify-500/10',
        youtube: 'bg-youtube-500/10',
        apple: 'bg-apple-500/10',
        google: 'bg-google-500/10',
      },
      size: {
        sm: 'px-2 py-0.5',
        md: 'px-2.5 py-0.5',
        lg: 'px-3 py-1',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'md',
    },
  }
);

const badgeTextVariants = cva(
  'font-semibold',
  {
    variants: {
      variant: {
        default: 'text-neutral-900 dark:text-neutral-100',
        primary: 'text-brand-primary',
        secondary: 'text-brand-secondary',
        success: 'text-semantic-success',
        warning: 'text-semantic-warning',
        error: 'text-semantic-error',
        destructive: 'text-semantic-error',
        outline: 'text-neutral-900 dark:text-neutral-100',
        // Platform-specific variants
        spotify: 'text-spotify-500',
        youtube: 'text-youtube-500',
        apple: 'text-apple-500',
        google: 'text-google-500',
      },
      size: {
        sm: 'text-xs',
        md: 'text-sm',
        lg: 'text-base',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'md',
    },
  }
);

export interface BadgeProps extends VariantProps<typeof badgeVariants> {
  children?: React.ReactNode;
  className?: string;
  textClassName?: string;
  style?: ViewStyle;
  textStyle?: TextStyle;
}

const Badge = React.forwardRef<View, BadgeProps>(
  ({ className, textClassName, variant, size, children, style, textStyle, ...props }, ref) => {
    return (
      <View
        ref={ref}
        style={style}
        {...props}
        {...{ className: cn(badgeVariants({ variant, size }), className) } as any}
      >
        <Text
          style={textStyle}
          {...{ className: cn(badgeTextVariants({ variant, size }), textClassName) } as any}
        >
          {children}
        </Text>
      </View>
    );
  }
);
Badge.displayName = 'Badge';

export { Badge, badgeVariants };