import { H4, Paragraph, XStack, YStack, Image } from 'tamagui'
import { Card } from '../ui/Card'
import { Button } from '../ui/Button'
import { Badge } from '../ui/Badge'
import { Play, Bookmark, MoreVertical, Clock } from '@tamagui/lucide-icons'

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
      animation="quick"
      hoverStyle={{ scale: 0.99 }}
      pressStyle={{ scale: 0.97 }}
      marginBottom="$3"
      opacity={item.isPlayed ? 0.7 : 1}
    >
      <XStack gap="$3">
        {item.imageUrl && (
          <YStack position="relative">
            <Image 
              source={{ uri: item.imageUrl }}
              width={100}
              height={100}
              borderRadius="$2"
            />
            {item.contentType !== 'article' && (
              <YStack
                position="absolute"
                bottom={0}
                left={0}
                right={0}
                backgroundColor="rgba(0,0,0,0.7)"
                padding="$1"
                borderBottomLeftRadius="$2"
                borderBottomRightRadius="$2"
              >
                <XStack alignItems="center" justifyContent="center" gap="$1">
                  <Clock size={12} color="white" />
                  <Paragraph size="$1" color="white">
                    {item.duration || '00:00'}
                  </Paragraph>
                </XStack>
              </YStack>
            )}
          </YStack>
        )}
        
        <YStack flex={1} gap="$2">
          <XStack gap="$2" alignItems="center">
            <Badge variant={item.platform} size="sm">
              {item.source}
            </Badge>
            {item.episodeNumber && (
              <Paragraph size="$2" color="$colorTransparent">
                Ep. {item.episodeNumber}
              </Paragraph>
            )}
            {item.isPlayed && (
              <Badge variant="success" size="sm">
                Played
              </Badge>
            )}
          </XStack>
          
          <H4 size="$4" numberOfLines={2}>
            {item.title}
          </H4>
          
          {item.description && (
            <Paragraph size="$2" color="$colorTransparent" numberOfLines={2}>
              {item.description}
            </Paragraph>
          )}
          
          <Paragraph size="$1" color="$colorTransparent">
            {new Date(item.publishedAt).toLocaleDateString()}
          </Paragraph>
        </YStack>
      </XStack>
      
      <Card.Footer padded paddingTop="$3">
        <XStack gap="$2" justifyContent="space-between">
          <XStack gap="$2">
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
          </XStack>
          
          <Button 
            size="sm" 
            variant="ghost" 
            icon={MoreVertical} 
            onPress={handleMore}
          />
        </XStack>
      </Card.Footer>
    </Card>
  )
}