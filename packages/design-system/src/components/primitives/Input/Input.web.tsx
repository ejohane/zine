import * as React from 'react';
import { cn } from '../../../lib/utils';
import { cva, type VariantProps } from 'class-variance-authority';

const inputVariants = cva(
  'flex w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-base ring-offset-white file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-neutral-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 dark:border-neutral-800 dark:bg-neutral-900 dark:ring-offset-neutral-950 dark:placeholder:text-neutral-400 dark:focus-visible:ring-brand-primary',
  {
    variants: {
      size: {
        sm: 'h-8 text-sm',
        md: 'h-10',
        lg: 'h-12 text-lg',
      },
      variant: {
        default: '',
        error: 'border-semantic-error focus-visible:ring-semantic-error',
      },
    },
    defaultVariants: {
      size: 'md',
      variant: 'default',
    },
  }
);

export interface InputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size'>,
    VariantProps<typeof inputVariants> {
  label?: string;
  error?: string;
  helperText?: string;
  containerClassName?: string;
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, containerClassName, type, size, variant, label, error, helperText, ...props }, ref) => {
    const inputVariant = error ? 'error' : variant;
    
    if (label || error || helperText) {
      return (
        <div className={cn('space-y-1', containerClassName)}>
          {label && (
            <label className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
              {label}
            </label>
          )}
          <input
            type={type}
            className={cn(inputVariants({ size, variant: inputVariant }), className)}
            ref={ref}
            {...props}
          />
          {error && (
            <p className="text-sm text-semantic-error">{error}</p>
          )}
          {helperText && !error && (
            <p className="text-sm text-neutral-500">{helperText}</p>
          )}
        </div>
      );
    }
    
    return (
      <input
        type={type}
        className={cn(inputVariants({ size, variant: inputVariant }), className)}
        ref={ref}
        {...props}
      />
    );
  }
);
Input.displayName = 'Input';

export { Input, inputVariants };