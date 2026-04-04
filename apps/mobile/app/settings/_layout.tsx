/**
 * Settings Layout
 *
 * Stack navigator configuration for the settings route group.
 * Handles user settings, account management, and app information screens.
 *
 * @see features/subscriptions/frontend-spec.md Section 2.1 (Settings Stack)
 */

import {
  createNativeLargeTitleScreenOptions,
  nativeLargeTitleStackScreenOptions,
} from '@/lib/native-large-title-header';
import { Stack } from 'expo-router';

export default function SettingsLayout() {
  return (
    <Stack screenOptions={nativeLargeTitleStackScreenOptions}>
      <Stack.Screen
        name="index"
        options={createNativeLargeTitleScreenOptions({
          title: 'Settings',
        })}
      />
      <Stack.Screen
        name="connections"
        options={{
          title: 'Integrations',
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
