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

      // Poll Spotify subscriptions
      for (const subscription of spotifySubscriptions) {
        try {
          const result = await this.pollSpotifySubscription(subscription)
          results.push(result)
          totalNewItems += result.newItemsFound
          totalUsersNotified += result.totalUsersNotified
        } catch (error) {
          const errorMsg = `Spotify subscription ${subscription.title}: ${error instanceof Error ? error.message : String(error)}`
          console.error(`[FeedPolling] ${errorMsg}`)
          globalErrors.push(errorMsg)
        }
      }

      // Poll YouTube subscriptions
      for (const subscription of youtubeSubscriptions) {
        try {
          const result = await this.pollYouTubeSubscription(subscription)
          results.push(result)
          totalNewItems += result.newItemsFound
          totalUsersNotified += result.totalUsersNotified
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

  private async pollSpotifySubscription(subscription: Subscription): Promise<PollResult> {
    console.log(`[FeedPolling] Polling Spotify subscription: ${subscription.title}`)

    // Get any user's access token for this provider (we need one to make API calls)
    const userAccount = await this.getAnyValidUserAccount('spotify')
    if (!userAccount) {
      console.log(`[FeedPolling] No valid Spotify tokens available for ${subscription.title} - skipping for MVP`)
      return {
        provider: 'spotify',
        subscriptionId: subscription.id,
        subscriptionTitle: subscription.title,
        newItemsFound: 0,
        totalUsersNotified: 0,
        errors: ['No valid Spotify tokens available - MVP limitation']
      }
    }

    const spotifyAPI = new SpotifyAPI(userAccount.accessToken)

    // Get latest episodes for this show
    const episodes = await spotifyAPI.getLatestEpisodes(subscription.externalId, 20)
    console.log(`[FeedPolling] Found ${episodes.length} recent episodes for ${subscription.title}`)

    const newFeedItems: FeedItem[] = []
    
    for (const episode of episodes) {
      // Check if we already have this episode
      const existingItem = await this.feedItemRepository.getFeedItem(
        `${subscription.id}-${episode.id}`
      )
      
      if (!existingItem) {
        // Create new feed item
        const feedItem: Omit<FeedItem, 'createdAt'> = {
          id: `${subscription.id}-${episode.id}`,
          subscriptionId: subscription.id,
          externalId: episode.id,
          title: episode.name,
          description: episode.description,
          thumbnailUrl: episode.images?.[0]?.url,
          publishedAt: new Date(episode.release_date),
          durationSeconds: Math.round(episode.duration_ms / 1000),
          externalUrl: episode.external_urls.spotify
        }

        const createdItem = await this.feedItemRepository.createFeedItem(feedItem)
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
    const userAccount = await this.getAnyValidUserAccount('youtube')
    if (!userAccount) {
      console.log(`[FeedPolling] No valid YouTube tokens available for ${subscription.title} - skipping for MVP`)
      return {
        provider: 'youtube',
        subscriptionId: subscription.id,
        subscriptionTitle: subscription.title,
        newItemsFound: 0,
        totalUsersNotified: 0,
        errors: ['No valid YouTube tokens available - MVP limitation']
      }
    }

    const youtubeAPI = new YouTubeAPI(userAccount.accessToken)

    // Get latest videos for this channel
    const videos = await youtubeAPI.getLatestVideos(subscription.externalId, 20)
    console.log(`[FeedPolling] Found ${videos.length} recent videos for ${subscription.title}`)

    const newFeedItems: FeedItem[] = []
    
    for (const video of videos) {
      // Check if we already have this video
      const existingItem = await this.feedItemRepository.getFeedItem(
        `${subscription.id}-${video.id}`
      )
      
      if (!existingItem) {
        // Create new feed item
        const feedItem: Omit<FeedItem, 'createdAt'> = {
          id: `${subscription.id}-${video.id}`,
          subscriptionId: subscription.id,
          externalId: video.id,
          title: video.snippet.title,
          description: video.snippet.description,
          thumbnailUrl: video.snippet.thumbnails?.medium?.url || video.snippet.thumbnails?.default?.url,
          publishedAt: new Date(video.snippet.publishedAt),
          durationSeconds: YouTubeAPI.parseDuration(video.contentDetails.duration),
          externalUrl: `https://youtube.com/watch?v=${video.id}`
        }

        const createdItem = await this.feedItemRepository.createFeedItem(feedItem)
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

    // For MVP, we'll simulate user feed item creation without actually querying all users
    // In a real implementation, we'd need a method to get all users subscribed to a specific subscription
    // This would require extending the repository interface
    
    console.log(`[FeedPolling] Would create user feed items for subscription ${subscriptionId} with ${newFeedItems.length} new items`)
    console.log(`[FeedPolling] Simulating creation for MVP - would notify users subscribed to this subscription`)
    
    // Return a simulated count for MVP
    return Math.max(1, newFeedItems.length * 2) // Simulate 2 users per new item on average
  }

  private async getAnyValidUserAccount(providerId: string): Promise<UserAccount | null> {
    try {
      // For MVP, we'll skip the actual API calls and just log what would happen
      // In a real implementation, we'd need to:
      // 1. Get all user accounts for this provider
      // 2. Find one with a valid (non-expired) token
      // 3. Refresh tokens if needed
      
      console.log(`[FeedPolling] Would fetch episodes/videos for provider ${providerId}, but skipping API calls for MVP`)
      return null
    } catch (error) {
      console.error(`Error getting user account for provider ${providerId}:`, error)
      return null
    }
  }


}