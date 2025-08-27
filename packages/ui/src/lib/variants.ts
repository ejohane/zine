import { cva, type VariantProps } from 'class-variance-authority';

// Re-export commonly used types
export { cva, type VariantProps };

/**
 * Common button variants using design tokens
 */
export const buttonVariants = cva(
  'inline-flex items-center justify-center rounded-md font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        default: 'bg-primary-500 text-white hover:bg-primary-600 focus-visible:ring-primary-500',
        primary: 'bg-primary-500 text-white hover:bg-primary-600 focus-visible:ring-primary-500',
        secondary: 'bg-neutral-200 text-neutral-900 hover:bg-neutral-300 focus-visible:ring-neutral-400',
        ghost: 'hover:bg-neutral-100 hover:text-neutral-900 focus-visible:ring-neutral-400',
        danger: 'bg-error-500 text-white hover:bg-error-600 focus-visible:ring-error-500',
        destructive: 'bg-error-500 text-white hover:bg-error-600 focus-visible:ring-error-500', // alias
        outline: 'border border-neutral-300 bg-transparent hover:bg-neutral-100 focus-visible:ring-neutral-400',
      },
      size: {
        sm: 'h-8 px-3 text-sm',
        md: 'h-10 px-4 py-2',
        lg: 'h-12 px-6 text-lg',
        icon: 'h-10 w-10',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'md',
    },
  }
);

/**
 * Common text variants
 */
export const textVariants = cva('', {
  variants: {
    size: {
      xs: 'text-xs',
      sm: 'text-sm',
      base: 'text-base',
      lg: 'text-lg',
      xl: 'text-xl',
      '2xl': 'text-2xl',
      '3xl': 'text-3xl',
      '4xl': 'text-4xl',
      '5xl': 'text-5xl',
      '6xl': 'text-6xl',
    },
    weight: {
      thin: 'font-thin',
      light: 'font-light',
      normal: 'font-normal',
      medium: 'font-medium',
      semibold: 'font-semibold',
      bold: 'font-bold',
      black: 'font-black',
    },
    color: {
      primary: 'text-primary-500',
      secondary: 'text-neutral-600',
      muted: 'text-neutral-400',
      error: 'text-error-500',
      success: 'text-success-500',
      warning: 'text-warning-500',
    },
  },
  defaultVariants: {
    size: 'base',
    weight: 'normal',
    color: 'primary',
  },
});

/**
 * Card variants
 */
export const cardVariants = cva(
  'rounded-lg border bg-white',
  {
    variants: {
      variant: {
        default: 'border-neutral-200 shadow-sm',
        elevated: 'border-neutral-200 shadow-md',
        ghost: 'border-transparent',
      },
      padding: {
        none: 'p-0',
        sm: 'p-3',
        md: 'p-4',
        lg: 'p-6',
      },
    },
    defaultVariants: {
      variant: 'default',
      padding: 'md',
    },
  }
);