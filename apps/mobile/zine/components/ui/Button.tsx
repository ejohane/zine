import React, { forwardRef } from 'react'
import { Pressable, Text, PressableProps, View } from 'react-native'
import { cn } from '../../lib/utils'

interface ButtonProps extends Omit<PressableProps, 'children'> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'outlined' | 'danger'
  size?: 'sm' | 'md' | 'lg'
  fullWidth?: boolean
  children?: React.ReactNode
  className?: string
  icon?: React.ComponentType<{ size: number; color: string }>
}

export const Button = forwardRef<View, ButtonProps>(
  ({ variant = 'primary', size = 'md', fullWidth, children, className, icon: Icon, ...props }, ref) => {
    const variantClasses = {
      primary: 'bg-green-600 border-0',
      secondary: 'bg-gray-600 border-0',
      ghost: 'bg-transparent border-0',
      outlined: 'bg-transparent border border-gray-300',
      danger: 'bg-red-600 border-0',
    }

    const textVariantClasses = {
      primary: 'text-white font-semibold',
      secondary: 'text-white',
      ghost: 'text-gray-900',
      outlined: 'text-black font-medium',
      danger: 'text-white',
    }

    const sizeClasses = {
      sm: 'px-3 py-2 h-8',
      md: 'px-4 py-2.5 h-10',
      lg: 'px-5 py-3 h-12',
    }

    const textSizeClasses = {
      sm: 'text-sm',
      md: 'text-base',
      lg: 'text-lg',
    }

    return (
      <Pressable
        ref={ref}
        className={cn(
          'rounded-lg items-center justify-center flex-row',
          variantClasses[variant],
          sizeClasses[size],
          fullWidth && 'w-full',
          className
        )}
        style={({ pressed }) => [
          pressed && { opacity: 0.8, transform: [{ scale: 0.98 }] }
        ]}
        {...props}
      >
        {Icon && (
          <Icon 
            size={size === 'sm' ? 16 : size === 'lg' ? 24 : 20} 
            color={variant === 'outlined' ? '#000' : variant === 'ghost' ? '#111827' : '#fff'}
          />
        )}
        {children && (
          <>
            {Icon && <View className="w-2" />}
            {typeof children === 'string' ? (
              <Text className={cn(textVariantClasses[variant], textSizeClasses[size])}>
                {children}
              </Text>
            ) : (
              children
            )}
          </>
        )}
      </Pressable>
    )
  }
)

Button.displayName = 'Button'