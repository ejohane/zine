import React from 'react'
import { View, ViewProps, Pressable, PressableProps } from 'react-native'
import { cn } from '../../lib/utils'

export interface CardProps extends ViewProps {
  variant?: 'elevated' | 'outlined' | 'filled'
  fullWidth?: boolean
  onPress?: () => void
  pressable?: boolean
  children?: React.ReactNode
  className?: string
}

export const Card = ({ 
  variant = 'elevated', 
  fullWidth, 
  onPress,
  pressable,
  children, 
  className,
  style,
  ...props 
}: CardProps) => {
  const variantClasses = {
    elevated: 'bg-white rounded-lg p-4 shadow-sm border border-gray-100',
    outlined: 'bg-white rounded-lg p-4 border border-gray-200',
    filled: 'bg-gray-50 rounded-lg p-4',
  }

  const cardClassName = cn(
    variantClasses[variant],
    fullWidth && 'w-full',
    className
  )

  if (pressable || onPress) {
    return (
      <Pressable
        onPress={onPress}
        className={cardClassName}
        style={({ pressed }) => [
          style,
          pressed && { opacity: 0.9, transform: [{ scale: 0.98 }] }
        ]}
        {...(props as PressableProps)}
      >
        {children}
      </Pressable>
    )
  }

  return (
    <View className={cardClassName} style={style} {...props}>
      {children}
    </View>
  )
}

Card.Header = ({ children, className, ...props }: ViewProps & { children?: React.ReactNode }) => (
  <View className={cn('pb-2', className)} {...props}>
    {children}
  </View>
)

Card.Footer = ({ children, className, ...props }: ViewProps & { children?: React.ReactNode }) => (
  <View className={cn('pt-2 mt-auto', className)} {...props}>
    {children}
  </View>
)

Card.Background = ({ children, className, ...props }: ViewProps & { children?: React.ReactNode }) => (
  <View className={cn('absolute inset-0', className)} {...props}>
    {children}
  </View>
)