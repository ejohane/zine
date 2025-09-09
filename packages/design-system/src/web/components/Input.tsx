import React from 'react';
import { Input as HeroUIInput } from '@heroui/react';
import type { InputProps } from '../../core/types/components';

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ onChange, onValueChange, ...props }, ref) => {
    // Handle both onChange and onValueChange for compatibility
    const handleChange = (value: string) => {
      onValueChange?.(value);
      onChange?.(value);
    };
    
    return (
      <HeroUIInput 
        ref={ref}
        onValueChange={handleChange}
        {...props}
      />
    );
  }
);

Input.displayName = 'Input';