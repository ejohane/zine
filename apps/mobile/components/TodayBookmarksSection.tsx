import * as React from 'react';
import { View, Text, TouchableOpacity, Animated, Image } from 'react-native';
import { Card, Avatar } from 'heroui-native';
import { useRouter } from 'expo-router';
import * as Linking from 'expo-linking';
import * as Haptics from 'expo-haptics';
import { MoreHorizontal } from 'lucide-react-native';
import type { Bookmark } from '@zine/shared';
import { formatDuration } from '../lib/dateUtils';
import { PlatformIcon } from '../lib/platformIcons';
import { OptimizedBookmarkImage } from './OptimizedBookmarkImage';
import { useTodayBookmarks } from '../hooks/useTodayBookmarks';
import { useAuth } from '../contexts/auth';

// Component for video/article items with thumbnail
const MediaBookmarkItem = React.memo<{ bookmark: Bookmark }>(({ bookmark }) => {
  const router = useRouter();
  
  const duration = bookmark.videoMetadata?.duration || bookmark.podcastMetadata?.duration;
  const formattedDuration = duration ? formatDuration(duration) : null;
  
  const handlePress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push(`/bookmark/${bookmark.id}`);
  };
  
  const handleMoreOptions = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      const url = bookmark.originalUrl || bookmark.url;
      const canOpen = await Linking.canOpenURL(url);
      if (canOpen) {
        await Linking.openURL(url);
      }
    } catch (error) {
      console.error('Error opening URL:', error);
    }
  };
  
  const authorName = bookmark.creator?.name || 
                     bookmark.articleMetadata?.authorName || 
                     'Unknown';
  
  return (
    <TouchableOpacity onPress={handlePress} activeOpacity={0.7}>
      <View className="flex-row bg-white rounded-xl p-3 mb-3 shadow-sm">
        {/* Thumbnail */}
        <View className="relative w-32 h-20 rounded-lg overflow-hidden bg-gray-100 mr-3">
          <OptimizedBookmarkImage
            url={bookmark.thumbnailUrl}
            contentType={bookmark.contentType}
            style={{
              width: '100%',
              height: '100%',
            }}
          />
          {formattedDuration && (
            <View className="absolute bottom-1 right-1 bg-black/80 px-1.5 py-0.5 rounded">
              <Text className="text-white text-xs font-medium">{formattedDuration}</Text>
            </View>
          )}
        </View>
        
        {/* Content */}
        <View className="flex-1">
          <Text className="text-sm font-semibold text-gray-900 mb-1" numberOfLines={2}>
            {bookmark.title}
          </Text>
          <Text className="text-xs text-gray-500 mb-1" numberOfLines={1}>
            {authorName}
          </Text>
          <View className="flex-row items-center">
            {bookmark.creator?.avatarUrl ? (
              <Image
                source={{ uri: bookmark.creator.avatarUrl }}
                style={{ width: 16, height: 16, borderRadius: 8, marginRight: 4 }}
                onError={() => {}}
              />
            ) : (
              <PlatformIcon source={bookmark.source} size={14} />
            )}
            {bookmark.source && (
              <Text className="text-xs text-gray-400 ml-1">
                {bookmark.source.charAt(0).toUpperCase() + bookmark.source.slice(1)}
              </Text>
            )}
          </View>
        </View>
        
        {/* More button */}
        <TouchableOpacity
          onPress={handleMoreOptions}
          className="p-1"
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <MoreHorizontal size={20} color="#6B7280" />
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );
});

MediaBookmarkItem.displayName = 'MediaBookmarkItem';

