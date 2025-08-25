import React from 'react';
import { cn } from '../../lib/cn';
import { cva } from 'class-variance-authority';
import { isReactNative } from '../../lib/platform';

const badgeVariants = cva(
  'inline-flex items-center justify-center rounded-full px-2.5 py-0.5',
  {
    variants: {
      variant: {
        default: 'bg-neutral-200 dark:bg-neutral-800',
        primary: 'bg-brand-primary/10 text-brand-primary',
        secondary: 'bg-brand-secondary/10 text-brand-secondary',
        success: 'bg-semantic-success/10 text-semantic-success',
        warning: 'bg-semantic-warning/10 text-semantic-warning',
        error: 'bg-semantic-error/10 text-semantic-error',
        destructive: 'bg-semantic-error/10 text-semantic-error', // alias for error
        outline: 'border border-neutral-300 bg-transparent',
        // Platform-specific variants
        spotify: 'bg-spotify-500/10 text-spotify-500',
        youtube: 'bg-youtube-500/10 text-youtube-500',
        apple: 'bg-apple-500/10 text-apple-500',
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

export interface BadgeProps {
  variant?: 'default' | 'primary' | 'secondary' | 'success' | 'warning' | 'error' | 'destructive' | 'outline' | 'spotify' | 'youtube' | 'apple';
  size?: 'sm' | 'md' | 'lg';
  children: React.ReactNode;
  className?: string;
}

// React Native implementation
const BadgeRN: React.FC<BadgeProps> = ({
  variant,
  size,
  children,
  className
}) => {
  const { View, Text } = require('react-native');
  
  return (
    <View className={cn(badgeVariants({ variant, size }), className)}>
      <Text className="font-medium">{children}</Text>
    </View>
  );
};

// Web implementation
const BadgeWeb: React.FC<BadgeProps> = ({
  variant,
  size,
  children,
  className
}) => {
  return (
    <span className={cn(badgeVariants({ variant, size }), className)}>
      <span className="font-medium">{children}</span>
    </span>
  );
};

export const Badge = isReactNative() ? BadgeRN : BadgeWeb;