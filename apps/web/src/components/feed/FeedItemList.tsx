import { useState } from 'react'
import { FeedItemCard } from './FeedItemCard'
import { Button } from '../ui/button'
import { Card, CardContent } from '../ui/card'

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

interface FeedItemWithState {
  id: string
  feedItem: FeedItem
  isRead: boolean
  readAt?: Date
  bookmarkId?: number
  createdAt: Date
}

interface FeedItemListProps {
  items: FeedItemWithState[]
  isLoading?: boolean
  error?: string | null
  onMarkRead?: (itemId: string) => void
  onMarkUnread?: (itemId: string) => void
  onSaveToBookmarks?: (feedItem: FeedItem) => void
  onLoadMore?: () => void
  hasMore?: boolean
  isLoadingMore?: boolean
  emptyTitle?: string
  emptyDescription?: string
  emptyActionText?: string
  onEmptyAction?: () => void
  compact?: boolean
  showUnreadOnly?: boolean
  onToggleUnreadOnly?: (unreadOnly: boolean) => void
}

export function FeedItemList({
  items,
  isLoading = false,
  error = null,
  onMarkRead,
  onMarkUnread,
  onSaveToBookmarks,
  onLoadMore,
  hasMore = false,
  isLoadingMore = false,
  emptyTitle = "No items to show",
  emptyDescription = "Check back later for new content from your subscriptions.",
  emptyActionText = "Manage Subscriptions",
  onEmptyAction,
  compact = false,
  showUnreadOnly = false,
  onToggleUnreadOnly
}: FeedItemListProps) {
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set())
  
  const handleItemOpen = (url: string) => {
    window.open(url, '_blank', 'noopener,noreferrer')
  }
  
  const toggleItemExpanded = (itemId: string) => {
    setExpandedItems(prev => {
      const newSet = new Set(prev)
      if (newSet.has(itemId)) {
        newSet.delete(itemId)
      } else {
        newSet.add(itemId)
      }
      return newSet
    })
  }

  // Loading state
  if (isLoading) {
    return (
      <div className="space-y-4">
        {/* Filter controls skeleton */}
        {onToggleUnreadOnly && (
          <div className="flex items-center justify-between">
            <div className="h-4 bg-gray-200 rounded w-24 animate-pulse"></div>
            <div className="h-8 bg-gray-200 rounded w-32 animate-pulse"></div>
          </div>
        )}
        
        {/* Item skeletons */}
        {Array.from({ length: 3 }, (_, i) => (
          <Card key={i} className="animate-pulse">
            <CardContent className={compact ? "p-4" : "p-6"}>
              <div className="flex gap-4">
                <div className={`bg-gray-200 rounded-lg flex-shrink-0 ${
                  compact ? "w-16 h-16" : "w-24 h-24 sm:w-32 sm:h-32"
                }`}></div>
                <div className="flex-1 space-y-2">
                  <div className="h-4 bg-gray-200 rounded w-3/4"></div>
                  <div className="h-3 bg-gray-200 rounded w-1/2"></div>
                  <div className="h-3 bg-gray-200 rounded w-full"></div>
                  <div className="flex gap-2 mt-4">
                    <div className="h-8 bg-gray-200 rounded w-16"></div>
                    <div className="h-8 bg-gray-200 rounded w-16"></div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    )
  }

  // Error state
  if (error) {
    return (
      <Card className="border-red-200 bg-red-50">
        <CardContent className="p-6 text-center">
          <div className="text-red-600 mb-4">
            <span className="text-2xl">⚠️</span>
          </div>
          <h3 className="font-semibold text-red-900 mb-2">Failed to load feed</h3>
          <p className="text-red-700 text-sm mb-4">{error}</p>
          <Button
            variant="outline"
            onClick={() => window.location.reload()}
            className="border-red-300 text-red-700 hover:bg-red-100"
          >
            Try Again
          </Button>
        </CardContent>
      </Card>
    )
  }

  const unreadCount = items.filter(item => !item.isRead).length
  const totalCount = items.length

  return (
    <div className="space-y-4">
      {/* Filter and stats */}
      {onToggleUnreadOnly && totalCount > 0 && (
        <div className="flex items-center justify-between">
          <div className="text-sm text-gray-600">
            {showUnreadOnly 
              ? `${unreadCount} unread items` 
              : `${totalCount} items (${unreadCount} unread)`
            }
          </div>
          
          <div className="flex items-center gap-2">
            <Button
              variant={showUnreadOnly ? "default" : "outline"}
              size="sm"
              onClick={() => onToggleUnreadOnly(!showUnreadOnly)}
            >
              {showUnreadOnly ? "Show All" : "Unread Only"}
            </Button>
          </div>
        </div>
      )}

      {/* Empty state */}
      {items.length === 0 && (
        <Card>
          <CardContent className="p-8 text-center">
            <div className="text-gray-400 mb-4">
              <span className="text-4xl">📭</span>
            </div>
            <h3 className="font-semibold text-gray-900 mb-2">{emptyTitle}</h3>
            <p className="text-gray-600 text-sm mb-4">{emptyDescription}</p>
            {onEmptyAction && (
              <Button variant="outline" onClick={onEmptyAction}>
                {emptyActionText}
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {/* Feed items */}
      <div className="space-y-4">
        {items.map((item) => (
          <FeedItemCard
            key={item.id}
            item={item}
            onMarkRead={onMarkRead}
            onMarkUnread={onMarkUnread}
            onSaveToBookmarks={onSaveToBookmarks}
            onOpen={handleItemOpen}
            compact={compact}
          />
        ))}
      </div>

      {/* Load more */}
      {hasMore && (
        <div className="text-center pt-4">
          <Button
            variant="outline"
            onClick={onLoadMore}
            disabled={isLoadingMore}
            className="min-w-32"
          >
            {isLoadingMore ? (
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin"></div>
                Loading...
              </div>
            ) : (
              "Load More"
            )}
          </Button>
        </div>
      )}

      {/* All caught up message */}
      {!hasMore && items.length > 0 && (
        <Card className="bg-green-50 border-green-200">
          <CardContent className="p-4 text-center">
            <div className="text-green-600 mb-2">
              <span className="text-xl">🎉</span>
            </div>
            <p className="text-green-800 font-medium text-sm">
              You're all caught up!
            </p>
            <p className="text-green-700 text-xs mt-1">
              Check back later for new content from your subscriptions.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}