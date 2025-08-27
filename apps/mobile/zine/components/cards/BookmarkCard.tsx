import React from 'react'
import { View, Text, Image, Share, Linking } from 'react-native'
import { Card, Button, Badge } from '@zine/design-system'
import { Bookmark, Share2, ExternalLink } from 'lucide-react-native'

interface BookmarkCardProps {
  bookmark: {
    id: string
    title: string
    description?: string
    url: string
    imageUrl?: string
    source: string
    sourcePlatform?: 'spotify' | 'youtube' | 'apple' | 'default'
    createdAt: string
    tags?: string[]
    isBookmarked?: boolean
  }
  onPress?: () => void
  onBookmark?: (id: string) => void
  onShare?: (bookmark: any) => void
}

export function BookmarkCard({ bookmark, onPress, onBookmark, onShare }: BookmarkCardProps) {
  const handleShare = async () => {
    if (onShare) {
      onShare(bookmark)
    } else {
      try {
        await Share.share({
          message: bookmark.title,
          url: bookmark.url,
        })
      } catch (error) {
        console.error('Error sharing:', error)
      }
    }
  }
  
  const handleBookmark = () => {
    if (onBookmark) {
      onBookmark(bookmark.id)
    }
  }
  
  const handleOpen = () => {
    if (bookmark.url) {
      Linking.openURL(bookmark.url)
    }
  }
  
  return (
    <Card 
      variant="elevated" 
      onPress={onPress}
      interactive
      className="mb-3 w-full"
    >
      <View className="flex-row gap-3">
        {bookmark.imageUrl && (
          <Image 
            source={{ uri: bookmark.imageUrl }}
            className="w-20 h-20 rounded-md"
          />
        )}
        
        <View className="flex-1 gap-2">
          <Text className="text-lg font-semibold text-gray-900" numberOfLines={2}>
            {bookmark.title}
          </Text>
          
          {bookmark.description && (
            <Text className="text-sm text-gray-500" numberOfLines={2}>
              {bookmark.description}
            </Text>
          )}
          
          <View className="flex-row gap-2 items-center flex-wrap">
            {bookmark.sourcePlatform && (
              <Badge variant={bookmark.sourcePlatform} size="sm">
                {bookmark.source}
              </Badge>
            )}
            
            {!bookmark.sourcePlatform && (
              <Badge variant="default" size="sm">
                {bookmark.source}
              </Badge>
            )}
            
            <Text className="text-xs text-gray-500">
              • {new Date(bookmark.createdAt).toLocaleDateString()}
            </Text>
          </View>
          
          {bookmark.tags && bookmark.tags.length > 0 && (
            <View className="flex-row gap-2 flex-wrap">
              {bookmark.tags.map((tag) => (
                <Badge key={tag} variant="secondary" size="sm">
                  {tag}
                </Badge>
              ))}
            </View>
          )}
        </View>
      </View>
      
      <View className="pt-3 border-t border-gray-200">
        <View className="flex-row gap-2 justify-end">
          <Button 
            size="sm" 
            variant={bookmark.isBookmarked ? 'primary' : 'outline'}
            leftIcon={<Bookmark size={16} />} 
            onClick={handleBookmark}
          >
            {bookmark.isBookmarked ? 'Saved' : 'Save'}
          </Button>
          
          <Button 
            size="sm" 
            variant="ghost"
            leftIcon={<Share2 size={16} />} 
            onClick={handleShare}
          >
            Share
          </Button>
          
          {bookmark.url && (
            <Button 
              size="sm" 
              variant="ghost"
              leftIcon={<ExternalLink size={16} />} 
              onClick={handleOpen}
            >
              Open
            </Button>
          )}
        </View>
      </View>
    </Card>
  )
}