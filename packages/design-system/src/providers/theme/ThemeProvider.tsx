/* eslint-disable @typescript-eslint/no-require-imports */
import * as React from 'react';
import { isWeb, isReactNative } from '../../lib/platform';

export type Theme = 'light' | 'dark' | 'system';

export interface ThemeContextValue {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  resolvedTheme: 'light' | 'dark';
}

const ThemeContext = React.createContext<ThemeContextValue | undefined>(undefined);

export interface ThemeProviderProps {
  children: React.ReactNode;
  defaultTheme?: Theme;
  storageKey?: string;
}

export function ThemeProvider({
  children,
  defaultTheme = 'system',
  storageKey = 'zine-theme',
}: ThemeProviderProps) {
  const [theme, setThemeState] = React.useState<Theme>(defaultTheme);
  const [resolvedTheme, setResolvedTheme] = React.useState<'light' | 'dark'>('light');
  const [isInitialized, setIsInitialized] = React.useState(false);

  // Load theme from storage on mount
  React.useEffect(() => {
    const loadTheme = async () => {
      if (isWeb()) {
        // Web: Use localStorage
        const stored = localStorage.getItem(storageKey);
        if (stored === 'light' || stored === 'dark' || stored === 'system') {
          setThemeState(stored);
        }
      } else if (isReactNative()) {
        // React Native: Use AsyncStorage
        try {
          const AsyncStorage = require('@react-native-async-storage/async-storage').default;
          const stored = await AsyncStorage.getItem(storageKey);
          if (stored === 'light' || stored === 'dark' || stored === 'system') {
            setThemeState(stored);
          }
        } catch (error) {
          console.warn('Failed to load theme from AsyncStorage:', error);
        }
      }
      setIsInitialized(true);
    };

    loadTheme();
  }, [storageKey]);

  // Persist theme changes
  const setTheme = React.useCallback((newTheme: Theme) => {
    setThemeState(newTheme);
    
    const persistTheme = async () => {
      if (isWeb()) {
        localStorage.setItem(storageKey, newTheme);
      } else if (isReactNative()) {
        try {
          const AsyncStorage = require('@react-native-async-storage/async-storage').default;
          await AsyncStorage.setItem(storageKey, newTheme);
        } catch (error) {
          console.warn('Failed to persist theme to AsyncStorage:', error);
        }
      }
    };

    persistTheme();
  }, [storageKey]);

  // Resolve system theme and apply to document/app
  React.useEffect(() => {
    if (!isInitialized) return;

    const applyTheme = (resolvedValue: 'light' | 'dark') => {
      setResolvedTheme(resolvedValue);

      if (isWeb()) {
        // Web: Apply class to document
        const root = window.document.documentElement;
        root.classList.remove('light', 'dark');
        root.classList.add(resolvedValue);
        
        // Also update meta theme-color for mobile browsers
        const metaThemeColor = document.querySelector('meta[name="theme-color"]');
        if (metaThemeColor) {
          metaThemeColor.setAttribute('content', resolvedValue === 'dark' ? '#000000' : '#ffffff');
        }
      } else if (isReactNative()) {
        // React Native: NativeWind v4 handles this via className prop
        // The resolved theme will be used by components
      }
    };

    if (theme === 'system') {
      // Detect system theme
      if (isWeb()) {
        const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
        applyTheme(mediaQuery.matches ? 'dark' : 'light');

        // Listen for system theme changes
        const handleChange = (e: MediaQueryListEvent) => {
          applyTheme(e.matches ? 'dark' : 'light');
        };

        mediaQuery.addEventListener('change', handleChange);
        return () => mediaQuery.removeEventListener('change', handleChange);
      } else if (isReactNative()) {
        // React Native: Use Appearance API
        try {
          const { Appearance } = require('react-native');
          const colorScheme = Appearance.getColorScheme();
          applyTheme(colorScheme === 'dark' ? 'dark' : 'light');

          // Listen for appearance changes
          const subscription = Appearance.addChangeListener(({ colorScheme }: { colorScheme: 'light' | 'dark' | null }) => {
            applyTheme(colorScheme === 'dark' ? 'dark' : 'light');
          });

          return () => subscription?.remove();
        } catch (error) {
          console.warn('Failed to detect system theme in React Native:', error);
          applyTheme('light');
        }
      }
    } else {
      // Apply explicit theme
      applyTheme(theme);
    }
  }, [theme, isInitialized]);

  const value = React.useMemo(
    () => ({ theme, setTheme, resolvedTheme }),
    [theme, setTheme, resolvedTheme]
  );

  if (!isInitialized) {
    // Prevent flash of unstyled content
    return null;
  }

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = React.useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}