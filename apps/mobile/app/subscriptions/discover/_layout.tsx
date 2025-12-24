/**
 * Discover Layout
 *
 * Stack navigator configuration for the discover route group.
 * Handles channel/show discovery screens for each provider.
 *
 * @see features/subscriptions/frontend-spec.md Section 2 (Navigation Structure)
 * @see features/subscriptions/frontend-spec.md Section 5 (Channel Selection)
 */

import { Stack } from 'expo-router';

import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

export default function DiscoverLayout() {
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
      }}
    >
      <Stack.Screen
        name="[provider]"
        options={{
          title: 'Discover',
        }}
      />
    </Stack>
  );
}
