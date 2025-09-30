// @ts-nocheck
import * as React from 'react';
import { View, Text, TouchableOpacity, Pressable, Image } from 'react-native';
import { Card, Chip, Button } from 'heroui-native';
import { useRouter } from 'expo-router';
import * as Linking from 'expo-linking';
import * as Haptics from 'expo-haptics';
import type { Bookmark } from '@zine/shared';
import { formatRelativeTime, formatShortDate } from '../lib/dateUtils';
import { PlatformIcon, ContentTypeIcon, ExternalLinkIcon } from '../lib/platformIcons';
import { OptimizedBookmarkImage } from './OptimizedBookmarkImage';

interface OptimizedCompactBookmarkCardProps {
  bookmark: Bookmark;
  onPress?: () => void;
  onLongPress?: () => void;
  enableHaptics?: boolean;
}

export const OptimizedCompactBookmarkCard = React.memo<OptimizedCompactBookmarkCardProps>(({ 
  bookmark, 
  onPress,
  onLongPress,
  enableHaptics = true
}) => {
  const router = useRouter();
  
  // Handle card press - navigate to detail view
  const handlePress = React.useCallback(() => {
    if (enableHaptics) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    
    if (onPress) {
      onPress();
    } else {
      // Navigate to bookmark detail screen
      router.push(`/bookmark/${bookmark.id}`);
    }
  }, [bookmark.id, onPress, router, enableHaptics]);
  
  // Handle open link button press - open in external browser
  const handleOpenLink = React.useCallback(async () => {
    if (enableHaptics) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    
    try {
      const url = bookmark.originalUrl || bookmark.url;
      const canOpen = await Linking.canOpenURL(url);
      if (canOpen) {
        await Linking.openURL(url);
      } else {
        console.warn('Cannot open URL:', url);
      }
    } catch (error) {
      console.error('Error opening URL:', error);
    }
  }, [bookmark.originalUrl, bookmark.url, enableHaptics]);
  
  // Handle long press with haptic feedback
  const handleLongPress = React.useCallback(() => {
    if (enableHaptics) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    }
    onLongPress?.();
  }, [onLongPress, enableHaptics]);
  
  // Get content type badge color
  const getContentTypeColor = React.useCallback((type?: string) => {
    switch (type) {
      case 'video': return 'bg-red-100 text-red-800';
      case 'podcast': return 'bg-purple-100 text-purple-800';
      case 'article': return 'bg-blue-100 text-blue-800';
      case 'post': return 'bg-green-100 text-green-800';
      case 'link': 
      default: return 'bg-gray-100 text-gray-800';
    }
  }, []);
  
  const showThumbnail = bookmark.thumbnailUrl && bookmark.contentType !== 'post';
  
  return (
    <Pressable
      onPress={handlePress}
      onLongPress={handleLongPress}
      className="active:opacity-80"
    >
      <Card className={`w-[280px] ${showThumbnail ? 'h-[200px]' : 'h-[140px]'} p-3 mr-3`}>
        {/* Thumbnail if available */}
        {showThumbnail && (
          <View className="mb-2 -m-3 mb-2">
            <OptimizedBookmarkImage
              url={bookmark.thumbnailUrl}
              contentType={bookmark.contentType}
              style={{
                width: '100%',
                height: 80,
                borderTopLeftRadius: 8,
                borderTopRightRadius: 8,
              }}
            />
          </View>
        )}
        
        {/* Header with author and publish date */}
        <View className="flex-row items-center justify-between mb-2">
          {/* Creator on the left */}
          <View className="flex-row items-center gap-2 flex-1">
            {bookmark.creator?.avatarUrl && (
              <Image
                source={{ uri: bookmark.creator.avatarUrl }}
                style={{ width: 18, height: 18, borderRadius: 9 }}
                onError={() => {}}
              />
            )}
            {bookmark.creator?.name ? (
              <Text className="text-xs text-gray-700 flex-1" numberOfLines={1}>
                {bookmark.creator.name}
              </Text>
            ) : null}
          </View>
          
          {/* Publish date on the right */}
          {bookmark.publishedAt && (
            <Text className="text-xs text-gray-500 ml-2">
              {formatShortDate(bookmark.publishedAt)}
            </Text>
          )}
        </View>
        
        {/* Title - truncated to 2 lines */}
        <Text 
          className="text-sm font-semibold text-gray-900 mb-2"
          numberOfLines={2}
          ellipsizeMode="tail"
        >
          {bookmark.title}
        </Text>
        
        {/* Bottom section with content type and open button */}
        <View className="flex-row items-center justify-between mt-auto">
          {/* Content type chip */}
          <View className="flex-row items-center gap-1">
            <ContentTypeIcon contentType={bookmark.contentType} size={14} />
            <Text className={`text-xs px-2 py-1 rounded-full ${getContentTypeColor(bookmark.contentType)}`}>
              {bookmark.contentType || 'link'}
            </Text>
          </View>
          
          {/* Open link button */}
          <TouchableOpacity
            onPress={handleOpenLink}
            className="flex-row items-center gap-1 px-2 py-1 rounded-md bg-gray-100 active:bg-gray-200"
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <ExternalLinkIcon size={14} color="#4B5563" />
            <Text className="text-xs text-gray-600">Open</Text>
          </TouchableOpacity>
        </View>
      </Card>
    </Pressable>
  );
}, (prevProps, nextProps) => {
  // Custom comparison for better performance
  return prevProps.bookmark.id === nextProps.bookmark.id &&
         prevProps.bookmark.updatedAt === nextProps.bookmark.updatedAt &&
         prevProps.enableHaptics === nextProps.enableHaptics;
});

OptimizedCompactBookmarkCard.displayName = 'OptimizedCompactBookmarkCard';