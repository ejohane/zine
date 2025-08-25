import React, { useEffect, useRef } from 'react'
import { View, ViewProps, Animated } from 'react-native'
import { cn } from '../../lib/utils'

export interface SkeletonProps extends Omit<ViewProps, 'style'> {
  variant?: 'text' | 'rectangular' | 'circular'
  animationType?: 'pulse' | 'wave' | 'none'
  width?: number | string
  height?: number | string
  className?: string
}

export const Skeleton = ({ 
  variant = 'text', 
  animationType = 'pulse', 
  width = '100%', 
  height,
  className,
  ...props 
}: SkeletonProps) => {
  const fadeAnim = useRef(new Animated.Value(0.3)).current
  
  useEffect(() => {
    if (animationType === 'pulse') {
      Animated.loop(
        Animated.sequence([
          Animated.timing(fadeAnim, {
            toValue: 1,
            duration: 1000,
            useNativeDriver: true,
          }),
          Animated.timing(fadeAnim, {
            toValue: 0.3,
            duration: 1000,
            useNativeDriver: true,
          }),
        ])
      ).start()
    }
  }, [animationType, fadeAnim])
  
  const defaultHeight = variant === 'text' ? 16 : variant === 'circular' ? width : 48
  const finalHeight = height || defaultHeight
  
  const variantClasses = {
    text: 'rounded',
    rectangular: 'rounded-md',
    circular: 'rounded-full',
  }
  
  const baseClassName = cn(
    'bg-gray-200 overflow-hidden',
    variantClasses[variant],
    className
  )
  
  if (animationType === 'pulse') {
    return (
      <Animated.View 
        style={{ 
          opacity: fadeAnim, 
          width: typeof width === 'string' ? undefined : width, 
          height: typeof finalHeight === 'number' ? finalHeight : 48,
        }}
        {...props}
      >
        <View 
          className={baseClassName}
          style={{
            width: typeof width === 'number' ? width : '100%',
            height: typeof finalHeight === 'number' ? finalHeight : 48,
          }}
        />
      </Animated.View>
    )
  }
  
  return (
    <View 
      className={baseClassName}
      style={{
        width: typeof width === 'number' ? width : '100%',
        height: typeof finalHeight === 'number' ? finalHeight : 48,
      }}
      {...props}
    />
  )
}