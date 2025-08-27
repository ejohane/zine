import { ScrollView, View, Text, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useState } from 'react';
import { useAuth } from '@/hooks/useAuth';

export default function HomeScreen() {
  const [refreshing, setRefreshing] = useState(false);
  const { isSignedIn } = useAuth();

  const handleRefresh = async () => {
    setRefreshing(true);
    // TODO: Refresh data
    setTimeout(() => setRefreshing(false), 1000);
  };

  // TEMPORARY: Bypass auth for development
  const BYPASS_AUTH = true;

  if (!isSignedIn && !BYPASS_AUTH) {
    return (
      <SafeAreaView className="flex-1 bg-gray-50">
        <View className="flex-1 items-center justify-center px-4">
          <Text className="text-4xl font-bold mb-4">Welcome to Zine</Text>
          <Text className="text-lg text-gray-600 text-center mb-8">
            Your intelligent bookmark manager with a modern twist
          </Text>
          <View className="w-full max-w-xs gap-3">
            <View className="bg-primary-500 py-3 px-6 rounded-lg">
              <Text className="text-white text-center font-semibold">Sign In</Text>
            </View>
            <View className="border border-primary-500 py-3 px-6 rounded-lg">
              <Text className="text-primary-500 text-center font-semibold">Create Account</Text>
            </View>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-gray-50">
      <ScrollView
        className="flex-1"
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
        }
      >
        <View className="pt-4 pb-8">
          {/* Greeting Section */}
          <View className="px-4 mb-6">
            <Text className="text-3xl font-bold mb-2">Good morning!</Text>
            <Text className="text-gray-600">Ready to explore your content?</Text>
          </View>

          {/* Quick Actions */}
          <View className="px-4 mb-6">
            <View className="flex-row gap-3">
              <View className="flex-1 bg-white p-4 rounded-lg">
                <Text className="text-center">Continue</Text>
              </View>
              <View className="flex-1 bg-white p-4 rounded-lg">
                <Text className="text-center">Starred</Text>
              </View>
              <View className="flex-1 bg-white p-4 rounded-lg">
                <Text className="text-center">Add New</Text>
              </View>
            </View>
          </View>

          {/* Recent Section */}
          <View className="mb-6">
            <Text className="text-xl font-semibold px-4 mb-3">Recently Added</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} className="px-4">
              <View className="bg-white rounded-lg p-4 mr-3 w-48">
                <Text className="font-semibold">Sample Item 1</Text>
                <Text className="text-gray-600 text-sm">Podcast</Text>
              </View>
              <View className="bg-white rounded-lg p-4 mr-3 w-48">
                <Text className="font-semibold">Sample Item 2</Text>
                <Text className="text-gray-600 text-sm">Video</Text>
              </View>
              <View className="bg-white rounded-lg p-4 mr-3 w-48">
                <Text className="font-semibold">Sample Item 3</Text>
                <Text className="text-gray-600 text-sm">Article</Text>
              </View>
            </ScrollView>
          </View>

          {/* Queue Section */}
          <View className="px-4">
            <Text className="text-xl font-semibold mb-3">Your Queue</Text>
            <View className="bg-white rounded-lg p-4 mb-3">
              <Text className="font-semibold">Queue Item 1</Text>
              <Text className="text-gray-600 text-sm">10 min • Podcast</Text>
            </View>
            <View className="bg-white rounded-lg p-4 mb-3">
              <Text className="font-semibold">Queue Item 2</Text>
              <Text className="text-gray-600 text-sm">5 min • Article</Text>
            </View>
            <View className="bg-white rounded-lg p-4 mb-3">
              <Text className="font-semibold">Queue Item 3</Text>
              <Text className="text-gray-600 text-sm">20 min • Video</Text>
            </View>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}