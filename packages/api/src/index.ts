import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'
import { 
  CreateBookmarkSchema, 
  UpdateBookmarkSchema,
  SaveBookmarkSchema,
  BookmarkService,
  BookmarkSaveService
} from '@zine/shared'
import { D1BookmarkRepository } from './d1-repository'
import { D1FeedItemRepository } from './d1-feed-item-repository'
import { authMiddleware, getAuthContext } from './middleware/auth'
import { getOAuthProviders } from './oauth/oauth-config'
import { OAuthService, encodeState, decodeState, getUserInfo } from './oauth/oauth-service'
import { setupDatabase } from './setup-database'
import { SubscriptionDiscoveryService } from './services/subscription-discovery-service'
import { OptimizedFeedPollingService } from './services/optimized-feed-polling-service'
import { TokenRefreshService } from './services/token-refresh-service'
import { QueryOptimizer } from './repositories/query-optimizer'
import { InitialFeedPopulationService } from './services/initial-feed-population-service'
import { DualModeSubscriptionRepository } from './repositories/dual-mode-subscription-repository'
import { userStateRoutes } from './routes/user-state'

export type Bindings = {
  DB: D1Database
  CLERK_SECRET_KEY: string
  // OAuth environment variables
  SPOTIFY_CLIENT_ID: string
  SPOTIFY_CLIENT_SECRET: string
  SPOTIFY_REDIRECT_URI?: string
  YOUTUBE_CLIENT_ID: string
  YOUTUBE_CLIENT_SECRET: string
  YOUTUBE_REDIRECT_URI?: string
  API_BASE_URL: string
  // Durable Objects
  USER_SUBSCRIPTION_MANAGER: DurableObjectNamespace
  USER_RECENT_BOOKMARKS: DurableObjectNamespace
  // KV for rate limiting
  KV?: KVNamespace
  // Feature flags
  FEATURE_DO_ROLLOUT_PERCENTAGE?: string
  FEATURE_DUAL_MODE_TOKENS?: string
  FEATURE_MIGRATION_METRICS?: string
}

export type Env = Bindings

// Cloudflare Workers types for scheduled events
interface ScheduledEvent {
  type: 'scheduled'
  scheduledTime: number
  cron: string
}

interface ExecutionContext {
  waitUntil(promise: Promise<any>): void
  passThroughOnException(): void
}

const app = new Hono<{ Bindings: Bindings }>()

// Initialize services with D1 database
let bookmarkService: BookmarkService
let bookmarkSaveService: BookmarkSaveService
let subscriptionRepository: DualModeSubscriptionRepository
let feedItemRepository: D1FeedItemRepository
let subscriptionDiscoveryService: SubscriptionDiscoveryService
let feedPollingService: OptimizedFeedPollingService
let tokenRefreshService: TokenRefreshService
let queryOptimizer: QueryOptimizer
let initialFeedPopulationService: InitialFeedPopulationService

// Initialize services on first request
async function initializeServices(db: D1Database, env: Bindings) {
  if (!bookmarkService) {
    const d1Repository = new D1BookmarkRepository(db)
    bookmarkService = new BookmarkService(d1Repository)
    bookmarkSaveService = new BookmarkSaveService(d1Repository)
    
    // Always use DualModeSubscriptionRepository for token storage in Durable Objects
    const { DualModeSubscriptionRepository } = await import('./repositories/dual-mode-subscription-repository')
    subscriptionRepository = new DualModeSubscriptionRepository(env)
    
    feedItemRepository = new D1FeedItemRepository(db)
    subscriptionDiscoveryService = new SubscriptionDiscoveryService(subscriptionRepository)
    feedPollingService = new OptimizedFeedPollingService(subscriptionRepository, feedItemRepository, db)
    tokenRefreshService = new TokenRefreshService(subscriptionRepository)
    queryOptimizer = new QueryOptimizer(db)
    initialFeedPopulationService = new InitialFeedPopulationService(subscriptionRepository, feedItemRepository)
    
    // Setup database tables and providers
    await setupDatabase(db)
    
    // Create optimized indexes for feed operations
    await queryOptimizer.createOptimizedIndexes()
  }
  return { 
    bookmarkService, 
    bookmarkSaveService, 
    subscriptionRepository, 
    feedItemRepository,
    subscriptionDiscoveryService,
    feedPollingService,
    tokenRefreshService,
    initialFeedPopulationService
  }
}

app.use('*', logger())
app.use('*', cors())

app.get('/', (c) => {
  return c.json({ message: 'Zine API is running' })
})

app.get('/health', (c) => {
  return c.json({ status: 'healthy', timestamp: new Date().toISOString() })
})

// Metadata preview endpoint (public - no auth required)
app.post('/api/v1/bookmarks/preview', async (c) => {
  try {
    const body = await c.req.json()
    const { url } = body
    
    if (!url || typeof url !== 'string') {
      return c.json({ error: 'URL is required' }, 400)
    }
    
    // Check for conditional request headers
    const ifNoneMatch = c.req.header('If-None-Match')
    const userId = c.req.header('x-user-id') // Optional user ID for authenticated previews
    
    // Use the new optimized PreviewService
    const { PreviewService } = await import('./services/preview-service')
    const previewService = new PreviewService(c)
    const result = await previewService.getPreviewWithCache(url, userId, ifNoneMatch)
    
    // Handle 304 Not Modified
    if (result.notModified) {
      c.status(304)
      if (result.cacheControl) {
        c.header('Cache-Control', result.cacheControl)
      }
      if (result.etag) {
        c.header('ETag', result.etag)
      }
      return c.body(null)
    }
    
    // Set cache headers
    if (result.cacheControl) {
      c.header('Cache-Control', result.cacheControl)
    }
    if (result.etag) {
      c.header('ETag', result.etag)
    }
    if (result.lastModified) {
      c.header('Last-Modified', result.lastModified)
    }
    
    if (!result.success) {
      return c.json({ 
        error: result.error || 'Failed to extract metadata',
        source: result.source,
        cached: result.cached
      }, 500)
    }
    
    return c.json({ 
      data: result.metadata,
      source: result.source,
      cached: result.cached,
      provider: result.provider,
      performanceMetrics: result.performanceMetrics
    })
  } catch (error) {
    console.error('[Preview] Error:', error)
    return c.json({ error: 'Invalid request data' }, 400)
  }
})

// Apply authentication middleware to protected routes
app.use('/api/v1/bookmarks/*', authMiddleware)
app.use('/api/v1/accounts/*', authMiddleware)
app.use('/api/v1/subscriptions/*', authMiddleware)
app.use('/api/v1/feed/*', authMiddleware)
app.use('/api/v1/enriched-bookmarks/*', authMiddleware)

// Apply auth middleware only to specific auth endpoints (not callbacks)
app.use('/api/v1/auth/*/connect', authMiddleware)
app.use('/api/v1/auth/*/disconnect', authMiddleware)

