import React from 'react';
import {
  TouchableOpacity,
  Text,
  View,
  ActivityIndicator,
  type TouchableOpacityProps,
} from 'react-native';
import { cn } from '../../../lib/cn';
import { buttonVariants, type VariantProps } from '../../../lib/variants';

export interface ButtonProps
  extends TouchableOpacityProps,
    VariantProps<typeof buttonVariants> {
  loading?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
  onClick?: () => void;
}

export const Button = React.forwardRef<TouchableOpacity, ButtonProps>(
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
      ...props
    },
    ref
  ) => {
    const classes = cn(buttonVariants({ variant, size }), className);
    const isDisabled = disabled || loading;
    const handlePress = onPress || onClick;

    const textColor = variant === 'primary' || variant === 'danger' || variant === 'destructive'
      ? 'text-white'
      : 'text-neutral-900';

    // Cast components to any to support className with NativeWind
    const StyledTouchableOpacity = TouchableOpacity as any;
    const StyledView = View as any;
    const StyledText = Text as any;
    const StyledActivityIndicator = ActivityIndicator as any;

    return (
      <StyledTouchableOpacity
        ref={ref}
        className={classes}
        onPress={handlePress}
        disabled={isDisabled}
        activeOpacity={0.7}
        {...props}
      >
        <StyledView className="flex-row items-center justify-center">
          {loading && (
            <StyledActivityIndicator
              size="small"
              color={variant === 'primary' ? '#fff' : '#000'}
              className="mr-2"
            />
          )}
          {!loading && leftIcon && (
            <StyledView className="mr-2">{leftIcon}</StyledView>
          )}
          {children && typeof children === 'string' ? (
            <StyledText className={cn('font-medium', textColor)}>
              {children}
            </StyledText>
          ) : (
            children
          )}
          {!loading && rightIcon && (
            <StyledView className="ml-2">{rightIcon}</StyledView>
          )}
        </StyledView>
      </StyledTouchableOpacity>
    );
  }
);

Button.displayName = 'Button';