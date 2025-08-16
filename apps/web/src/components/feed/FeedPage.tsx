import { useState, useEffect } from 'react'
import { Link, useNavigate } from '@tanstack/react-router'
import { ProtectedRoute } from '../auth/ProtectedRoute'
import { SubscriptionAvatars } from './SubscriptionAvatars'
import { FeedItemList } from './FeedItemList'
import { useFeedManager } from '../../hooks/useFeed'
import { useRefreshSubscriptions } from '../../hooks/useSubscriptions'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card'
import { Button } from '../ui/button'
import { RefreshButton } from '../subscriptions/RefreshButton'
import { Alert, AlertDescription } from '../ui/alert'

interface FeedPageProps {
  subscriptionId?: string
}

export function FeedPage({ subscriptionId }: FeedPageProps) {
  const [showUnreadOnly, setShowUnreadOnly] = useState(true)
  const [refreshMessage, setRefreshMessage] = useState<{ type: 'success' | 'error', message: string } | null>(null)
  const navigate = useNavigate()
  const refreshMutation = useRefreshSubscriptions()
  
  const {
    feedItems,
    subscriptions,
    isLoading,
    isLoadingSubscriptions,
    isLoadingMore,
    error,
    subscriptionsError,
    hasMore,
    loadMore,
    markAsRead,
    markAsUnread,
    saveToBookmarks,
    refetch,
    refetchSubscriptions
  } = useFeedManager({
    unreadOnly: showUnreadOnly,
    subscriptionId,
    limit: 20
  })

  // Get stored refresh times for rate limiting UI
  const lastRefreshTime = localStorage.getItem('lastRefreshTime')
  const nextAllowedTime = localStorage.getItem('nextAllowedRefreshTime')

  const handleRefresh = async () => {
    setRefreshMessage(null)
    try {
      const result = await refreshMutation.mutateAsync()
      
      setRefreshMessage({
        type: 'success',
        message: result.message
      })
      
      // Refetch feed data to show new items
      if (result.newItemsCount > 0) {
        refetch()
        refetchSubscriptions()
      }
      
      // Clear message after 5 seconds
      setTimeout(() => setRefreshMessage(null), 5000)
    } catch (error) {
      setRefreshMessage({
        type: 'error',
        message: error instanceof Error ? error.message : "Failed to refresh subscriptions"
      })
      
      // Clear error message after 5 seconds
      setTimeout(() => setRefreshMessage(null), 5000)
    }
  }

  // Clear old localStorage values when they expire
  useEffect(() => {
    if (nextAllowedTime) {
      const nextTime = new Date(nextAllowedTime)
      if (nextTime <= new Date()) {
        localStorage.removeItem('nextAllowedRefreshTime')
      }
    }
  }, [nextAllowedTime])

  const handleSubscriptionSelect = (selectedId: string | null) => {
    // Navigate to the appropriate route
    if (selectedId) {
      navigate({ to: '/feed/$subscriptionId', params: { subscriptionId: selectedId } })
    } else {
      navigate({ to: '/feed' })
    }
  }

  // Error state
  if (error || subscriptionsError) {
    return (
      <ProtectedRoute>
        <div className="container mx-auto px-4 py-8">
          <Card className="border-red-200 bg-red-50 max-w-md mx-auto">
            <CardContent className="p-6 text-center">
              <div className="text-red-600 mb-4">
                <span className="text-2xl">⚠️</span>
              </div>
              <h3 className="font-semibold text-red-900 mb-2">Failed to load feed</h3>
              <p className="text-red-700 text-sm mb-4">
                {(error as Error)?.message || (subscriptionsError as Error)?.message || 'Something went wrong'}
              </p>
              <div className="flex gap-2 justify-center">
                <Button
                  variant="outline"
                  onClick={() => refetch()}
                  className="border-red-300 text-red-700 hover:bg-red-100"
                >
                  Retry Feed
                </Button>
                <Button
                  variant="outline"
                  onClick={() => refetchSubscriptions()}
                  className="border-red-300 text-red-700 hover:bg-red-100"
                >
                  Retry Subscriptions
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </ProtectedRoute>
    )
  }

  // No subscriptions state
  if (!isLoadingSubscriptions && subscriptions.length === 0) {
    return (
      <ProtectedRoute>
        <div className="container mx-auto px-4 py-8">
          <Card className="max-w-lg mx-auto">
            <CardHeader className="text-center">
              <div className="text-4xl mb-4">🎧</div>
              <CardTitle>Welcome to Your Feed</CardTitle>
              <CardDescription>
                Connect your accounts and manage subscriptions to start seeing content here.
              </CardDescription>
            </CardHeader>
            <CardContent className="text-center space-y-4">
              <div className="space-y-2">
                <Link to="/accounts">
                  <Button className="w-full">
                    Connect Accounts
                  </Button>
                </Link>
                <Link to="/subscriptions">
                  <Button variant="outline" className="w-full">
                    Manage Subscriptions
                  </Button>
                </Link>
              </div>
              <p className="text-xs text-gray-500">
                Connect Spotify for podcasts or YouTube for channels to get started.
              </p>
            </CardContent>
          </Card>
        </div>
      </ProtectedRoute>
    )
  }

  const selectedSubscription = subscriptionId 
    ? subscriptions.find(s => s.id === subscriptionId)
    : null

  return (
    <ProtectedRoute>
      <div className="container mx-auto px-4 py-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              {selectedSubscription ? selectedSubscription.title : 'Your Feed'}
            </h1>
            <p className="text-gray-600 text-sm">
              {selectedSubscription 
                ? `Content from ${selectedSubscription.creatorName}`
                : 'Latest content from your subscriptions'
              }
            </p>
          </div>
          
          <div className="flex items-center gap-2">
            {subscriptions.length > 0 && (
              <RefreshButton
                onRefresh={handleRefresh}
                isRefreshing={refreshMutation.isPending}
                lastRefreshTime={lastRefreshTime ? new Date(lastRefreshTime) : null}
                nextAllowedTime={nextAllowedTime ? new Date(nextAllowedTime) : null}
                showLabel={false}
              />
            )}
            <Link to="/subscriptions">
              <Button variant="outline" size="sm">
                Manage Subscriptions
              </Button>
            </Link>
            <Link to="/accounts">
              <Button variant="outline" size="sm">
                Accounts
              </Button>
            </Link>
          </div>
        </div>

        {/* Refresh Status Alert */}
        {refreshMessage && (
          <Alert variant={refreshMessage.type === 'error' ? 'destructive' : 'default'}>
            <AlertDescription>{refreshMessage.message}</AlertDescription>
          </Alert>
        )}

        {/* Subscription Avatars */}
        {!isLoadingSubscriptions && subscriptions.length > 0 && (
          <SubscriptionAvatars
            subscriptions={subscriptions}
            selectedSubscriptionId={subscriptionId}
            onSubscriptionSelect={handleSubscriptionSelect}
          />
        )}

        {/* Feed Content */}
        <FeedItemList
          items={feedItems}
          isLoading={isLoading}
          error={error as string | null}
          onMarkRead={markAsRead}
          onMarkUnread={markAsUnread}
          onSaveToBookmarks={saveToBookmarks}
          onLoadMore={loadMore}
          hasMore={hasMore}
          isLoadingMore={isLoadingMore}
          showUnreadOnly={showUnreadOnly}
          onToggleUnreadOnly={setShowUnreadOnly}
          emptyTitle={selectedSubscription 
            ? `No ${showUnreadOnly ? 'unread ' : ''}items from ${selectedSubscription.creatorName}`
            : `No ${showUnreadOnly ? 'unread ' : ''}items in your feed`
          }
          emptyDescription={selectedSubscription
            ? "This subscription doesn't have any new content yet. Check back later!"
            : showUnreadOnly 
              ? "You're all caught up! Toggle to 'Show All' to see previously read items."
              : "Your subscriptions haven't posted any new content yet."
          }
          emptyActionText="Manage Subscriptions"
          onEmptyAction={() => navigate({ to: '/subscriptions' })}
        />

        {/* Loading overlay for subscription avatars */}
        {isLoadingSubscriptions && (
          <div className="space-y-4">
            <div className="flex gap-4 overflow-hidden">
              {Array.from({ length: 6 }, (_, i) => (
                <div key={i} className="flex-shrink-0 flex flex-col items-center gap-2">
                  <div className="w-12 h-12 bg-gray-200 rounded-full animate-pulse"></div>
                  <div className="w-16 h-3 bg-gray-200 rounded animate-pulse"></div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </ProtectedRoute>
  )
}