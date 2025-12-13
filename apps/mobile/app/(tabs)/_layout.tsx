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

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: '#0ea5e9', // zine-500
        tabBarInactiveTintColor: '#64748b', // slate-500
        headerShown: true,
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
