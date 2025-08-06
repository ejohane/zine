import { createFileRoute, Link, useSearch } from '@tanstack/react-router'
import { useAuth } from '../lib/auth'
import { Button } from '../components/ui/button'
import { Card, CardContent } from '../components/ui/card'
import { useFeedManager } from '../hooks/useFeed'
import { Filter, TrendingUp, Clock, BookOpen, Play, MoreHorizontal, BookmarkIcon } from 'lucide-react'
import { useState } from 'react'
import { cn } from '../lib/utils'
import type { FeedItemWithState } from '../lib/api'

interface HomeSearchParams {
  saved?: string
  message?: string
}

type FilterType = 'trending' | 'recent' | 'unread'

function Home() {
  const { isAuthenticated } = useAuth()
  const { saved, message } = useSearch({ from: '/' }) as HomeSearchParams
  const [activeFilter, setActiveFilter] = useState<FilterType>('trending')
  
  const { 
    feedItems, 
    subscriptions,
    isLoading, 
    error,
    markAsRead,
    markAsUnread,
    saveToBookmarks,
    isMarkingRead,
    isSavingToBookmarks
  } = useFeedManager({ 
    unreadOnly: activeFilter === 'unread' 
  })

  // Show welcome screen for unauthenticated users
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-4">Welcome to Zine</h1>
          <p className="mb-8">Please sign in to access your feed</p>
          <div className="space-x-4">
            <Link 
              to="/sign-in"
              className="bg-green-500 hover:bg-green-600 text-white font-bold py-2 px-4 rounded-full"
            >
              Sign In
            </Link>
            <Link 
              to="/sign-up"
              className="bg-gray-200 hover:bg-gray-300 text-gray-800 font-bold py-2 px-4 rounded-full"
            >
              Sign Up
            </Link>
          </div>
        </div>
      </div>
    )
  }

  if (isLoading) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-500 mx-auto mb-4"></div>
        <p className="text-gray-600">Loading your feed...</p>
      </div>
    </div>
  )
  
  if (error) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="text-center">
        <p className="text-red-600 mb-4">Error loading feed: {error.message}</p>
        <Button onClick={() => window.location.reload()}>Try Again</Button>
      </div>
    </div>
  )

  const formatDuration = (seconds: number): string => {
    const minutes = Math.floor(seconds / 60)
    const remainingSeconds = seconds % 60
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`
  }

  const formatTimeAgo = (date: Date): string => {
    const now = new Date()
    const diffInSeconds = Math.floor((now.getTime() - new Date(date).getTime()) / 1000)
    
    if (diffInSeconds < 60) return 'just now'
    if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)} min ago`
    if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`
    if (diffInSeconds < 604800) return `${Math.floor(diffInSeconds / 86400)}d ago`
    return new Date(date).toLocaleDateString()
  }

  const getProviderBadge = (providerId: string) => {
    switch (providerId) {
      case 'youtube':
        return (
          <span className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-red-600 text-white">
            YouTube
          </span>
        )
      case 'spotify':
        return (
          <span className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-green-600 text-white">
            Spotify
          </span>
        )
      default:
        return null
    }
  }

  const handleFeedItemClick = (item: FeedItemWithState) => {
    if (!item.isRead) {
      markAsRead(item.id)
    }
    window.open(item.feedItem.externalUrl, '_blank')
  }

  const unreadCount = feedItems.filter(item => !item.isRead).length
  const totalNewContent = feedItems.filter(item => {
    const publishedAt = new Date(item.feedItem.publishedAt)
    const now = new Date()
    const diffInHours = (now.getTime() - publishedAt.getTime()) / (1000 * 60 * 60)
    return diffInHours < 24
  }).length

  const greeting = () => {
    const hour = new Date().getHours()
    if (hour < 12) return 'Good morning'
    if (hour < 18) return 'Good afternoon'
    return 'Good evening'
  }

  return (
    <div className="min-h-screen bg-white">
      {/* Success Message */}
      {saved && message && (
        <div className="bg-green-50 border border-green-200 px-4 py-3">
          <div className="flex items-center gap-2 text-green-700">
            <span className="w-5 h-5">✅</span>
            <span>{message}</span>
          </div>
        </div>
      )}

      {/* Main Content */}
      <div className="max-w-2xl mx-auto px-4 py-6">
        {/* Greeting Section */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-green-500 mb-2">{greeting()}</h1>
          <p className="text-gray-600">
            {unreadCount > 0 ? `${unreadCount} unread updates from your feeds` : 'All caught up!'}
          </p>
        </div>

        {/* Filter Buttons and Actions */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex gap-2">
            <Button
              variant={activeFilter === 'trending' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setActiveFilter('trending')}
              className={cn(
                "rounded-full",
                activeFilter === 'trending' && "bg-green-500 hover:bg-green-600 text-white"
              )}
            >
              <TrendingUp className="w-4 h-4 mr-1" />
              Trending
            </Button>
            <Button
              variant={activeFilter === 'recent' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setActiveFilter('recent')}
              className={cn(
                "rounded-full",
                activeFilter === 'recent' && "bg-green-500 hover:bg-green-600 text-white"
              )}
            >
              <Clock className="w-4 h-4 mr-1" />
              Recent
            </Button>
            <Button
              variant={activeFilter === 'unread' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setActiveFilter('unread')}
              className={cn(
                "rounded-full",
                activeFilter === 'unread' && "bg-green-500 hover:bg-green-600 text-white"
              )}
            >
              <BookOpen className="w-4 h-4 mr-1" />
              Unread
            </Button>
          </div>
          
          <Button variant="ghost" size="sm" className="text-gray-600">
            <Filter className="w-4 h-4 mr-1" />
            Filter
          </Button>
        </div>

        {/* Today's Highlights */}
        {totalNewContent > 0 && (
          <div className="mb-8">
            <h2 className="text-xl font-bold mb-4">Today's Highlights</h2>
            <Card className="bg-green-500 text-white border-0">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-2xl font-bold mb-2">{totalNewContent} new videos from your subscriptions</p>
                    <p className="opacity-90">
                      Including content from {subscriptions.slice(0, 2).map(s => s.creatorName).join(' and ')}
                    </p>
                  </div>
                  <div className="text-4xl">⚡</div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Feed Section */}
        <div className="space-y-6">
          <div className="flex justify-between items-center">
            <h2 className="text-xl font-bold">Your Feed</h2>
            {unreadCount > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="text-gray-600"
                onClick={() => {
                  feedItems.filter(item => !item.isRead).forEach(item => markAsRead(item.id))
                }}
              >
                Mark all read
              </Button>
            )}
          </div>

          {/* Feed Items */}
          {feedItems.length > 0 ? (
            <div className="space-y-4">
              {feedItems.map((item) => (
                <Card 
                  key={item.id} 
                  className="cursor-pointer hover:shadow-md transition-shadow overflow-hidden"
                  onClick={() => handleFeedItemClick(item)}
                >
                  <CardContent className="p-0">
                    <div className="relative">
                      {/* Thumbnail */}
                      {item.feedItem.thumbnailUrl && (
                        <div className="relative aspect-video">
                          <img
                            src={item.feedItem.thumbnailUrl}
                            alt={item.feedItem.title}
                            className="w-full h-full object-cover"
                          />
                          {/* Duration overlay */}
                          {item.feedItem.durationSeconds && (
                            <div className="absolute bottom-2 right-2 bg-black bg-opacity-80 text-white px-2 py-1 rounded text-sm">
                              <Play className="w-3 h-3 inline mr-1" />
                              {formatDuration(item.feedItem.durationSeconds)}
                            </div>
                          )}
                          {/* Provider badge overlay */}
                          <div className="absolute top-3 left-3">
                            {getProviderBadge(item.feedItem.subscription.providerId)}
                          </div>
                          {/* Unread indicator */}
                          {!item.isRead && (
                            <div className="absolute top-3 right-3 w-3 h-3 bg-green-500 rounded-full"></div>
                          )}
                        </div>
                      )}
                      
                      {/* Content */}
                      <div className="p-4">
                        <h3 className="font-semibold text-lg line-clamp-2 mb-2">
                          {item.feedItem.title}
                        </h3>
                        
                        <div className="flex items-center gap-2 text-sm text-gray-600 mb-2">
                          {item.feedItem.subscription.thumbnailUrl && (
                            <img
                              src={item.feedItem.subscription.thumbnailUrl}
                              alt={item.feedItem.subscription.creatorName}
                              className="w-5 h-5 rounded-full"
                            />
                          )}
                          <span>{item.feedItem.subscription.creatorName}</span>
                          <span>·</span>
                          <span>{formatTimeAgo(item.feedItem.publishedAt)}</span>
                        </div>
                        
                        {item.feedItem.description && (
                          <p className="text-gray-600 text-sm line-clamp-2">
                            {item.feedItem.description}
                          </p>
                        )}
                        
                        {/* Actions */}
                        <div className="flex items-center gap-4 mt-4">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="p-0 h-auto"
                            onClick={(e) => {
                              e.stopPropagation()
                              saveToBookmarks(item.feedItem)
                            }}
                            disabled={isSavingToBookmarks || !!item.bookmarkId}
                          >
                            <BookmarkIcon className={cn(
                              "w-5 h-5",
                              item.bookmarkId ? "fill-current" : ""
                            )} />
                          </Button>
                          
                          <Button
                            variant="ghost"
                            size="sm"
                            className="p-0 h-auto"
                            onClick={(e) => {
                              e.stopPropagation()
                              if (item.isRead) {
                                markAsUnread(item.id)
                              } else {
                                markAsRead(item.id)
                              }
                            }}
                            disabled={isMarkingRead}
                          >
                            <BookOpen className={cn(
                              "w-5 h-5",
                              !item.isRead ? "text-green-500" : "text-gray-400"
                            )} />
                          </Button>
                          
                          <Button
                            variant="ghost"
                            size="sm"
                            className="p-0 h-auto ml-auto"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <MoreHorizontal className="w-5 h-5" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <Card className="text-center py-12">
              <CardContent>
                <div className="space-y-4">
                  <div className="w-16 h-16 mx-auto bg-gray-100 rounded-full flex items-center justify-center">
                    <span className="text-2xl">📺</span>
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900 mb-2">
                      No content yet
                    </h3>
                    <p className="text-gray-600 mb-6">
                      Subscribe to your favorite creators to see their content here
                    </p>
                    <Link to="/subscriptions">
                      <Button size="lg" className="bg-green-500 hover:bg-green-600">
                        <span className="w-5 h-5 mr-2">🔍</span>
                        Discover Subscriptions
                      </Button>
                    </Link>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}

export const Route = createFileRoute('/')({
  component: Home,
  beforeLoad: async () => {
    // Note: This is a placeholder. In a real app, we'd need to check auth status
    // For now, we'll rely on the Clerk components to handle the redirect
    return {}
  },
  validateSearch: (search: Record<string, unknown>): HomeSearchParams => {
    return {
      saved: typeof search.saved === 'string' ? search.saved : undefined,
      message: typeof search.message === 'string' ? search.message : undefined,
    }
  },
})