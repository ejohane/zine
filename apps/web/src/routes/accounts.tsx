import { createFileRoute } from '@tanstack/react-router'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card'
import { Button } from '../components/ui/button'
import { Badge } from '../components/ui/badge'
import { Alert, AlertDescription } from '../components/ui/alert'
import { Loader2, CheckCircle, XCircle, Link as LinkIcon } from 'lucide-react'
import { useAccounts } from '../hooks/useAccounts'

export const Route = createFileRoute('/accounts')({
  component: AccountsPage,
})

function AccountsPage() {
  const {
    accounts,
    isLoading,
    error,
    connect,
    disconnect,
    isConnecting,
    isDisconnecting,
    connectError,
    disconnectError
  } = useAccounts()

  if (isLoading) {
    return (
      <div className="container mx-auto py-8">
        <div className="flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin" />
          <span className="ml-2">Loading accounts...</span>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="container mx-auto py-8">
        <Alert variant="destructive">
          <AlertDescription>
            Failed to load accounts: {error.message}
          </AlertDescription>
        </Alert>
      </div>
    )
  }

  return (
    <div className="container mx-auto py-8 max-w-4xl">
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Connected Accounts</h1>
          <p className="text-muted-foreground">
            Connect your accounts to sync subscriptions and discover new content.
          </p>
        </div>

        {(connectError || disconnectError) && (
          <Alert variant="destructive">
            <AlertDescription>
              {connectError?.message || disconnectError?.message}
            </AlertDescription>
          </Alert>
        )}

        <div className="grid gap-4 md:grid-cols-2">
          {accounts.map((account) => (
            <Card key={account.provider.id} className="relative">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <div className="h-12 w-12 bg-muted rounded-lg flex items-center justify-center">
                      {account.provider.id === 'spotify' && (
                        <div className="h-6 w-6 bg-green-500 rounded-full" />
                      )}
                      {account.provider.id === 'youtube' && (
                        <div className="h-6 w-6 bg-red-500 rounded-full" />
                      )}
                    </div>
                    <div>
                      <CardTitle className="text-lg">{account.provider.name}</CardTitle>
                      <CardDescription>
                        {account.provider.id === 'spotify' && 'Podcast subscriptions'}
                        {account.provider.id === 'youtube' && 'Channel subscriptions'}
                      </CardDescription>
                    </div>
                  </div>
                  <div className="flex items-center space-x-2">
                    {account.connected ? (
                      <Badge variant="default" className="flex items-center space-x-1">
                        <CheckCircle className="h-3 w-3" />
                        <span>Connected</span>
                      </Badge>
                    ) : (
                      <Badge variant="secondary" className="flex items-center space-x-1">
                        <XCircle className="h-3 w-3" />
                        <span>Not Connected</span>
                      </Badge>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {account.connected && (
                    <div className="text-sm text-muted-foreground">
                      Connected on {account.connectedAt ? new Date(account.connectedAt).toLocaleDateString() : 'Unknown date'}
                      {account.externalAccountId && (
                        <div>Account ID: {account.externalAccountId}</div>
                      )}
                    </div>
                  )}
                  
                  <div className="flex space-x-2">
                    {account.connected ? (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => disconnect(account.provider.id)}
                        disabled={isDisconnecting}
                        className="flex items-center space-x-1"
                      >
                        {isDisconnecting ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <XCircle className="h-4 w-4" />
                        )}
                        <span>Disconnect</span>
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        onClick={() => connect({ 
                          provider: account.provider.id,
                          redirectUrl: window.location.origin + '/accounts'
                        })}
                        disabled={isConnecting}
                        className="flex items-center space-x-1"
                      >
                        {isConnecting ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <LinkIcon className="h-4 w-4" />
                        )}
                        <span>Connect</span>
                      </Button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <Card>
          <CardHeader>
            <CardTitle>How It Works</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p>
              <strong>Spotify:</strong> Connect your Spotify account to automatically discover new episodes 
              from podcasts you're already subscribed to.
            </p>
            <p>
              <strong>YouTube:</strong> Connect your YouTube account to get the latest videos from 
              channels you subscribe to.
            </p>
            <p>
              We only access your subscription data and never store your login credentials. 
              You can disconnect at any time.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}