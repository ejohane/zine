/**
 * Subscriptions Layout
 *
 * Uses a nested Stack to enable proper back navigation between
 * the subscriptions list and provider detail pages.
 */

import { Stack } from 'expo-router';
import {
  createNativeLargeTitleScreenOptions,
  nativeLargeTitleStackScreenOptions,
} from '@/lib/native-large-title-header';

export default function SubscriptionsLayout() {
  return (
    <Stack screenOptions={nativeLargeTitleStackScreenOptions}>
      <Stack.Screen
        name="index"
        options={createNativeLargeTitleScreenOptions({
          title: 'Subscriptions',
        })}
      />
      <Stack.Screen
        name="rss"
        options={createNativeLargeTitleScreenOptions({
          title: 'RSS',
        })}
      />
      <Stack.Screen name="[provider]" options={createNativeLargeTitleScreenOptions()} />
      <Stack.Screen
        name="connect"
        options={{
          headerShown: false,
        }}
      />
      <Stack.Screen
        name="discover"
        options={{
          headerShown: false,
        }}
      />
    </Stack>
  );
}
