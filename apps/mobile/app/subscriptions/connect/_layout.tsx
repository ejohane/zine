/**
 * Layout for OAuth connect screens.
 *
 * Provides a Stack navigator for provider-specific connect screens
 * (YouTube, Spotify) with consistent styling and navigation.
 */

import { Stack } from 'expo-router';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors } from '@/constants/theme';

export default function ConnectLayout() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];

  return (
    <Stack
      screenOptions={{
        headerStyle: {
          backgroundColor: colors.background,
        },
        headerTintColor: colors.text,
        headerTitleStyle: {
          fontWeight: '600',
        },
        // Clean header for connect screens
        headerTransparent: false,
        headerShadowVisible: false,
      }}
    >
      <Stack.Screen
        name="youtube"
        options={{
          title: 'Connect YouTube',
          presentation: 'card',
        }}
      />
      <Stack.Screen
        name="spotify"
        options={{
          title: 'Connect Spotify',
          presentation: 'card',
        }}
      />
    </Stack>
  );
}
