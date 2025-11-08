import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'
import { z } from 'zod'
import { verifyToken } from '@clerk/backend'
import { 
  CreateBookmarkSchema, 
  UpdateBookmarkSchema,
  SaveBookmarkSchema,
  BookmarkService,
  BookmarkSaveService,
  type Bookmark
} from '@zine/shared'
import { D1BookmarkRepository } from './d1-repository'
import { D1FeedItemRepository } from './d1-feed-item-repository'
import { authMiddleware, getAuthContext } from './middleware/auth'
import { getOAuthProviders } from './oauth/oauth-config'
import { OAuthService, encodeState, decodeState, getUserInfo } from './oauth/oauth-service'
import { setupDatabase } from './setup-database'
import { SubscriptionDiscoveryService } from './services/subscription-discovery-service'
import { TokenRefreshService } from './services/token-refresh-service'
import { QueryOptimizer } from './repositories/query-optimizer'
import { InitialFeedPopulationService } from './services/initial-feed-population-service'
import { DualModeSubscriptionRepository } from './repositories/dual-mode-subscription-repository'
import { userStateRoutes } from './routes/user-state'
import { enrichedBookmarksRoutes } from './routes/enriched-bookmarks'

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
  KV: KVNamespace
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
    tokenRefreshService = new TokenRefreshService(subscriptionRepository)
    queryOptimizer = new QueryOptimizer(db)
    initialFeedPopulationService = new InitialFeedPopulationService(subscriptionRepository, feedItemRepository)
    
    // Setup database tables and providers
    await setupDatabase(db)
    
    // Create optimized indexes for feed operations (non-blocking)
    try {
      await queryOptimizer.createOptimizedIndexes()
    } catch (error) {
      console.error('[API] Failed to create optimized indexes (non-fatal):', error)
      // Continue execution - indexes are optimizations, not required for functionality
    }
  }
  return { 
    bookmarkService, 
    bookmarkSaveService, 
    subscriptionRepository, 
    feedItemRepository,
    subscriptionDiscoveryService,
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
    let userId = c.req.header('x-user-id') || undefined

    if (!userId) {
      const authHeader = c.req.header('Authorization')
      if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.substring(7)
        try {
          const payload = await verifyToken(token, {
            secretKey: c.env.CLERK_SECRET_KEY
          })
          if (payload?.sub) {
            userId = payload.sub
          }
        } catch (error) {
          console.warn('[Preview] Authorization token verification failed, continuing without user context', error)
        }
      }
    }
    
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

// Apply authentication middleware to protected routes (excluding preview)
app.use('/api/v1/bookmarks/*', async (c, next) => {
  // Skip auth for preview endpoint
  if (c.req.path === '/api/v1/bookmarks/preview') {
    return next()
  }
  return authMiddleware(c, next)
})
app.use('/api/v1/accounts/*', authMiddleware)
app.use('/api/v1/subscriptions/*', authMiddleware)
app.use('/api/v1/feed/*', authMiddleware)
app.use('/api/v1/enriched-bookmarks/*', authMiddleware)
app.use('/api/v1/search', authMiddleware)

// Apply auth middleware only to specific auth endpoints (not callbacks)
app.use('/api/v1/auth/*/connect', authMiddleware)
app.use('/api/v1/auth/*/disconnect', authMiddleware)

