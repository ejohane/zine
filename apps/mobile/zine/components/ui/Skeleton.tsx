import { styled, View, ViewProps } from 'tamagui'
import { useEffect, useRef } from 'react'
import { Animated } from 'react-native'

export interface SkeletonProps extends Omit<ViewProps, 'animation'> {
  variant?: 'text' | 'rectangular' | 'circular'
  animationType?: 'pulse' | 'wave' | 'none'
  width?: number | string
  height?: number | string
}

const StyledSkeleton = styled(View, {
  name: 'Skeleton',
  backgroundColor: '$backgroundHover',
  overflow: 'hidden',
  
  variants: {
    variant: {
      text: {
        borderRadius: '$1',
        height: '$3',
      },
      rectangular: {
        borderRadius: '$2',
      },
      circular: {
        borderRadius: 1000,
      },
    },
  } as const,
  
  defaultVariants: {
    variant: 'text',
  },
})

export const Skeleton = ({ 
  variant = 'text', 
  animationType = 'pulse', 
  width = '100%', 
  height,
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
  
  if (animationType === 'pulse') {
    return (
      <Animated.View style={{ 
        opacity: fadeAnim, 
        width: typeof width === 'string' ? undefined : width, 
        height: typeof height === 'number' ? height : (typeof defaultHeight === 'number' ? defaultHeight : 48) 
      }}>
        <StyledSkeleton 
          variant={variant} 
          width={width} 
          height={height || defaultHeight}
          {...props} 
        />
      </Animated.View>
    )
  }
  
  return (
    <StyledSkeleton 
      variant={variant} 
      width={width} 
      height={height || defaultHeight}
      {...props} 
    />
  )
}