import { SubscriptionRepository, FeedItemRepository, UserAccount, Subscription, FeedItem } from '@zine/shared'
import { SpotifyAPI } from '../external/spotify-api'
import { YouTubeAPI } from '../external/youtube-api'

export interface PollResult {
  provider: 'spotify' | 'youtube'
  subscriptionId: string
  subscriptionTitle: string
  newItemsFound: number
  totalUsersNotified: number
  errors?: string[]
}

export interface PollingResults {
  timestamp: Date
  totalSubscriptionsPolled: number
  totalNewItems: number
  totalUsersNotified: number
  results: PollResult[]
  errors: string[]
}

export class FeedPollingService {
  private maxRetries = 3
  private baseDelay = 1000 // 1 second
  
  constructor(
    private subscriptionRepository: SubscriptionRepository,
    private feedItemRepository: FeedItemRepository
  ) {}

  async pollAllActiveSubscriptions(): Promise<PollingResults> {
    const startTime = new Date()
    console.log(`[FeedPolling] Starting polling at ${startTime.toISOString()}`)

    const results: PollResult[] = []
    const globalErrors: string[] = []
    let totalNewItems = 0
    let totalUsersNotified = 0

    try {
      // Get all active subscriptions grouped by provider
      const spotifySubscriptions = await this.subscriptionRepository.getSubscriptionsByProvider('spotify')
      const youtubeSubscriptions = await this.subscriptionRepository.getSubscriptionsByProvider('youtube')

      console.log(`[FeedPolling] Found ${spotifySubscriptions.length} Spotify and ${youtubeSubscriptions.length} YouTube subscriptions`)

      // Poll Spotify subscriptions with rate limiting
      for (let i = 0; i < spotifySubscriptions.length; i++) {
        const subscription = spotifySubscriptions[i]
        try {
          const result = await this.pollWithRetry(() => this.pollSpotifySubscription(subscription))
          results.push(result)
          totalNewItems += result.newItemsFound
          totalUsersNotified += result.totalUsersNotified

          // Rate limiting: small delay between Spotify API calls
          if (i < spotifySubscriptions.length - 1) {
            await this.delay(100) // 100ms between calls
          }
        } catch (error) {
          const errorMsg = `Spotify subscription ${subscription.title}: ${error instanceof Error ? error.message : String(error)}`
          console.error(`[FeedPolling] ${errorMsg}`)
          globalErrors.push(errorMsg)
        }
      }

      // Small delay between providers
      if (spotifySubscriptions.length > 0 && youtubeSubscriptions.length > 0) {
        await this.delay(500)
      }

      // Poll YouTube subscriptions with rate limiting
      for (let i = 0; i < youtubeSubscriptions.length; i++) {
        const subscription = youtubeSubscriptions[i]
        try {
          const result = await this.pollWithRetry(() => this.pollYouTubeSubscription(subscription))
          results.push(result)
          totalNewItems += result.newItemsFound
          totalUsersNotified += result.totalUsersNotified

          // Rate limiting: small delay between YouTube API calls
          if (i < youtubeSubscriptions.length - 1) {
            await this.delay(100) // 100ms between calls
          }
        } catch (error) {
          const errorMsg = `YouTube subscription ${subscription.title}: ${error instanceof Error ? error.message : String(error)}`
          console.error(`[FeedPolling] ${errorMsg}`)
          globalErrors.push(errorMsg)
        }
      }

      const endTime = new Date()
      const duration = endTime.getTime() - startTime.getTime()
      console.log(`[FeedPolling] Completed in ${duration}ms. Found ${totalNewItems} new items for ${totalUsersNotified} users`)

      return {
        timestamp: startTime,
        totalSubscriptionsPolled: spotifySubscriptions.length + youtubeSubscriptions.length,
        totalNewItems,
        totalUsersNotified,
        results,
        errors: globalErrors
      }
    } catch (error) {
      console.error('[FeedPolling] Fatal error during polling:', error)
      globalErrors.push(`Fatal error: ${error instanceof Error ? error.message : String(error)}`)
      
      return {
        timestamp: startTime,
        totalSubscriptionsPolled: 0,
        totalNewItems: 0,
        totalUsersNotified: 0,
        results,
        errors: globalErrors
      }
    }
  }

