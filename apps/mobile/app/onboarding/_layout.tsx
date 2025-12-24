/**
 * Onboarding Layout
 *
 * Stack navigator for the onboarding flow.
 * Guides new users through provider connection setup.
 *
 * @see features/subscriptions/frontend-spec.md Section 4 (Onboarding Flow)
 */

import { Stack } from 'expo-router';

import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

export default function OnboardingLayout() {
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
        // Hide header by default for a cleaner onboarding experience
        headerShown: false,
      }}
    >
      <Stack.Screen
        name="connect"
        options={{
          title: 'Connect Sources',
        }}
      />
      <Stack.Screen
        name="select-channels"
        options={{
          title: 'Select Channels',
          headerShown: true,
        }}
      />
    </Stack>
  );
}
