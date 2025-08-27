import React from 'react'
import { View, Text, Image, Pressable } from 'react-native'
import { Play, Headphones, FileText } from 'lucide-react-native'

interface MinimalItemCardProps {
  title: string;
  creator?: string;
  thumbnailUrl?: string;
  contentType: 'video' | 'podcast' | 'article';
  duration?: string;
  onPress: () => void;
}

export function MinimalItemCard({ 
  title, 
  creator, 
  thumbnailUrl, 
  contentType,
  duration,
  onPress 
}: MinimalItemCardProps) {
  const getContentIcon = () => {
    switch (contentType) {
      case 'video':
        return <Play size={14} color="white" />;
      case 'podcast':
        return <Headphones size={14} color="white" />;
      case 'article':
        return <FileText size={14} color="white" />;
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
          className={`${pressed ? 'bg-gray-50' : 'bg-white'} rounded-lg p-3 flex-row items-center gap-3 shadow-sm border border-gray-100`}
        >
          {/* Thumbnail */}
          {thumbnailUrl ? (
            <Image
              source={{ uri: thumbnailUrl }}
              className="w-12 h-12 rounded-md"
            />
          ) : (
            <View
              className={`w-12 h-12 rounded-md ${getContentColor()} opacity-90 items-center justify-center`}
            >
              {getContentIcon()}
            </View>
          )}

          {/* Content */}
          <View className="flex-1 gap-0.5">
            <Text 
              className="text-sm font-medium text-black"
              numberOfLines={1}
            >
              {title}
            </Text>
            <View className="flex-row gap-1.5 items-center">
              {creator && (
                <Text className="text-xs text-gray-500" numberOfLines={1}>
                  {creator}
                </Text>
              )}
              {duration && (
                <>
                  <Text className="text-xs text-gray-400">•</Text>
                  <Text className="text-xs text-gray-500">
                    {duration}
                  </Text>
                </>
              )}
            </View>
          </View>
        </View>
      )}
    </Pressable>
  );
}