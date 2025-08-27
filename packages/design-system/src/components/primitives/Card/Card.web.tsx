import * as React from 'react';
import { cn } from '../../../lib/utils';
import { cva, type VariantProps } from 'class-variance-authority';

const cardVariants = cva(
  'rounded-xl transition-all',
  {
    variants: {
      variant: {
        elevated: 'bg-white dark:bg-neutral-900 shadow-md',
        outlined: 'bg-transparent border border-neutral-200 dark:border-neutral-800',
        filled: 'bg-neutral-100 dark:bg-neutral-900',
        ghost: 'bg-transparent',
      },
      padding: {
        none: '',
        sm: 'p-2',
        md: 'p-4',
        lg: 'p-6',
      },
      interactive: {
        true: 'cursor-pointer hover:scale-[0.98] hover:opacity-90',
        false: '',
      },
    },
    defaultVariants: {
      variant: 'elevated',
      padding: 'md',
      interactive: false,
    },
  }
);

export interface CardProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof cardVariants> {
  asChild?: boolean;
  pressable?: boolean;
  fullWidth?: boolean;
  onPress?: () => void;
}

const Card = React.forwardRef<HTMLDivElement, CardProps>(
  ({ className, variant, padding, interactive, onClick, onPress, pressable, fullWidth, ...props }, ref) => {
    const handleClick = onClick || onPress;
    const isInteractive = interactive || pressable || !!handleClick;
    
    return (
      <div
        ref={ref}
        className={cn(
          cardVariants({ variant, padding, interactive: isInteractive }),
          fullWidth && 'w-full',
          className
        )}
        onClick={handleClick}
        role={isInteractive ? 'button' : undefined}
        tabIndex={isInteractive ? 0 : undefined}
        onKeyDown={
          isInteractive
            ? (e) => {
                if ((e.key === 'Enter' || e.key === ' ') && handleClick) {
                  e.preventDefault();
                  handleClick(e as any);
                }
              }
            : undefined
        }
        {...props}
      />
    );
  }
);
Card.displayName = 'Card';

const CardHeader = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn('flex flex-col space-y-1.5 p-6', className)}
    {...props}
  />
));
CardHeader.displayName = 'CardHeader';

const CardTitle = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLHeadingElement>
>(({ className, ...props }, ref) => (
  <h3
    ref={ref}
    className={cn(
      'text-2xl font-semibold leading-none tracking-tight',
      className
    )}
    {...props}
  />
));
CardTitle.displayName = 'CardTitle';

const CardDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <p
    ref={ref}
    className={cn('text-sm text-neutral-500 dark:text-neutral-400', className)}
    {...props}
  />
));
CardDescription.displayName = 'CardDescription';

const CardContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn('p-6 pt-0', className)} {...props} />
));
CardContent.displayName = 'CardContent';

const CardFooter = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn('flex items-center p-6 pt-0', className)}
    {...props}
  />
));
CardFooter.displayName = 'CardFooter';

export { 
  Card, 
  CardHeader, 
  CardFooter, 
  CardTitle, 
  CardDescription, 
  CardContent,
  cardVariants 
};