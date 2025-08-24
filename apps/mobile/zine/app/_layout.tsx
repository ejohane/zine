import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { TamaguiProvider, Theme } from 'tamagui';
import { useFonts } from 'expo-font';
import { QueryClientProvider } from '@tanstack/react-query';
import { ClerkProvider } from '@clerk/clerk-expo';
import * as SecureStore from 'expo-secure-store';
import 'react-native-reanimated';

import { ThemeProvider, useTheme } from '../contexts/ThemeContext';
import { queryClient } from '../lib/api';
import tamaguiConfig from '../tamagui.config';

// Clerk token cache using SecureStore
const tokenCache = {
  async getToken(key: string) {
    try {
      return SecureStore.getItemAsync(key);
    } catch (err) {
      return null;
    }
  },
  async saveToken(key: string, value: string) {
    try {
      return SecureStore.setItemAsync(key, value);
    } catch (err) {
      return;
    }
  },
};

// Inner component that uses theme context
function AppContent() {
  const { actualTheme } = useTheme();

  return (
    <TamaguiProvider config={tamaguiConfig} defaultTheme={actualTheme}>
      <Theme name={actualTheme}>
        <Stack>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="+not-found" />
        </Stack>
        <StatusBar style={actualTheme === 'dark' ? 'light' : 'dark'} />
      </Theme>
    </TamaguiProvider>
  );
}

export default function RootLayout() {
  const [loaded] = useFonts({
    SpaceMono: require('../assets/fonts/SpaceMono-Regular.ttf'),
  });

  if (!loaded) {
    return null;
  }

  const publishableKey = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY;

  if (!publishableKey) {
    console.warn('Missing Clerk Publishable Key. Authentication will not work.');
  }

  return (
    <ClerkProvider 
      tokenCache={tokenCache} 
      publishableKey={publishableKey || ''}
    >
      <QueryClientProvider client={queryClient}>
        <ThemeProvider>
          <AppContent />
        </ThemeProvider>
      </QueryClientProvider>
    </ClerkProvider>
  );
}
