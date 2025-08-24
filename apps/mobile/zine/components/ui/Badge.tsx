import { styled, Text, View, ViewProps } from 'tamagui'

export interface BadgeProps extends ViewProps {
  variant?: 'default' | 'primary' | 'secondary' | 'success' | 'warning' | 'error' | 'spotify' | 'youtube' | 'apple'
  size?: 'sm' | 'md' | 'lg'
  children: React.ReactNode
}

const StyledBadge = styled(View, {
  name: 'Badge',
  borderRadius: '$2',
  paddingHorizontal: '$2',
  paddingVertical: '$1',
  alignItems: 'center',
  justifyContent: 'center',
  
  variants: {
    variant: {
      default: {
        backgroundColor: '$backgroundHover',
      },
      primary: {
        backgroundColor: '$primary',
      },
      secondary: {
        backgroundColor: '$secondary',
      },
      success: {
        backgroundColor: '$success',
      },
      warning: {
        backgroundColor: '$warning',
      },
      error: {
        backgroundColor: '$error',
      },
      spotify: {
        backgroundColor: '$spotify',
      },
      youtube: {
        backgroundColor: '$youtube',
      },
      apple: {
        backgroundColor: '$apple',
      },
    },
    badgeSize: {
      sm: {
        paddingHorizontal: '$1.5',
        paddingVertical: '$0.5',
      },
      md: {
        paddingHorizontal: '$2',
        paddingVertical: '$1',
      },
      lg: {
        paddingHorizontal: '$3',
        paddingVertical: '$1.5',
      },
    },
  } as const,
  
  defaultVariants: {
    variant: 'default',
    badgeSize: 'md',
  },
})

const BadgeText = styled(Text, {
  name: 'BadgeText',
  fontWeight: '600',
  
  variants: {
    variant: {
      default: {
        color: '$color',
      },
      primary: {
        color: 'white',
      },
      secondary: {
        color: 'white',
      },
      success: {
        color: 'white',
      },
      warning: {
        color: 'white',
      },
      error: {
        color: 'white',
      },
      spotify: {
        color: 'white',
      },
      youtube: {
        color: 'white',
      },
      apple: {
        color: 'white',
      },
    },
    textSize: {
      sm: {
        fontSize: '$1',
      },
      md: {
        fontSize: '$2',
      },
      lg: {
        fontSize: '$3',
      },
    },
  } as const,
  
  defaultVariants: {
    variant: 'default',
    textSize: 'md',
  },
})

export const Badge = ({ variant = 'default', size = 'md', children, ...props }: BadgeProps) => {
  return (
    <StyledBadge variant={variant} badgeSize={size} {...props}>
      <BadgeText variant={variant} textSize={size}>
        {children}
      </BadgeText>
    </StyledBadge>
  )
}