// Component for social posts (Twitter/X, etc)
const PostBookmarkItem = React.memo<{ bookmark: Bookmark }>(({ bookmark }) => {
  const router = useRouter();
  
  const handlePress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push(`/bookmark/${bookmark.id}`);
  };
  
  const handleMoreOptions = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      const url = bookmark.originalUrl || bookmark.url;
      const canOpen = await Linking.canOpenURL(url);
      if (canOpen) {
        await Linking.openURL(url);
      }
    } catch (error) {
      console.error('Error opening URL:', error);
    }
  };
  
  const authorName = bookmark.creator?.name || 'Unknown';
  const authorHandle = bookmark.creator?.handle || '@user';
  const authorAvatar = bookmark.creator?.avatarUrl;
  
  return (
    <TouchableOpacity onPress={handlePress} activeOpacity={0.7}>
      <Card className="mb-3 p-4">
        {/* Author header */}
        <View className="flex-row items-center mb-3">
          <View className="mr-3">
            <Avatar size="sm" color="default" alt={authorName}>
              {authorAvatar ? (
                <Avatar.Image source={{ uri: authorAvatar }} />
              ) : (
                <Avatar.Fallback>
                  <Text className="text-xs font-semibold text-gray-600">
                    {authorName.charAt(0).toUpperCase()}
                  </Text>
                </Avatar.Fallback>
              )}
            </Avatar>
          </View>
          <View className="flex-1">
            <Text className="text-sm font-semibold text-gray-900">{authorName}</Text>
            <Text className="text-xs text-gray-500">{authorHandle}</Text>
          </View>
          <TouchableOpacity
            onPress={handleMoreOptions}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <MoreHorizontal size={20} color="#6B7280" />
          </TouchableOpacity>
        </View>
        
        {/* Post content */}
        <Text className="text-sm text-gray-800 mb-3" numberOfLines={3}>
          {bookmark.description || bookmark.title}
        </Text>
        
        {/* Post image if available */}
        {bookmark.thumbnailUrl && (
          <View className="rounded-lg overflow-hidden h-48 bg-gray-100">
            <OptimizedBookmarkImage
              url={bookmark.thumbnailUrl}
              contentType={bookmark.contentType}
              style={{
                width: '100%',
                height: '100%',
              }}
            />
          </View>
        )}
      </Card>
    </TouchableOpacity>
  );
});

PostBookmarkItem.displayName = 'PostBookmarkItem';

// Loading skeleton
const SkeletonItem = React.memo(() => {
  const [opacity] = React.useState(new Animated.Value(0.3));
  
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
      backgroundColor: 'white', 
      borderRadius: 12, 
      padding: 12, 
      marginBottom: 12,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.05,
      shadowRadius: 2,
      elevation: 1
    }}>
      <View style={{ flexDirection: 'row' }}>
        {/* Thumbnail skeleton */}
        <Animated.View style={{ 
          width: 128, 
          height: 80, 
          borderRadius: 8, 
          backgroundColor: '#e5e7eb',
          marginRight: 12,
          opacity: opacity,
          position: 'relative'
        }}>
          {/* Duration badge skeleton */}
          <View style={{ 
            position: 'absolute', 
            bottom: 4, 
            right: 4, 
            backgroundColor: 'rgba(0, 0, 0, 0.3)', 
            width: 32,
            height: 18,
            borderRadius: 3 
          }} />
        </Animated.View>
        
        {/* Content skeleton */}
        <View style={{ flex: 1 }}>
          {/* Title - two lines */}
          <Animated.View style={{ 
            height: 14, 
            backgroundColor: '#e5e7eb', 
            borderRadius: 4, 
            marginBottom: 6,
            width: '90%',
            opacity: opacity
          }} />
          <Animated.View style={{ 
            height: 14, 
            backgroundColor: '#e5e7eb', 
            borderRadius: 4, 
            marginBottom: 8,
            width: '70%',
            opacity: opacity
          }} />
          
          {/* Author skeleton */}
          <Animated.View style={{ 
            height: 12, 
            backgroundColor: '#e5e7eb', 
            borderRadius: 4,
            width: '50%',
            marginBottom: 6,
            opacity: opacity
          }} />
          
          {/* Platform icon skeleton */}
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Animated.View style={{ 
              width: 14, 
              height: 14, 
              backgroundColor: '#e5e7eb', 
              borderRadius: 7,
              marginRight: 8,
              opacity: opacity
            }} />
            <Animated.View style={{ 
              height: 12, 
              backgroundColor: '#e5e7eb', 
              borderRadius: 4,
              width: 60,
              opacity: opacity
            }} />
          </View>
        </View>
        
        {/* More button skeleton */}
        <Animated.View style={{ 
          width: 20, 
          height: 20, 
          backgroundColor: '#e5e7eb', 
          borderRadius: 10,
          marginLeft: 8,
          opacity: opacity
        }} />
      </View>
    </View>
  );
});

