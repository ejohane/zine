import React from 'react';
import { HeroUINativeProvider } from 'heroui-native';

interface DesignSystemProviderProps {
  children: React.ReactNode;
}

export const DesignSystemProvider: React.FC<DesignSystemProviderProps> = ({ 
  children,
  ...props 
}) => {
  return (
    <HeroUINativeProvider {...props}>
      {children}
    </HeroUINativeProvider>
  );
};