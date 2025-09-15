// @ts-nocheck
import * as React from 'react';
import { View, Text, TouchableOpacity, Pressable } from 'react-native';
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
      case 'video': return 'bg-red-100 text-red-800';
      case 'podcast': return 'bg-purple-100 text-purple-800';
      case 'article': return 'bg-blue-100 text-blue-800';
      case 'post': return 'bg-green-100 text-green-800';
      case 'link': 
      default: return 'bg-gray-100 text-gray-800';
    }
  };
  
  return (
    <Pressable
      onPress={handlePress}
      onLongPress={onLongPress}
      className="active:opacity-80"
    >
      <Card className="w-[280px] h-[140px] p-3 mr-3">
        {/* Header with platform icon and time */}
        <View className="flex-row items-center justify-between mb-2">
          <View className="flex-row items-center gap-2">
            <PlatformIcon source={bookmark.source} size={18} />
            <Text className="text-xs text-gray-500">
              {formatRelativeTime(bookmark.createdAt)}
            </Text>
          </View>
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
}

// Memoized version for better performance in lists
export const MemoizedCompactBookmarkCard = React.memo(CompactBookmarkCard);