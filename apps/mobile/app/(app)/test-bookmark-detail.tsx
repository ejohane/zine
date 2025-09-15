// @ts-nocheck
import { View, Text, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Card, Button } from 'heroui-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../../contexts/auth';

export default function TestBookmarkDetail() {
  const router = useRouter();
  const { isSignedIn } = useAuth();

  // Test bookmark IDs (you'll need to replace with actual IDs from your database)
  const testBookmarkIds = [
    '1', // Replace with actual bookmark ID
    '2', // Replace with actual bookmark ID
    '3', // Replace with actual bookmark ID
  ];

  return (
    <SafeAreaView className="flex-1 bg-gray-50">
      <ScrollView className="flex-1 px-4 py-4">
        <Card className="p-4 mb-4">
          <Text className="text-lg font-bold mb-2">Test Bookmark Navigation</Text>
          <Text className="text-sm text-gray-600 mb-4">
            {isSignedIn ? '✅ Signed in' : '❌ Not signed in'}
          </Text>
          <Text className="text-sm text-gray-600 mb-4">
            Click a button below to test navigation to bookmark detail view:
          </Text>
        </Card>

        <Card className="p-4 mb-4">
          <Text className="text-sm font-semibold mb-3">Test with Mock IDs</Text>
          <View className="gap-2">
            {testBookmarkIds.map((id) => (
              <Button
                key={id}
                onPress={() => router.push(`/bookmark/${id}`)}
                className="w-full"
              >
                Navigate to Bookmark {id}
              </Button>
            ))}
          </View>
        </Card>

        <Card className="p-4 mb-4">
          <Text className="text-sm font-semibold mb-3">Test Navigation Flow</Text>
          <View className="gap-2">
            <Button
              onPress={() => router.push('/')}
              className="w-full"
            >
              Go to Home
            </Button>
            <Button
              onPress={() => router.push('/test-scroll-shadow')}
              className="w-full"
            >
              Test Recent Bookmarks Section
            </Button>
          </View>
        </Card>

        <Card className="p-4">
          <Text className="text-sm font-semibold mb-2">Test Checklist</Text>
          <View className="gap-2">
            <Text className="text-xs text-gray-600">
              ✅ Created BookmarkDetailScreen at /bookmark/[id]
            </Text>
            <Text className="text-xs text-gray-600">
              ✅ Added useBookmarkDetail hook
            </Text>
            <Text className="text-xs text-gray-600">
              ✅ CompactBookmarkCard navigates to detail view
            </Text>
            <Text className="text-xs text-gray-600">
              ✅ Loading state with skeleton
            </Text>
            <Text className="text-xs text-gray-600">
              ✅ Error state with retry option
            </Text>
            <Text className="text-xs text-gray-600">
              ✅ Action buttons (Open, Share, Edit, Delete)
            </Text>
            <Text className="text-xs text-gray-600">
              ✅ Authentication check
            </Text>
          </View>
        </Card>
      </ScrollView>
    </SafeAreaView>
  );
}