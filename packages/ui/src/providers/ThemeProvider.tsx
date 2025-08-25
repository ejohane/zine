import React, { createContext, useContext, useEffect, useState } from 'react';
import { isReactNative } from '../lib/platform';

type Theme = 'light' | 'dark' | 'system';

interface ThemeContextType {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  resolvedTheme: 'light' | 'dark';
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export interface ThemeProviderProps {
  children: React.ReactNode;
  defaultTheme?: Theme;
  storageKey?: string;
}

export const ThemeProvider: React.FC<ThemeProviderProps> = ({
  children,
  defaultTheme = 'system',
  storageKey = 'zine-ui-theme',
}) => {
  const [theme, setThemeState] = useState<Theme>(defaultTheme);
  const [resolvedTheme, setResolvedTheme] = useState<'light' | 'dark'>('light');

  useEffect(() => {
    if (isReactNative()) {
      // React Native implementation
      const { Appearance } = require('react-native');
      const colorScheme = Appearance.getColorScheme();
      
      if (theme === 'system') {
        setResolvedTheme(colorScheme === 'dark' ? 'dark' : 'light');
      } else {
        setResolvedTheme(theme as 'light' | 'dark');
      }

      const subscription = Appearance.addChangeListener(({ colorScheme }: { colorScheme: 'light' | 'dark' | null }) => {
        if (theme === 'system') {
          setResolvedTheme(colorScheme === 'dark' ? 'dark' : 'light');
        }
      });

      return () => subscription?.remove();
    } else {
      // Web implementation
      const root = window.document.documentElement;
      
      // Load saved theme
      const savedTheme = localStorage.getItem(storageKey) as Theme | null;
      if (savedTheme) {
        setThemeState(savedTheme);
      }

      // Apply theme
      const applyTheme = (t: Theme) => {
        const systemTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
        const effectiveTheme = t === 'system' ? systemTheme : t;
        
        root.classList.remove('light', 'dark');
        root.classList.add(effectiveTheme);
        setResolvedTheme(effectiveTheme);
      };

      applyTheme(theme);

      // Listen for system theme changes
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      const handleChange = () => {
        if (theme === 'system') {
          applyTheme('system');
        }
      };

      mediaQuery.addEventListener('change', handleChange);
      return () => mediaQuery.removeEventListener('change', handleChange);
    }
  }, [theme, storageKey]);

  const setTheme = (newTheme: Theme) => {
    setThemeState(newTheme);
    
    if (!isReactNative()) {
      localStorage.setItem(storageKey, newTheme);
    }
  };

  return (
    <ThemeContext.Provider value={{ theme, setTheme, resolvedTheme }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};