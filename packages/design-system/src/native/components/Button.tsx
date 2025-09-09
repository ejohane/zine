import React from 'react';
import { Button as HeroUINativeButton } from 'heroui-native';
import type { ButtonProps } from '../../core/types/components';

// Map web variants to native variants
const mapVariantToNative = (variant?: ButtonProps['variant']) => {
  const variantMap: Record<string, string> = {
    'solid': 'filled',
    'bordered': 'outlined',
    'light': 'text',
    'flat': 'filled',
    'faded': 'tonal',
    'shadow': 'elevated',
    'ghost': 'text'
  };
  
  return variant ? variantMap[variant] || 'filled' : undefined;
};

export const Button: React.FC<ButtonProps> = ({ 
  onPress, 
  onClick, 
  variant,
  children,
  ...props 
}) => {
  // Handle both onPress and onClick for compatibility
  const handlePress = onPress || onClick;
  
  // Map variant to native equivalent
  const nativeVariant = mapVariantToNative(variant);
  
  return (
    <HeroUINativeButton 
      onPress={handlePress}
      variant={nativeVariant as any}
      {...props}
    >
      {children}
    </HeroUINativeButton>
  );
};