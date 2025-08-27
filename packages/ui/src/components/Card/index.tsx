import React from 'react';
import { cn } from '../../lib/cn';
import { isReactNative } from '../../lib/platform';

export interface CardProps {
  variant?: 'elevated' | 'outlined' | 'filled';
  pressable?: boolean;
  onPress?: () => void;
  className?: string;
  children?: React.ReactNode;
  style?: any;
}

export interface CardHeaderProps {
  className?: string;
  children?: React.ReactNode;
  style?: any;
}

export interface CardTitleProps {
  className?: string;
  children?: React.ReactNode;
  style?: any;
}

export interface CardDescriptionProps {
  className?: string;
  children?: React.ReactNode;
  style?: any;
}

export interface CardContentProps {
  className?: string;
  children?: React.ReactNode;
  style?: any;
}

// React Native implementation
const CardRN: React.FC<CardProps> = ({ 
  variant = 'elevated', 
  pressable, 
  onPress, 
  className, 
  children, 
  style,
  ...props 
}) => {
  const { View, Pressable } = require('react-native');
  
  const cardClass = cn(
    'rounded-xl p-4',
    variant === 'elevated' && 'bg-white dark:bg-neutral-900 shadow-md',
    variant === 'outlined' && 'bg-transparent border border-neutral-200 dark:border-neutral-800',
    variant === 'filled' && 'bg-neutral-100 dark:bg-neutral-900',
    className
  );

  if (pressable && onPress) {
    return (
      <Pressable
        onPress={onPress}
        style={({ pressed }: { pressed: boolean }) => [
          style,
          pressed && { opacity: 0.8, transform: [{ scale: 0.98 }] }
        ]}
        className={cardClass}
        {...props}
      >
        {children}
      </Pressable>
    );
  }

  return (
    <View style={style} className={cardClass} {...props}>
      {children}
    </View>
  );
};

// Web implementation
const CardWeb: React.FC<CardProps> = ({ 
  variant = 'elevated', 
  pressable, 
  onPress, 
  className, 
  children,
  ...props 
}) => {
  const cardClass = cn(
    'rounded-xl p-4',
    variant === 'elevated' && 'bg-white dark:bg-neutral-900 shadow-md',
    variant === 'outlined' && 'bg-transparent border border-neutral-200 dark:border-neutral-800',
    variant === 'filled' && 'bg-neutral-100 dark:bg-neutral-900',
    pressable && 'transition-all hover:scale-[0.98] hover:opacity-90 cursor-pointer',
    className
  );

  if (pressable && onPress) {
    return (
      <div
        onClick={onPress}
        className={cardClass}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onPress();
          }
        }}
        {...props}
      >
        {children}
      </div>
    );
  }

  return (
    <div className={cardClass} {...props}>
      {children}
    </div>
  );
};

// CardHeader components
const CardHeaderRN: React.FC<CardHeaderProps> = ({ className, children, style, ...props }) => {
  const { View } = require('react-native');
  return (
    <View style={style} className={cn('px-6 py-4', className)} {...props}>
      {children}
    </View>
  );
};

const CardHeaderWeb: React.FC<CardHeaderProps> = ({ className, children, ...props }) => {
  return (
    <div className={cn('flex flex-col space-y-1.5 p-6', className)} {...props}>
      {children}
    </div>
  );
};

// CardTitle components
const CardTitleRN: React.FC<CardTitleProps> = ({ className, children, style, ...props }) => {
  const { Text } = require('react-native');
  return (
    <Text style={style} className={cn('text-2xl font-semibold leading-none tracking-tight', className)} {...props}>
      {children}
    </Text>
  );
};

const CardTitleWeb: React.FC<CardTitleProps> = ({ className, children, ...props }) => {
  return (
    <h3 className={cn('text-2xl font-semibold leading-none tracking-tight', className)} {...props}>
      {children}
    </h3>
  );
};

// CardDescription components  
const CardDescriptionRN: React.FC<CardDescriptionProps> = ({ className, children, style, ...props }) => {
  const { Text } = require('react-native');
  return (
    <Text style={style} className={cn('text-sm text-neutral-500 dark:text-neutral-400', className)} {...props}>
      {children}
    </Text>
  );
};

const CardDescriptionWeb: React.FC<CardDescriptionProps> = ({ className, children, ...props }) => {
  return (
    <p className={cn('text-sm text-neutral-500 dark:text-neutral-400', className)} {...props}>
      {children}
    </p>
  );
};

// CardContent components
const CardContentRN: React.FC<CardContentProps> = ({ className, children, style, ...props }) => {
  const { View } = require('react-native');
  return (
    <View style={style} className={cn('p-6 pt-0', className)} {...props}>
      {children}
    </View>
  );
};

const CardContentWeb: React.FC<CardContentProps> = ({ className, children, ...props }) => {
  return (
    <div className={cn('p-6 pt-0', className)} {...props}>
      {children}
    </div>
  );
};

export const Card = isReactNative() ? CardRN : CardWeb;
export const CardHeader = isReactNative() ? CardHeaderRN : CardHeaderWeb;
export const CardTitle = isReactNative() ? CardTitleRN : CardTitleWeb;
export const CardDescription = isReactNative() ? CardDescriptionRN : CardDescriptionWeb;
export const CardContent = isReactNative() ? CardContentRN : CardContentWeb;