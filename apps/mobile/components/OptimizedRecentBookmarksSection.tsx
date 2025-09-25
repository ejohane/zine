// @ts-nocheck
import * as React from 'react';
import {
  View,
  ScrollView,
  Text,
  FlatList,
  Dimensions,
  Animated,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Card, Button } from 'heroui-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { MediaRichBookmarkCard } from './MediaRichBookmarkCard';
import { useRecentBookmarks } from '../hooks/useRecentBookmarks';
import { useAuth } from '../contexts/auth';
import type { Bookmark } from '@zine/shared';

const { width: screenWidth } = Dimensions.get('window');
const CARD_WIDTH = 300;
const CARD_MARGIN = 12;

const SkeletonCard = React.memo(() => {
  const [opacity] = React.useState(new React.useRef(new Animated.Value(0.3)).current);
  
  React.useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 1,
          duration: 1000,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0.3,
          duration: 1000,
          useNativeDriver: true,
        }),
      ])
    );
    animation.start();
    return () => animation.stop();
  }, [opacity]);
  
  return (
    <View style={{ 
      width: 300, 
      height: 240, 
      backgroundColor: 'white', 
      borderRadius: 12, 
      overflow: 'hidden', 
      marginRight: 12,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.05,
      shadowRadius: 2,
      elevation: 2
    }}>
      {/* Media Preview Skeleton */}
      <Animated.View style={{ 
        width: '100%', 
        height: 169, 
        backgroundColor: '#e5e7eb',
        opacity: opacity,
      }}>
        {/* Play button skeleton for media content */}
        <View style={{ 
          position: 'absolute', 
          top: '50%', 
          left: '50%', 
          transform: [{ translateX: -24 }, { translateY: -24 }],
        }}>
          <View style={{ 
            backgroundColor: 'rgba(255, 255, 255, 0.5)', 
            borderRadius: 999, 
            width: 48,
            height: 48,
          }} />
        </View>
        
        {/* Duration badge skeleton */}
        <View style={{ 
          position: 'absolute', 
          bottom: 8, 
          right: 8, 
          backgroundColor: 'rgba(0, 0, 0, 0.3)', 
          width: 40,
          height: 20,
          borderRadius: 4 
        }} />
      </Animated.View>
      
      {/* Content Section Skeleton */}
      <View style={{ padding: 12, height: 71 }}>
        {/* Title skeleton - two lines */}
        <Animated.View style={{ 
          height: 14, 
          backgroundColor: '#e5e7eb', 
          borderRadius: 4, 
          marginBottom: 4,
          opacity: opacity,
        }} />
        <Animated.View style={{ 
          height: 14, 
          backgroundColor: '#e5e7eb', 
          borderRadius: 4, 
          marginBottom: 10,
          width: '75%',
          opacity: opacity,
        }} />
        
        {/* Author/Platform skeleton */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Animated.View style={{ 
            width: 14, 
            height: 14, 
            backgroundColor: '#e5e7eb', 
            borderRadius: 7,
            opacity: opacity,
          }} />
          <Animated.View style={{ 
            height: 12, 
            backgroundColor: '#e5e7eb', 
            borderRadius: 4,
            width: 80,
            opacity: opacity,
          }} />
        </View>
      </View>
    </View>
  );
});

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

interface OptimizedRecentBookmarksSectionProps {
  onRefresh?: () => void;
  useVirtualization?: boolean;
}

export const OptimizedRecentBookmarksSection = React.memo<OptimizedRecentBookmarksSectionProps>(
  ({ onRefresh, useVirtualization = false }) => {
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

    const handleRefresh = React.useCallback(() => {
      refetch();
      onRefresh?.();
    }, [refetch, onRefresh]);

    const renderBookmarkItem = React.useCallback(({ item, index }: { item: Bookmark; index: number }) => (
      <View
        style={{
          paddingLeft: index === 0 ? 16 : 0,
          paddingRight: index === (bookmarks?.length ?? 0) - 1 ? 16 : 0,
        }}
      >
        <MediaRichBookmarkCard
          bookmark={item}
          onPress={() => router.push(`/bookmark/${item.id}`)}
        />
      </View>
    ), [router, bookmarks?.length]);

    const keyExtractor = React.useCallback((item: Bookmark) => item.id, []);

    const getItemLayout = React.useCallback((data: any, index: number) => ({
      length: CARD_WIDTH + CARD_MARGIN,
      offset: (CARD_WIDTH + CARD_MARGIN) * index,
      index,
    }), []);

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
        <View style={{ marginBottom: 16 }}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ 
              paddingHorizontal: 16,
              paddingVertical: 4,
            }}
            snapToInterval={CARD_WIDTH + CARD_MARGIN}
            snapToAlignment="start"
            decelerationRate="fast"
          >
            {[1, 2, 3].map((i) => (
              <SkeletonCard key={`skeleton-${i}`} />
            ))}
          </ScrollView>
        </View>
      );
    }

    if (!bookmarks || bookmarks.length === 0) {
      return (
        <View className="mb-4">
          <EmptyState />
        </View>
      );
    }

    // Use FlatList for better performance with large lists
    if (useVirtualization && bookmarks.length > 5) {
      return (
        <View className="mb-4">
          <FlatList
            data={bookmarks}
            renderItem={renderBookmarkItem}
            keyExtractor={keyExtractor}
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{
              paddingHorizontal: 16,
              paddingVertical: 8,
            }}
            snapToInterval={CARD_WIDTH + CARD_MARGIN}
            snapToAlignment="start"
            decelerationRate="fast"
            getItemLayout={getItemLayout}
            initialNumToRender={3}
            maxToRenderPerBatch={2}
            windowSize={5}
            removeClippedSubviews={true}
          />
        </View>
      );
    }

    // Use ScrollView without ScrollShadow for now to avoid the displayName error
    return (
      <View>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{
            paddingHorizontal: 16,
          }}
          snapToInterval={CARD_WIDTH + CARD_MARGIN}
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
              <MediaRichBookmarkCard
                bookmark={bookmark}
                onPress={() => router.push(`/bookmark/${bookmark.id}`)}
              />
            </View>
          ))}
        </ScrollView>
      </View>
    );
  }
);

OptimizedRecentBookmarksSection.displayName = 'OptimizedRecentBookmarksSection';