import React from 'react'
import { TextInput, TextInputProps, View, Text } from 'react-native'
import { AlertCircle, Check } from 'lucide-react-native'
import { cn } from '../../lib/utils'

export interface InputProps extends Omit<TextInputProps, 'style'> {
  label?: string
  error?: string
  helperText?: string
  isValid?: boolean
  size?: 'sm' | 'md' | 'lg'
  fullWidth?: boolean
  className?: string
}

export const Input = ({ 
  label, 
  error, 
  helperText, 
  isValid, 
  size = 'md', 
  fullWidth, 
  className,
  ...props 
}: InputProps) => {
  const hasError = !!error
  
  const sizeClasses = {
    sm: 'px-3 py-2 h-8 text-sm',
    md: 'px-4 py-2.5 h-10 text-base',
    lg: 'px-5 py-3 h-12 text-lg',
  }

  const borderClasses = hasError 
    ? 'border-red-500 focus:border-red-500' 
    : isValid 
    ? 'border-green-500 focus:border-green-500'
    : 'border-gray-300 focus:border-blue-500'

  return (
    <View className={cn('gap-2', fullWidth && 'w-full')}>
      {label && (
        <Text className="text-base text-gray-900">
          {label}
        </Text>
      )}
      
      <View className="flex-row items-center gap-2">
        <TextInput
          className={cn(
            'rounded-lg border bg-white text-gray-900',
            sizeClasses[size],
            borderClasses,
            fullWidth && 'flex-1',
            className
          )}
          placeholderTextColor="#9CA3AF"
          {...props}
        />
        
        {hasError && (
          <AlertCircle size={20} color="#EF4444" />
        )}
        
        {isValid && !hasError && (
          <Check size={20} color="#10B981" />
        )}
      </View>
      
      {(error || helperText) && (
        <Text className={cn(
          'text-sm',
          hasError ? 'text-red-500' : 'text-gray-500'
        )}>
          {error || helperText}
        </Text>
      )}
    </View>
  )
}