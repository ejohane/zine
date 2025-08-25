import React from 'react';
import { cn } from '../../lib/cn';
import { isReactNative } from '../../lib/platform';
import { cva, type VariantProps } from '../../lib/variants';

const alertVariants = cva(
  'relative w-full rounded-lg border p-4',
  {
    variants: {
      variant: {
        default: 'bg-white dark:bg-neutral-950 text-neutral-950 dark:text-neutral-50 border-neutral-200 dark:border-neutral-800',
        destructive: 'border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950 text-red-900 dark:text-red-100',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
);

export interface AlertProps extends VariantProps<typeof alertVariants> {
  className?: string;
  children?: React.ReactNode;
  style?: any;
}

export interface AlertDescriptionProps {
  className?: string;
  children?: React.ReactNode;
  style?: any;
}

// React Native Alert implementation
const AlertRN: React.FC<AlertProps> = ({ 
  variant = 'default', 
  className, 
  children, 
  style,
  ...props 
}) => {
  const { View } = require('react-native');
  
  return (
    <View 
      style={style} 
      className={cn(alertVariants({ variant }), className)} 
      {...props}
    >
      {children}
    </View>
  );
};

// Web Alert implementation
const AlertWeb: React.FC<AlertProps> = ({ 
  variant = 'default', 
  className, 
  children,
  ...props 
}) => {
  return (
    <div
      role="alert"
      className={cn(alertVariants({ variant }), className)}
      {...props}
    >
      {children}
    </div>
  );
};

// React Native AlertDescription implementation
const AlertDescriptionRN: React.FC<AlertDescriptionProps> = ({ 
  className, 
  children, 
  style,
  ...props 
}) => {
  const { Text } = require('react-native');
  
  return (
    <Text 
      style={style} 
      className={cn('text-sm leading-relaxed', className)} 
      {...props}
    >
      {children}
    </Text>
  );
};

// Web AlertDescription implementation
const AlertDescriptionWeb: React.FC<AlertDescriptionProps> = ({ 
  className, 
  children,
  ...props 
}) => {
  return (
    <div
      className={cn('text-sm [&_p]:leading-relaxed', className)}
      {...props}
    >
      {children}
    </div>
  );
};

export const Alert = isReactNative() ? AlertRN : AlertWeb;
export const AlertDescription = isReactNative() ? AlertDescriptionRN : AlertDescriptionWeb;