  private async pollWithRetry<T>(operation: () => Promise<T>): Promise<T> {
    let lastError: Error | null = null
    
    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        return await operation()
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error))
        
        if (attempt === this.maxRetries) {
          throw lastError
        }
        
        // Exponential backoff: 1s, 2s, 4s
        const delay = this.baseDelay * Math.pow(2, attempt - 1)
        console.log(`[FeedPolling] Attempt ${attempt} failed, retrying in ${delay}ms: ${lastError.message}`)
        await this.delay(delay)
      }
    }
    
    throw lastError
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }

  private async pollSpotifySubscription(subscription: Subscription): Promise<PollResult> {
    console.log(`[FeedPolling] Polling Spotify subscription: ${subscription.title}`)

    // Get any user's access token for this provider (we need one to make API calls)
    const userAccount = await this.getValidUserAccountForProvider('spotify')
    if (!userAccount) {
      console.log(`[FeedPolling] No valid Spotify tokens available for ${subscription.title}`)
      return {
        provider: 'spotify',
        subscriptionId: subscription.id,
        subscriptionTitle: subscription.title,
        newItemsFound: 0,
        totalUsersNotified: 0,
        errors: ['No valid Spotify tokens available']
      }
    }

    const spotifyAPI = new SpotifyAPI(userAccount.accessToken)

    // Test connection first
    const connectionValid = await spotifyAPI.testConnection()
    if (!connectionValid) {
      throw new Error('Spotify API connection failed - token may be invalid')
    }

    // Get latest episodes for this show
    const episodes = await spotifyAPI.getLatestEpisodes(subscription.externalId, 20)
    console.log(`[FeedPolling] Found ${episodes.length} recent episodes for ${subscription.title}`)

    const newFeedItems: FeedItem[] = []
    
    for (const episode of episodes) {
      // Use findOrCreateFeedItem for deduplication
      const feedItem: Omit<FeedItem, 'id' | 'createdAt'> = {
        subscriptionId: subscription.id,
        externalId: episode.id,
        title: episode.name,
        description: episode.description,
        thumbnailUrl: episode.images?.[0]?.url,
        publishedAt: new Date(episode.release_date),
        durationSeconds: Math.round(episode.duration_ms / 1000),
        externalUrl: episode.external_urls.spotify
      }

      const createdItem = await this.feedItemRepository.findOrCreateFeedItem(feedItem)
      
      // Check if this is actually new (created timestamp is recent)
      const isNew = createdItem.createdAt.getTime() > Date.now() - 5000 // Created within last 5 seconds
      if (isNew) {
        newFeedItems.push(createdItem)
        console.log(`[FeedPolling] Created new feed item: ${episode.name}`)
      }
    }

    // Create user feed items for all users subscribed to this subscription
    const totalUsersNotified = await this.createUserFeedItems(subscription.id, newFeedItems)

    return {
      provider: 'spotify',
      subscriptionId: subscription.id,
      subscriptionTitle: subscription.title,
      newItemsFound: newFeedItems.length,
      totalUsersNotified
    }
  }

  private async pollYouTubeSubscription(subscription: Subscription): Promise<PollResult> {
    console.log(`[FeedPolling] Polling YouTube subscription: ${subscription.title}`)

    // Get any user's access token for this provider
    const userAccount = await this.getValidUserAccountForProvider('youtube')
    if (!userAccount) {
      console.log(`[FeedPolling] No valid YouTube tokens available for ${subscription.title}`)
      return {
        provider: 'youtube',
        subscriptionId: subscription.id,
        subscriptionTitle: subscription.title,
        newItemsFound: 0,
        totalUsersNotified: 0,
        errors: ['No valid YouTube tokens available']
      }
    }

    const youtubeAPI = new YouTubeAPI(userAccount.accessToken)

    // Test connection first
    const connectionValid = await youtubeAPI.testConnection()
    if (!connectionValid) {
      throw new Error('YouTube API connection failed - token may be invalid')
    }

    // Get latest videos for this channel
    const videos = await youtubeAPI.getLatestVideos(subscription.externalId, 20)
    console.log(`[FeedPolling] Found ${videos.length} recent videos for ${subscription.title}`)

    const newFeedItems: FeedItem[] = []
    
    for (const video of videos) {
      // Use findOrCreateFeedItem for deduplication
      const feedItem: Omit<FeedItem, 'id' | 'createdAt'> = {
        subscriptionId: subscription.id,
        externalId: video.id,
        title: video.snippet.title,
        description: video.snippet.description,
        thumbnailUrl: video.snippet.thumbnails?.medium?.url || video.snippet.thumbnails?.default?.url,
        publishedAt: new Date(video.snippet.publishedAt),
        durationSeconds: YouTubeAPI.parseDuration(video.contentDetails.duration),
        externalUrl: `https://youtube.com/watch?v=${video.id}`
      }

      const createdItem = await this.feedItemRepository.findOrCreateFeedItem(feedItem)
      
      // Check if this is actually new (created timestamp is recent)
      const isNew = createdItem.createdAt.getTime() > Date.now() - 5000 // Created within last 5 seconds
      if (isNew) {
        newFeedItems.push(createdItem)
        console.log(`[FeedPolling] Created new feed item: ${video.snippet.title}`)
      }
    }

    // Create user feed items for all users subscribed to this subscription
    const totalUsersNotified = await this.createUserFeedItems(subscription.id, newFeedItems)

    return {
      provider: 'youtube',
      subscriptionId: subscription.id,
      subscriptionTitle: subscription.title,
      newItemsFound: newFeedItems.length,
      totalUsersNotified
    }
  }

  private async createUserFeedItems(subscriptionId: string, newFeedItems: FeedItem[]): Promise<number> {
    if (newFeedItems.length === 0) return 0

    // Get all users subscribed to this subscription
    const subscribedUserIds = await this.subscriptionRepository.getUsersForSubscription(subscriptionId)
    console.log(`[FeedPolling] Found ${subscribedUserIds.length} users subscribed to ${subscriptionId}`)
    
    if (subscribedUserIds.length === 0) return 0

    // Create user feed items for each new feed item and each subscribed user
    const userFeedItems = []
    for (const userId of subscribedUserIds) {
      for (const feedItem of newFeedItems) {
        userFeedItems.push({
          id: `${userId}-${feedItem.id}`,
          userId,
          feedItemId: feedItem.id,
          isRead: false
        })
      }
    }

    // Batch create all user feed items
    if (userFeedItems.length > 0) {
      await this.feedItemRepository.createUserFeedItems(userFeedItems)
      console.log(`[FeedPolling] Created ${userFeedItems.length} user feed items for subscription ${subscriptionId}`)
    }
    
    return subscribedUserIds.length
  }

  private async getValidUserAccountForProvider(providerId: string): Promise<UserAccount | null> {
    try {
      return await this.subscriptionRepository.getValidUserAccountForProvider(providerId)
    } catch (error) {
      console.error(`Error getting user account for provider ${providerId}:`, error)
      return null
    }
  }


}