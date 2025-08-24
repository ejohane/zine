import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react'
import { useColorScheme } from 'react-native'
import { userPreferences } from '@/lib/storage'

type ThemeMode = 'light' | 'dark' | 'system'

interface ThemeContextType {
  theme: ThemeMode
  actualTheme: 'light' | 'dark'
  setTheme: (theme: ThemeMode) => void
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined)

interface ThemeProviderProps {
  children: ReactNode
}

export function ThemeProvider({ children }: ThemeProviderProps) {
  const systemColorScheme = useColorScheme()
  const [theme, setThemeState] = useState<ThemeMode>('system')
  const [isLoaded, setIsLoaded] = useState(false)

  // Load saved theme on mount
  useEffect(() => {
    const loadTheme = async () => {
      const savedTheme = await userPreferences.getTheme()
      setThemeState(savedTheme)
      setIsLoaded(true)
    }
    loadTheme()
  }, [])

  // Save theme when it changes
  const setTheme = async (newTheme: ThemeMode) => {
    setThemeState(newTheme)
    await userPreferences.setTheme(newTheme)
  }

  // Calculate actual theme based on mode and system preference
  const actualTheme: 'light' | 'dark' = 
    theme === 'system' 
      ? (systemColorScheme || 'light')
      : theme

  const value = {
    theme,
    actualTheme,
    setTheme,
  }

  // Don't render until theme is loaded to prevent flicker
  if (!isLoaded) {
    return null
  }

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  )
}

// Custom hook for using theme
export function useTheme() {
  const context = useContext(ThemeContext)
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider')
  }
  return context
}