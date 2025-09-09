import React from 'react';
import { HeroUIProvider } from '@heroui/react';

interface DesignSystemProviderProps {
  children: React.ReactNode;
  theme?: 'light' | 'dark' | 'system';
}

export const DesignSystemProvider: React.FC<DesignSystemProviderProps> = ({ 
  children,
  theme = 'system',
  ...props 
}) => {
  // For now, we'll use HeroUI's built-in theme handling
  // We can add more sophisticated theme management later
  return (
    <HeroUIProvider {...props}>
      {children}
    </HeroUIProvider>
  );
};