import React, { createContext, useContext, useState } from 'react';

type ThemeMode = 'light' | 'dark' | 'system';

interface ThemeContextType {
  mode: ThemeMode;
  resolvedTheme: 'light' | 'dark';
  setMode: (mode: ThemeMode) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};

interface ThemeProviderProps {
  children: React.ReactNode;
  defaultMode?: ThemeMode;
  storageKey?: string;
}

export const ThemeProvider: React.FC<ThemeProviderProps> = ({ 
  children, 
  defaultMode = 'system',
  storageKey = 'zine-theme-mode' 
}) => {
  const [mode, setMode] = useState<ThemeMode>(defaultMode);
  
  // For mobile, we default to 'light' when system is selected
  // In a real app, you'd use React Native's Appearance API here
  const resolvedTheme = mode === 'system' ? 'light' : mode;

  return (
    <ThemeContext.Provider 
      value={{ 
        mode, 
        resolvedTheme, 
        setMode 
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
};