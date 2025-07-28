import { useState } from 'react'
import { Button } from '../ui/button'
import { Card, CardContent } from '../ui/card'
import { Badge } from '../ui/badge'

interface FeedItem {
  id: string
  title: string
  description?: string
  thumbnailUrl?: string
  publishedAt: Date
  durationSeconds?: number
  externalUrl: string
  subscription: {
    id: string
    title: string
    creatorName: string
    thumbnailUrl?: string
    providerId: string
  }
}

interface FeedItemCardProps {
  item: {
    id: string
    feedItem: FeedItem
    isRead: boolean
    readAt?: Date
    bookmarkId?: number
    createdAt: Date
  }
  onMarkRead?: (itemId: string) => void
  onMarkUnread?: (itemId: string) => void
  onSaveToBookmarks?: (feedItem: FeedItem) => void
  onOpen?: (url: string) => void
  compact?: boolean
}

export function FeedItemCard({ 
  item, 
  onMarkRead, 
  onMarkUnread, 
  onSaveToBookmarks, 
  onOpen,
  compact = false 
}: FeedItemCardProps) {
  const [imageError, setImageError] = useState(false)
  const [subscriptionImageError, setSubscriptionImageError] = useState(false)
  
  const { feedItem, isRead, bookmarkId } = item
  
  const formatDuration = (seconds: number): string => {
    const hours = Math.floor(seconds / 3600)
    const minutes = Math.floor((seconds % 3600) / 60)
    
    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, '0')}:${(seconds % 60).toString().padStart(2, '0')}`
    }
    return `${minutes}:${(seconds % 60).toString().padStart(2, '0')}`
  }
  
  const formatTimeAgo = (date: Date): string => {
    const now = new Date()
    const diffInMinutes = Math.floor((now.getTime() - date.getTime()) / (1000 * 60))
    
    if (diffInMinutes < 60) {
      return `${diffInMinutes}m ago`
    }
    
    const diffInHours = Math.floor(diffInMinutes / 60)
    if (diffInHours < 24) {
      return `${diffInHours}h ago`
    }
    
    const diffInDays = Math.floor(diffInHours / 24)
    if (diffInDays < 7) {
      return `${diffInDays}d ago`
    }
    
    return date.toLocaleDateString()
  }
  
  const getProviderIcon = (providerId: string) => {
    switch (providerId) {
      case 'spotify': return '🎧'
      case 'youtube': return '📺'
      default: return '📰'
    }
  }
  
  const handleToggleRead = () => {
    if (isRead) {
      onMarkUnread?.(item.id)
    } else {
      onMarkRead?.(item.id)
    }
  }
  
  const handleSave = () => {
    onSaveToBookmarks?.(feedItem)
  }
  
  const handleOpen = () => {
    onOpen?.(feedItem.externalUrl)
    // Auto-mark as read when opened
    if (!isRead) {
      onMarkRead?.(item.id)
    }
  }

  if (compact) {
    return (
      <Card className={`transition-all hover:shadow-md ${isRead ? 'opacity-75' : ''}`}>
        <CardContent className="p-4">
          <div className="flex gap-3">
            {/* Thumbnail */}
            {feedItem.thumbnailUrl && !imageError && (
              <div className="flex-shrink-0">
                <img
                  src={feedItem.thumbnailUrl}
                  alt={feedItem.title}
                  className="w-16 h-16 object-cover rounded-md"
                  onError={() => setImageError(true)}
                />
              </div>
            )}
            
            {/* Content */}
            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-2">
                <h3 className={`font-medium text-sm line-clamp-2 ${isRead ? 'text-gray-600' : 'text-gray-900'}`}>
                  {feedItem.title}
                </h3>
                {!isRead && (
                  <div className="w-2 h-2 bg-blue-500 rounded-full flex-shrink-0 mt-1"></div>
                )}
              </div>
              
              <div className="flex items-center gap-2 mt-1 text-xs text-gray-500">
                <span>{feedItem.subscription.creatorName}</span>
                <span>•</span>
                <span>{formatTimeAgo(feedItem.publishedAt)}</span>
                {feedItem.durationSeconds && (
                  <>
                    <span>•</span>
                    <span>{formatDuration(feedItem.durationSeconds)}</span>
                  </>
                )}
              </div>
              
              {/* Actions */}
              <div className="flex items-center gap-1 mt-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleOpen}
                  className="h-6 px-2 text-xs"
                >
                  Open
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleToggleRead}
                  className="h-6 px-2 text-xs"
                >
                  {isRead ? 'Unread' : 'Read'}
                </Button>
                {!bookmarkId && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleSave}
                    className="h-6 px-2 text-xs"
                  >
                    Save
                  </Button>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className={`transition-all hover:shadow-md ${isRead ? 'opacity-75' : ''}`}>
      <CardContent className="p-6">
        <div className="space-y-4">
          {/* Header with subscription info */}
          <div className="flex items-center gap-3">
            {/* Subscription avatar */}
            <div className="w-8 h-8 rounded-full overflow-hidden bg-gray-100">
              {feedItem.subscription.thumbnailUrl && !subscriptionImageError ? (
                <img
                  src={feedItem.subscription.thumbnailUrl}
                  alt={feedItem.subscription.title}
                  className="w-full h-full object-cover"
                  onError={() => setSubscriptionImageError(true)}
                />
              ) : (
                <div className="w-full h-full bg-gray-200 flex items-center justify-center text-xs">
                  {getProviderIcon(feedItem.subscription.providerId)}
                </div>
              )}
            </div>
            
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 truncate">
                {feedItem.subscription.creatorName}
              </p>
              <p className="text-xs text-gray-500">
                {formatTimeAgo(feedItem.publishedAt)}
              </p>
            </div>
            
            {/* Provider badge */}
            <Badge variant="secondary" className="text-xs">
              {getProviderIcon(feedItem.subscription.providerId)} {feedItem.subscription.providerId}
            </Badge>
            
            {/* Unread indicator */}
            {!isRead && (
              <div className="w-3 h-3 bg-blue-500 rounded-full"></div>
            )}
          </div>
          
          {/* Main content */}
          <div className="flex gap-4">
            {/* Thumbnail */}
            {feedItem.thumbnailUrl && !imageError && (
              <div className="flex-shrink-0">
                <img
                  src={feedItem.thumbnailUrl}
                  alt={feedItem.title}
                  className="w-24 h-24 sm:w-32 sm:h-32 object-cover rounded-lg"
                  onError={() => setImageError(true)}
                />
              </div>
            )}
            
            {/* Text content */}
            <div className="flex-1 min-w-0">
              <h3 className={`font-semibold text-lg line-clamp-2 mb-2 ${
                isRead ? 'text-gray-600' : 'text-gray-900'
              }`}>
                {feedItem.title}
              </h3>
              
              {feedItem.description && (
                <p className="text-gray-600 text-sm line-clamp-3 mb-3">
                  {feedItem.description}
                </p>
              )}
              
              {/* Metadata */}
              <div className="flex flex-wrap gap-3 text-xs text-gray-500 mb-3">
                {feedItem.durationSeconds && (
                  <div className="flex items-center gap-1">
                    <span>⏱️</span>
                    <span>{formatDuration(feedItem.durationSeconds)}</span>
                  </div>
                )}
                <div className="flex items-center gap-1">
                  <span>📅</span>
                  <span>{feedItem.publishedAt.toLocaleDateString()}</span>
                </div>
              </div>
            </div>
          </div>
          
          {/* Actions */}
          <div className="flex items-center justify-between pt-2 border-t">
            <div className="flex items-center gap-2">
              <Button
                variant="default"
                size="sm"
                onClick={handleOpen}
                className="flex items-center gap-2"
              >
                <span>🔗</span>
                Open
              </Button>
              
              <Button
                variant="outline"
                size="sm"
                onClick={handleToggleRead}
                className="flex items-center gap-2"
              >
                <span>{isRead ? '👁️' : '✓'}</span>
                {isRead ? 'Mark Unread' : 'Mark Read'}
              </Button>
              
              {!bookmarkId ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleSave}
                  className="flex items-center gap-2"
                >
                  <span>🔖</span>
                  Save to Zine
                </Button>
              ) : (
                <Badge variant="secondary" className="text-xs">
                  <span>✅</span>
                  Saved
                </Badge>
              )}
            </div>
            
            {/* Read status */}
            {isRead && item.readAt && (
              <p className="text-xs text-gray-500">
                Read {formatTimeAgo(item.readAt)}
              </p>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}