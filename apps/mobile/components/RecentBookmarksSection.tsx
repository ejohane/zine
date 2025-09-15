// @ts-nocheck
import * as React from 'react';
import {
  View,
  ScrollView,
  Text,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { ScrollShadow, Card, Button } from 'heroui-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { CompactBookmarkCard } from './CompactBookmarkCard';
import { useRecentBookmarks } from '../hooks/useRecentBookmarks';
import { useAuth } from '../contexts/auth';

const SkeletonCard = React.memo(() => (
  <Card className="w-[280px] h-[140px] p-4 mr-3 bg-gray-100">
    <View className="space-y-3">
      <View className="h-4 bg-gray-200 rounded-md w-3/4 animate-pulse" />
      <View className="h-3 bg-gray-200 rounded-md w-1/2 animate-pulse" />
      <View className="flex-row space-x-2 mt-auto">
        <View className="h-6 w-16 bg-gray-200 rounded-full animate-pulse" />
        <View className="h-6 w-20 bg-gray-200 rounded-full animate-pulse" />
      </View>
    </View>
  </Card>
));

SkeletonCard.displayName = 'SkeletonCard';

const EmptyState = React.memo(() => {
  const router = useRouter();

  return (
    <Card className="mx-4 p-8">
      <View className="items-center space-y-4">
        <View className="w-16 h-16 bg-gray-100 rounded-full items-center justify-center">
          <Ionicons name="bookmark-outline" size={32} color="#9CA3AF" />
        </View>
        <Text className="text-lg font-semibold text-gray-900">
          No bookmarks yet
        </Text>
        <Text className="text-sm text-gray-500 text-center">
          Start saving articles, videos, and podcasts to access them here
        </Text>
        <Button
          onPress={() => router.push('/discover')}
          className="mt-4"
          size="sm"
        >
          Discover Content
        </Button>
      </View>
    </Card>
  );
});

EmptyState.displayName = 'EmptyState';

interface RecentBookmarksSectionProps {
  onRefresh?: () => void;
}

export const RecentBookmarksSection = React.memo<RecentBookmarksSectionProps>(
  ({ onRefresh }) => {
    const { isSignedIn } = useAuth();
    const router = useRouter();
    const { 
      data: bookmarks, 
      isLoading, 
      error, 
      refetch 
    } = useRecentBookmarks({
      enabled: isSignedIn,
      limit: 10,
    });

    const handleRefresh = () => {
      refetch();
      onRefresh?.();
    };

    if (!isSignedIn) {
      return null;
    }

    if (error) {
      return (
        <View className="mx-4">
          <Card className="p-6 bg-red-50 border border-red-200">
            <View className="flex-row items-center space-x-3">
              <Ionicons name="alert-circle" size={24} color="#EF4444" />
              <View className="flex-1">
                <Text className="text-sm font-medium text-red-900">
                  Failed to load bookmarks
                </Text>
                <Text className="text-xs text-red-700 mt-1">
                  {error.message || 'Please try again later'}
                </Text>
              </View>
              <Button
                onPress={handleRefresh}
                size="sm"
                variant="bordered"
                className="border-red-300"
              >
                Retry
              </Button>
            </View>
          </Card>
        </View>
      );
    }

    if (isLoading) {
      return (
        <View className="pb-4">
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: 16 }}
          >
            {[1, 2, 3, 4].map((i) => (
              <SkeletonCard key={i} />
            ))}
          </ScrollView>
        </View>
      );
    }

    if (!bookmarks || bookmarks.length === 0) {
      return (
        <View className="pb-4">
          <EmptyState />
        </View>
      );
    }

    return (
      <View className="pb-4">
        <ScrollShadow
          size={50}
          visibility="both"
          hideScrollBar
          orientation="horizontal"
          className="w-full"
        >
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{
              paddingHorizontal: 16,
              paddingVertical: 8,
            }}
            snapToInterval={296} // Card width (280) + margin (16)
            snapToAlignment="start"
            decelerationRate="fast"
          >
            {bookmarks.map((bookmark, index) => (
              <View
                key={bookmark.id}
                style={{
                  marginRight: index === bookmarks.length - 1 ? 0 : 16,
                }}
              >
                <CompactBookmarkCard
                  bookmark={bookmark}
                  onPress={() => router.push(`/bookmark/${bookmark.id}`)}
                />
              </View>
            ))}
          </ScrollView>
        </ScrollShadow>
      </View>
    );
  }
);

RecentBookmarksSection.displayName = 'RecentBookmarksSection';