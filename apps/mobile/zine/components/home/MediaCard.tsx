import React from 'react'
import { View, Text, Image, Pressable } from 'react-native'
import { Play, Headphones, FileText } from 'lucide-react-native'

interface MediaCardProps {
  title: string;
  creator?: string;
  thumbnailUrl?: string;
  contentType: 'video' | 'podcast' | 'article';
  duration?: string;
  onPress: () => void;
}

export function MediaCard({ 
  title, 
  creator, 
  thumbnailUrl, 
  contentType, 
  duration,
  onPress 
}: MediaCardProps) {
  const getContentIcon = () => {
    switch (contentType) {
      case 'video':
        return <Play size={20} color="white" />;
      case 'podcast':
        return <Headphones size={20} color="white" />;
      case 'article':
        return <FileText size={20} color="white" />;
    }
  };

  const getContentColor = () => {
    switch (contentType) {
      case 'video':
        return 'bg-red-600'; // YouTube red
      case 'podcast':
        return 'bg-green-600'; // Spotify green
      case 'article':
        return 'bg-blue-500'; // Blue for articles
    }
  };

  const getContentBadgeColor = () => {
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
          className="w-72 bg-white rounded-xl overflow-hidden shadow-md"
          style={{
            transform: [{ scale: pressed ? 0.98 : 1 }]
          }}
        >
          {/* Thumbnail */}
          <View className="h-40 relative">
            {thumbnailUrl ? (
              <Image
                source={{ uri: thumbnailUrl }}
                className="w-full h-full"
              />
            ) : (
              <View
                className={`w-full h-full ${getContentColor()} opacity-90 items-center justify-center`}
              >
                {getContentIcon()}
              </View>
            )}
            
            {/* Content type badge */}
            <View
              className={`absolute top-2 right-2 ${getContentBadgeColor()} px-2 py-1 rounded-md`}
            >
              <Text className="text-xs text-white font-semibold uppercase">
                {contentType}
              </Text>
            </View>

            {/* Duration badge */}
            {duration && (
              <View
                className="absolute bottom-2 right-2 bg-black/80 px-2 py-1 rounded-md"
              >
                <Text className="text-xs text-white">
                  {duration}
                </Text>
              </View>
            )}
          </View>

          {/* Content */}
          <View className="p-3">
            <Text 
              className="text-sm font-semibold text-black mb-1"
              numberOfLines={2}
            >
              {title}
            </Text>
            {creator && (
              <Text className="text-xs text-gray-500">
                {creator}
              </Text>
            )}
          </View>
        </View>
      )}
    </Pressable>
  );
}