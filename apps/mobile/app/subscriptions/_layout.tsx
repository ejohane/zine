/**
 * Subscriptions Layout
 *
 * Uses a nested Stack to enable proper back navigation between
 * the subscriptions list and provider detail pages.
 */

import { Stack, useRouter } from 'expo-router';
import { Pressable } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

function BackButton() {
  const router = useRouter();
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'dark'];

  return (
    <Pressable
      onPress={() => router.back()}
      hitSlop={8}
      style={({ pressed }) => [{ opacity: pressed ? 0.6 : 1 }]}
    >
      <Svg
        width={24}
        height={24}
        viewBox="0 0 24 24"
        fill="none"
        stroke={colors.primary}
        strokeWidth={2.5}
      >
        <Path d="M15 18l-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" />
      </Svg>
    </Pressable>
  );
}

export default function SubscriptionsLayout() {
  return (
    <Stack>
      <Stack.Screen
        name="index"
        options={{
          title: 'Subscriptions',
          headerLargeTitle: true,
          headerLargeTitleShadowVisible: false,
          headerLeft: () => <BackButton />,
        }}
      />
      <Stack.Screen
        name="[provider]"
        options={{
          headerBackButtonDisplayMode: 'minimal',
          headerLargeTitle: true,
          headerLargeTitleShadowVisible: false,
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
