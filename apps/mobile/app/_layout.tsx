// @ts-nocheck
import '../global.css';
import { Stack } from 'expo-router';
import { ClerkProvider, ClerkLoaded } from '@clerk/clerk-expo';
import { HeroUINativeProvider } from 'heroui-native';
import { AuthProvider } from '../contexts/auth';
import { ApiProvider } from '../contexts/api';
import { QueryProvider } from '../contexts/query';
import { clerkTokenCache } from '../lib/tokenCache';
import { ThemeProvider } from '../contexts/theme';

const publishableKey = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY;

if (!publishableKey) {
  console.warn('Add EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY to your .env.local file');
}

export default function RootLayout() {
  return (
    <ClerkProvider 
      publishableKey={publishableKey || ''} 
      tokenCache={clerkTokenCache}
    >
      <ClerkLoaded>
        <AuthProvider>
          <ApiProvider>
            <QueryProvider>
              <HeroUINativeProvider>
                <ThemeProvider>
                  <Stack screenOptions={{ headerShown: false }}>
                    <Stack.Screen name="(auth)" />
                    <Stack.Screen name="(app)" />
                  </Stack>
                </ThemeProvider>
              </HeroUINativeProvider>
            </QueryProvider>
          </ApiProvider>
        </AuthProvider>
      </ClerkLoaded>
    </ClerkProvider>
  );
}