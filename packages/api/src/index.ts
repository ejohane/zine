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
import { D1SubscriptionRepository } from './d1-subscription-repository'
import { D1FeedItemRepository } from './d1-feed-item-repository'
import { authMiddleware, getAuthContext } from './middleware/auth'
import { getOAuthProviders } from './oauth/oauth-config'
import { OAuthService, encodeState, decodeState, getUserInfo } from './oauth/oauth-service'
import { setupDatabase } from './setup-database'
import { SubscriptionDiscoveryService } from './services/subscription-discovery-service'
import { FeedPollingService } from './services/feed-polling-service'

type Bindings = {
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
}

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
let subscriptionRepository: D1SubscriptionRepository
let feedItemRepository: D1FeedItemRepository
let subscriptionDiscoveryService: SubscriptionDiscoveryService
let feedPollingService: FeedPollingService

// Initialize services on first request
async function initializeServices(db: D1Database) {
  if (!bookmarkService) {
    const d1Repository = new D1BookmarkRepository(db)
    bookmarkService = new BookmarkService(d1Repository)
    bookmarkSaveService = new BookmarkSaveService(d1Repository)
    subscriptionRepository = new D1SubscriptionRepository(db)
    feedItemRepository = new D1FeedItemRepository(db)
    subscriptionDiscoveryService = new SubscriptionDiscoveryService(subscriptionRepository)
    feedPollingService = new FeedPollingService(subscriptionRepository, feedItemRepository)
    
    // Setup database tables and providers
    await setupDatabase(db)
  }
  return { 
    bookmarkService, 
    bookmarkSaveService, 
    subscriptionRepository, 
    feedItemRepository,
    subscriptionDiscoveryService,
    feedPollingService
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

// Apply authentication middleware to protected routes
app.use('/api/v1/bookmarks/*', authMiddleware)
app.use('/api/v1/accounts/*', authMiddleware)
app.use('/api/v1/subscriptions/*', authMiddleware)

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
    
    const { subscriptionRepository } = await initializeServices(c.env.DB)
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
      await subscriptionRepository.updateUserAccount(existingAccount.id, {
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        expiresAt: tokens.expires_in ? new Date(Date.now() + tokens.expires_in * 1000) : undefined
      })
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
        expiresAt: tokens.expires_in ? new Date(Date.now() + tokens.expires_in * 1000) : undefined
      })
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
    
    const { subscriptionRepository } = await initializeServices(c.env.DB)
    
    const account = await subscriptionRepository.getUserAccount(auth.userId, provider)
    if (!account) {
      return c.json({ error: 'Account not found' }, 404)
    }
    
    await subscriptionRepository.deleteUserAccount(account.id)
    
    return c.json({ message: 'Account disconnected successfully' })
  } catch (error) {
    console.error('OAuth disconnect error:', error)
    return c.json({ error: 'Failed to disconnect account' }, 500)
  }
})

// Account status endpoint
app.get('/api/v1/accounts', async (c) => {
  try {
    const auth = getAuthContext(c)
    const { subscriptionRepository } = await initializeServices(c.env.DB)
    
    const oauthProviders = getOAuthProviders(c.env)
    const accounts = []
    
    for (const [providerId, provider] of Object.entries(oauthProviders)) {
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
    
    const { subscriptionDiscoveryService } = await initializeServices(c.env.DB)
    
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
    
    const { subscriptionRepository } = await initializeServices(c.env.DB)
    
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
    
    const { subscriptionDiscoveryService } = await initializeServices(c.env.DB)
    
    const result = await subscriptionDiscoveryService.updateUserSubscriptions(
      auth.userId,
      provider,
      subscriptions
    )
    
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

// Feed Polling endpoints
app.get('/api/v1/jobs/poll-feeds', async (c) => {
  try {
    const { feedPollingService } = await initializeServices(c.env.DB)
    
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
    // Setup scheduled polling - for now just return success
    // TODO: Implement actual Cloudflare Workers cron trigger setup
    return c.json({ 
      message: 'Scheduled polling setup successfully',
      timestamp: new Date().toISOString(),
      note: 'Scheduled polling will be implemented with Cloudflare Workers cron triggers'
    })
  } catch (error) {
    console.error('Schedule polling setup error:', error)
    return c.json({ error: 'Failed to setup scheduled polling' }, 500)
  }
})

// Bookmarks endpoints
app.get('/api/v1/bookmarks', async (c) => {
  const { bookmarkService } = await initializeServices(c.env.DB)
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
  const { bookmarkService } = await initializeServices(c.env.DB)
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
  const { bookmarkService } = await initializeServices(c.env.DB)
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
  const { bookmarkService } = await initializeServices(c.env.DB)
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
  const { bookmarkService } = await initializeServices(c.env.DB)
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

// New save endpoint
app.post('/api/v1/bookmarks/save', async (c) => {
  const { bookmarkSaveService } = await initializeServices(c.env.DB)
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

// Metadata preview endpoint
app.post('/api/v1/bookmarks/preview', async (c) => {
  const { bookmarkSaveService } = await initializeServices(c.env.DB)
  try {
    const body = await c.req.json()
    const { url } = body
    
    if (!url || typeof url !== 'string') {
      return c.json({ error: 'URL is required' }, 400)
    }
    
    const result = await bookmarkSaveService.previewMetadata(url)
    
    if (!result.success) {
      return c.json({ error: result.error }, 500)
    }
    
    return c.json({ 
      data: result.bookmark,
      message: result.message 
    })
  } catch (error) {
    return c.json({ error: 'Invalid request data' }, 400)
  }
})

// Refresh metadata endpoint
app.put('/api/v1/bookmarks/:id/refresh', async (c) => {
  const { bookmarkSaveService } = await initializeServices(c.env.DB)
  const auth = getAuthContext(c)
  
  try {
    const id = c.req.param('id')
    
    // First check if bookmark exists and belongs to user
    const { bookmarkService } = await initializeServices(c.env.DB)
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

// Scheduled event handler for cron triggers
export default {
  // HTTP requests
  fetch: app.fetch,
  
  // Scheduled events (cron triggers)
  async scheduled(event: ScheduledEvent, env: Bindings, ctx: ExecutionContext): Promise<void> {
    console.log(`[Scheduled] Feed polling triggered by cron at ${new Date().toISOString()}`)
    
    try {
      // Initialize services
      const { feedPollingService } = await initializeServices(env.DB)
      
      // Run the polling
      const results = await feedPollingService.pollAllActiveSubscriptions()
      
      console.log(`[Scheduled] Feed polling completed:`, {
        subscriptionsPolled: results.totalSubscriptionsPolled,
        newItemsFound: results.totalNewItems,
        usersNotified: results.totalUsersNotified,
        errors: results.errors.length
      })
      
      // If there are critical errors, we could log them or send alerts
      if (results.errors.length > 0) {
        console.error('[Scheduled] Feed polling errors:', results.errors)
      }
      
    } catch (error) {
      console.error('[Scheduled] Fatal error during scheduled feed polling:', error)
      // In production, you might want to send this to an error tracking service
    }
  }
}