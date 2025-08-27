import { Tabs } from 'expo-router';
import React from 'react';
import { Platform } from 'react-native';
import { Home, Search, User } from 'lucide-react-native';

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: '#3b82f6', // primary-500
        tabBarInactiveTintColor: '#6b7280', // gray-500
        headerShown: false,
        tabBarStyle: Platform.select({
          ios: {
            position: 'absolute',
            backgroundColor: '#ffffff',
            borderTopColor: '#e5e5e5',
            borderTopWidth: 1,
          },
          default: {
            backgroundColor: '#ffffff',
            borderTopColor: '#e5e5e5',
            borderTopWidth: 1,
          },
        }),
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ color, size }) => <Home size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="search"
        options={{
          title: 'Search',
          tabBarIcon: ({ color, size }) => <Search size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color, size }) => <User size={size} color={color} />,
        }}
      />
      {/* Hidden screens that are still accessible programmatically */}
      <Tabs.Screen
        name="bookmarks"
        options={{
          href: null, // Hide from tab bar
        }}
      />
      <Tabs.Screen
        name="discover"
        options={{
          href: null, // Hide from tab bar
        }}
      />
    </Tabs>
  );
}
