import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import { Badge } from '../ui/badge'

interface Subscription {
  id: string
  title: string
  creatorName: string
  thumbnailUrl: string
  providerId: string
  unreadCount: number
  lastUpdated: Date
}

interface SubscriptionAvatarsProps {
  subscriptions: Subscription[]
  selectedSubscriptionId?: string
  onSubscriptionSelect?: (subscriptionId: string | null) => void
}

export function SubscriptionAvatars({ 
  subscriptions, 
  selectedSubscriptionId,
  onSubscriptionSelect 
}: SubscriptionAvatarsProps) {
  const [showAll, setShowAll] = useState(false)
  
  // Sort by last updated (most recent first)
  const sortedSubscriptions = [...subscriptions].sort((a, b) => 
    b.lastUpdated.getTime() - a.lastUpdated.getTime()
  )
  
  // Show first 8 by default, with option to show all
  const displayedSubscriptions = showAll ? sortedSubscriptions : sortedSubscriptions.slice(0, 8)
  const hasMore = sortedSubscriptions.length > 8

  const getProviderIcon = (providerId: string) => {
    switch (providerId) {
      case 'spotify': return '🎧'
      case 'youtube': return '📺'
      default: return '📰'
    }
  }

  const handleAvatarClick = (subscriptionId: string) => {
    if (selectedSubscriptionId === subscriptionId) {
      // If already selected, deselect (show all feeds)
      onSubscriptionSelect?.(null)
    } else {
      onSubscriptionSelect?.(subscriptionId)
    }
  }

  if (subscriptions.length === 0) {
    return (
      <div className="text-center py-8">
        <p className="text-gray-500">No subscriptions yet</p>
        <Link to="/subscriptions" className="text-blue-600 hover:text-blue-800 text-sm">
          Manage your subscriptions
        </Link>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* All Feeds Avatar */}
      <div className="flex items-center gap-4">
        <button
          onClick={() => onSubscriptionSelect?.(null)}
          className={`flex-shrink-0 relative transition-all duration-200 ${
            !selectedSubscriptionId 
              ? 'ring-2 ring-blue-500 ring-offset-2' 
              : 'hover:scale-105'
          }`}
        >
          <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center text-white font-semibold text-lg">
            📱
          </div>
          {/* Total unread count */}
          {subscriptions.some(s => s.unreadCount > 0) && (
            <Badge 
              variant="destructive" 
              className="absolute -top-1 -right-1 h-5 w-5 p-0 flex items-center justify-center text-xs"
            >
              {subscriptions.reduce((total, s) => total + s.unreadCount, 0)}
            </Badge>
          )}
        </button>
        <div className="flex-1 min-w-0">
          <h3 className={`font-medium truncate ${
            !selectedSubscriptionId ? 'text-blue-600' : 'text-gray-900'
          }`}>
            All Feeds
          </h3>
          <p className="text-sm text-gray-500">
            {subscriptions.reduce((total, s) => total + s.unreadCount, 0)} unread items
          </p>
        </div>
      </div>

      {/* Stories-style horizontal scroll */}
      <div className="relative">
        <div className="flex gap-4 overflow-x-auto pb-2 scrollbar-hide">
          {displayedSubscriptions.map((subscription) => (
            <button
              key={subscription.id}
              onClick={() => handleAvatarClick(subscription.id)}
              className={`flex-shrink-0 flex flex-col items-center gap-2 transition-all duration-200 ${
                selectedSubscriptionId === subscription.id 
                  ? 'scale-105' 
                  : 'hover:scale-105'
              }`}
            >
              {/* Avatar with ring for selection and unread indicator */}
              <div className={`relative ${
                selectedSubscriptionId === subscription.id
                  ? 'ring-2 ring-blue-500 ring-offset-2 rounded-full'
                  : ''
              }`}>
                <div className="w-12 h-12 rounded-full overflow-hidden bg-gray-100 border-2 border-white shadow-sm">
                  {subscription.thumbnailUrl ? (
                    <img
                      src={subscription.thumbnailUrl}
                      alt={subscription.title}
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        const target = e.target as HTMLImageElement
                        target.style.display = 'none'
                        target.parentElement!.innerHTML = `
                          <div class="w-full h-full bg-gray-200 flex items-center justify-center text-gray-500 text-xs">
                            ${getProviderIcon(subscription.providerId)}
                          </div>
                        `
                      }}
                    />
                  ) : (
                    <div className="w-full h-full bg-gray-200 flex items-center justify-center text-gray-500">
                      {getProviderIcon(subscription.providerId)}
                    </div>
                  )}
                </div>
                
                {/* Unread count badge */}
                {subscription.unreadCount > 0 && (
                  <Badge 
                    variant="destructive" 
                    className="absolute -top-1 -right-1 h-5 w-5 p-0 flex items-center justify-center text-xs"
                  >
                    {subscription.unreadCount > 99 ? '99+' : subscription.unreadCount}
                  </Badge>
                )}
              </div>
              
              {/* Title */}
              <div className="w-16 text-center">
                <p className={`text-xs font-medium truncate ${
                  selectedSubscriptionId === subscription.id ? 'text-blue-600' : 'text-gray-700'
                }`}>
                  {subscription.title}
                </p>
              </div>
            </button>
          ))}
          
          {/* Show more button */}
          {hasMore && !showAll && (
            <button
              onClick={() => setShowAll(true)}
              className="flex-shrink-0 flex flex-col items-center gap-2 hover:scale-105 transition-transform"
            >
              <div className="w-12 h-12 rounded-full bg-gray-100 border-2 border-dashed border-gray-300 flex items-center justify-center text-gray-400">
                <span className="text-lg">+{sortedSubscriptions.length - 8}</span>
              </div>
              <p className="text-xs text-gray-500 w-16 text-center">More</p>
            </button>
          )}
        </div>
        
        {/* Show less button when expanded */}
        {showAll && hasMore && (
          <button
            onClick={() => setShowAll(false)}
            className="mt-2 text-sm text-blue-600 hover:text-blue-800"
          >
            Show less
          </button>
        )}
      </div>
    </div>
  )
}

/* CSS for hiding scrollbar - add to your global styles */
/*
.scrollbar-hide {
  -ms-overflow-style: none;
  scrollbar-width: none;
}
.scrollbar-hide::-webkit-scrollbar {
  display: none;
}
*/