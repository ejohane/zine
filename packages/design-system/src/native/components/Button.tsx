import React from 'react';
import { Button as HeroUINativeButton } from 'heroui-native';
import type { ButtonProps } from '../../core/types/components';

// Map web variants to native variants
const mapVariantToNative = (variant?: ButtonProps['variant']) => {
  const variantMap: Record<string, string> = {
    'solid': 'primary',
    'bordered': 'secondary',
    'light': 'secondary',
    'flat': 'primary',
    'faded': 'secondary',
    'shadow': 'primary',
    'ghost': 'secondary'
  };
  
  return variant ? variantMap[variant] || 'primary' : undefined;
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
      variant={nativeVariant as Parameters<typeof HeroUINativeButton>[0]['variant']}
      {...props}
    >
      {children}
    </HeroUINativeButton>
  );
};