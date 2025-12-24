/**
 * Subscriptions Layout
 *
 * Stack navigator configuration for the subscriptions route group.
 * Handles subscription management, provider connections, and discovery screens.
 *
 * @see features/subscriptions/frontend-spec.md Section 2 (Navigation Structure)
 */

import { Stack } from 'expo-router';

import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

export default function SubscriptionsLayout() {
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
        headerBackTitle: '',
      }}
    >
      <Stack.Screen
        name="index"
        options={{
          title: 'Subscriptions',
        }}
      />
      <Stack.Screen
        name="discover"
        options={{
          headerShown: false, // Discover has its own layout
        }}
      />
    </Stack>
  );
}
