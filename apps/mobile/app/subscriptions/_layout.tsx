/**
 * Subscriptions Layout
 *
 * Uses a nested Stack to enable proper back navigation between
 * the subscriptions list and provider detail pages.
 */

import { Stack } from 'expo-router';

export default function SubscriptionsLayout() {
  return (
    <Stack
      screenOptions={{
        headerBackButtonDisplayMode: 'minimal',
        headerLargeTitleShadowVisible: false,
      }}
    >
      <Stack.Screen
        name="index"
        options={{
          title: 'Subscriptions',
          headerLargeTitle: true,
        }}
      />
      <Stack.Screen
        name="rss"
        options={{
          title: 'RSS Feeds',
          headerLargeTitle: true,
        }}
      />
      <Stack.Screen
        name="[provider]"
        options={{
          headerLargeTitle: true,
        }}
      />
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
