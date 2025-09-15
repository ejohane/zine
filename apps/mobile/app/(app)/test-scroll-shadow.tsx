// @ts-nocheck
import * as React from 'react';
import { View, Text, SafeAreaView, ScrollView } from 'react-native';
import { Stack } from 'expo-router';
import { RecentBookmarksSection } from '../../components/RecentBookmarksSection';

export default function TestScrollShadowScreen() {
  const [refreshing, setRefreshing] = React.useState(false);

  const handleRefresh = async () => {
    setRefreshing(true);
    // Simulate refresh delay
    await new Promise(resolve => setTimeout(resolve, 1000));
    setRefreshing(false);
  };

  return (
    <>
      <Stack.Screen
        options={{
          title: 'Test ScrollShadow',
          headerShown: true,
        }}
      />
      <SafeAreaView className="flex-1 bg-white">
        <ScrollView
          className="flex-1"
          refreshing={refreshing}
          onRefresh={handleRefresh}
        >
          <View className="py-6">
            <View className="px-4 mb-4">
              <Text className="text-2xl font-bold text-gray-900">
                Recent Bookmarks with ScrollShadow
              </Text>
              <Text className="text-sm text-gray-500 mt-1">
                Testing horizontal scroll with shadow effects
              </Text>
            </View>
            
            <RecentBookmarksSection onRefresh={handleRefresh} />
            
            <View className="px-4 mt-8">
              <Text className="text-lg font-semibold text-gray-900 mb-2">
                Test Scenarios:
              </Text>
              <View className="space-y-2">
                <Text className="text-sm text-gray-600">
                  ✓ Shadow appears on both sides when scrollable
                </Text>
                <Text className="text-sm text-gray-600">
                  ✓ Shadow disappears at scroll boundaries
                </Text>
                <Text className="text-sm text-gray-600">
                  ✓ Smooth horizontal scrolling
                </Text>
                <Text className="text-sm text-gray-600">
                  ✓ Snap-to-item behavior
                </Text>
                <Text className="text-sm text-gray-600">
                  ✓ Loading state with skeleton cards
                </Text>
                <Text className="text-sm text-gray-600">
                  ✓ Empty state when no bookmarks
                </Text>
                <Text className="text-sm text-gray-600">
                  ✓ Error state with retry button
                </Text>
              </View>
            </View>
          </View>
        </ScrollView>
      </SafeAreaView>
    </>
  );
}