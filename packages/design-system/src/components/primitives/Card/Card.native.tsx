import * as React from 'react';
import { View, Text, Pressable } from 'react-native';
import type { ViewStyle, TextStyle } from 'react-native';
import { cn } from '../../../lib/utils';
import { cva, type VariantProps } from 'class-variance-authority';

const cardVariants = cva(
  'rounded-xl',
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
        true: '',
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

export interface CardProps extends VariantProps<typeof cardVariants> {
  children?: React.ReactNode;
  className?: string;
  style?: ViewStyle;
  onPress?: () => void;
  pressable?: boolean;
  fullWidth?: boolean;
}

const Card = React.forwardRef<View, CardProps>(
  ({ className, variant, padding, interactive, onPress, children, style, pressable, fullWidth, ...props }, ref) => {
    const isInteractive = interactive || pressable || !!onPress;
    
    const cardClass = cn(
      cardVariants({ variant, padding, interactive: isInteractive }),
      fullWidth && 'w-full',
      className
    );
    
    if (isInteractive && onPress) {
      return (
        <Pressable
          ref={ref as any}
          onPress={onPress}
          style={({ pressed }) => [
            style,
            pressed && { opacity: 0.8, transform: [{ scale: 0.98 }] }
          ]}
          {...props}
          {...{ className: cardClass } as any}
        >
          {children}
        </Pressable>
      );
    }
    
    return (
      <View
        ref={ref}
        style={style}
        {...props}
        {...{ className: cardClass } as any}
      >
        {children}
      </View>
    );
  }
);
Card.displayName = 'Card';

export interface CardHeaderProps {
  children?: React.ReactNode;
  className?: string;
  style?: ViewStyle;
}

const CardHeader = React.forwardRef<View, CardHeaderProps>(
  ({ className, style, children, ...props }, ref) => (
    <View
      ref={ref}
      style={style}
      {...props}
      {...{ className: cn('px-6 py-4', className) } as any}
    >
      {children}
    </View>
  )
);
CardHeader.displayName = 'CardHeader';

export interface CardTitleProps {
  children?: React.ReactNode;
  className?: string;
  style?: TextStyle;
}

const CardTitle = React.forwardRef<Text, CardTitleProps>(
  ({ className, style, children, ...props }, ref) => (
    <Text
      ref={ref}
      style={style}
      {...props}
      {...{ className: cn(
        'text-2xl font-semibold leading-none tracking-tight',
        className
      )} as any}
    >
      {children}
    </Text>
  )
);
CardTitle.displayName = 'CardTitle';

export interface CardDescriptionProps {
  children?: React.ReactNode;
  className?: string;
  style?: TextStyle;
}

const CardDescription = React.forwardRef<Text, CardDescriptionProps>(
  ({ className, style, children, ...props }, ref) => (
    <Text
      ref={ref}
      style={style}
      {...props}
      {...{ className: cn('text-sm text-neutral-500 dark:text-neutral-400', className) } as any}
    >
      {children}
    </Text>
  )
);
CardDescription.displayName = 'CardDescription';

export interface CardContentProps {
  children?: React.ReactNode;
  className?: string;
  style?: ViewStyle;
}

const CardContent = React.forwardRef<View, CardContentProps>(
  ({ className, style, children, ...props }, ref) => (
    <View 
      ref={ref}
      style={style}
      {...props}
      {...{ className: cn('p-6 pt-0', className) } as any}
    >
      {children}
    </View>
  )
);
CardContent.displayName = 'CardContent';

export interface CardFooterProps {
  children?: React.ReactNode;
  className?: string;
  style?: ViewStyle;
}

const CardFooter = React.forwardRef<View, CardFooterProps>(
  ({ className, style, children, ...props }, ref) => (
    <View
      ref={ref}
      style={style}
      {...props}
      {...{ className: cn('flex-row items-center p-6 pt-0', className) } as any}
    >
      {children}
    </View>
  )
);
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