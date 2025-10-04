// @ts-nocheck
import * as React from 'react';
import { View, Text, TouchableOpacity, Pressable, Image } from 'react-native';
import { Card, Chip, Button } from 'heroui-native';
import { useRouter } from 'expo-router';
import * as Linking from 'expo-linking';
import type { Bookmark } from '@zine/shared';
import { formatRelativeTime } from '../lib/dateUtils';
import { PlatformIcon, ContentTypeIcon, ExternalLinkIcon } from '../lib/platformIcons';

interface CompactBookmarkCardProps {
  bookmark: Bookmark;
  onPress?: () => void;
  onLongPress?: () => void;
}

export function CompactBookmarkCard({ 
  bookmark, 
  onPress,
  onLongPress 
}: CompactBookmarkCardProps) {
  const router = useRouter();
  
  // Handle card press - navigate to detail view
  const handlePress = () => {
    if (onPress) {
      onPress();
    } else {
      // Navigate to bookmark detail screen
      router.push(`/bookmark/${bookmark.id}`);
    }
  };
  
  // Handle open link button press - open in external browser
  const handleOpenLink = async () => {
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
  };
  
  // Get content type badge color
  const getContentTypeColor = (type?: string) => {
    switch (type) {
      case 'video': return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200';
      case 'podcast': return 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200';
      case 'article': return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200';
      case 'post': return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200';
      case 'link': 
      default: return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200';
    }
  };
  
  return (
    <Pressable
      onPress={handlePress}
      onLongPress={onLongPress}
      className="active:opacity-80"
    >
      <Card className="p-4 bg-white dark:bg-gray-900">
        {/* Header with author info */}
        <View className="flex-row items-center mb-3">
          {bookmark.creator?.avatarUrl ? (
            <Image
              source={{ uri: bookmark.creator.avatarUrl }}
              style={{ width: 32, height: 32, borderRadius: 16 }}
              onError={() => {}}
            />
          ) : null}
          <View className={bookmark.creator?.avatarUrl ? "ml-2 flex-1" : "flex-1"}>
            {bookmark.creator?.name && (
              <Text className="text-sm font-medium text-gray-900 dark:text-gray-100" numberOfLines={1}>
                {bookmark.creator.name}
              </Text>
            )}
          </View>
        </View>
        
        {/* Title - truncated to 2 lines */}
        <Text 
          className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-2"
          numberOfLines={2}
          ellipsizeMode="tail"
        >
          {bookmark.title}
        </Text>
        
        {/* Bottom section with content type and open button */}
        <View className="flex-row items-center justify-between mt-2">
          {/* Content type chip */}
          <View className="flex-row items-center gap-1.5">
            <ContentTypeIcon contentType={bookmark.contentType} size={16} />
            <Text className="text-xs text-gray-600 dark:text-gray-400">
              {bookmark.contentType || 'link'}
            </Text>
          </View>
          
          {/* Open link button */}
          <TouchableOpacity
            onPress={handleOpenLink}
            className="flex-row items-center gap-1.5 px-3 py-1.5 rounded-md bg-gray-100 active:bg-gray-200 dark:bg-gray-800 dark:active:bg-gray-700"
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <ExternalLinkIcon size={16} color="#6B7280" />
            <Text className="text-sm text-gray-700 dark:text-gray-300">Open</Text>
          </TouchableOpacity>
        </View>
      </Card>
    </Pressable>
  );
}

// Memoized version for better performance in lists
export const MemoizedCompactBookmarkCard = React.memo(CompactBookmarkCard);