import * as React from 'react';
import { cn } from '../../../lib/utils';
import { cva, type VariantProps } from 'class-variance-authority';

const badgeVariants = cva(
  'inline-flex items-center justify-center rounded-full px-2.5 py-0.5 text-xs font-semibold transition-colors',
  {
    variants: {
      variant: {
        default: 'bg-neutral-100 text-neutral-900 hover:bg-neutral-100/80 dark:bg-neutral-800 dark:text-neutral-100',
        primary: 'bg-brand-primary/10 text-brand-primary hover:bg-brand-primary/20',
        secondary: 'bg-brand-secondary/10 text-brand-secondary hover:bg-brand-secondary/20',
        success: 'bg-semantic-success/10 text-semantic-success hover:bg-semantic-success/20',
        warning: 'bg-semantic-warning/10 text-semantic-warning hover:bg-semantic-warning/20',
        error: 'bg-semantic-error/10 text-semantic-error hover:bg-semantic-error/20',
        destructive: 'bg-semantic-error/10 text-semantic-error hover:bg-semantic-error/20',
        outline: 'border border-neutral-200 bg-transparent hover:bg-neutral-100 dark:border-neutral-800 dark:hover:bg-neutral-800',
        // Platform-specific variants
        spotify: 'bg-spotify-500/10 text-spotify-500 hover:bg-spotify-500/20',
        youtube: 'bg-youtube-500/10 text-youtube-500 hover:bg-youtube-500/20',
        apple: 'bg-apple-500/10 text-apple-500 hover:bg-apple-500/20',
        google: 'bg-google-500/10 text-google-500 hover:bg-google-500/20',
      },
      size: {
        sm: 'text-xs px-2 py-0.5',
        md: 'text-sm px-2.5 py-0.5',
        lg: 'text-base px-3 py-1',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'md',
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

const Badge = React.forwardRef<HTMLSpanElement, BadgeProps>(
  ({ className, variant, size, ...props }, ref) => {
    return (
      <span
        ref={ref}
        className={cn(badgeVariants({ variant, size }), className)}
        {...props}
      />
    );
  }
);
Badge.displayName = 'Badge';

export { Badge, badgeVariants };