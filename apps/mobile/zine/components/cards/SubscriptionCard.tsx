import React from 'react'
import { View, Text, Image } from 'react-native'
import { Card, Button, Badge } from '@zine/ui'
import { CheckCircle, PlusCircle, RefreshCw } from 'lucide-react-native'

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
      pressable
      className="mb-3"
    >
      <View className="flex-row gap-3 items-center">
        {subscription.imageUrl && (
          <Image 
            source={{ uri: subscription.imageUrl }}
            className="w-16 h-16 rounded-md"
          />
        )}
        
        <View className="flex-1 gap-2">
          <View className="flex-row gap-2 items-center">
            <Badge variant={subscription.platform} size="sm">
              {subscription.platform.charAt(0).toUpperCase() + subscription.platform.slice(1)}
            </Badge>
            {subscription.category && (
              <Badge variant="secondary" size="sm">
                {subscription.category}
              </Badge>
            )}
            {subscription.isSubscribed && (
              <CheckCircle size={16} color="#10B981" />
            )}
          </View>
          
          <Text className="text-base font-semibold text-gray-900" numberOfLines={1}>
            {subscription.name}
          </Text>
          
          {subscription.description && (
            <Text className="text-xs text-gray-500" numberOfLines={2}>
              {subscription.description}
            </Text>
          )}
          
          <View className="flex-row gap-3 items-center">
            {subscription.subscriberCount && (
              <Text className="text-xs text-gray-500">
                {subscription.subscriberCount.toLocaleString()} subscribers
              </Text>
            )}
            {subscription.episodeCount && (
              <Text className="text-xs text-gray-500">
                {subscription.episodeCount} episodes
              </Text>
            )}
            {subscription.lastUpdated && (
              <Text className="text-xs text-gray-500">
                Updated {new Date(subscription.lastUpdated).toLocaleDateString()}
              </Text>
            )}
          </View>
        </View>
      </View>
      
      <Card.Footer className="pt-3">
        <View className="flex-row justify-between">
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
        </View>
      </Card.Footer>
    </Card>
  )
}