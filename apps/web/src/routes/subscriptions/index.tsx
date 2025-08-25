import { createFileRoute, Link } from '@tanstack/react-router'
import { 
  Card, 
  CardContent, 
  CardDescription, 
  CardHeader, 
  CardTitle, 
  Button, 
  Badge, 
  Alert, 
  AlertDescription 
} from '@zine/ui'
import { Loader2, Plus, Settings, ExternalLink } from 'lucide-react'
import { useUserSubscriptions, useRefreshSubscriptions } from '../../hooks/useSubscriptions'
import { useAccounts } from '../../hooks/useAccounts'
import { RefreshButton } from '../../components/subscriptions/RefreshButton'
import { useEffect, useState } from 'react'

export const Route = createFileRoute('/subscriptions/')({
  component: SubscriptionsPage,
})

function SubscriptionsPage() {
  const { accounts, isLoading: accountsLoading } = useAccounts()
  const { data: subscriptions, isLoading, error } = useUserSubscriptions()
  const refreshMutation = useRefreshSubscriptions()
  const [refreshMessage, setRefreshMessage] = useState<{ type: 'success' | 'error', message: string } | null>(null)

  const connectedProviders = accounts.filter(acc => acc.connected)
  const hasSpotify = connectedProviders.some(acc => acc.provider.id === 'spotify')
  const hasYouTube = connectedProviders.some(acc => acc.provider.id === 'youtube')

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

  // Clear old localStorage values on unmount or when they expire
  useEffect(() => {
    if (nextAllowedTime) {
      const nextTime = new Date(nextAllowedTime)
      if (nextTime <= new Date()) {
        localStorage.removeItem('nextAllowedRefreshTime')
      }
    }
  }, [nextAllowedTime])

  if (accountsLoading || isLoading) {
    return (
      <div className="container mx-auto py-8">
        <div className="flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin" />
          <span className="ml-2">Loading subscriptions...</span>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="container mx-auto py-8">
        <Alert variant="destructive">
          <AlertDescription>
            Failed to load subscriptions: {(error as Error).message}
          </AlertDescription>
        </Alert>
      </div>
    )
  }

  return (
    <div className="container mx-auto py-8 max-w-4xl">
      <div className="space-y-6">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-3xl font-bold">Your Subscriptions</h1>
            <p className="text-muted-foreground">
              Manage your podcast and channel subscriptions from connected accounts.
            </p>
          </div>
          {subscriptions && subscriptions.length > 0 && (
            <RefreshButton
              onRefresh={handleRefresh}
              isRefreshing={refreshMutation.isPending}
              lastRefreshTime={lastRefreshTime ? new Date(lastRefreshTime) : null}
              nextAllowedTime={nextAllowedTime ? new Date(nextAllowedTime) : null}
            />
          )}
        </div>

        {refreshMessage && (
          <Alert variant={refreshMessage.type === 'error' ? 'destructive' : 'default'}>
            <AlertDescription>{refreshMessage.message}</AlertDescription>
          </Alert>
        )}

        {connectedProviders.length === 0 && (
          <Alert>
            <AlertDescription>
              You need to connect accounts first to discover subscriptions.
              <Link to="/accounts" className="ml-1 underline">Connect accounts</Link>
            </AlertDescription>
          </Alert>
        )}

        {/* Discovery Actions */}
        {connectedProviders.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Discover New Subscriptions</CardTitle>
              <CardDescription>
                Find podcasts and channels from your connected accounts.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-3">
                {hasSpotify && (
                  <Button asChild>
                    <Link to="/subscriptions/discover/$provider" params={{ provider: 'spotify' }} className="flex items-center space-x-2">
                      <Plus className="h-4 w-4" />
                      <span>Discover Podcasts</span>
                    </Link>
                  </Button>
                )}
                
                {hasYouTube && (
                  <Button asChild variant="outline">
                    <Link to="/subscriptions/discover/$provider" params={{ provider: 'youtube' }} className="flex items-center space-x-2">
                      <Plus className="h-4 w-4" />
                      <span>Discover Channels</span>
                    </Link>
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Current Subscriptions */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold">Active Subscriptions</h2>
            <Badge variant="secondary">
              {subscriptions?.filter(sub => sub.isActive).length || 0} active
            </Badge>
          </div>

          {!subscriptions || subscriptions.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center">
                <p className="text-muted-foreground mb-4">
                  No subscriptions yet. Discover content from your connected accounts!
                </p>
                {connectedProviders.length > 0 && (
                  <div className="flex justify-center space-x-2">
                    {hasSpotify && (
                      <Button asChild size="sm">
                        <Link to="/subscriptions/discover/$provider" params={{ provider: 'spotify' }}>
                          Discover Podcasts
                        </Link>
                      </Button>
                    )}
                    {hasYouTube && (
                      <Button asChild size="sm" variant="outline">
                        <Link to="/subscriptions/discover/$provider" params={{ provider: 'youtube' }}>
                          Discover Channels
                        </Link>
                      </Button>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {/* Group by provider */}
              {hasSpotify && (
                <ProviderSubscriptions 
                  title="Spotify Podcasts" 
                  provider="spotify"
                  subscriptions={subscriptions.filter(sub => sub.subscription.providerId === 'spotify')} 
                />
              )}
              
              {hasYouTube && (
                <ProviderSubscriptions 
                  title="YouTube Channels" 
                  provider="youtube"
                  subscriptions={subscriptions.filter(sub => sub.subscription.providerId === 'youtube')} 
                />
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

interface ProviderSubscriptionsProps {
  title: string
  provider: string
  subscriptions: Array<{
    id: string
    isActive: boolean
    subscription: {
      id: string
      title: string
      creatorName: string
      description?: string
      thumbnailUrl?: string
      subscriptionUrl?: string
    }
  }>
}

function ProviderSubscriptions({ title, provider, subscriptions }: ProviderSubscriptionsProps) {
  const activeSubscriptions = subscriptions.filter(sub => sub.isActive)

  if (activeSubscriptions.length === 0) {
    return null
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg">{title}</CardTitle>
            <CardDescription>
              {activeSubscriptions.length} active subscription{activeSubscriptions.length !== 1 ? 's' : ''}
            </CardDescription>
          </div>
          <Button variant="outline" size="sm" asChild>
            <Link to="/subscriptions/discover/$provider" params={{ provider }} className="flex items-center space-x-1">
              <Settings className="h-3 w-3" />
              <span>Manage</span>
            </Link>
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {activeSubscriptions.map((userSub) => (
            <div key={userSub.id} className="flex items-center space-x-3 p-2 rounded-lg border">
              {userSub.subscription.thumbnailUrl && (
                <img
                  src={userSub.subscription.thumbnailUrl}
                  alt={userSub.subscription.title}
                  className="h-10 w-10 rounded object-cover"
                />
              )}
              <div className="flex-1 min-w-0">
                <p className="font-medium truncate">{userSub.subscription.title}</p>
                <p className="text-sm text-muted-foreground truncate">
                  by {userSub.subscription.creatorName}
                </p>
              </div>
              {userSub.subscription.subscriptionUrl && (
                <Button
                  variant="ghost"
                  size="sm"
                  asChild
                >
                  <a
                    href={userSub.subscription.subscriptionUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center space-x-1"
                  >
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </Button>
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}