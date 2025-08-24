import { H4, Paragraph, XStack, YStack, Image } from 'tamagui'
import { Card } from '../ui/Card'
import { Button } from '../ui/Button'
import { Badge } from '../ui/Badge'
import { CheckCircle, PlusCircle, RefreshCw } from '@tamagui/lucide-icons'

interface SubscriptionCardProps {
  subscription: {
    id: string
    name: string
    description?: string
    imageUrl?: string
    platform: 'spotify' | 'youtube' | 'apple' | 'default'
    subscriberCount?: number
    episodeCount?: number
    lastUpdated?: string
    isSubscribed?: boolean
    category?: string
  }
  onPress?: () => void
  onSubscribe?: (id: string) => void
  onRefresh?: (id: string) => void
}

export function SubscriptionCard({ subscription, onPress, onSubscribe, onRefresh }: SubscriptionCardProps) {
  const handleSubscribe = () => {
    if (onSubscribe) {
      onSubscribe(subscription.id)
    }
  }
  
  const handleRefresh = () => {
    if (onRefresh) {
      onRefresh(subscription.id)
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
      <XStack gap="$3" alignItems="center">
        {subscription.imageUrl && (
          <Image 
            source={{ uri: subscription.imageUrl }}
            width={60}
            height={60}
            borderRadius="$2"
          />
        )}
        
        <YStack flex={1} gap="$2">
          <XStack gap="$2" alignItems="center">
            <Badge variant={subscription.platform} size="sm">
              {subscription.platform.charAt(0).toUpperCase() + subscription.platform.slice(1)}
            </Badge>
            {subscription.category && (
              <Badge variant="secondary" size="sm">
                {subscription.category}
              </Badge>
            )}
            {subscription.isSubscribed && (
              <CheckCircle size={16} color="$success" />
            )}
          </XStack>
          
          <H4 size="$4" numberOfLines={1}>
            {subscription.name}
          </H4>
          
          {subscription.description && (
            <Paragraph size="$2" color="$colorTransparent" numberOfLines={2}>
              {subscription.description}
            </Paragraph>
          )}
          
          <XStack gap="$3" alignItems="center">
            {subscription.subscriberCount && (
              <Paragraph size="$1" color="$colorTransparent">
                {subscription.subscriberCount.toLocaleString()} subscribers
              </Paragraph>
            )}
            {subscription.episodeCount && (
              <Paragraph size="$1" color="$colorTransparent">
                {subscription.episodeCount} episodes
              </Paragraph>
            )}
            {subscription.lastUpdated && (
              <Paragraph size="$1" color="$colorTransparent">
                Updated {new Date(subscription.lastUpdated).toLocaleDateString()}
              </Paragraph>
            )}
          </XStack>
        </YStack>
      </XStack>
      
      <Card.Footer padded paddingTop="$3">
        <XStack gap="$2" justifyContent="space-between">
          <Button 
            size="sm" 
            variant={subscription.isSubscribed ? 'secondary' : 'primary'}
            icon={subscription.isSubscribed ? CheckCircle : PlusCircle} 
            onPress={handleSubscribe}
          >
            {subscription.isSubscribed ? 'Subscribed' : 'Subscribe'}
          </Button>
          
          {subscription.isSubscribed && (
            <Button 
              size="sm" 
              variant="ghost" 
              icon={RefreshCw} 
              onPress={handleRefresh}
            >
              Refresh
            </Button>
          )}
        </XStack>
      </Card.Footer>
    </Card>
  )
}