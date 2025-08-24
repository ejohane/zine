import { Button as TamaguiButton, ButtonProps as TamaguiButtonProps, styled } from 'tamagui'
import { forwardRef } from 'react'

interface ButtonProps extends Omit<TamaguiButtonProps, 'variant' | 'size'> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'outlined' | 'danger'
  size?: 'sm' | 'md' | 'lg'
  fullWidth?: boolean
}

const StyledButton = styled(TamaguiButton, {
  name: 'Button',
  variants: {
    variant: {
      primary: {
        backgroundColor: '$primary',
        color: 'white',
        borderWidth: 0,
        hoverStyle: {
          backgroundColor: '$primaryHover',
        },
        pressStyle: {
          backgroundColor: '$primaryPress',
        },
      },
      secondary: {
        backgroundColor: '$secondary',
        color: 'white',
        borderWidth: 0,
        hoverStyle: {
          backgroundColor: '$secondaryHover',
        },
        pressStyle: {
          backgroundColor: '$secondaryPress',
        },
      },
      ghost: {
        backgroundColor: 'transparent',
        color: '$color',
        borderWidth: 0,
        hoverStyle: {
          backgroundColor: '$backgroundHover',
        },
        pressStyle: {
          backgroundColor: '$backgroundPress',
        },
      },
      outlined: {
        backgroundColor: 'transparent',
        color: '$color',
        borderWidth: 1,
        borderColor: '$borderColor',
        hoverStyle: {
          backgroundColor: '$backgroundHover',
        },
        pressStyle: {
          backgroundColor: '$backgroundPress',
        },
      },
      danger: {
        backgroundColor: '$error',
        color: 'white',
        borderWidth: 0,
        hoverStyle: {
          backgroundColor: '$errorHover',
        },
        pressStyle: {
          backgroundColor: '$errorPress',
        },
      },
    },
    buttonSize: {
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
    fullWidth: {
      true: {
        width: '100%',
      },
    },
  } as const,
  defaultVariants: {
    variant: 'primary',
    buttonSize: 'md',
  },
})

export const Button = forwardRef<typeof TamaguiButton, ButtonProps>(
  ({ variant = 'primary', size = 'md', fullWidth, ...props }, ref) => {
    return (
      <StyledButton
        ref={ref}
        variant={variant}
        buttonSize={size}
        fullWidth={fullWidth}
        animation="quick"
        {...props}
      />
    )
  }
)

Button.displayName = 'Button'