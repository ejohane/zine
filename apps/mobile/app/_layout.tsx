import '../global.css';

import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import Constants from 'expo-constants';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ClerkProvider, ClerkLoaded } from '@clerk/clerk-expo';
import { HeroUINativeProvider } from 'heroui-native';

import { tokenCache } from '@/lib/auth';
import { ReplicacheProvider } from '@/hooks/useReplicache';

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync();

// Get Clerk publishable key from Expo config
const clerkPublishableKey = Constants.expoConfig?.extra?.clerkPublishableKey as string | undefined;

if (!clerkPublishableKey) {
  console.warn('Missing EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY. Authentication will not work.');
}

export default function RootLayout() {
  useEffect(() => {
    // Hide splash screen once the app is ready
    SplashScreen.hideAsync();
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ClerkProvider publishableKey={clerkPublishableKey || ''} tokenCache={tokenCache}>
          <ClerkLoaded>
            <ReplicacheProvider>
              <HeroUINativeProvider>
                <Stack>
                  <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
                  <Stack.Screen
                    name="(dev)/components"
                    options={{
                      presentation: 'modal',
                      headerTitle: 'Components',
                    }}
                  />
                  <Stack.Screen
                    name="item/[id]"
                    options={{
                      presentation: 'card',
                      headerTitle: 'Item Details',
                    }}
                  />
                  <Stack.Screen name="+not-found" />
                </Stack>
                <StatusBar style="auto" />
              </HeroUINativeProvider>
            </ReplicacheProvider>
          </ClerkLoaded>
        </ClerkProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
