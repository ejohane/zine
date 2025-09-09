import React from 'react';
import { Button as HeroUIButton } from '@heroui/react';
import type { ButtonProps } from '../../core/types/components';

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ onPress, onClick, children, ...props }, ref) => {
    // Handle both onPress and onClick for compatibility
    const handlePress = onPress || onClick;
    
    return (
      <HeroUIButton 
        ref={ref}
        onPress={handlePress} 
        {...props}
      >
        {children}
      </HeroUIButton>
    );
  }
);

Button.displayName = 'Button';