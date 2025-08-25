import React from 'react';
import { cn } from '../../lib/cn';
import { isReactNative } from '../../lib/platform';

export interface InputProps {
  label?: string;
  error?: string;
  placeholder?: string;
  value?: string;
  onChangeText?: (text: string) => void;
  onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  type?: string;
  className?: string;
  containerClassName?: string;
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
  autoCorrect?: boolean;
  secureTextEntry?: boolean;
  editable?: boolean;
  disabled?: boolean;
}

// React Native implementation
const InputRN: React.FC<InputProps> = ({ 
  label, 
  error, 
  className, 
  containerClassName,
  placeholder,
  value,
  onChangeText,
  autoCapitalize,
  autoCorrect,
  secureTextEntry,
  editable = true,
  ...props 
}) => {
  const { TextInput, View, Text } = require('react-native');
  
  return (
    <View className={cn('space-y-1', containerClassName)}>
      {label && (
        <Text className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
          {label}
        </Text>
      )}
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        autoCapitalize={autoCapitalize}
        autoCorrect={autoCorrect}
        secureTextEntry={secureTextEntry}
        editable={editable}
        className={cn(
          'h-10 px-3 rounded-lg border bg-white dark:bg-neutral-900',
          'text-neutral-900 dark:text-neutral-100',
          error ? 'border-semantic-error' : 'border-neutral-200 dark:border-neutral-800',
          'focus:border-brand-primary',
          className
        )}
        placeholderTextColor="#737373"
        {...props}
      />
      {error && (
        <Text className="text-sm text-semantic-error">{error}</Text>
      )}
    </View>
  );
};

// Web implementation
const InputWeb: React.FC<InputProps> = ({ 
  label, 
  error, 
  className, 
  containerClassName,
  placeholder,
  value,
  onChange,
  onChangeText,
  type = 'text',
  disabled = false,
  autoCapitalize,
  autoCorrect,
  secureTextEntry,
  editable 
}) => {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (onChange) onChange(e);
    if (onChangeText) onChangeText(e.target.value);
  };

  return (
    <div className={cn('space-y-1', containerClassName)}>
      {label && (
        <label className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
          {label}
        </label>
      )}
      <input
        type={secureTextEntry ? 'password' : type}
        value={value}
        onChange={handleChange}
        placeholder={placeholder}
        disabled={disabled || !editable}
        autoCapitalize={autoCapitalize === 'none' ? 'off' : 'on'}
        autoCorrect={autoCorrect ? 'on' : 'off'}
        className={cn(
          'h-10 px-3 rounded-lg border bg-white dark:bg-neutral-900',
          'text-neutral-900 dark:text-neutral-100',
          error ? 'border-semantic-error' : 'border-neutral-200 dark:border-neutral-800',
          'focus:border-brand-primary focus:ring-2 focus:ring-brand-primary/20',
          'disabled:opacity-50 disabled:cursor-not-allowed',
          'placeholder:text-neutral-400',
          className
        )}
      />
      {error && (
        <span className="text-sm text-semantic-error">{error}</span>
      )}
    </div>
  );
};

export const Input = isReactNative() ? InputRN : InputWeb;