// Search endpoint
app.get('/api/v1/search', async (c) => {
  try {
    const auth = getAuthContext(c)
    const query = c.req.query('q')
    const type = c.req.query('type')
    const limit = parseInt(c.req.query('limit') || '20', 10)
    const offset = parseInt(c.req.query('offset') || '0', 10)

    if (!query || query.trim().length === 0) {
      return c.json({ error: 'Search query is required' }, 400)
    }

    if (query.length > 200) {
      return c.json({ error: 'Search query too long (max 200 characters)' }, 400)
    }

    const safeLimit = Math.min(Math.max(limit, 1), 50)
    const safeOffset = Math.max(offset, 0)

    const { ContentRepository } = await import('./repositories/content-repository')
    const contentRepo = new ContentRepository(c.env.DB)
    const d1Repository = new D1BookmarkRepository(c.env.DB)

    type SearchResponseItem = {
      type: string
      id: string
      title: string
      description?: string
      url: string
      thumbnailUrl?: string
      creator?: {
        id: string
        name: string
        avatarUrl?: string
      }
      contentType?: string
      publishedAt?: string
      relevanceScore: number
      notes?: string
    }

    const mapBookmarkToResult = (bookmark: Bookmark): SearchResponseItem => ({
      type: 'bookmark',
      id: bookmark.id,
      title: bookmark.title || 'Untitled',
      description: bookmark.description,
      url: bookmark.url,
      thumbnailUrl: bookmark.thumbnailUrl,
      creator: bookmark.creator ? {
        id: bookmark.creator.id,
        name: bookmark.creator.name,
        avatarUrl: bookmark.creator.avatarUrl
      } : undefined,
      contentType: bookmark.contentType,
      publishedAt: bookmark.publishedAt ? new Date(bookmark.publishedAt).toISOString() : undefined,
      relevanceScore: 1.0,
      notes: bookmark.notes
    })

    const includeBookmarks = type === 'bookmarks' || !type || type === 'all'
    const includeContent = type === 'feeds' || type === 'content' || type === 'all'

    let bookmarkResultsForResponse: SearchResponseItem[] = []
    let bookmarkResultsForCombination: SearchResponseItem[] = []
    let bookmarkTotalCount = 0

    if (includeBookmarks) {
      const bookmarkQueryLimit = type === 'all'
        ? Math.min(safeOffset + safeLimit, 500)
        : safeLimit

      const bookmarkQueryOffset = type === 'all' ? 0 : safeOffset

      const bookmarkSearch = await d1Repository.searchByUserId(auth.userId, {
        query,
        limit: bookmarkQueryLimit,
        offset: bookmarkQueryOffset
      })

      bookmarkTotalCount = bookmarkSearch.totalCount
      const mapped = bookmarkSearch.results.map(mapBookmarkToResult)

      if (type === 'all') {
        bookmarkResultsForCombination = mapped
      }

      if (type === 'bookmarks' || !type) {
        bookmarkResultsForResponse = mapped
      }
    }

    let contentResults: SearchResponseItem[] = []
    let contentResultsForResponse: SearchResponseItem[] = []

    if (includeContent) {
      const baseContentLimit = safeLimit * 2
      const contentQueryLimit = (type === 'feeds' || type === 'content')
        ? Math.min(safeOffset + safeLimit, 200)
        : baseContentLimit

      const contentItems = await contentRepo.search(query, {
        limit: contentQueryLimit,
        offset: 0,
        orderBy: 'createdAt',
        orderDirection: 'desc'
      })

      contentResults = contentItems.map((contentItem) => ({
        type: 'feed_item',
        id: contentItem.id,
        title: contentItem.title || 'Untitled',
        description: contentItem.description || undefined,
        url: contentItem.url,
        thumbnailUrl: contentItem.thumbnailUrl || undefined,
        creator: contentItem.creatorName ? {
          id: contentItem.creatorId || '',
          name: contentItem.creatorName,
          avatarUrl: undefined
        } : undefined,
        contentType: contentItem.contentType || undefined,
        publishedAt: contentItem.publishedAt ? new Date(Number(contentItem.publishedAt) * 1000).toISOString() : undefined,
        relevanceScore: 0.8
      }))

      if (type === 'feeds' || type === 'content') {
        contentResultsForResponse = contentResults.slice(safeOffset, safeOffset + safeLimit)
      }
    }

    let results: SearchResponseItem[] = []
    let totalCount = 0

    if (type === 'feeds' || type === 'content') {
      results = contentResultsForResponse
      totalCount = contentResults.length
    } else if (type === 'all') {
      const combined = [...bookmarkResultsForCombination, ...contentResults]
      results = combined.slice(safeOffset, safeOffset + safeLimit)
      totalCount = bookmarkTotalCount + contentResults.length
    } else {
      results = bookmarkResultsForResponse
      totalCount = bookmarkTotalCount
    }

    return c.json({
      results,
      totalCount,
      query,
      facets: {
        bookmarks: bookmarkTotalCount,
        content: contentResults.length
      },
      pagination: {
        limit: safeLimit,
        offset: safeOffset,
        hasMore: safeOffset + safeLimit < totalCount
      }
    })
  } catch (error) {
    console.error('Search error:', error)
    return c.json({
      error: 'Search failed',
      details: error instanceof Error ? error.message : String(error)
    }, 500)
  }
})

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
          creatorName: us.subscription.title,
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
    
    // If new subscriptions were added, populate initial feed with latest item only
    if (result.newSubscriptionIds.length > 0) {
      console.log(`[SubscriptionUpdate] Populating initial feed for ${result.newSubscriptionIds.length} new subscriptions`)
      
      try {
        const populationResults = await initialFeedPopulationService.populateInitialFeedForUser(
          auth.userId,
          result.newSubscriptionIds
        )
        
        const totalItemsAdded = populationResults.reduce((sum, r) => sum + r.itemsAdded, 0)
        console.log(`[SubscriptionUpdate] Added ${totalItemsAdded} latest items to user's feed`)
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
          contentId: item.feedItem.contentId,
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

app.put('/api/v1/feed/:itemId/read', authMiddleware, async (c) => {
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

app.put('/api/v1/feed/:itemId/hide', authMiddleware, async (c) => {
  try {
    const auth = getAuthContext(c)
    const itemId = c.req.param('itemId')
    
    console.log(`Hide feed item request for itemId: ${itemId} by userId: ${auth.userId}`)
    
    const { feedItemRepository, subscriptionRepository } = await initializeServices(c.env.DB, c.env)
    
    // Ensure user exists in database before hiding item
    await subscriptionRepository.ensureUser({
      id: auth.userId
    })
    
    // The itemId could be either a feedItemId or a userFeedItemId
    // Try to look it up as a userFeedItemId first
    let feedItemId = itemId
    
    // Check if this is a userFeedItemId by looking it up in the database
    const userFeedItem = await feedItemRepository.getUserFeedItemById(itemId)
    if (userFeedItem) {
      // Verify it belongs to the current user
      if (userFeedItem.userId !== auth.userId) {
        return c.json({ error: 'Unauthorized' }, 403)
      }
      feedItemId = userFeedItem.feedItemId
      console.log(`Found userFeedItem ${itemId}, extracted feedItemId: ${feedItemId}`)
    } else {
      console.log(`No userFeedItem found for ${itemId}, treating as feedItemId`)
    }
    
    await feedItemRepository.hideItem(auth.userId, feedItemId)
    
    return c.json({ message: 'Item hidden from feed' })
  } catch (error) {
    console.error('Hide feed item error:', error)
    return c.json({ error: 'Failed to hide feed item' }, 500)
  }
})

app.put('/api/v1/feed/:itemId/unhide', authMiddleware, async (c) => {
  try {
    const auth = getAuthContext(c)
    const itemId = c.req.param('itemId')
    
    console.log(`Unhide feed item request for itemId: ${itemId} by userId: ${auth.userId}`)
    
    const { feedItemRepository, subscriptionRepository } = await initializeServices(c.env.DB, c.env)
    
    // Ensure user exists in database before unhiding item
    await subscriptionRepository.ensureUser({
      id: auth.userId
    })
    
    // The itemId could be either a feedItemId or a userFeedItemId
    // Try to look it up as a userFeedItemId first
    let feedItemId = itemId
    
    // Check if this is a userFeedItemId by looking it up in the database
    const userFeedItem = await feedItemRepository.getUserFeedItemById(itemId)
    if (userFeedItem) {
      // Verify it belongs to the current user
      if (userFeedItem.userId !== auth.userId) {
        return c.json({ error: 'Unauthorized' }, 403)
      }
      feedItemId = userFeedItem.feedItemId
      console.log(`Found userFeedItem ${itemId}, extracted feedItemId: ${feedItemId}`)
    } else {
      console.log(`No userFeedItem found for ${itemId}, treating as feedItemId`)
    }
    
    await feedItemRepository.unhideItem(auth.userId, feedItemId)
    
    return c.json({ message: 'Item unhidden from feed' })
  } catch (error) {
    console.error('Unhide feed item error:', error)
    return c.json({ error: 'Failed to unhide feed item' }, 500)
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
        creatorName: sub.subscription.title,
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

// Feed Polling - All polling now handled by Durable Objects
// Scheduled via cron triggers calling /poll on USER_SUBSCRIPTION_MANAGER
// Manual refresh via /api/v1/subscriptions/refresh endpoint

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
        scheduled: {
          status: 'active',
          schedule: 'Hourly (0 * * * *)',
          mechanism: 'Cloudflare Workers cron triggers calling Durable Objects',
          lastRun: 'See Cloudflare Workers logs',
          nextRun: 'At the top of every hour'
        },
        manual: {
          endpoint: '/api/v1/subscriptions/refresh',
          method: 'POST',
          description: 'Manually trigger feed refresh for authenticated user (rate limited)'
        }
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
          mechanism: 'Cloudflare Workers cron triggers calling Durable Objects',
          lastRun: 'See Cloudflare Workers logs',
          nextRun: 'At the top of every hour'
        }
      },
      manual: {
        refreshFeeds: {
          endpoint: '/api/v1/subscriptions/refresh',
          method: 'POST',
          description: 'Manually trigger feed refresh for authenticated user (rate limited)'
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
    const limit = parseInt(c.req.query('limit') || '50', 10)
    const offset = parseInt(c.req.query('offset') || '0', 10)
    
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
    
    // Get total count before pagination
    const totalCount = bookmarks.length
    
    // Apply pagination
    const paginatedBookmarks = bookmarks.slice(offset, offset + limit)
    
    return c.json({
      data: paginatedBookmarks,
      meta: {
        total: totalCount,
        limit,
        offset,
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

// Get recent bookmarks endpoint
app.get('/api/v1/bookmarks/recent', async (c) => {
  const auth = getAuthContext(c)
  const limit = parseInt(c.req.query('limit') || '4', 10)
  
  try {
    // Ensure limit is reasonable (between 1 and 20)
    const safeLimit = Math.min(Math.max(limit, 1), 20)
    
    // Query for recent bookmarks
    const result = await c.env.DB.prepare(`
      SELECT 
        b.id,
        b.user_id,
        b.notes,
        b.bookmarked_at,
        b.last_accessed_at,
        b.status,
        c.url,
        c.title,
        c.description,
        c.thumbnail_url,
        c.content_type,
        c.creator_name
      FROM bookmarks b
      JOIN content c ON b.content_id = c.id
      WHERE b.user_id = ? 
        AND b.status = 'active'
        AND b.last_accessed_at IS NOT NULL
      ORDER BY b.last_accessed_at DESC
      LIMIT ?
    `).bind(auth.userId, safeLimit).all()
    
    if (!result.results) {
      return c.json({ data: [] })
    }
    
    // Map results to bookmark format
    const bookmarks = result.results.map((row: any) => ({
      id: row.id,
      userId: row.user_id,
      url: row.url,
      title: row.title,
      description: row.description,
      thumbnailUrl: row.thumbnail_url,
      contentType: row.content_type,
      notes: row.notes,
      bookmarkedAt: row.bookmarked_at,
      lastAccessedAt: row.last_accessed_at,
      status: row.status,
      creatorName: row.creator_name
    }))
    
    return c.json({ data: bookmarks })
  } catch (error) {
    console.error('Error fetching recent bookmarks:', error)
    return c.json({ error: 'Failed to fetch recent bookmarks' }, 500)
  }
})

// Track bookmark accessed endpoint
app.patch('/api/v1/bookmarks/:id/accessed', async (c) => {
  const auth = getAuthContext(c)
  const bookmarkId = c.req.param('id')
  
  try {
    const now = Date.now()
    
    // Update last_accessed_at timestamp
    const result = await c.env.DB.prepare(`
      UPDATE bookmarks 
      SET last_accessed_at = ?
      WHERE id = ? AND user_id = ?
    `).bind(now, bookmarkId, auth.userId).run()
    
    // Check if bookmark was found and updated
    if (result.meta.changes === 0) {
      return c.json({ error: 'Bookmark not found' }, 404)
    }
    
    return c.json({ 
      success: true, 
      bookmarkId,
      lastAccessedAt: now
    })
  } catch (error) {
    console.error('Error tracking bookmark access:', error)
    return c.json({ error: 'Failed to track bookmark access' }, 500)
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

// Archive bookmark endpoint
app.put('/api/v1/bookmarks/:id/archive', async (c) => {
  const { bookmarkService } = await initializeServices(c.env.DB, c.env)
  const auth = getAuthContext(c)
  const id = c.req.param('id')
  
  // Check if bookmark exists and belongs to user
  const existingResult = await bookmarkService.getBookmark(id)
  if (existingResult.error) {
    return c.json({ error: existingResult.error }, 404)
  }
  
  if (existingResult.data?.userId !== auth.userId) {
    return c.json({ error: 'Bookmark not found' }, 404)
  }
  
  // Check if already archived
  if (existingResult.data?.status === 'archived') {
    return c.json({ error: 'Bookmark is already archived' }, 400)
  }
  
  // Archive the bookmark
  const result = await bookmarkService.archiveBookmark(id)
  if (result.error) {
    return c.json({ error: result.error }, 500)
  }
  
  return c.json(result.data)
})

// Unarchive bookmark endpoint
app.put('/api/v1/bookmarks/:id/unarchive', async (c) => {
  const { bookmarkService } = await initializeServices(c.env.DB, c.env)
  const auth = getAuthContext(c)
  const id = c.req.param('id')
  
  // Check if bookmark exists and belongs to user
  const existingResult = await bookmarkService.getBookmark(id)
  if (existingResult.error) {
    return c.json({ error: existingResult.error }, 404)
  }
  
  if (existingResult.data?.userId !== auth.userId) {
    return c.json({ error: 'Bookmark not found' }, 404)
  }
  
  // Check if not archived
  if (existingResult.data?.status !== 'archived') {
    return c.json({ error: 'Bookmark is not archived' }, 400)
  }
  
  // Unarchive the bookmark
  const result = await bookmarkService.unarchiveBookmark(id)
  if (result.error) {
    return c.json({ error: result.error }, 500)
  }
  
  return c.json(result.data)
})

// Get bookmarks by creator endpoint with pagination
app.get('/api/v1/bookmarks/creator/:creatorId', async (c) => {
  const auth = getAuthContext(c)
  const creatorId = c.req.param('creatorId')
  
  // Get pagination parameters from query string
  const page = parseInt(c.req.query('page') || '1', 10)
  const limit = parseInt(c.req.query('limit') || '20', 10)
  const offset = (page - 1) * limit
  
  // Ensure reasonable limits
  const safeLimit = Math.min(Math.max(limit, 1), 50)
  
  try {
    // First get the total count
    const countResult = await c.env.DB.prepare(`
      SELECT COUNT(*) as total
      FROM bookmarks b
      LEFT JOIN content c ON b.content_id = c.id
      WHERE b.user_id = ? AND c.creator_id = ?
    `).bind(auth.userId, creatorId).first()
    
    const totalCount = Number(countResult?.total || 0)
    
    if (totalCount === 0) {
      return c.json({ 
        creator: null, 
        bookmarks: [], 
        totalCount: 0,
        page: page,
        limit: safeLimit,
        hasNextPage: false,
        hasPreviousPage: false
      })
    }
    
    // Get paginated bookmarks for the authenticated user with this creator
    const result = await c.env.DB.prepare(`
      SELECT 
        b.*,
        c.id as content_id,
        c.url as content_url,
        c.title as content_title,
        c.description as content_description,
        c.thumbnail_url as content_thumbnail_url,
        c.favicon_url as content_favicon_url,
        c.creator_id,
        c.content_type,
        c.published_at as content_published_at,
        c.provider as content_provider,
        cr.name as creator_name,
        cr.handle as creator_handle,
        cr.avatar_url as creator_avatar_url,
        cr.verified as creator_verified,
        cr.subscriber_count as creator_subscriber_count,
        cr.follower_count as creator_follower_count,
        cr.bio as creator_bio,
        cr.url as creator_url,
        cr.platforms as creator_platforms
      FROM bookmarks b
      LEFT JOIN content c ON b.content_id = c.id
      LEFT JOIN creators cr ON c.creator_id = cr.id
      WHERE b.user_id = ? AND c.creator_id = ?
      ORDER BY c.published_at DESC, b.bookmarked_at DESC
      LIMIT ? OFFSET ?
    `).bind(auth.userId, creatorId, safeLimit, offset).all()
    
    if (!result.results || result.results.length === 0) {
      return c.json({ 
        creator: null, 
        bookmarks: [], 
        totalCount: totalCount,
        page: page,
        limit: safeLimit,
        hasNextPage: false,
        hasPreviousPage: page > 1
      })
    }
    
    // Map bookmarks
    const bookmarks = result.results.map((row: any) => {
      // Use the private mapRowToBookmark method logic
      const bookmark: Bookmark = {
        id: String(row.id),
        userId: row.user_id,
        url: row.content_url || '',
        originalUrl: row.content_url || '',
        title: row.content_title || '',
        description: row.content_description || undefined,
        contentType: row.content_type || undefined,
        thumbnailUrl: row.content_thumbnail_url || undefined,
        faviconUrl: row.content_favicon_url || undefined,
        // Convert from seconds (database) to milliseconds (API response)
        publishedAt: row.content_published_at ? Number(row.content_published_at) * 1000 : undefined,
        status: row.status || 'active',
        creatorId: row.creator_id || undefined,
        tags: row.user_tags ? JSON.parse(row.user_tags) : undefined,
        notes: row.notes || undefined,
        createdAt: row.bookmarked_at ? Number(row.bookmarked_at) : Date.now(),
        updatedAt: row.bookmarked_at ? Number(row.bookmarked_at) : Date.now(),
        creator: row.creator_id && row.creator_name ? {
          id: row.creator_id,
          name: row.creator_name,
          handle: row.creator_handle || undefined,
          avatarUrl: row.creator_avatar_url || undefined,
          verified: row.creator_verified === 1 || row.creator_verified === true || undefined,
          subscriberCount: row.creator_subscriber_count ? Number(row.creator_subscriber_count) : undefined,
          followerCount: row.creator_follower_count ? Number(row.creator_follower_count) : undefined,
          platform: row.content_provider || undefined,
          bio: row.creator_bio || undefined,
          url: row.creator_url || undefined,
          platforms: row.creator_platforms ? JSON.parse(String(row.creator_platforms)) : undefined,
          externalLinks: undefined,
          createdAt: undefined,
          updatedAt: undefined
        } : null
      }
      
      return bookmark
    })
    
    // Get creator info from first bookmark
    const firstRow = result.results[0]
    const creator = firstRow.creator_id && firstRow.creator_name ? {
      id: firstRow.creator_id,
      name: firstRow.creator_name,
      handle: firstRow.creator_handle || undefined,
      avatarUrl: firstRow.creator_avatar_url || undefined,
      verified: firstRow.creator_verified === 1 || firstRow.creator_verified === true || undefined,
      subscriberCount: firstRow.creator_subscriber_count ? Number(firstRow.creator_subscriber_count) : undefined,
      followerCount: firstRow.creator_follower_count ? Number(firstRow.creator_follower_count) : undefined,
      platform: firstRow.content_provider || undefined,
      bio: firstRow.creator_bio || undefined,
      url: firstRow.creator_url || (firstRow.content_provider === 'youtube' 
        ? `https://youtube.com/channel/${String(firstRow.creator_id).replace('youtube:', '')}`
        : firstRow.content_provider === 'spotify' 
        ? `https://open.spotify.com/show/${String(firstRow.creator_id).replace('spotify:', '')}`
        : undefined),
      platforms: firstRow.creator_platforms ? JSON.parse(String(firstRow.creator_platforms)) : undefined
    } : null
    
    const hasNextPage = offset + safeLimit < totalCount
    const hasPreviousPage = page > 1
    
    return c.json({
      creator,
      bookmarks,
      totalCount: totalCount,
      page: page,
      limit: safeLimit,
      hasNextPage,
      hasPreviousPage,
      totalPages: Math.ceil(totalCount / safeLimit)
    })
  } catch (error) {
    console.error('Error fetching bookmarks by creator:', error)
    return c.json({ error: 'Failed to fetch bookmarks by creator' }, 500)
  }
})

// New save endpoint with enhanced API enrichment
app.post('/api/v1/bookmarks/save', async (c) => {
  const { bookmarkSaveService } = await initializeServices(c.env.DB, c.env)
  const auth = getAuthContext(c)
  
  try {
    const body = await c.req.json()
    console.log('[Save Endpoint] Received body:', JSON.stringify(body))
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
    if (error instanceof z.ZodError) {
      console.error('Validation errors:', error.errors)
      return c.json({ 
        error: 'Invalid request data', 
        details: error.errors 
      }, 400)
    }
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

// Get content by ID endpoint (for feed items that aren't bookmarked yet)
app.get('/api/v1/content/:contentId', authMiddleware, async (c) => {
  try {
    const contentId = c.req.param('contentId')
    
    // Use ContentRepository to fetch content
    const { ContentRepository } = await import('./repositories/content-repository')
    const contentRepository = new ContentRepository(c.env.DB)
    
    const content = await contentRepository.findById(contentId)
    
    if (!content) {
      return c.json({ error: 'Content not found' }, 404)
    }
    
    // Join with creator data if creatorId exists
    const { CreatorRepository } = await import('./repositories/creator-repository')
    const creatorRepository = new CreatorRepository(c.env.DB)
    
    let creator = null
    if (content.creatorId) {
      creator = await creatorRepository.getCreator(content.creatorId)
    }
    
    // If no creator info in content table, try to get it from feed item's subscription
    let subscriptionCreatorName = null
    let subscriptionCreatorThumbnail = null
    if (!creator && !content.creatorName) {
      const feedItemResult = await c.env.DB.prepare(`
        SELECT 
          s.creator_name,
          s.thumbnail_url
        FROM feed_items fi
        JOIN subscriptions s ON fi.subscription_id = s.id
        WHERE fi.content_id = ?
        LIMIT 1
      `).bind(contentId).first()
      
      if (feedItemResult) {
        subscriptionCreatorName = feedItemResult.creator_name as string
        subscriptionCreatorThumbnail = feedItemResult.thumbnail_url as string
      }
    }
    
    // Format response with creator data
    const response = {
      id: content.id,
      externalId: content.externalId,
      provider: content.provider,
      contentType: content.contentType,
      title: content.title,
      description: content.description,
      url: content.url,
      thumbnailUrl: content.thumbnailUrl,
      publishedAt: content.publishedAt?.getTime(),
      creator: creator ? {
        id: creator.id,
        name: creator.name,
        handle: creator.handle,
        avatarUrl: creator.avatarUrl,
        verified: creator.verified || false
      } : (content.creatorName ? {
        id: content.creatorId || '',
        name: content.creatorName,
        handle: content.creatorHandle,
        avatarUrl: content.creatorThumbnail,
        verified: content.creatorVerified || false
      } : (subscriptionCreatorName ? {
        id: '',
        name: subscriptionCreatorName,
        avatarUrl: subscriptionCreatorThumbnail,
        verified: false
      } : null)),
      videoMetadata: content.contentType === 'video' ? {
        duration: content.durationSeconds,
        viewCount: content.viewCount
      } : undefined,
      podcastMetadata: content.contentType === 'podcast' ? {
        duration: content.durationSeconds,
        episodeNumber: content.episodeNumber
      } : undefined,
      articleMetadata: content.contentType === 'article' ? {
        readingTime: Math.ceil((content.durationSeconds || 0) / 60), // Convert seconds to minutes
        wordCount: undefined // Not stored currently
      } : undefined
    }
    
    return c.json(response)
  } catch (error) {
    console.error('Error fetching content:', error)
    return c.json({ error: 'Failed to fetch content' }, 500)
  }
})

// Create bookmark from existing content endpoint
app.post('/api/v1/bookmarks/from-content', authMiddleware, async (c) => {
  try {
    const auth = getAuthContext(c)
    const body = await c.req.json()
    
    // Validate request body with Zod
    const { CreateBookmarkFromContentSchema } = await import('@zine/shared')
    const parseResult = CreateBookmarkFromContentSchema.safeParse(body)
    if (!parseResult.success) {
      return c.json({ 
        error: 'Invalid request body', 
        details: parseResult.error.errors 
      }, 400)
    }
    const { contentId, notes, tags } = parseResult.data
    
    // Check if content exists
    const { ContentRepository } = await import('./repositories/content-repository')
    const contentRepository = new ContentRepository(c.env.DB)
    const content = await contentRepository.findById(contentId)
    
    if (!content) {
      return c.json({ error: 'Content not found' }, 404)
    }
    
    // Check for existing bookmark
    const d1Repository = new D1BookmarkRepository(c.env.DB)
    
    // Query to check if bookmark already exists
    const existingBookmark = await c.env.DB.prepare(`
      SELECT id, content_id 
      FROM bookmarks 
      WHERE user_id = ? AND content_id = ? AND status != 'deleted'
      LIMIT 1
    `).bind(auth.userId, contentId).first()
    
    if (existingBookmark) {
      // Return existing bookmark with duplicate flag
      const bookmarkResult = await d1Repository.getById(existingBookmark.id as string)
      if (!bookmarkResult) {
        // This should not happen, but handle it gracefully
        console.error(`Bookmark ${existingBookmark.id} found in query but getById returned null`)
        return c.json({ error: 'Bookmark not found' }, 404)
      }
      return c.json({
        data: bookmarkResult,
        duplicate: true,
        existingBookmarkId: existingBookmark.id
      })
    }
    
    // Ensure user exists
    await d1Repository.ensureUser({ id: auth.userId })
    
    // Create new bookmark
    const bookmarkId = `${auth.userId}-${Date.now()}`
    const now = Date.now()
    
    await c.env.DB.prepare(`
      INSERT INTO bookmarks (
        id, user_id, content_id, notes, user_tags, status, bookmarked_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `).bind(
      bookmarkId,
      auth.userId,
      contentId,
      notes || null,
      tags ? JSON.stringify(tags) : null,
      'active',
      now
    ).run()
    
    // Fetch and return the created bookmark
    const bookmark = await d1Repository.getById(bookmarkId)
    
    // Link bookmark to feed item if it exists
    try {
      const { feedItemRepository } = await initializeServices(c.env.DB, c.env)
      
      // Find feed item by content ID
      const feedItemResult = await c.env.DB.prepare(`
        SELECT id FROM feed_items WHERE content_id = ? LIMIT 1
      `).bind(contentId).first()
      
      if (feedItemResult) {
        const feedItemId = feedItemResult.id as string
        // Update user_feed_items to link this bookmark
        await feedItemRepository.addBookmarkToFeedItem(auth.userId, feedItemId, bookmarkId)
      }
    } catch (linkError) {
      console.error('Failed to link bookmark to feed item:', linkError)
      // Don't fail the request if linking fails
    }
    
    // Invalidate caches (if using Durable Objects for recent bookmarks)
    try {
      const doId = c.env.USER_RECENT_BOOKMARKS.idFromName(auth.userId)
      const stub = c.env.USER_RECENT_BOOKMARKS.get(doId)
      await stub.fetch(new Request('http://do/invalidate', { method: 'POST' }))
    } catch (doError) {
      console.error('Failed to invalidate recent bookmarks cache:', doError)
      // Don't fail the request if cache invalidation fails
    }
    
    return c.json({
      data: bookmark,
      duplicate: false
    }, 201)
  } catch (error) {
    console.error('Error creating bookmark from content:', error)
    return c.json({ error: 'Failed to create bookmark' }, 500)
  }
})

// User state endpoints (Recent items, Continue bookmark, etc.)
app.use('/api/v1/user-state/*', authMiddleware)

// Mount user state routes (imported at top of file)
app.route('/api/v1/user-state', userStateRoutes)

// Mount enriched bookmarks routes
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
        INNER JOIN user_accounts ua ON u.id = ua.user_id
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
              id, user_id, durable_object_id, status, last_poll_time,
              last_poll_success, last_poll_error, total_poll_count,
              successful_poll_count, failed_poll_count, total_new_items,
              created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
              status = excluded.status,
              last_poll_time = excluded.last_poll_time,
              last_poll_success = excluded.last_poll_success,
              last_poll_error = excluded.last_poll_error,
              total_poll_count = durable_object_status.total_poll_count + 1,
              successful_poll_count = CASE
                WHEN excluded.last_poll_success = 1
                THEN durable_object_status.successful_poll_count + 1
                ELSE durable_object_status.successful_poll_count
              END,
              failed_poll_count = CASE
                WHEN excluded.last_poll_success = 0
                THEN durable_object_status.failed_poll_count + 1
                ELSE durable_object_status.failed_poll_count
              END,
              total_new_items = durable_object_status.total_new_items + excluded.total_new_items,
              updated_at = excluded.updated_at
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
export { UserRecentBookmarksDO } from './durable-objects/user-recent-bookmarks-do'
