import { createFileRoute } from '@tanstack/react-router'
import { useState, useEffect } from 'react'
import { 
  Card, 
  CardContent,
  Button,
  Badge,
  Alert, 
  AlertDescription,
  Checkbox
} from '@zine/ui'
import { Loader2, Search, CheckCircle, ExternalLink } from 'lucide-react'
import { useProviderSubscriptions } from '../../../hooks/useSubscriptions'
import { useAccounts } from '../../../hooks/useAccounts'
import { useQueryClient } from '@tanstack/react-query'
import type { DiscoveredSubscription, SubscriptionUpdateRequest } from '../../../lib/api'

export const Route = createFileRoute('/subscriptions/discover/$provider')({
  component: SubscriptionDiscoveryPage,
})

function SubscriptionDiscoveryPage() {
  const { provider } = Route.useParams()
  const [selectedSubscriptions, setSelectedSubscriptions] = useState<Set<string>>(new Set())
  const [hasChanges, setHasChanges] = useState(false)
  const queryClient = useQueryClient()

  const { accounts, refetch: refetchAccounts } = useAccounts()
  const {
    discoveredSubscriptions,
    totalFound,
    isDiscovering,
    isUpdating,
    discoveryError,
    updateError,
    discover,
    updateSelections
  } = useProviderSubscriptions(provider as 'spotify' | 'youtube')

  // Check if provider is connected
  const connectedAccount = accounts.find(acc => acc.provider.id === provider && acc.connected)
  
  // Refresh accounts data when mounting and after potential reconnection
  useEffect(() => {
    // Invalidate and refetch accounts to ensure we have fresh data
    queryClient.invalidateQueries({ queryKey: ['accounts'] })
    refetchAccounts()
  }, [provider, queryClient, refetchAccounts])

  // Initialize selected subscriptions from user's existing choices
  useEffect(() => {
    const currentSelections = new Set<string>()
    discoveredSubscriptions.forEach(sub => {
      if (sub.isUserSubscribed) {
        currentSelections.add(sub.externalId)
      }
    })
    setSelectedSubscriptions(currentSelections)
    setHasChanges(false)
  }, [discoveredSubscriptions])

  const handleSelectionChange = (externalId: string, selected: boolean) => {
    const newSelections = new Set(selectedSubscriptions)
    if (selected) {
      newSelections.add(externalId)
    } else {
      newSelections.delete(externalId)
    }
    setSelectedSubscriptions(newSelections)
    setHasChanges(true)
  }

  const handleSelectAll = () => {
    const allExternalIds = new Set(discoveredSubscriptions.map(sub => sub.externalId))
    setSelectedSubscriptions(allExternalIds)
    setHasChanges(true)
  }

  const handleDeselectAll = () => {
    setSelectedSubscriptions(new Set())
    setHasChanges(true)
  }

  const handleSaveChanges = async () => {
    const subscriptionUpdates: SubscriptionUpdateRequest[] = discoveredSubscriptions.map(sub => ({
      externalId: sub.externalId,
      title: sub.title,
      creatorName: sub.creatorName,
      description: sub.description,
      thumbnailUrl: sub.thumbnailUrl,
      subscriptionUrl: sub.subscriptionUrl,
      selected: selectedSubscriptions.has(sub.externalId)
    }))

    await updateSelections(subscriptionUpdates)
    setHasChanges(false)
  }

  if (!connectedAccount) {
    return (
      <div className="container mx-auto py-8 max-w-4xl">
        <Alert>
          <AlertDescription>
            You need to connect your {provider} account first. 
            <a href="/accounts" className="ml-1 underline">Go to accounts page</a>
          </AlertDescription>
        </Alert>
      </div>
    )
  }

  return (
    <div className="container mx-auto py-8 max-w-4xl">
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">
            Discover {provider === 'spotify' ? 'Podcasts' : 'Channels'}
          </h1>
          <p className="text-muted-foreground">
            Choose which {provider === 'spotify' ? 'podcasts' : 'YouTube channels'} you want to follow in your Zine feed.
          </p>
        </div>

        {(discoveryError || updateError) && (
          <Alert variant="destructive">
            <AlertDescription>
              {(discoveryError as Error)?.message || (updateError as Error)?.message}
            </AlertDescription>
          </Alert>
        )}

        <div className="flex items-center space-x-4">
          <Button 
            onClick={discover} 
            disabled={isDiscovering}
            className="flex items-center space-x-2"
          >
            {isDiscovering ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Search className="h-4 w-4" />
            )}
            <span>
              {isDiscovering ? 'Discovering...' : `Discover ${provider === 'spotify' ? 'Podcasts' : 'Channels'}`}
            </span>
          </Button>

          {hasChanges && (
            <Button 
              onClick={handleSaveChanges} 
              disabled={isUpdating}
              variant="default"
              className="flex items-center space-x-2"
            >
              {isUpdating ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <CheckCircle className="h-4 w-4" />
              )}
              <span>Save Changes</span>
            </Button>
          )}
        </div>

        {totalFound > 0 && (
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Badge variant="secondary">
                {totalFound} {provider === 'spotify' ? 'podcasts' : 'channels'} found
              </Badge>
              <Badge variant="outline">
                {selectedSubscriptions.size} selected
              </Badge>
            </div>
            <div className="flex items-center space-x-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleSelectAll}
                disabled={selectedSubscriptions.size === discoveredSubscriptions.length}
              >
                Select All
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleDeselectAll}
                disabled={selectedSubscriptions.size === 0}
              >
                Deselect All
              </Button>
            </div>
          </div>
        )}

        {discoveredSubscriptions.length > 0 && (
          <div className="grid gap-4">
            {discoveredSubscriptions.map((subscription) => (
              <SubscriptionCard
                key={subscription.externalId}
                subscription={subscription}
                isSelected={selectedSubscriptions.has(subscription.externalId)}
                onSelectionChange={handleSelectionChange}
              />
            ))}
          </div>
        )}

        {discoveredSubscriptions.length === 0 && !isDiscovering && !discoveryError && (
          <Card>
            <CardContent className="py-8 text-center">
              <p className="text-muted-foreground">
                Click "Discover {provider === 'spotify' ? 'Podcasts' : 'Channels'}" to see your {provider} subscriptions.
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}

interface SubscriptionCardProps {
  subscription: DiscoveredSubscription
  isSelected: boolean
  onSelectionChange: (externalId: string, selected: boolean) => void
}

function SubscriptionCard({ subscription, isSelected, onSelectionChange }: SubscriptionCardProps) {
  return (
    <Card className="flex items-center space-x-4 p-4">
      <Checkbox
        checked={isSelected}
        onCheckedChange={(checked) => 
          onSelectionChange(subscription.externalId, Boolean(checked))
        }
      />
      
      {subscription.thumbnailUrl && (
        <img
          src={subscription.thumbnailUrl}
          alt={subscription.title}
          className="h-16 w-16 rounded-lg object-cover"
        />
      )}
      
      <div className="flex-1 min-w-0">
        <h3 className="font-semibold truncate">{subscription.title}</h3>
        <p className="text-sm text-muted-foreground truncate">
          by {subscription.creatorName}
        </p>
        {subscription.description && (
          <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
            {subscription.description}
          </p>
        )}
      </div>
      
      <div className="flex items-center space-x-2">
        {subscription.isUserSubscribed && (
          <Badge variant="default" className="text-xs">
            Following
          </Badge>
        )}
        
        {subscription.subscriptionUrl && (
          <Button
            variant="ghost"
            size="sm"
            asChild
          >
            <a
              href={subscription.subscriptionUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center space-x-1"
            >
              <ExternalLink className="h-3 w-3" />
            </a>
          </Button>
        )}
      </div>
    </Card>
  )
}