SkeletonItem.displayName = 'SkeletonItem';

// Post skeleton
const PostSkeletonItem = React.memo(() => {
  const [opacity] = React.useState(new Animated.Value(0.3));
  
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
      backgroundColor: 'white', 
      borderRadius: 12, 
      padding: 16, 
      marginBottom: 12,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.05,
      shadowRadius: 2,
      elevation: 1
    }}>
      {/* Author header skeleton */}
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
        <Animated.View style={{ 
          width: 32, 
          height: 32, 
          borderRadius: 16, 
          backgroundColor: '#e5e7eb',
          marginRight: 12,
          opacity: opacity
        }} />
        <View style={{ flex: 1 }}>
          <Animated.View style={{ 
            height: 14, 
            backgroundColor: '#e5e7eb', 
            borderRadius: 4,
            width: 100,
            marginBottom: 4,
            opacity: opacity
          }} />
          <Animated.View style={{ 
            height: 12, 
            backgroundColor: '#e5e7eb', 
            borderRadius: 4,
            width: 80,
            opacity: opacity
          }} />
        </View>
        <Animated.View style={{ 
          width: 20, 
          height: 20, 
          backgroundColor: '#e5e7eb', 
          borderRadius: 10,
          opacity: opacity
        }} />
      </View>
      
      {/* Post content skeleton */}
      <Animated.View style={{ 
        height: 14, 
        backgroundColor: '#e5e7eb', 
        borderRadius: 4,
        marginBottom: 6,
        opacity: opacity
      }} />
      <Animated.View style={{ 
        height: 14, 
        backgroundColor: '#e5e7eb', 
        borderRadius: 4,
        marginBottom: 6,
        width: '90%',
        opacity: opacity
      }} />
      <Animated.View style={{ 
        height: 14, 
        backgroundColor: '#e5e7eb', 
        borderRadius: 4,
        width: '75%',
        opacity: opacity
      }} />
    </View>
  );
});

PostSkeletonItem.displayName = 'PostSkeletonItem';

interface TodayBookmarksSectionProps {
  onRefresh?: () => void;
}

export const TodayBookmarksSection = React.memo<TodayBookmarksSectionProps>(() => {
  const { isSignedIn } = useAuth();
  const { data: bookmarks, isLoading, isFetching, error } = useTodayBookmarks({
    enabled: isSignedIn,
  });
  
  if (!isSignedIn || (!bookmarks?.length && !isLoading)) {
    return null;
  }
  
  if (isLoading && !bookmarks) {
    return (
      <View style={{ paddingHorizontal: 16 }}>
        <SkeletonItem />
        <PostSkeletonItem />
        <SkeletonItem />
      </View>
    );
  }
  
  if (error) {
    return null;
  }
  
  return (
    <View className="px-4">
      {bookmarks?.map((bookmark) => {
        if (bookmark.contentType === 'post') {
          return <PostBookmarkItem key={bookmark.id} bookmark={bookmark} />;
        } else {
          return <MediaBookmarkItem key={bookmark.id} bookmark={bookmark} />;
        }
      })}
    </View>
  );
});

TodayBookmarksSection.displayName = 'TodayBookmarksSection';