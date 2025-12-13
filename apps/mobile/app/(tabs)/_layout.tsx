import { Tabs } from 'expo-router';
import { Platform } from 'react-native';
import {
  HomeIcon,
  InboxIcon,
  BookmarkIcon,
} from 'react-native-heroicons/outline';
import {
  HomeIcon as HomeIconSolid,
  InboxIcon as InboxIconSolid,
  BookmarkIcon as BookmarkIconSolid,
} from 'react-native-heroicons/solid';

/**
 * Tab Navigator Layout
 *
 * Primary navigation shell for the Zine mobile app with three main tabs:
 * - Home: Re-entry and discovery surface
 * - Inbox: Decision queue for content triage
 * - Library: Long-term bookmark storage
 *
 * Auth Gating Strategy:
 * ---------------------
 * Authentication is handled at the root layout level via ClerkProvider.
 * The tab screens themselves do not implement auth gating - instead:
 * 1. ClerkLoaded in _layout.tsx ensures auth state is resolved before rendering
 * 2. Individual screens can use useAuth() from @clerk/clerk-expo to check auth status
 * 3. For protected data, Replicache subscriptions will return empty results if not authenticated
 * 4. Future: Add a dedicated auth flow (sign-in screen) that redirects unauthenticated users
 *
 * Deep Link Compatibility:
 * ------------------------
 * The tab navigator is configured as a group (tabs) in the file-based routing.
 * Deep links to item/[id] work because:
 * 1. Root Stack in _layout.tsx includes both (tabs) and item/[id] screens
 * 2. item/[id] is a sibling route, not nested in tabs, allowing direct navigation
 * 3. Navigation from tabs to item detail uses router.push('/item/[id]')
 */
export default function TabLayout() {
  // Brand colors for tab bar
  const colors = {
    primary: '#0ea5e9', // sky-500 - active tab color
    gray: {
      400: '#9ca3af', // gray-400 - inactive tab color
    },
  };

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.gray[400],
        headerShown: false,
        tabBarStyle: Platform.select({
          ios: {
            // Use a transparent background on iOS to show the blur effect
            position: 'absolute',
          },
          default: {},
        }),
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ focused, color, size }) =>
            focused ? (
              <HomeIconSolid color={color} size={size} />
            ) : (
              <HomeIcon color={color} size={size} />
            ),
        }}
      />
      <Tabs.Screen
        name="inbox"
        options={{
          title: 'Inbox',
          tabBarIcon: ({ focused, color, size }) =>
            focused ? (
              <InboxIconSolid color={color} size={size} />
            ) : (
              <InboxIcon color={color} size={size} />
            ),
        }}
      />
      <Tabs.Screen
        name="library"
        options={{
          title: 'Library',
          tabBarIcon: ({ focused, color, size }) =>
            focused ? (
              <BookmarkIconSolid color={color} size={size} />
            ) : (
              <BookmarkIcon color={color} size={size} />
            ),
        }}
      />
    </Tabs>
  );
}
