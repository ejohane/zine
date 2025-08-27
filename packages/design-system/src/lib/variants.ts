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
        default: 'bg-primary-500 text-white hover:bg-primary-600 dark:bg-primary-600 dark:hover:bg-primary-700 focus-visible:ring-primary-500 dark:focus-visible:ring-primary-400',
        primary: 'bg-primary-500 text-white hover:bg-primary-600 dark:bg-primary-600 dark:hover:bg-primary-700 focus-visible:ring-primary-500 dark:focus-visible:ring-primary-400',
        secondary: 'bg-neutral-200 text-neutral-900 hover:bg-neutral-300 dark:bg-neutral-700 dark:text-neutral-100 dark:hover:bg-neutral-600 focus-visible:ring-neutral-400',
        ghost: 'hover:bg-neutral-100 hover:text-neutral-900 dark:hover:bg-neutral-800 dark:hover:text-neutral-100 focus-visible:ring-neutral-400',
        danger: 'bg-error-500 text-white hover:bg-error-600 dark:bg-error-600 dark:hover:bg-error-700 focus-visible:ring-error-500',
        destructive: 'bg-error-500 text-white hover:bg-error-600 dark:bg-error-600 dark:hover:bg-error-700 focus-visible:ring-error-500', // alias
        outline: 'border border-neutral-300 bg-transparent hover:bg-neutral-100 dark:border-neutral-600 dark:hover:bg-neutral-800 focus-visible:ring-neutral-400',
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
      primary: 'text-primary-500 dark:text-primary-400',
      secondary: 'text-neutral-600 dark:text-neutral-400',
      muted: 'text-neutral-400 dark:text-neutral-500',
      error: 'text-error-500 dark:text-error-400',
      success: 'text-success-500 dark:text-success-400',
      warning: 'text-warning-500 dark:text-warning-400',
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
  'rounded-lg border bg-white dark:bg-neutral-900',
  {
    variants: {
      variant: {
        default: 'border-neutral-200 dark:border-neutral-700 shadow-sm',
        elevated: 'border-neutral-200 dark:border-neutral-700 shadow-md',
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

/**
 * Badge variants
 */
export const badgeVariants = cva(
  'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold transition-colors',
  {
    variants: {
      variant: {
        default: 'border border-neutral-200 bg-neutral-100 text-neutral-900 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100',
        primary: 'bg-primary-100 text-primary-700 dark:bg-primary-900 dark:text-primary-300',
        secondary: 'bg-neutral-100 text-neutral-900 dark:bg-neutral-800 dark:text-neutral-100',
        success: 'bg-success-100 text-success-700 dark:bg-success-900 dark:text-success-300',
        warning: 'bg-warning-100 text-warning-700 dark:bg-warning-900 dark:text-warning-300',
        error: 'bg-error-100 text-error-700 dark:bg-error-900 dark:text-error-300',
        // Platform-specific variants
        spotify: 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300',
        youtube: 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300',
        apple: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
      },
      size: {
        sm: 'px-2 py-0.5 text-xs',
        md: 'px-2.5 py-0.5 text-sm',
        lg: 'px-3 py-1 text-base',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'md',
    },
  }
);