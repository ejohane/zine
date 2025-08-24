import { Card as TamaguiCard, CardProps as TamaguiCardProps, styled } from 'tamagui'

export interface CardProps extends TamaguiCardProps {
  variant?: 'elevated' | 'outlined' | 'filled'
  fullWidth?: boolean
}

const StyledCard = styled(TamaguiCard, {
  name: 'Card',
  backgroundColor: '$background',
  borderRadius: '$4',
  padding: '$4',
  
  variants: {
    variant: {
      elevated: {
        elevate: true,
        bordered: false,
        shadowColor: '$shadowColor',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 8,
        elevation: 4,
      },
      outlined: {
        bordered: true,
        borderWidth: 1,
        borderColor: '$borderColor',
        elevate: false,
      },
      filled: {
        backgroundColor: '$backgroundHover',
        bordered: false,
        elevate: false,
      },
    },
    fullWidth: {
      true: {
        width: '100%',
      },
    },
  } as const,
  
  defaultVariants: {
    variant: 'elevated',
  },
})

export const Card = ({ variant = 'elevated', fullWidth, children, ...props }: CardProps) => {
  return (
    <StyledCard
      variant={variant}
      fullWidth={fullWidth}
      animation="quick"
      pressStyle={{ scale: 0.97 }}
      {...props}
    >
      {children}
    </StyledCard>
  )
}

Card.Header = TamaguiCard.Header
Card.Footer = TamaguiCard.Footer
Card.Background = TamaguiCard.Background