import React from 'react'
import { View, Text, ViewProps } from 'react-native'
import { cn } from '../../lib/utils'

export interface BadgeProps extends ViewProps {
  variant?: 'default' | 'primary' | 'secondary' | 'success' | 'warning' | 'error' | 'spotify' | 'youtube' | 'apple'
  size?: 'sm' | 'md' | 'lg'
  children: React.ReactNode
  className?: string
}

export const Badge = ({ 
  variant = 'default', 
  size = 'md', 
  children, 
  className,
  ...props 
}: BadgeProps) => {
  const variantClasses = {
    default: 'bg-gray-100',
    primary: 'bg-blue-500',
    secondary: 'bg-gray-500',
    success: 'bg-green-500',
    warning: 'bg-yellow-500',
    error: 'bg-red-500',
    spotify: 'bg-green-600',
    youtube: 'bg-red-600',
    apple: 'bg-black',
  }

  const sizeClasses = {
    sm: 'px-1.5 py-0.5',
    md: 'px-2 py-1',
    lg: 'px-3 py-1.5',
  }

  const textVariantClasses = {
    default: 'text-gray-900',
    primary: 'text-white',
    secondary: 'text-white',
    success: 'text-white',
    warning: 'text-white',
    error: 'text-white',
    spotify: 'text-white',
    youtube: 'text-white',
    apple: 'text-white',
  }

  const textSizeClasses = {
    sm: 'text-xs',
    md: 'text-sm',
    lg: 'text-base',
  }

  return (
    <View 
      className={cn(
        'rounded-md items-center justify-center',
        variantClasses[variant],
        sizeClasses[size],
        className
      )}
      {...props}
    >
      <Text 
        className={cn(
          'font-semibold',
          textVariantClasses[variant],
          textSizeClasses[size]
        )}
      >
        {children}
      </Text>
    </View>
  )
}