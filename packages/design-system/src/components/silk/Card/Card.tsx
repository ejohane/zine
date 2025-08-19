import * as React from 'react';
import { cn } from '../../../lib/utils';

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  variant?: 'default' | 'elevated' | 'bordered' | 'ghost';
  padding?: 'none' | 'sm' | 'md' | 'lg';
  interactive?: boolean;
  selected?: boolean;
}

export const Card = React.forwardRef<HTMLDivElement, CardProps>(
  ({ 
    children, 
    className, 
    variant = 'default',
    padding = 'md',
    interactive = false,
    selected = false,
    ...props 
  }, ref) => {
    const paddingClasses = {
      none: '',
      sm: 'p-2',
      md: 'p-4',
      lg: 'p-6',
    };

    const variantClasses = {
      default: 'bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700',
      elevated: 'bg-white dark:bg-gray-900 shadow-lg',
      bordered: 'bg-transparent border-2 border-gray-300 dark:border-gray-600',
      ghost: 'bg-transparent',
    };

    return (
      <div
        ref={ref}
        className={cn(
          'rounded-lg transition-all duration-200',
          paddingClasses[padding],
          variantClasses[variant],
          interactive && 'cursor-pointer hover:scale-[1.02] active:scale-[0.98]',
          selected && 'ring-2 ring-blue-500 ring-offset-2',
          className
        )}
        {...props}
      >
        {children}
      </div>
    );
  }
);

Card.displayName = 'Card';