// OAuth endpoints
app.post('/api/v1/auth/:provider/connect', async (c) => {
  try {
    const provider = c.req.param('provider')
    const auth = getAuthContext(c)
    const { redirectUrl } = await c.req.json().catch(() => ({ redirectUrl: undefined }))
    
    const oauthProviders = getOAuthProviders(c.env)
    const oauthProvider = oauthProviders[provider]
    
    if (!oauthProvider) {
      return c.json({ error: 'Unsupported provider' }, 400)
    }
    
    const state = encodeState({
      userId: auth.userId,
      provider,
      redirectUrl,
      timestamp: Date.now()
    })
    
    const oauthService = new OAuthService(oauthProvider.config)
    const authUrl = oauthService.generateAuthUrl(state)
    
    return c.json({ authUrl })
  } catch (error) {
    console.error('OAuth connect error:', error)
    return c.json({ error: 'Failed to initiate OAuth flow' }, 500)
  }
})

app.get('/api/v1/auth/:provider/callback', async (c) => {
  try {
    const provider = c.req.param('provider')
    const code = c.req.query('code')
    const state = c.req.query('state')
    const error = c.req.query('error')
    
    if (error) {
      return c.json({ error: `OAuth error: ${error}` }, 400)
    }
    
    if (!code || !state) {
      return c.json({ error: 'Missing code or state parameter' }, 400)
    }
    
    const decodedState = decodeState(state)
    
    // Validate state
    if (decodedState.provider !== provider) {
      return c.json({ error: 'Invalid state parameter' }, 400)
    }
    
    // Check state age (5 minutes max)
    if (Date.now() - decodedState.timestamp > 5 * 60 * 1000) {
      return c.json({ error: 'State expired' }, 400)
    }
    
    const oauthProviders = getOAuthProviders(c.env)
    const oauthProvider = oauthProviders[provider]
    
    if (!oauthProvider) {
      return c.json({ error: 'Unsupported provider' }, 400)
    }
    
    const { subscriptionRepository } = await initializeServices(c.env.DB, c.env)
    const oauthService = new OAuthService(oauthProvider.config)
    
    console.log('Debug info:', {
      provider,
      userId: decodedState.userId,
      providerId: provider
    })
    
    // Exchange code for tokens
    console.log('Exchanging code for tokens...')
    const tokens = await oauthService.exchangeCodeForTokens(code)
    console.log('Token exchange successful:', { has_access_token: !!tokens.access_token, has_refresh_token: !!tokens.refresh_token })
    
    // Get user info from provider
    console.log('Getting user info from provider...')
    const userInfo = await getUserInfo(provider, tokens.access_token)
    console.log('User info retrieved:', { user_id: userInfo.id, display_name: userInfo.display_name })
    
    // Check if user already has this provider connected
    console.log('Checking for existing account...')
    const existingAccount = await subscriptionRepository.getUserAccount(decodedState.userId, provider)
    console.log('Existing account check:', { exists: !!existingAccount })
    
    if (existingAccount) {
      // Update existing account
      console.log('Updating existing account...')
      
      // CRITICAL: Ensure user exists with Durable Object ID before updating tokens
      // This is essential for reconnection to work properly
      console.log('Ensuring user has Durable Object ID...')
      await subscriptionRepository.ensureUser({
        id: decodedState.userId
      })
      
      // First update the account in the database
      await subscriptionRepository.updateUserAccount(existingAccount.id, {
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        expiresAt: tokens.expires_in ? new Date(Date.now() + tokens.expires_in * 1000) : undefined
      })
      
      // Also ensure tokens are updated in Durable Object
      // This is critical for reconnection to work properly
      try {
        console.log(`[OAuth] Updating tokens in DO for existing account: userId=${decodedState.userId}, provider=${provider}`)
        const { DualModeTokenService } = await import('./services/dual-mode-token-service')
        const tokenService = new DualModeTokenService(c.env)
        await tokenService.updateToken(decodedState.userId, {
          provider: provider as 'spotify' | 'youtube',
          accessToken: tokens.access_token,
          refreshToken: tokens.refresh_token,
          expiresAt: tokens.expires_in ? new Date(Date.now() + tokens.expires_in * 1000) : undefined
        })
        console.log(`[OAuth] Successfully updated tokens in Durable Object for ${decodedState.userId}/${provider}`)
      } catch (doError) {
        console.error(`[OAuth] Failed to update tokens in Durable Object for ${decodedState.userId}/${provider}:`, doError)
        // Log but don't fail the OAuth flow
      }
    } else {
      // Create new account
      console.log('Creating new account...')
      
      // First ensure the user exists
      console.log('Ensuring user exists in database...')
      await subscriptionRepository.ensureUser({
        id: decodedState.userId
      })
      
      // Then ensure the provider exists
      console.log('Ensuring provider exists in database...')
      await subscriptionRepository.ensureProvider({
        id: provider,
        name: provider === 'spotify' ? 'Spotify' : 'YouTube',
        oauthConfig: JSON.stringify(oauthProvider.config)
      })
      
      await subscriptionRepository.createUserAccount({
        id: `${decodedState.userId}-${provider}-${Date.now()}`,
        userId: decodedState.userId,
        providerId: provider,
        externalAccountId: userInfo.id,
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        expiresAt: tokens.expires_in ? new Date(Date.now() + tokens.expires_in * 1000) : undefined,
        isActive: true
      })
      
      // Also store tokens in Durable Object for new accounts
      try {
        const { DualModeTokenService } = await import('./services/dual-mode-token-service')
        const tokenService = new DualModeTokenService(c.env)
        await tokenService.updateToken(decodedState.userId, {
          provider: provider as 'spotify' | 'youtube',
          accessToken: tokens.access_token,
          refreshToken: tokens.refresh_token,
          expiresAt: tokens.expires_in ? new Date(Date.now() + tokens.expires_in * 1000) : undefined
        })
        console.log('Successfully stored tokens in Durable Object for new account')
      } catch (doError) {
        console.error('Failed to store tokens in Durable Object:', doError)
        // Log but don't fail the OAuth flow
      }
    }
    
    console.log('OAuth callback completed successfully')
    
    // Redirect to frontend with success
    const redirectUrl = decodedState.redirectUrl || `${c.env.API_BASE_URL}/feed`
    return c.redirect(`${redirectUrl}?provider=${provider}&status=success`)
    
  } catch (error) {
    console.error('OAuth callback error:', error)
    console.error('Error details:', {
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    })
    return c.json({ 
      error: 'OAuth callback failed',
      details: error instanceof Error ? error.message : String(error)
    }, 500)
  }
})

