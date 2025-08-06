import { createFileRoute, Link, useSearch } from '@tanstack/react-router'
import { useAuth } from '../lib/auth'
import { Button } from '../components/ui/button'
import { Card, CardContent } from '../components/ui/card'
import { useFeedManager } from '../hooks/useFeed'
import { useBookmarks } from '../hooks/useBookmarks'
import { Filter, TrendingUp, Clock, BookOpen, Play, MoreHorizontal, BookmarkIcon, Plus, User } from 'lucide-react'
import { useState } from 'react'
import { cn } from '../lib/utils'
import type { FeedItemWithState } from '../lib/api'
import { BookmarkSectionSkeleton } from '../components/home/BookmarkSkeleton'
import { ContentGrid } from '../components/home/ContentGrid'
import { SectionHeader } from '../components/home/SectionHeader'

type FilterType = 'trending' | 'recent' | 'unread'

interface HomeSearchParams {
  saved?: boolean
  message?: string
}

function Home() {
  const { isAuthenticated } = useAuth()
  const { saved, message } = useSearch({ from: '/' }) as HomeSearchParams
  const [activeFilter, setActiveFilter] = useState<FilterType>('trending')
  
  const { 
    feedItems, 
    subscriptions,
    isLoading: isFeedLoading, 
    error: feedError,
    markAsRead,
    markAsUnread,
    saveToBookmarks,
    isMarkingRead,
    isSavingToBookmarks
  } = useFeedManager({ 
    unreadOnly: activeFilter === 'unread' 
  })

  const { data: bookmarks, isLoading: isBookmarksLoading, error: bookmarksError } = useBookmarks()

  // Show welcome screen for unauthenticated users
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center max-w-md mx-auto px-4">
          <div className="mb-8">
            <h1 className="text-5xl font-bold mb-4 text-foreground">Welcome to Zine</h1>
            <p className="text-xl text-muted-foreground">Your intelligent bookmark manager with a modern twist</p>
          </div>
          <div className="space-y-4">
            <Link to="/sign-in" className="block">
              <Button size="lg" className="w-full bg-spotify-green hover:bg-spotify-green-hover text-white">
                Sign In
              </Button>
            </Link>
            <Link to="/sign-up" className="block">
              <Button size="lg" variant="outline" className="w-full">
                Create Account
              </Button>
            </Link>
          </div>
        </div>
      </div>
    )
  }

  const isLoading = isFeedLoading || isBookmarksLoading
  const error = feedError || bookmarksError

  if (isLoading) return (
    <div className="min-h-screen bg-background p-4">
      <div className="animate-pulse">
        <div className="h-10 bg-secondary rounded w-64 mb-2" />
        <div className="h-6 bg-secondary rounded w-96 mb-8" />
      </div>
      <BookmarkSectionSkeleton />
      <BookmarkSectionSkeleton />
    </div>
  )
  
  if (error) return (
    <div className="min-h-screen bg-background p-4">
      <div className="text-center py-12">
        <p className="text-destructive mb-4">Error loading content: {error.message}</p>
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

  // Organize bookmarks by categories
  const recentBookmarks = bookmarks?.slice(0, 8) || []
  const podcastBookmarks = bookmarks?.filter(b => b.contentType === 'podcast') || []

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
        {/* User Profile Header (Mobile) */}
        <div className="flex items-center justify-between mb-4 md:hidden">
          <div className="w-10 h-10 rounded-full bg-spotify-green flex items-center justify-center">
            <User className="w-6 h-6 text-white" />
          </div>
        </div>

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
            <div>
              {/* Bookmarks Content Grid */}
              {bookmarks && bookmarks.length > 0 ? (
                <div className="space-y-6 pb-28">
                  {/* Your Episodes Section */}
                  <ContentGrid
                    title="Your Episodes"
                    items={recentBookmarks.slice(0, 2)}
                    type="episodes"
                  />

                  {/* Picked for you Section */}
                  <div>
                    <SectionHeader title="Picked for you" />
                    <div className="space-y-4">
                      {recentBookmarks.slice(0, 1).map((bookmark) => (
                        <div key={bookmark.id} className="bg-surface rounded-lg p-4 flex items-center space-x-4">
                          <div className="w-16 h-16 bg-muted rounded-lg flex items-center justify-center">
                            <span className="text-xs font-medium">IMG</span>
                          </div>
                          <div className="flex-1">
                            <div className="text-xs text-spotify-green mb-1">Included in Premium</div>
                            <h3 className="font-semibold text-foreground line-clamp-2">{bookmark.title}</h3>
                            <p className="text-sm text-muted-foreground">{bookmark.url}</p>
                          </div>
                          <div className="flex items-center space-x-2">
                            <Button size="sm" variant="ghost" className="w-8 h-8 p-0">
                              <Plus className="w-4 h-4" />
                            </Button>
                            <Button size="sm" className="w-8 h-8 p-0 rounded-full bg-white text-black hover:bg-gray-200">
                              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                                <path d="M8 5v14l11-7z"/>
                              </svg>
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Your shows Section */}
                  <div>
                    <SectionHeader title="Your shows" />
                    <div className="grid grid-cols-1 gap-4">
                      {podcastBookmarks.slice(0, 3).map((bookmark) => (
                        <div key={bookmark.id} className="relative">
                          <div className="w-full aspect-video bg-surface rounded-lg flex items-center justify-center relative overflow-hidden">
                            <span className="text-xs font-medium text-muted-foreground">PODCAST</span>
                            <div className="absolute top-2 left-2">
                              <div className="bg-black/80 text-white px-2 py-1 rounded text-xs font-medium">
                                A SPOTIFY VIDEO PODCAST
                              </div>
                            </div>
                          </div>
                          <div className="mt-2">
                            <h3 className="font-semibold text-foreground">{bookmark.title}</h3>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
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
})