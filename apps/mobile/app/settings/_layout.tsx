/**
 * Settings Layout
 *
 * Stack navigator configuration for the settings route group.
 * Handles user settings, account management, and app information screens.
 *
 * @see features/subscriptions/frontend-spec.md Section 2.1 (Settings Stack)
 */

import { Pressable } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

export default function SettingsLayout() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const router = useRouter();

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
        headerBackButtonDisplayMode: 'minimal',
      }}
    >
      <Stack.Screen
        name="index"
        options={{
          title: 'Settings',
          headerLeft: () => (
            <Pressable onPress={() => router.back()} hitSlop={8}>
              <Ionicons name="chevron-back" size={28} color={colors.text} />
            </Pressable>
          ),
        }}
      />
      <Stack.Screen
        name="connections"
        options={{
          title: 'Connected Accounts',
        }}
      />
      <Stack.Screen
        name="account"
        options={{
          title: 'Account',
        }}
      />
      <Stack.Screen
        name="about"
        options={{
          title: 'About',
        }}
      />
    </Stack>
  );
}
