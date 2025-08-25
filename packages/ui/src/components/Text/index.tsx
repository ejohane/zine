import React from 'react';
import { cn } from '../../lib/cn';
import { cva } from 'class-variance-authority';
import { isReactNative } from '../../lib/platform';

const textVariants = cva('', {
  variants: {
    variant: {
      h1: 'text-5xl font-bold',
      h2: 'text-4xl font-bold',
      h3: 'text-3xl font-semibold',
      h4: 'text-2xl font-semibold',
      h5: 'text-xl font-medium',
      h6: 'text-lg font-medium',
      body: 'text-base',
      caption: 'text-sm text-neutral-600',
      overline: 'text-xs uppercase tracking-wider',
    },
    color: {
      default: 'text-neutral-900 dark:text-neutral-100',
      muted: 'text-neutral-600 dark:text-neutral-400',
      primary: 'text-brand-primary',
      error: 'text-semantic-error',
      success: 'text-semantic-success',
    },
  },
  defaultVariants: {
    variant: 'body',
    color: 'default',
  },
});

export interface TextProps {
  variant?: 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6' | 'body' | 'caption' | 'overline';
  color?: 'default' | 'muted' | 'primary' | 'error' | 'success';
  className?: string;
  children?: React.ReactNode;
  style?: any;
}

// React Native implementation
const TextRN: React.FC<TextProps> = ({ variant, color, className, children, style, ...props }) => {
  const { Text: RNText } = require('react-native');
  
  return (
    <RNText
      style={[style]}
      className={cn(textVariants({ variant, color }), className)}
      {...props}
    >
      {children}
    </RNText>
  );
};

// Web implementation
const TextWeb: React.FC<TextProps> = ({ variant = 'body', color, className, children, ...props }) => {
  const Component = variant?.startsWith('h') 
    ? variant as keyof JSX.IntrinsicElements
    : 'span';
  
  return React.createElement(
    Component,
    {
      className: cn(textVariants({ variant, color }), className),
      ...props
    },
    children
  );
};

export const Text = isReactNative() ? TextRN : TextWeb;