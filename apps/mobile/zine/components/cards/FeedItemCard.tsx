import React from 'react'
import { View, Text, Image } from 'react-native'
import { Card, Button, Badge } from '@zine/ui'
import { Play, Bookmark, MoreVertical, Clock } from 'lucide-react-native'

interface FeedItemCardProps {
  item: {
    id: string
    title: string
    description?: string
    imageUrl?: string
    source: string
    platform: 'spotify' | 'youtube' | 'apple' | 'default'
    duration?: string
    publishedAt: string
    isPlayed?: boolean
    isBookmarked?: boolean
    episodeNumber?: string
    contentType: 'podcast' | 'video' | 'article'
  }
  onPress?: () => void
  onPlay?: (id: string) => void
  onBookmark?: (id: string) => void
  onMore?: (id: string) => void
}

export function FeedItemCard({ item, onPress, onPlay, onBookmark, onMore }: FeedItemCardProps) {
  const handlePlay = () => {
    if (onPlay) {
      onPlay(item.id)
    }
  }
  
  const handleBookmark = () => {
    if (onBookmark) {
      onBookmark(item.id)
    }
  }
  
  const handleMore = () => {
    if (onMore) {
      onMore(item.id)
    }
  }
  
  return (
    <Card 
      variant="elevated" 
      fullWidth
      onPress={onPress}
      pressable
      className="mb-3"
      style={{ opacity: item.isPlayed ? 0.7 : 1 }}
    >
      <View className="flex-row gap-3">
        {item.imageUrl && (
          <View className="relative">
            <Image 
              source={{ uri: item.imageUrl }}
              className="w-24 h-24 rounded-md"
            />
            {item.contentType !== 'article' && (
              <View className="absolute bottom-0 left-0 right-0 bg-black/70 p-1 rounded-b-md">
                <View className="flex-row items-center justify-center gap-1">
                  <Clock size={12} color="white" />
                  <Text className="text-xs text-white">
                    {item.duration || '00:00'}
                  </Text>
                </View>
              </View>
            )}
          </View>
        )}
        
        <View className="flex-1 gap-2">
          <View className="flex-row gap-2 items-center">
            <Badge variant={item.platform} size="sm">
              {item.source}
            </Badge>
            {item.episodeNumber && (
              <Text className="text-xs text-gray-500">
                Ep. {item.episodeNumber}
              </Text>
            )}
            {item.isPlayed && (
              <Badge variant="success" size="sm">
                Played
              </Badge>
            )}
          </View>
          
          <Text className="text-base font-semibold text-gray-900" numberOfLines={2}>
            {item.title}
          </Text>
          
          {item.description && (
            <Text className="text-xs text-gray-500" numberOfLines={2}>
              {item.description}
            </Text>
          )}
          
          <Text className="text-xs text-gray-500">
            {new Date(item.publishedAt).toLocaleDateString()}
          </Text>
        </View>
      </View>
      
      <Card.Footer className="pt-3">
        <View className="flex-row justify-between">
          <View className="flex-row gap-2">
            {item.contentType !== 'article' && (
              <Button 
                size="sm" 
                variant="primary"
                icon={Play} 
                onPress={handlePlay}
              >
                Play
              </Button>
            )}
            
            <Button 
              size="sm" 
              variant={item.isBookmarked ? 'secondary' : 'outlined'}
              icon={Bookmark} 
              onPress={handleBookmark}
            />
          </View>
          
          <Button 
            size="sm" 
            variant="ghost" 
            icon={MoreVertical} 
            onPress={handleMore}
          />
        </View>
      </Card.Footer>
    </Card>
  )
}