app.delete('/api/v1/auth/:provider/disconnect', async (c) => {
  try {
    const provider = c.req.param('provider')
    const auth = getAuthContext(c)
    
    const { subscriptionRepository } = await initializeServices(c.env.DB, c.env)
    
    const account = await subscriptionRepository.getUserAccount(auth.userId, provider)
    if (!account) {
      return c.json({ error: 'Account not found' }, 404)
    }
    
    // Delete the account from database
    await subscriptionRepository.deleteUserAccount(account.id)
    
    // Also remove tokens from Durable Object
    try {
      const { DualModeTokenService } = await import('./services/dual-mode-token-service')
      const tokenService = new DualModeTokenService(c.env)
      await tokenService.deleteToken(auth.userId, provider as 'spotify' | 'youtube')
      console.log(`Successfully removed ${provider} tokens from Durable Object`)
    } catch (doError) {
      console.error(`Failed to remove ${provider} tokens from Durable Object:`, doError)
      // Log but don't fail the disconnect
    }
    
    return c.json({ message: 'Account disconnected successfully' })
  } catch (error) {
    console.error('OAuth disconnect error:', error)
    return c.json({ error: 'Failed to disconnect account' }, 500)
  }
})

// Manual token refresh endpoint
app.post('/api/v1/auth/:provider/refresh', authMiddleware, async (c) => {
  try {
    const provider = c.req.param('provider')
    const auth = getAuthContext(c)
    
    if (!['spotify', 'youtube'].includes(provider)) {
      return c.json({ error: 'Invalid provider' }, 400)
    }
    
    const { subscriptionRepository } = await initializeServices(c.env.DB, c.env)
    
    // Get the user's account for this provider
    const existingAccount = await subscriptionRepository.getUserAccount(auth.userId, provider)
    if (!existingAccount) {
      return c.json({ error: `No ${provider} account connected` }, 404)
    }
    
    if (!existingAccount.refreshToken) {
      return c.json({ error: 'No refresh token available - please reconnect your account' }, 400)
    }
    
    console.log(`[ManualRefresh] User ${auth.userId} requesting manual refresh for ${provider} account ${existingAccount.id}`)
    
    // Attempt to refresh the token
    const refreshedAccount = await subscriptionRepository.getValidUserAccount(auth.userId, provider)
    
    if (!refreshedAccount) {
      console.error(`[ManualRefresh] Failed to refresh token for user ${auth.userId} provider ${provider}`)
      return c.json({ 
        error: 'Failed to refresh token - please try reconnecting your account',
        requiresReconnection: true
      }, 400)
    }
    
    // Check if the token was actually refreshed (expiration time changed)
    const wasRefreshed = !existingAccount.expiresAt || !refreshedAccount.expiresAt || 
                        refreshedAccount.expiresAt.getTime() !== existingAccount.expiresAt.getTime()
    
    console.log(`[ManualRefresh] Token refresh ${wasRefreshed ? 'successful' : 'not needed'} for user ${auth.userId} provider ${provider}`)
    
    return c.json({
      success: true,
      message: wasRefreshed ? 'Token refreshed successfully' : 'Token was already valid',
      account: {
        id: refreshedAccount.id,
        provider: refreshedAccount.providerId,
        externalAccountId: refreshedAccount.externalAccountId,
        expiresAt: refreshedAccount.expiresAt?.toISOString(),
        hasRefreshToken: !!refreshedAccount.refreshToken
      },
      wasRefreshed
    })
    
  } catch (error) {
    console.error('Manual token refresh error:', error)
    return c.json({ 
      error: 'Failed to refresh token',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, 500)
  }
})

// OAuth health check endpoint
app.get('/api/v1/auth/health', authMiddleware, async (c) => {
  try {
    const auth = getAuthContext(c)
    const { subscriptionRepository } = await initializeServices(c.env.DB, c.env)
    
    const oauthProviders = getOAuthProviders(c.env)
    const healthStatus = {
      userId: auth.userId,
      timestamp: new Date().toISOString(),
      providers: [] as Array<{
        provider: string
        connected: boolean
        accountId?: string
        externalAccountId?: string
        tokenStatus: 'valid' | 'expired' | 'expiring_soon' | 'no_token'
        expiresAt?: string
        hasRefreshToken: boolean
        canRefresh: boolean
        timeUntilExpiry?: string
        requiresAttention: boolean
        lastRefreshAttempt?: string
        nextAllowedRefresh?: string
      }>
    }
    
    for (const [providerId] of Object.entries(oauthProviders)) {
      const account = await subscriptionRepository.getUserAccount(auth.userId, providerId)
      
      if (!account) {
        healthStatus.providers.push({
          provider: providerId,
          connected: false,
          tokenStatus: 'no_token',
          hasRefreshToken: false,
          canRefresh: false,
          requiresAttention: false
        })
        continue
      }
      
      // Determine token status
      const now = new Date()
      const oneHourFromNow = new Date(now.getTime() + 60 * 60 * 1000)
      const fifteenMinutesFromNow = new Date(now.getTime() + 15 * 60 * 1000)
      
      let tokenStatus: 'valid' | 'expired' | 'expiring_soon' | 'no_token' = 'valid'
      let timeUntilExpiry: string | undefined
      let requiresAttention = false
      
      if (!account.expiresAt) {
        tokenStatus = 'valid'
        timeUntilExpiry = 'never expires'
      } else if (account.expiresAt <= now) {
        tokenStatus = 'expired'
        requiresAttention = true
        timeUntilExpiry = 'expired'
      } else if (account.expiresAt <= fifteenMinutesFromNow) {
        tokenStatus = 'expiring_soon'
        requiresAttention = true
        const minutesLeft = Math.floor((account.expiresAt.getTime() - now.getTime()) / 60000)
        timeUntilExpiry = `${minutesLeft} minutes`
      } else if (account.expiresAt <= oneHourFromNow) {
        tokenStatus = 'expiring_soon'
        const minutesLeft = Math.floor((account.expiresAt.getTime() - now.getTime()) / 60000)
        timeUntilExpiry = `${minutesLeft} minutes`
      } else {
        const hoursLeft = Math.floor((account.expiresAt.getTime() - now.getTime()) / 3600000)
        timeUntilExpiry = hoursLeft < 24 ? `${hoursLeft} hours` : `${Math.floor(hoursLeft / 24)} days`
      }
      
      // Check if refresh is possible
      const canRefresh = !!account.refreshToken && (tokenStatus === 'expired' || tokenStatus === 'expiring_soon')
      
      healthStatus.providers.push({
        provider: providerId,
        connected: true,
        accountId: account.id,
        externalAccountId: account.externalAccountId,
        tokenStatus,
        expiresAt: account.expiresAt?.toISOString(),
        hasRefreshToken: !!account.refreshToken,
        canRefresh,
        timeUntilExpiry,
        requiresAttention
      })
    }
    
    // Overall health summary
    const connectedCount = healthStatus.providers.filter(p => p.connected).length
    const expiredCount = healthStatus.providers.filter(p => p.tokenStatus === 'expired').length
    const expiringSoonCount = healthStatus.providers.filter(p => p.tokenStatus === 'expiring_soon').length
    const requiresAttentionCount = healthStatus.providers.filter(p => p.requiresAttention).length
    
    return c.json({
      ...healthStatus,
      summary: {
        totalProviders: healthStatus.providers.length,
        connectedProviders: connectedCount,
        expiredTokens: expiredCount,
        expiringSoonTokens: expiringSoonCount,
        requiresAttention: requiresAttentionCount,
        overallHealth: requiresAttentionCount === 0 ? 'healthy' : expiredCount > 0 ? 'critical' : 'warning'
      }
    })
    
  } catch (error) {
    console.error('OAuth health check error:', error)
    return c.json({ 
      error: 'Failed to check OAuth health',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, 500)
  }
})

// Account status endpoint
app.get('/api/v1/accounts', async (c) => {
  try {
    const auth = getAuthContext(c)
    const { subscriptionRepository } = await initializeServices(c.env.DB, c.env)
    
    const oauthProviders = getOAuthProviders(c.env)
    const accounts = []
    
    for (const [providerId, provider] of Object.entries(oauthProviders)) {
      try {
        const account = await subscriptionRepository.getUserAccount(auth.userId, providerId)
        accounts.push({
          provider: {
            id: provider.id,
            name: provider.name
          },
          connected: !!account,
          connectedAt: account?.createdAt,
          externalAccountId: account?.externalAccountId
        })
      } catch (error) {
        // If we can't get account info for a provider, still include it as disconnected
        console.warn(`Failed to get account for provider ${providerId}:`, error)
        accounts.push({
          provider: {
            id: provider.id,
            name: provider.name
          },
          connected: false,
          connectedAt: null,
          externalAccountId: null
        })
      }
    }
    
    return c.json({ accounts })
  } catch (error) {
    console.error('Get accounts error:', error)
    return c.json({ error: 'Failed to get account status' }, 500)
  }
})

// Subscription Discovery & Management endpoints
app.get('/api/v1/subscriptions/discover/:provider', async (c) => {
  try {
    const provider = c.req.param('provider') as 'spotify' | 'youtube'
    const auth = getAuthContext(c)
    
    if (!['spotify', 'youtube'].includes(provider)) {
      return c.json({ error: 'Unsupported provider' }, 400)
    }
    
    const { subscriptionDiscoveryService } = await initializeServices(c.env.DB, c.env)
    
    const result = await subscriptionDiscoveryService.discoverUserSubscriptions(auth.userId, provider)
    
    return c.json(result)
  } catch (error) {
    console.error('Subscription discovery error:', error)
    const message = error instanceof Error ? error.message : 'Failed to discover subscriptions'
    return c.json({ 
      error: message 
    }, message?.includes('No') ? 404 : 500)
  }
})

app.get('/api/v1/subscriptions', async (c) => {
  try {
    const auth = getAuthContext(c)
    const provider = c.req.query('provider') // Optional filter by provider
    
    const { subscriptionRepository } = await initializeServices(c.env.DB, c.env)
    
    let userSubscriptions
    if (provider) {
      userSubscriptions = await subscriptionRepository.getUserSubscriptionsByProvider(auth.userId, provider)
    } else {
      userSubscriptions = await subscriptionRepository.getUserSubscriptions(auth.userId)
    }
    
    return c.json({
      subscriptions: userSubscriptions.map(us => ({
        id: us.id,
        isActive: us.isActive,
        createdAt: us.createdAt,
        updatedAt: us.updatedAt,
        subscription: {
          id: us.subscription.id,
          providerId: us.subscription.providerId,
          externalId: us.subscription.externalId,
          title: us.subscription.title,
          creatorName: us.subscription.creatorName,
          description: us.subscription.description,
          thumbnailUrl: us.subscription.thumbnailUrl,
          subscriptionUrl: us.subscription.subscriptionUrl
        }
      })),
      total: userSubscriptions.length
    })
  } catch (error) {
    console.error('Get subscriptions error:', error)
    return c.json({ error: 'Failed to get subscriptions' }, 500)
  }
})

app.post('/api/v1/subscriptions/:provider/update', async (c) => {
  try {
    const provider = c.req.param('provider') as 'spotify' | 'youtube'
    const auth = getAuthContext(c)
    
    if (!['spotify', 'youtube'].includes(provider)) {
      return c.json({ error: 'Unsupported provider' }, 400)
    }
    
    const body = await c.req.json()
    const { subscriptions } = body
    
    if (!Array.isArray(subscriptions)) {
      return c.json({ error: 'subscriptions must be an array' }, 400)
    }
    
    const { subscriptionDiscoveryService, initialFeedPopulationService } = await initializeServices(c.env.DB, c.env)
    
    const result = await subscriptionDiscoveryService.updateUserSubscriptions(
      auth.userId,
      provider,
      subscriptions
    )
    
    // If new subscriptions were added, populate initial feed with content from last 7 days
    if (result.newSubscriptionIds.length > 0) {
      console.log(`[SubscriptionUpdate] Populating initial feed for ${result.newSubscriptionIds.length} new subscriptions`)
      
      try {
        const populationResults = await initialFeedPopulationService.populateInitialFeedForUser(
          auth.userId,
          result.newSubscriptionIds
        )
        
        const totalItemsAdded = populationResults.reduce((sum, r) => sum + r.itemsAdded, 0)
        console.log(`[SubscriptionUpdate] Added ${totalItemsAdded} items to user's feed from last 7 days`)
      } catch (error) {
        // Log error but don't fail the subscription update
        console.error('[SubscriptionUpdate] Error populating initial feed:', error)
      }
    }
    
    return c.json({
      message: 'Subscriptions updated successfully',
      added: result.added,
      removed: result.removed
    })
  } catch (error) {
    console.error('Update subscriptions error:', error)
    return c.json({ error: 'Failed to update subscriptions' }, 500)
  }
})

// Manual refresh endpoint - allows users to trigger feed refresh for their subscriptions
app.post('/api/v1/subscriptions/refresh', async (c) => {
  try {
    const auth = getAuthContext(c)
    const { RateLimiter } = await import('./services/rate-limiter')
    
    // Check rate limiting
    const rateLimitResult = await RateLimiter.checkRateLimit(c, auth.userId)
    
    if (!rateLimitResult.allowed) {
      const message = RateLimiter.getRateLimitMessage(rateLimitResult.remainingTime!)
      return c.json({ 
        error: 'Rate limited',
        message,
        retryAfter: Math.ceil(rateLimitResult.remainingTime! / 1000),
        nextAllowedTime: new Date(Date.now() + rateLimitResult.remainingTime!).toISOString()
      }, 429)
    }
    
    // Get user's Durable Object ID
    const userResult = await c.env.DB.prepare(`
      SELECT durable_object_id as durableObjectId
      FROM users
      WHERE id = ?
      LIMIT 1
    `).bind(auth.userId).first()
    
    if (!userResult || !userResult.durableObjectId) {
      console.log(`[ManualRefresh] No Durable Object found for user ${auth.userId}`)
      return c.json({ 
        error: 'User configuration not found',
        message: 'Unable to refresh subscriptions. Please try reconnecting your accounts.'
      }, 404)
    }
    
    // Record the refresh attempt for rate limiting
    await RateLimiter.recordRefresh(c, auth.userId)
    
    // Get the Durable Object stub and trigger polling
    const doId = c.env.USER_SUBSCRIPTION_MANAGER.idFromString(userResult.durableObjectId as string)
    const stub = c.env.USER_SUBSCRIPTION_MANAGER.get(doId)
    
    // Send poll request to the Durable Object
    const pollResponse = await stub.fetch(new Request('https://do/poll'))
    const pollResult = await pollResponse.json() as {
      success: boolean
      newItemsCount: number
      errors: string[]
      results: Array<{
        provider: string
        subscriptionsPolled: number
        newItemsFound: number
      }>
    }
    
    if (!pollResult.success) {
      console.error(`[ManualRefresh] Polling failed for user ${auth.userId}:`, pollResult.errors)
      return c.json({ 
        error: 'Failed to refresh subscriptions',
        message: 'An error occurred while refreshing your subscriptions. Please try again later.',
        details: pollResult.errors
      }, 500)
    }
    
    // Calculate next allowed refresh time
    const nextAllowedTime = new Date(Date.now() + 5 * 60 * 1000)
    
    return c.json({
      success: true,
      message: pollResult.newItemsCount > 0 
        ? `Found ${pollResult.newItemsCount} new ${pollResult.newItemsCount === 1 ? 'item' : 'items'}!`
        : 'No new items found',
      newItemsCount: pollResult.newItemsCount,
      details: pollResult.results,
      nextAllowedTime: nextAllowedTime.toISOString(),
      rateLimitSeconds: 300 // 5 minutes
    })
    
  } catch (error) {
    console.error('[ManualRefresh] Error:', error)
    return c.json({ 
      error: 'Internal server error',
      message: 'An unexpected error occurred. Please try again later.'
    }, 500)
  }
})

// Feed endpoints
app.get('/api/v1/feed', async (c) => {
  try {
    const auth = getAuthContext(c)
    const unreadOnly = c.req.query('unread') === 'true'
    const subscriptionId = c.req.query('subscription')
    const limit = parseInt(c.req.query('limit') || '50')
    const offset = parseInt(c.req.query('offset') || '0')
    
    const { feedItemRepository } = await initializeServices(c.env.DB, c.env)
    
    let feedItems
    if (subscriptionId) {
      // Get feed items for specific subscription
      feedItems = await feedItemRepository.getUserFeedItemsBySubscription(
        auth.userId, 
        subscriptionId, 
        unreadOnly, 
        limit, 
        offset
      )
    } else {
      // Get all feed items for user
      feedItems = await feedItemRepository.getUserFeedItemsWithDetails(
        auth.userId, 
        unreadOnly, 
        limit, 
        offset
      )
    }
    
    return c.json({
      feedItems: feedItems.map(item => ({
        id: item.id,
        feedItem: {
          id: item.feedItem.id,
          title: item.feedItem.title,
          description: item.feedItem.description,
          thumbnailUrl: item.feedItem.thumbnailUrl,
          publishedAt: item.feedItem.publishedAt,
          durationSeconds: item.feedItem.durationSeconds,
          externalUrl: item.feedItem.externalUrl,
          subscription: {
            id: item.feedItem.subscription.id,
            title: item.feedItem.subscription.title,
            creatorName: item.feedItem.subscription.creatorName,
            thumbnailUrl: item.feedItem.subscription.thumbnailUrl,
            providerId: item.feedItem.subscription.providerId
          }
        },
        isRead: item.isRead,
        readAt: item.readAt,
        bookmarkId: item.bookmarkId,
        createdAt: item.createdAt
      })),
      pagination: {
        limit,
        offset,
        hasMore: feedItems.length === limit
      }
    })
  } catch (error) {
    console.error('Get feed items error:', error)
    return c.json({ error: 'Failed to get feed items' }, 500)
  }
})

app.put('/api/v1/feed/:itemId/read', async (c) => {
  try {
    const auth = getAuthContext(c)
    const itemId = c.req.param('itemId')
    
    console.log(`Mark as read request for itemId: ${itemId} by userId: ${auth.userId}`)
    
    const { feedItemRepository, subscriptionRepository } = await initializeServices(c.env.DB, c.env)
    
    // Ensure user exists in database before marking as read
    await subscriptionRepository.ensureUser({
      id: auth.userId
    })
    
    // Extract the actual feedItemId from the userFeedItemId if needed
    // The itemId might be in format: userId-feedItemId-timestamp
    let feedItemId = itemId
    
    // Check if this looks like a userFeedItemId (contains userId prefix)
    if (itemId.startsWith(auth.userId + '-')) {
      // Extract the feedItemId part (everything after userId- and before the last timestamp)
      const parts = itemId.substring(auth.userId.length + 1).split('-')
      if (parts.length >= 3) {
        // Remove the last part (timestamp) and rejoin
        parts.pop() // Remove timestamp
        feedItemId = parts.join('-')
        console.log(`Extracted feedItemId: ${feedItemId} from userFeedItemId: ${itemId}`)
      }
    }
    
    await feedItemRepository.markAsRead(auth.userId, feedItemId)
    
    return c.json({ message: 'Item marked as read' })
  } catch (error) {
    console.error('Mark as read error:', error)
    return c.json({ error: 'Failed to mark item as read' }, 500)
  }
})

app.put('/api/v1/feed/:itemId/unread', async (c) => {
  try {
    const auth = getAuthContext(c)
    const itemId = c.req.param('itemId')
    
    console.log(`Mark as unread request for itemId: ${itemId} by userId: ${auth.userId}`)
    
    const { feedItemRepository, subscriptionRepository } = await initializeServices(c.env.DB, c.env)
    
    // Ensure user exists in database before marking as unread
    await subscriptionRepository.ensureUser({
      id: auth.userId
    })
    
    // Extract the actual feedItemId from the userFeedItemId if needed
    // The itemId might be in format: userId-feedItemId-timestamp
    let feedItemId = itemId
    
    // Check if this looks like a userFeedItemId (contains userId prefix)
    if (itemId.startsWith(auth.userId + '-')) {
      // Extract the feedItemId part (everything after userId- and before the last timestamp)
      const parts = itemId.substring(auth.userId.length + 1).split('-')
      if (parts.length >= 3) {
        // Remove the last part (timestamp) and rejoin
        parts.pop() // Remove timestamp
        feedItemId = parts.join('-')
        console.log(`Extracted feedItemId: ${feedItemId} from userFeedItemId: ${itemId}`)
      }
    }
    
    await feedItemRepository.markAsUnread(auth.userId, feedItemId)
    
    return c.json({ message: 'Item marked as unread' })
  } catch (error) {
    console.error('Mark as unread error:', error)
    return c.json({ error: 'Failed to mark item as unread' }, 500)
  }
})

app.get('/api/v1/feed/subscriptions', async (c) => {
  try {
    const auth = getAuthContext(c)
    
    const { feedItemRepository } = await initializeServices(c.env.DB, c.env)
    
    const subscriptionsWithCounts = await feedItemRepository.getSubscriptionsWithUnreadCounts(auth.userId)
    
    return c.json({
      subscriptions: subscriptionsWithCounts.map(sub => ({
        id: sub.subscription.id,
        title: sub.subscription.title,
        creatorName: sub.subscription.creatorName,
        thumbnailUrl: sub.subscription.thumbnailUrl,
        providerId: sub.subscription.providerId,
        unreadCount: sub.unreadCount,
        lastUpdated: sub.lastUpdated
      }))
    })
  } catch (error) {
    console.error('Get subscriptions with counts error:', error)
    return c.json({ error: 'Failed to get subscriptions with unread counts' }, 500)
  }
})

// Feed Polling endpoints
app.get('/api/v1/jobs/poll-feeds', async (c) => {
  try {
    const { feedPollingService } = await initializeServices(c.env.DB, c.env)
    
    console.log('Manual feed polling triggered')
    const results = await feedPollingService.pollAllActiveSubscriptions()
    
    return c.json({ 
      message: 'Feed polling completed successfully',
      results,
      summary: {
        timestamp: results.timestamp,
        subscriptionsPolled: results.totalSubscriptionsPolled,
        newItemsFound: results.totalNewItems,
        usersNotified: results.totalUsersNotified,
        errors: results.errors.length
      }
    })
  } catch (error) {
    console.error('Manual feed polling error:', error)
    return c.json({ 
      error: 'Failed to trigger feed polling',
      details: error instanceof Error ? error.message : String(error)
    }, 500)
  }
})

app.post('/api/v1/jobs/schedule-polls', async (c) => {
  try {
    return c.json({ 
      message: 'Scheduled polling is configured via Cloudflare Workers cron triggers',
      timestamp: new Date().toISOString(),
      schedule: 'Hourly (0 * * * *)',
      status: 'active'
    })
  } catch (error) {
    console.error('Schedule polling setup error:', error)
    return c.json({ error: 'Failed to setup scheduled polling' }, 500)
  }
})

// Monitoring and health check endpoints
app.get('/api/v1/health/feeds', async (c) => {
  try {
    const { subscriptionRepository } = await initializeServices(c.env.DB, c.env)
    
    // Get basic stats
    const spotifySubscriptions = await subscriptionRepository.getSubscriptionsByProvider('spotify')
    const youtubeSubscriptions = await subscriptionRepository.getSubscriptionsByProvider('youtube')
    
    // Get recent polling activity (checking for recent feed items)
    const now = new Date()
    
    // This is a basic health check - in production you'd want more detailed metrics
    return c.json({
      status: 'healthy',
      timestamp: now.toISOString(),
      subscriptions: {
        spotify: spotifySubscriptions.length,
        youtube: youtubeSubscriptions.length,
        total: spotifySubscriptions.length + youtubeSubscriptions.length
      },
      polling: {
        schedule: 'Hourly (0 * * * *)',
        nextRun: 'At the top of every hour',
        status: 'active'
      },
      lastHour: {
        note: 'Detailed metrics would be added in production monitoring'
      }
    })
  } catch (error) {
    console.error('Feed health check error:', error)
    return c.json({ 
      status: 'unhealthy',
      error: 'Failed to check feed health',
      timestamp: new Date().toISOString()
    }, 500)
  }
})

app.get('/api/v1/jobs/status', async (c) => {
  try {
    return c.json({
      scheduled: {
        feedPolling: {
          enabled: true,
          schedule: 'Hourly (0 * * * *)',
          lastRun: 'See Cloudflare Workers logs',
          nextRun: 'At the top of every hour'
        }
      },
      manual: {
        pollFeeds: {
          endpoint: '/api/v1/jobs/poll-feeds',
          method: 'GET',
          description: 'Manually trigger feed polling for all subscriptions'
        }
      },
      monitoring: {
        health: '/api/v1/health/feeds',
        status: '/api/v1/jobs/status'
      },
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('Job status error:', error)
    return c.json({ error: 'Failed to get job status' }, 500)
  }
})

// Migration endpoints
app.post('/api/v1/migration/tokens-to-do', async (c) => {
  try {
    const { runMigration } = await import('./migrations/migration-cli')
    const response = await runMigration(c.env, c.req.raw)
    const text = await response.text()
    return c.text(text)
  } catch (error) {
    console.error('Migration error:', error)
    return c.json({ error: 'Migration failed', details: error instanceof Error ? error.message : String(error) }, 500)
  }
})

app.get('/api/v1/migration/status', async (c) => {
  try {
    const { runMigration } = await import('./migrations/migration-cli')
    const request = new Request(`${c.req.url}?action=status`)
    const response = await runMigration(c.env, request)
    const text = await response.text()
    return c.text(text)
  } catch (error) {
    console.error('Migration status error:', error)
    return c.json({ error: 'Failed to get migration status', details: error instanceof Error ? error.message : String(error) }, 500)
  }
})

app.get('/api/v1/migration/metrics', async (c) => {
  try {
    const { DualModeSubscriptionRepository } = await import('./repositories/dual-mode-subscription-repository')
    const { getFeatureFlagService } = await import('./services/feature-flags')
    
    const featureFlags = getFeatureFlagService(c.env)
    const dualModeRepo = new DualModeSubscriptionRepository(c.env)
    
    return c.json({
      featureFlags: featureFlags.getFlags(),
      tokenServiceMetrics: dualModeRepo.getTokenServiceMetrics(),
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('Migration metrics error:', error)
    return c.json({ error: 'Failed to get migration metrics', details: error instanceof Error ? error.message : String(error) }, 500)
  }
})

// Bookmarks endpoints
app.get('/api/v1/bookmarks', async (c) => {
  const { bookmarkService } = await initializeServices(c.env.DB, c.env)
  const auth = getAuthContext(c)
  
  try {
    // Get query parameters for filtering
    const status = c.req.query('status') || 'active'
    const source = c.req.query('source')
    const contentType = c.req.query('contentType')
    
    const result = await bookmarkService.getBookmarks()
    if (result.error) {
      return c.json({ error: result.error }, 500)
    }
    
    let bookmarks = result.data || []
    
    // Apply filters
    bookmarks = bookmarks.filter(bookmark => {
      // Filter by authenticated user ID
      if (bookmark.userId !== auth.userId) return false
      
      // Filter by status
      if (bookmark.status !== status) return false
      
      // Filter by source if specified
      if (source && bookmark.source !== source) return false
      
      // Filter by content type if specified
      if (contentType && bookmark.contentType !== contentType) return false
      
      return true
    })
    
    // Sort by created date (newest first)
    bookmarks.sort((a, b) => {
      const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0
      const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0
      return dateB - dateA
    })
    
    return c.json({
      data: bookmarks,
      meta: {
        total: bookmarks.length,
        userId: auth.userId,
        status,
        ...(source && { source }),
        ...(contentType && { contentType })
      }
    })
  } catch (error) {
    return c.json({ error: 'Failed to fetch bookmarks' }, 500)
  }
})

app.get('/api/v1/bookmarks/:id', async (c) => {
  const { bookmarkService } = await initializeServices(c.env.DB, c.env)
  const auth = getAuthContext(c)
  const id = c.req.param('id')
  
  const result = await bookmarkService.getBookmark(id)
  if (result.error) {
    return c.json({ error: result.error }, result.error === 'Bookmark not found' ? 404 : 500)
  }
  
  // Ensure user can only access their own bookmarks
  if (result.data?.userId !== auth.userId) {
    return c.json({ error: 'Bookmark not found' }, 404)
  }
  
  return c.json(result.data)
})

app.post('/api/v1/bookmarks', async (c) => {
  const { bookmarkService } = await initializeServices(c.env.DB, c.env)
  const auth = getAuthContext(c)
  
  try {
    const body = await c.req.json()
    const validatedData = CreateBookmarkSchema.parse(body)
    
    // Ensure user exists in database before creating bookmark
    console.log('Ensuring user exists for userId:', auth.userId)
    const d1Repository = new D1BookmarkRepository(c.env.DB)
    await d1Repository.ensureUser({
      id: auth.userId
    })
    console.log('User ensured successfully for userId:', auth.userId)
    
    const result = await bookmarkService.createBookmark(validatedData, auth.userId)
    if (result.error) {
      return c.json({ error: result.error }, 500)
    }
    return c.json(result.data, 201)
  } catch (error) {
    return c.json({ error: 'Invalid request data' }, 400)
  }
})

app.put('/api/v1/bookmarks/:id', async (c) => {
  const { bookmarkService } = await initializeServices(c.env.DB, c.env)
  const auth = getAuthContext(c)
  
  try {
    const id = c.req.param('id')
    
    // First check if bookmark exists and belongs to user
    const existingResult = await bookmarkService.getBookmark(id)
    if (existingResult.error) {
      return c.json({ error: existingResult.error }, existingResult.error === 'Bookmark not found' ? 404 : 500)
    }
    
    if (existingResult.data?.userId !== auth.userId) {
      return c.json({ error: 'Bookmark not found' }, 404)
    }
    
    const body = await c.req.json()
    const validatedData = UpdateBookmarkSchema.parse(body)
    const result = await bookmarkService.updateBookmark(id, validatedData)
    if (result.error) {
      return c.json({ error: result.error }, result.error === 'Bookmark not found' ? 404 : 500)
    }
    return c.json(result.data)
  } catch (error) {
    return c.json({ error: 'Invalid request data' }, 400)
  }
})

app.delete('/api/v1/bookmarks/:id', async (c) => {
  const { bookmarkService } = await initializeServices(c.env.DB, c.env)
  const auth = getAuthContext(c)
  const id = c.req.param('id')
  
  // First check if bookmark exists and belongs to user
  const existingResult = await bookmarkService.getBookmark(id)
  if (existingResult.error) {
    return c.json({ error: existingResult.error }, existingResult.error === 'Bookmark not found' ? 404 : 500)
  }
  
  if (existingResult.data?.userId !== auth.userId) {
    return c.json({ error: 'Bookmark not found' }, 404)
  }
  
  const result = await bookmarkService.deleteBookmark(id)
  if (result.error) {
    return c.json({ error: result.error }, result.error === 'Bookmark not found' ? 404 : 500)
  }
  return c.json({ message: result.message })
})

// New save endpoint with enhanced API enrichment
app.post('/api/v1/bookmarks/save', async (c) => {
  const { bookmarkSaveService } = await initializeServices(c.env.DB, c.env)
  const auth = getAuthContext(c)
  
  try {
    const body = await c.req.json()
    const validatedData = SaveBookmarkSchema.parse(body)
    
    // Ensure user exists in database before creating bookmark
    console.log('Ensuring user exists for userId:', auth.userId)
    const d1Repository = new D1BookmarkRepository(c.env.DB)
    await d1Repository.ensureUser({
      id: auth.userId
    })
    console.log('User ensured successfully for userId:', auth.userId)
    
    // Ensure userId is set to authenticated user
    const saveData = {
      ...validatedData,
      userId: auth.userId
    }
    

    
    // Fall back to regular save if API enrichment not used or failed
    const result = await bookmarkSaveService.saveBookmark(saveData, auth.userId)
    
    if (!result.success) {
      if (result.duplicate) {
        return c.json({ 
          error: result.message,
          duplicate: result.duplicate 
        }, 409) // Conflict
      }
      console.error('Error creating bookmark with metadata:', result.error)
      return c.json({ error: result.error }, 500)
    }
    
    return c.json({ 
      data: result.bookmark,
      message: result.message 
    }, 201)
  } catch (error) {
    console.error('Error creating bookmark with metadata:', error)
    return c.json({ error: 'Invalid request data' }, 400)
  }
})

// Refresh metadata endpoint
app.put('/api/v1/bookmarks/:id/refresh', async (c) => {
  const { bookmarkSaveService } = await initializeServices(c.env.DB, c.env)
  const auth = getAuthContext(c)
  
  try {
    const id = c.req.param('id')
    
    // First check if bookmark exists and belongs to user
    const { bookmarkService } = await initializeServices(c.env.DB, c.env)
    const existingResult = await bookmarkService.getBookmark(id)
    if (existingResult.error) {
      return c.json({ error: existingResult.error }, existingResult.error === 'Bookmark not found' ? 404 : 500)
    }
    
    if (existingResult.data?.userId !== auth.userId) {
      return c.json({ error: 'Bookmark not found' }, 404)
    }
    
    const result = await bookmarkSaveService.refreshMetadata(id)
    
    if (!result.success) {
      return c.json({ error: result.error }, result.error === 'Bookmark not found' ? 404 : 500)
    }
    
    return c.json({ 
      data: result.bookmark,
      message: result.message 
    })
  } catch (error) {
    return c.json({ error: 'Failed to refresh metadata' }, 500)
  }
})

// User state endpoints (Recent items, Continue bookmark, etc.)
app.use('/api/v1/user-state/*', authMiddleware)

// Mount user state routes (imported at top of file)
app.route('/api/v1/user-state', userStateRoutes)

// Mount enriched bookmarks routes
import { enrichedBookmarksRoutes } from './routes/enriched-bookmarks'
app.route('/api/v1/enriched-bookmarks', enrichedBookmarksRoutes)

// Scheduled event handler for cron triggers
export default {
  // HTTP requests
  fetch: app.fetch,
  
  // Scheduled events (cron triggers)
  async scheduled(_event: ScheduledEvent, env: Bindings, ctx: ExecutionContext): Promise<void> {
    const now = new Date()
    console.log(`[Scheduled] Starting Durable Object polling at ${now.toISOString()}`)
    
    // Immediately return to prevent CPU timeout, use waitUntil for async work
    ctx.waitUntil(
      this.performScheduledWork(env).catch(error => {
        console.error('[Scheduled] Fatal error during scheduled task:', error)
      })
    )
  },

  // Separate async method for the actual work
  async performScheduledWork(env: Bindings): Promise<void> {
    const now = new Date()
    
    try {
      // Get all active users with Durable Objects
      const activeUsers = await env.DB.prepare(`
        SELECT DISTINCT u.id, u.durable_object_id as durableObjectId
        FROM users u
        INNER JOIN user_accounts ua ON u.id = ua.userId
        WHERE u.durable_object_id IS NOT NULL
        LIMIT 100
      `).all()
      
      if (!activeUsers || activeUsers.results.length === 0) {
        console.log('[Scheduled] No active users with Durable Objects found')
        return
      }
      
      console.log(`[Scheduled] Found ${activeUsers.results.length} active users with Durable Objects`)
      
      // Process users in smaller batches to avoid CPU timeout
      const BATCH_SIZE = 5 // Smaller batch size to avoid CPU timeout
      const userBatches = []
      for (let i = 0; i < activeUsers.results.length; i += BATCH_SIZE) {
        userBatches.push(activeUsers.results.slice(i, i + BATCH_SIZE))
      }
      
      const results = []
      
      // Process each batch of users
      for (const [batchIndex, batch] of userBatches.entries()) {
        console.log(`[Scheduled] Processing batch ${batchIndex + 1}/${userBatches.length} (${batch.length} users)`)
        
        // Create promises for this batch
        const batchPromises = batch.map(async (user) => {
          const startTime = Date.now()
          try {
            const doId = env.USER_SUBSCRIPTION_MANAGER.idFromString(user.durableObjectId as string)
            const stub = env.USER_SUBSCRIPTION_MANAGER.get(doId)
            
            // Use a timeout to prevent hanging requests
            const controller = new AbortController()
            const timeout = setTimeout(() => controller.abort(), 25000) // 25 second timeout
            
            try {
              const response = await stub.fetch(
                new Request('https://do.internal/poll', { signal: controller.signal })
              )
              clearTimeout(timeout)
              
              if (!response.ok) {
                console.error(`[Scheduled] Poll failed for user ${user.id}: ${response.status}`)
                return { 
                  userId: user.id, 
                  durableObjectId: user.durableObjectId,
                  success: false, 
                  error: `HTTP ${response.status}`,
                  duration: Date.now() - startTime
                }
              }
              
              const result = await response.json() as any
              return { 
                userId: user.id, 
                durableObjectId: user.durableObjectId,
                success: true, 
                duration: Date.now() - startTime,
                ...result 
              }
            } catch (timeoutError: any) {
              clearTimeout(timeout)
              if (timeoutError.name === 'AbortError') {
                console.error(`[Scheduled] Poll timeout for user ${user.id}`)
                return {
                  userId: user.id,
                  durableObjectId: user.durableObjectId,
                  success: false,
                  error: 'Request timeout',
                  duration: Date.now() - startTime
                }
              }
              throw timeoutError
            }
          } catch (error) {
            console.error(`[Scheduled] Error polling user ${user.id}:`, error)
            return { 
              userId: user.id, 
              durableObjectId: user.durableObjectId,
              success: false, 
              error: error instanceof Error ? error.message : String(error),
              duration: Date.now() - startTime
            }
          }
        })
        
        // Execute batch and collect results
        const batchResults = await Promise.allSettled(batchPromises)
        results.push(...batchResults)
        
        // Small delay between batches to prevent CPU spikes
        if (batchIndex < userBatches.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 100))
        }
      }
      
      // Aggregate results and update DO status tracking
      let totalNewItems = 0
      let successfulPolls = 0
      let failedPolls = 0
      const doStatusUpdates = []
      
      for (const result of results) {
        if (result.status === 'fulfilled' && result.value.success) {
          successfulPolls++
          totalNewItems += result.value.newItemsCount || 0
          
          // Prepare status update for successful poll
          doStatusUpdates.push({
            userId: result.value.userId,
            durableObjectId: result.value.durableObjectId,
            status: 'healthy',
            lastPollTime: now,
            lastPollSuccess: true,
            lastPollError: null,
            newItems: result.value.newItemsCount || 0,
            duration: result.value.duration
          })
        } else {
          failedPolls++
          
          // Prepare status update for failed poll
          if (result.status === 'rejected') {
            // For rejected promises, we might not have userId/durableObjectId
            console.error('[Scheduled] Poll promise rejected:', result.reason)
          } else if (result.value) {
            doStatusUpdates.push({
              userId: result.value.userId,
              durableObjectId: result.value.durableObjectId,
              status: 'unhealthy',
              lastPollTime: now,
              lastPollSuccess: false,
              lastPollError: result.value.error || 'Unknown error',
              newItems: 0,
              duration: result.value.duration || 0
            })
          }
        }
      }
      
      // Update DO status tracking in database
      try {
        // Check if the durable_object_status table exists
        const tableCheck = await env.DB.prepare(`
          SELECT name FROM sqlite_master WHERE type='table' AND name='durable_object_status'
        `).first()
        
        if (!tableCheck) {
          console.log('[Scheduled] durable_object_status table not found, skipping status updates')
          return
        }
        
        for (const update of doStatusUpdates) {
          await env.DB.prepare(`
            INSERT INTO durable_object_status (
              id, userId, durableObjectId, status, lastPollTime, 
              lastPollSuccess, lastPollError, totalPollCount, 
              successfulPollCount, failedPollCount, totalNewItems,
              createdAt, updatedAt
            ) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
              status = excluded.status,
              lastPollTime = excluded.lastPollTime,
              lastPollSuccess = excluded.lastPollSuccess,
              lastPollError = excluded.lastPollError,
              totalPollCount = durable_object_status.totalPollCount + 1,
              successfulPollCount = CASE 
                WHEN excluded.lastPollSuccess = 1 
                THEN durable_object_status.successfulPollCount + 1 
                ELSE durable_object_status.successfulPollCount 
              END,
              failedPollCount = CASE 
                WHEN excluded.lastPollSuccess = 0 
                THEN durable_object_status.failedPollCount + 1 
                ELSE durable_object_status.failedPollCount 
              END,
              totalNewItems = durable_object_status.totalNewItems + excluded.totalNewItems,
              updatedAt = excluded.updatedAt
          `).bind(
            `${update.userId}-do-status`,
            update.userId,
            update.durableObjectId,
            update.status,
            update.lastPollTime.getTime(),
            update.lastPollSuccess ? 1 : 0,
            update.lastPollError,
            update.lastPollSuccess ? 1 : 0,
            update.lastPollSuccess ? 0 : 1,
            update.newItems,
            now.getTime(),
            now.getTime()
          ).run()
        }
      } catch (error) {
        console.error('[Scheduled] Error updating DO status tracking:', error)
      }
      
      console.log(`[Scheduled] Durable Object polling completed:`, {
        totalUsers: activeUsers.results.length,
        successfulPolls,
        failedPolls,
        totalNewItems
      })
      
    } catch (error) {
      console.error('[Scheduled] Fatal error during scheduled task:', error)
    }
  }
}

// Export Durable Objects
export { UserSubscriptionManager } from './durable-objects/user-subscription-manager'
export { UserRecentBookmarksDO } from './durableObjects/UserRecentBookmarksDO'