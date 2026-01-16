/**
 * Settings Layout
 *
 * Stack navigator configuration for the settings route group.
 * Handles user settings, account management, and app information screens.
 *
 * @see features/subscriptions/frontend-spec.md Section 2.1 (Settings Stack)
 */

import { Stack } from 'expo-router';

export default function SettingsLayout() {
  return (
    <Stack
      screenOptions={{
        headerBackButtonDisplayMode: 'minimal',
      }}
    >
      <Stack.Screen
        name="index"
        options={{
          title: 'Settings',
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
