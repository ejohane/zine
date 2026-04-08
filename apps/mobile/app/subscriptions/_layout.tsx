/**
 * Subscriptions Layout
 *
 * Uses a nested Stack to enable proper back navigation between
 * the subscriptions list and provider detail pages.
 */

import { Stack } from 'expo-router';
import { lightweightHeaderStackScreenOptions } from '@/lib/native-large-title-header';

export default function SubscriptionsLayout() {
  return (
    <Stack screenOptions={lightweightHeaderStackScreenOptions}>
      <Stack.Screen name="index" />
      <Stack.Screen name="rss" />
      <Stack.Screen name="[provider]" />
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
