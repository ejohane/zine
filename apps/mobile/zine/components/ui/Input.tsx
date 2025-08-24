import { Input as TamaguiInput, InputProps as TamaguiInputProps, styled, YStack, Text, XStack } from 'tamagui'
import { AlertCircle, Check } from '@tamagui/lucide-icons'

export interface InputProps extends Omit<TamaguiInputProps, 'size'> {
  label?: string
  error?: string
  helperText?: string
  isValid?: boolean
  size?: 'sm' | 'md' | 'lg'
  fullWidth?: boolean
}

const StyledInput = styled(TamaguiInput, {
  name: 'Input',
  borderWidth: 1,
  borderColor: '$borderColor',
  backgroundColor: '$background',
  color: '$color',
  
  focusStyle: {
    borderColor: '$primary',
    borderWidth: 2,
  },
  
  variants: {
    inputSize: {
      sm: {
        paddingHorizontal: '$3',
        paddingVertical: '$2',
        fontSize: '$2',
        height: '$8',
      },
      md: {
        paddingHorizontal: '$4',
        paddingVertical: '$2.5',
        fontSize: '$3',
        height: '$10',
      },
      lg: {
        paddingHorizontal: '$5',
        paddingVertical: '$3',
        fontSize: '$4',
        height: '$12',
      },
    },
    error: {
      true: {
        borderColor: '$error',
        focusStyle: {
          borderColor: '$error',
        },
      },
    },
    isValid: {
      true: {
        borderColor: '$success',
        focusStyle: {
          borderColor: '$success',
        },
      },
    },
    fullWidth: {
      true: {
        width: '100%',
      },
    },
  } as const,
  
  defaultVariants: {
    inputSize: 'md',
  },
})

export const Input = ({ label, error, helperText, isValid, size = 'md', fullWidth, ...props }: InputProps) => {
  const hasError = !!error
  
  return (
    <YStack gap="$2" width={fullWidth ? '100%' : undefined}>
      {label && (
        <Text fontSize="$3" color="$color">
          {label}
        </Text>
      )}
      
      <XStack alignItems="center" gap="$2">
        <StyledInput
          inputSize={size}
          error={hasError}
          isValid={isValid && !hasError}
          fullWidth={fullWidth}
          placeholderTextColor="$colorTransparent"
          {...props}
        />
        
        {hasError && (
          <AlertCircle size={20} color="$error" />
        )}
        
        {isValid && !hasError && (
          <Check size={20} color="$success" />
        )}
      </XStack>
      
      {(error || helperText) && (
        <Text
          fontSize="$2"
          color={hasError ? '$error' : '$colorTransparent'}
        >
          {error || helperText}
        </Text>
      )}
    </YStack>
  )
}