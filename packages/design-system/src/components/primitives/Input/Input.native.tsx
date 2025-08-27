import * as React from 'react';
import { View, Text, TextInput } from 'react-native';
import type { TextStyle, ViewStyle, TextInputProps } from 'react-native';
import { cn } from '../../../lib/utils';
import { cva, type VariantProps } from 'class-variance-authority';

const inputVariants = cva(
  'px-3 py-2 rounded-lg border bg-white dark:bg-neutral-900 text-neutral-900 dark:text-neutral-100',
  {
    variants: {
      size: {
        sm: 'h-8 text-sm',
        md: 'h-10',
        lg: 'h-12 text-lg',
      },
      variant: {
        default: 'border-neutral-200 dark:border-neutral-800',
        error: 'border-semantic-error',
      },
    },
    defaultVariants: {
      size: 'md',
      variant: 'default',
    },
  }
);

export interface InputProps extends Omit<TextInputProps, 'style'>, VariantProps<typeof inputVariants> {
  label?: string;
  error?: string;
  helperText?: string;
  className?: string;
  containerClassName?: string;
  style?: TextStyle;
  containerStyle?: ViewStyle;
}

const Input = React.forwardRef<TextInput, InputProps>(
  ({ 
    className, 
    containerClassName, 
    size, 
    variant, 
    label, 
    error, 
    helperText, 
    style,
    containerStyle,
    editable = true,
    ...props 
  }, ref) => {
    const inputVariant = error ? 'error' : variant;
    
    if (label || error || helperText) {
      return (
        <View 
          style={containerStyle}
          {...{ className: cn('space-y-1', containerClassName) } as any}
        >
          {label && (
            <Text 
              {...{ className: 'text-sm font-medium text-neutral-700 dark:text-neutral-300' } as any}
            >
              {label}
            </Text>
          )}
          <TextInput
            ref={ref}
            style={style}
            editable={editable}
            placeholderTextColor="#737373"
            {...props}
            {...{ className: cn(inputVariants({ size, variant: inputVariant }), className) } as any}
          />
          {error && (
            <Text 
              {...{ className: 'text-sm text-semantic-error' } as any}
            >
              {error}
            </Text>
          )}
          {helperText && !error && (
            <Text 
              {...{ className: 'text-sm text-neutral-500' } as any}
            >
              {helperText}
            </Text>
          )}
        </View>
      );
    }
    
    return (
      <TextInput
        ref={ref}
        style={style}
        editable={editable}
        placeholderTextColor="#737373"
        {...props}
        {...{ className: cn(inputVariants({ size, variant: inputVariant }), className) } as any}
      />
    );
  }
);
Input.displayName = 'Input';

export { Input, inputVariants };