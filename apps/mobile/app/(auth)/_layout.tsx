/**
 * Auth Layout - Handles authentication flow routing
 *
 * Redirects authenticated users away from auth screens.
 */

import { useAuth } from '@clerk/clerk-expo';
import { Redirect, Stack } from 'expo-router';
import { useAuthAvailability } from '@/providers/auth-provider';

export default function AuthLayout() {
  const { isEnabled } = useAuthAvailability();

  if (!isEnabled) {
    return <Redirect href="/(tabs)" />;
  }

  return <ClerkAuthLayout />;
}

function ClerkAuthLayout() {
  const { isSignedIn, isLoaded } = useAuth();

  // Wait for auth to load before making routing decisions
  if (!isLoaded) {
    return null;
  }

  // Redirect signed-in users to the main app
  if (isSignedIn) {
    return <Redirect href="/(tabs)" />;
  }

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: 'transparent' },
      }}
    >
      <Stack.Screen name="sign-in" />
      <Stack.Screen name="sign-up" />
    </Stack>
  );
}
