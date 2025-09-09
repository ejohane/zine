import React, { createContext, useContext, useEffect, useState } from 'react';

// Platform detection
const isWeb = typeof document !== 'undefined';

type ColorSchemeName = 'light' | 'dark' | null | undefined;
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
  const [systemTheme, setSystemTheme] = useState<ColorSchemeName>(() => {
    if (isWeb && typeof window !== 'undefined' && window.matchMedia) {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      return mediaQuery?.matches ? 'dark' : 'light';
    }
    return 'light';
  });

  useEffect(() => {
    // Load saved theme preference
    if (isWeb && typeof localStorage !== 'undefined') {
      const savedMode = localStorage.getItem(storageKey) as ThemeMode;
      if (savedMode) {
        setMode(savedMode);
      }
    }
  }, [storageKey]);

  useEffect(() => {
    // Listen for system theme changes on web
    if (!isWeb || typeof window === 'undefined' || !window.matchMedia) return;
    
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = (e: MediaQueryListEvent) => {
      setSystemTheme(e.matches ? 'dark' : 'light');
    };
    
    // Modern browsers
    if (mediaQuery.addEventListener) {
      mediaQuery.addEventListener('change', handleChange);
      return () => mediaQuery.removeEventListener('change', handleChange);
    }
    
    // Legacy browsers
    if (mediaQuery.addListener) {
      mediaQuery.addListener(handleChange);
      return () => mediaQuery.removeListener(handleChange);
    }
  }, []);

  useEffect(() => {
    // Save theme preference
    if (isWeb && typeof localStorage !== 'undefined') {
      localStorage.setItem(storageKey, mode);
    }
  }, [mode, storageKey]);

  const resolvedTheme = mode === 'system' 
    ? (systemTheme === 'dark' ? 'dark' : 'light')
    : mode;

  useEffect(() => {
    // Apply theme class to document root on web
    if (isWeb) {
      const root = document.documentElement;
      root.classList.remove('light', 'dark');
      root.classList.add(resolvedTheme);
    }
  }, [resolvedTheme]);

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