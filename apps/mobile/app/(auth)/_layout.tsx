/**
 * Auth Layout - Handles authentication flow routing
 *
 * Redirects authenticated users away from auth screens.
 */

import { useAuth } from '@clerk/clerk-expo';
import { Redirect, Stack } from 'expo-router';

export default function AuthLayout() {
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
