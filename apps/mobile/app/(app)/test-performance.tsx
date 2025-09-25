// @ts-nocheck
import React, { useState } from 'react';
import {
  ScrollView,
  View,
  Text,
  Button as RNButton,
  Switch,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack } from 'expo-router';
import { OptimizedRecentBookmarksSection } from '../../components/OptimizedRecentBookmarksSection';
import { RecentBookmarksSection } from '../../components/RecentBookmarksSection';
import { cleanImageCache } from '../../components/OptimizedBookmarkImage';

export default function TestPerformanceScreen() {
  const [useOptimized, setUseOptimized] = useState(true);
  const [useVirtualization, setUseVirtualization] = useState(false);
  const [enableHaptics, setEnableHaptics] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = async () => {
    setRefreshing(true);
    // Simulate refresh delay
    await new Promise(resolve => setTimeout(resolve, 1000));
    setRefreshing(false);
  };

  const handleClearCache = async () => {
    try {
      await cleanImageCache();
      alert('Image cache cleared successfully');
    } catch (error) {
      alert('Failed to clear cache: ' + error.message);
    }
  };

  return (
    <>
      <Stack.Screen
        options={{
          title: 'Performance Test',
          headerBackTitle: 'Back',
        }}
      />
      <SafeAreaView className="flex-1 bg-gray-50">
        <ScrollView
          className="flex-1"
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor="#9333ea"
            />
          }
        >
          {/* Controls */}
          <View className="bg-white p-4 mb-4 border-b border-gray-200">
            <Text className="text-lg font-bold mb-4">Performance Settings</Text>
            
            {/* Optimized Version Toggle */}
            <View className="flex-row items-center justify-between mb-3">
              <Text className="text-sm font-medium">Use Optimized Version</Text>
              <Switch
                value={useOptimized}
                onValueChange={setUseOptimized}
                trackColor={{ false: '#d1d5db', true: '#9333ea' }}
                thumbColor="#ffffff"
              />
            </View>
            
            {/* Virtualization Toggle (only for optimized) */}
            {useOptimized && (
              <View className="flex-row items-center justify-between mb-3">
                <View className="flex-1">
                  <Text className="text-sm font-medium">Use Virtualization</Text>
                  <Text className="text-xs text-gray-500">Better for 5+ cards</Text>
                </View>
                <Switch
                  value={useVirtualization}
                  onValueChange={setUseVirtualization}
                  trackColor={{ false: '#d1d5db', true: '#9333ea' }}
                  thumbColor="#ffffff"
                />
              </View>
            )}
            
            {/* Haptics Toggle (only for optimized) */}
            {useOptimized && (
              <View className="flex-row items-center justify-between mb-3">
                <Text className="text-sm font-medium">Enable Haptic Feedback</Text>
                <Switch
                  value={enableHaptics}
                  onValueChange={setEnableHaptics}
                  trackColor={{ false: '#d1d5db', true: '#9333ea' }}
                  thumbColor="#ffffff"
                />
              </View>
            )}
            
            {/* Clear Cache Button */}
            {useOptimized && (
              <View className="mt-4">
                <RNButton
                  title="Clear Image Cache"
                  onPress={handleClearCache}
                  color="#9333ea"
                />
              </View>
            )}
          </View>

          {/* Performance Info */}
          <View className="bg-white p-4 mb-4">
            <Text className="text-sm font-bold mb-2">Current Configuration:</Text>
            <Text className="text-xs text-gray-600">
              • Version: {useOptimized ? 'Optimized' : 'Original'}{'\n'}
              {useOptimized && (
                <>
                  • Virtualization: {useVirtualization ? 'Enabled' : 'Disabled'}{'\n'}
                  • Haptic Feedback: {enableHaptics ? 'Enabled' : 'Disabled'}{'\n'}
                  • Image Caching: Enabled{'\n'}
                  • Lazy Loading: Enabled{'\n'}
                  • Memoization: Enabled
                </>
              )}
              {!useOptimized && (
                <>
                  • No image caching{'\n'}
                  • No lazy loading{'\n'}
                  • Basic memoization only
                </>
              )}
            </Text>
          </View>

          {/* Section Header */}
          <View className="flex-row items-center justify-between px-4 mb-2">
            <Text className="text-xl font-bold text-gray-900">
              Recent Bookmarks
            </Text>
            <Text className="text-sm text-purple-600">
              See all
            </Text>
          </View>

          {/* Bookmarks Section */}
          {useOptimized ? (
            <OptimizedRecentBookmarksSection
              onRefresh={handleRefresh}
              useVirtualization={useVirtualization}
            />
          ) : (
            <RecentBookmarksSection
              onRefresh={handleRefresh}
            />
          )}

          {/* Performance Tips */}
          <View className="p-4 mx-4 mb-4 bg-blue-50 rounded-lg">
            <Text className="text-sm font-bold text-blue-900 mb-2">
              Performance Tips:
            </Text>
            <Text className="text-xs text-blue-700">
              • Pull down to refresh and test reload performance{'\n'}
              • Try scrolling quickly to test smoothness{'\n'}
              • Toggle settings to compare performance{'\n'}
              • Check if images load from cache on second view{'\n'}
              • Monitor for any jank or stuttering
            </Text>
          </View>
        </ScrollView>
      </SafeAreaView>
    </>
  );
}