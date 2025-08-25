import React from 'react';
import { isReactNative } from '../lib/platform';
import { cn } from '../lib/cn';
import { buttonVariants, type VariantProps } from '../lib/variants';

// Platform-specific imports
let TouchableOpacity: any;
let Text: any;
let View: any;
let ActivityIndicator: any;

if (isReactNative()) {
  const RN = require('react-native');
  TouchableOpacity = RN.TouchableOpacity;
  Text = RN.Text;
  View = RN.View;
  ActivityIndicator = RN.ActivityIndicator;
}

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  /** Loading state for the button */
  loading?: boolean;
  /** Icon to display before the text */
  leftIcon?: React.ReactNode;
  /** Icon to display after the text */
  rightIcon?: React.ReactNode;
  /** For React Native - onPress handler */
  onPress?: () => void;
  /** Additional className for styling */
  className?: string;
  /** Children content */
  children?: React.ReactNode;
}

/**
 * Unified Button component that works on both web and React Native
 */
export const Button = React.forwardRef<
  HTMLButtonElement | typeof TouchableOpacity,
  ButtonProps
>(
  (
    {
      className,
      variant,
      size,
      loading = false,
      disabled = false,
      leftIcon,
      rightIcon,
      children,
      onPress,
      onClick,
      type = 'button',
      ...props
    },
    ref
  ) => {
    const classes = cn(buttonVariants({ variant, size }), className);
    const isDisabled = disabled || loading;

    // React Native implementation
    if (isReactNative()) {
      const handlePress = onPress || onClick;
      
      return (
        <TouchableOpacity
          ref={ref}
          className={classes}
          onPress={handlePress}
          disabled={isDisabled}
          activeOpacity={0.7}
          {...props}
        >
          <View className="flex-row items-center justify-center">
            {loading && (
              <ActivityIndicator
                size="small"
                color={variant === 'primary' ? '#fff' : '#000'}
                className="mr-2"
              />
            )}
            {!loading && leftIcon && (
              <View className="mr-2">{leftIcon}</View>
            )}
            {children && (
              <Text
                className={cn(
                  'font-medium',
                  variant === 'primary' || variant === 'danger'
                    ? 'text-white'
                    : 'text-neutral-900'
                )}
              >
                {children}
              </Text>
            )}
            {!loading && rightIcon && (
              <View className="ml-2">{rightIcon}</View>
            )}
          </View>
        </TouchableOpacity>
      );
    }

    // Web implementation
    return (
      <button
        ref={ref as React.Ref<HTMLButtonElement>}
        type={type}
        className={classes}
        disabled={isDisabled}
        onClick={onClick}
        {...props}
      >
        {loading && (
          <svg
            className="mr-2 h-4 w-4 animate-spin"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
        )}
        {!loading && leftIcon && <span className="mr-2">{leftIcon}</span>}
        {children}
        {!loading && rightIcon && <span className="ml-2">{rightIcon}</span>}
      </button>
    );
  }
);

Button.displayName = 'Button';