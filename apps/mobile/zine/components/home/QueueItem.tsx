import React from 'react'
import { View, Text, Image, Pressable } from 'react-native'
import { Play, Headphones, FileText } from 'lucide-react-native'

interface QueueItemProps {
  title: string;
  creator?: string;
  source?: string;
  thumbnailUrl?: string;
  contentType: 'video' | 'podcast' | 'article';
  onPress: () => void;
}

export function QueueItem({ 
  title, 
  creator, 
  source,
  thumbnailUrl, 
  contentType,
  onPress 
}: QueueItemProps) {
  const getContentIcon = () => {
    switch (contentType) {
      case 'video':
        return <Play size={16} color="white" />;
      case 'podcast':
        return <Headphones size={16} color="white" />;
      case 'article':
        return <FileText size={16} color="white" />;
    }
  };

  const getContentColor = () => {
    switch (contentType) {
      case 'video':
        return 'bg-red-600';
      case 'podcast':
        return 'bg-green-600';
      case 'article':
        return 'bg-blue-500';
    }
  };

  return (
    <Pressable onPress={onPress}>
      {({ pressed }) => (
        <View
          className={`${pressed ? 'bg-gray-50' : 'bg-white'} rounded-lg p-3 flex-row items-center gap-3`}
        >
          {/* Thumbnail */}
          {thumbnailUrl ? (
            <Image
              source={{ uri: thumbnailUrl }}
              className="w-16 h-16 rounded-md"
            />
          ) : (
            <View
              className={`w-16 h-16 rounded-md ${getContentColor()} opacity-90 items-center justify-center`}
            >
              {getContentIcon()}
            </View>
          )}

          {/* Content */}
          <View className="flex-1 gap-1">
            <Text 
              className="text-sm font-medium text-black"
              numberOfLines={1}
            >
              {title}
            </Text>
            <View className="flex-row gap-2 items-center">
              {creator && (
                <Text className="text-xs text-gray-500">
                  {creator}
                </Text>
              )}
              {creator && source && (
                <Text className="text-xs text-gray-500">•</Text>
              )}
              {source && (
                <Text className="text-xs text-gray-500">
                  {source}
                </Text>
              )}
            </View>
          </View>
        </View>
      )}
    </Pressable>
  );
}