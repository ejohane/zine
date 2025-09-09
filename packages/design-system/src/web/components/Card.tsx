import React from 'react';
import { Card as HeroUICard, CardHeader as HeroUICardHeader, CardBody as HeroUICardBody, CardFooter as HeroUICardFooter } from '@heroui/react';
import type { CardProps, CardHeaderProps, CardBodyProps, CardFooterProps } from '../../core/types/components';

export const Card = React.forwardRef<HTMLDivElement, CardProps>(
  ({ onPress, onClick, children, ...props }, ref) => {
    // Handle both onPress and onClick for compatibility
    const handlePress = onPress || onClick;
    
    return (
      <HeroUICard 
        ref={ref}
        onPress={handlePress}
        {...props}
      >
        {children}
      </HeroUICard>
    );
  }
);

Card.displayName = 'Card';

export const CardHeader: React.FC<CardHeaderProps> = ({ children, ...props }) => (
  <HeroUICardHeader {...props}>
    {children}
  </HeroUICardHeader>
);

CardHeader.displayName = 'CardHeader';

export const CardBody: React.FC<CardBodyProps> = ({ children, ...props }) => (
  <HeroUICardBody {...props}>
    {children}
  </HeroUICardBody>
);

CardBody.displayName = 'CardBody';

export const CardFooter: React.FC<CardFooterProps> = ({ children, ...props }) => (
  <HeroUICardFooter {...props}>
    {children}
  </HeroUICardFooter>
);

CardFooter.displayName = 'CardFooter';