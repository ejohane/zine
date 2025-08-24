import { H3, Paragraph, XStack, YStack, Image } from 'tamagui'
import { Card } from '../ui/Card'
import { Button } from '../ui/Button'
import { Badge } from '../ui/Badge'
import { Bookmark, Share2, ExternalLink } from '@tamagui/lucide-icons'
import { Share } from 'react-native'

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
  
  return (
    <Card 
      variant="elevated" 
      fullWidth
      onPress={onPress}
      animation="quick"
      hoverStyle={{ scale: 0.99 }}
      pressStyle={{ scale: 0.97 }}
      marginBottom="$3"
    >
      <XStack gap="$3">
        {bookmark.imageUrl && (
          <Image 
            source={{ uri: bookmark.imageUrl }}
            width={80}
            height={80}
            borderRadius="$2"
          />
        )}
        
        <YStack flex={1} gap="$2">
          <H3 size="$5" numberOfLines={2}>
            {bookmark.title}
          </H3>
          
          {bookmark.description && (
            <Paragraph size="$3" color="$colorTransparent" numberOfLines={2}>
              {bookmark.description}
            </Paragraph>
          )}
          
          <XStack gap="$2" alignItems="center" flexWrap="wrap">
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
            
            <Paragraph size="$2" color="$colorTransparent">
              • {new Date(bookmark.createdAt).toLocaleDateString()}
            </Paragraph>
          </XStack>
          
          {bookmark.tags && bookmark.tags.length > 0 && (
            <XStack gap="$2" flexWrap="wrap">
              {bookmark.tags.map((tag) => (
                <Badge key={tag} variant="secondary" size="sm">
                  {tag}
                </Badge>
              ))}
            </XStack>
          )}
        </YStack>
      </XStack>
      
      <Card.Footer padded paddingTop="$3">
        <XStack gap="$2" justifyContent="flex-end">
          <Button 
            size="sm" 
            variant={bookmark.isBookmarked ? 'primary' : 'outlined'}
            icon={Bookmark} 
            onPress={handleBookmark}
          >
            {bookmark.isBookmarked ? 'Saved' : 'Save'}
          </Button>
          
          <Button 
            size="sm" 
            variant="ghost" 
            icon={Share2} 
            onPress={handleShare}
          >
            Share
          </Button>
          
          <Button 
            size="sm" 
            variant="ghost" 
            icon={ExternalLink} 
            onPress={() => {}}
          >
            Open
          </Button>
        </XStack>
      </Card.Footer>
    </Card>
  )
}