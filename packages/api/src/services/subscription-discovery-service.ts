import { SubscriptionRepository, UserAccount, UserSubscription, Subscription } from '@zine/shared'
import { SpotifyAPI } from '../external/spotify-api'
import { YouTubeAPI, YouTubeChannel } from '../external/youtube-api'

export interface DiscoveredSubscription {
  externalId: string
  title: string
  creatorName: string
  description?: string
  thumbnailUrl?: string
  subscriptionUrl?: string
  provider: 'spotify' | 'youtube'
  isUserSubscribed: boolean // Whether user has selected this subscription in Zine
  totalEpisodes?: number // Total episodes/videos count for optimization
}

export interface DiscoveryResult {
  provider: 'spotify' | 'youtube'
  subscriptions: DiscoveredSubscription[]
  totalFound: number
  errors?: string[]
}

export class SubscriptionDiscoveryService {
  constructor(private subscriptionRepository: SubscriptionRepository) {}

  async discoverUserSubscriptions(
    userId: string, 
    provider: 'spotify' | 'youtube'
  ): Promise<DiscoveryResult> {
    console.log(`[SubscriptionDiscoveryService] Starting discovery for user ${userId}, provider ${provider}`)
    
    // Get user's OAuth account for this provider (with automatic token refresh if needed)
    const userAccount = await this.subscriptionRepository.getValidUserAccount(userId, provider)
    
    if (!userAccount) {
      console.error(`[SubscriptionDiscoveryService] No valid account found for user ${userId}, provider ${provider}`)
      throw new Error(`No valid ${provider} account found - please reconnect your account`)
    }
    
    console.log(`[SubscriptionDiscoveryService] Found valid account for user ${userId}, has token: ${!!userAccount.accessToken}`)

    try {
      if (provider === 'spotify') {
        return await this.discoverSpotifySubscriptions(userId, userAccount)
      } else {
        return await this.discoverYouTubeSubscriptions(userId, userAccount)
      }
    } catch (error) {
      console.error(`Error discovering ${provider} subscriptions:`, error)
      const message = error instanceof Error ? error.message : 'Unknown error'
      throw new Error(`Failed to discover ${provider} subscriptions: ${message}`)
    }
  }

  private async discoverSpotifySubscriptions(
    userId: string, 
    userAccount: UserAccount
  ): Promise<DiscoveryResult> {
    if (!userAccount.accessToken) {
      throw new Error('No access token available for Spotify')
    }
    const spotifyAPI = new SpotifyAPI(userAccount.accessToken)
    
    // Test connection first
    const isConnected = await spotifyAPI.testConnection()
    if (!isConnected) {
      throw new Error('Spotify connection test failed - token may be invalid')
    }

    // Fetch all user's podcast subscriptions
    const spotifyShows = await spotifyAPI.getAllUserPodcasts()
    
    // Get user's existing Zine subscriptions for this provider
    const userSubscriptions = await this.subscriptionRepository.getUserSubscriptionsByProvider(userId, 'spotify')
    const userSubscriptionIds = new Set(userSubscriptions.map(us => us.subscription.externalId))

    // Convert Spotify shows to our format
    const discoveredSubscriptions: DiscoveredSubscription[] = spotifyShows.map(show => ({
      externalId: show.id,
      title: show.name,
      creatorName: show.publisher,
      description: show.description,
      thumbnailUrl: show.images?.[0]?.url,
      subscriptionUrl: show.external_urls?.spotify,
      provider: 'spotify' as const,
      isUserSubscribed: userSubscriptionIds.has(show.id),
      totalEpisodes: show.total_episodes
    }))

    return {
      provider: 'spotify',
      subscriptions: discoveredSubscriptions,
      totalFound: spotifyShows.length
    }
  }

  private async discoverYouTubeSubscriptions(
    userId: string, 
    userAccount: UserAccount
  ): Promise<DiscoveryResult> {
    if (!userAccount.accessToken) {
      throw new Error('No access token available for YouTube')
    }
    const youtubeAPI = new YouTubeAPI(userAccount.accessToken)
    
    // Test connection first
    const isConnected = await youtubeAPI.testConnection()
    if (!isConnected) {
      throw new Error('YouTube connection test failed - token may be invalid')
    }

    // Fetch all user's channel subscriptions
    const youtubeSubscriptions = await youtubeAPI.getAllUserSubscriptions()
    
    // Get user's existing Zine subscriptions for this provider
    const userSubscriptions = await this.subscriptionRepository.getUserSubscriptionsByProvider(userId, 'youtube')
    const userSubscriptionIds = new Set(userSubscriptions.map(us => us.subscription.externalId))

    // Extract channel IDs and fetch channel details in batches to get video counts
    const channelIds = youtubeSubscriptions.map(sub => sub.snippet.resourceId.channelId)
    const channelDetails = new Map<string, number>()
    
    // Fetch channel details in batches of 50 (YouTube's limit)
    for (let i = 0; i < channelIds.length; i += 50) {
      const batch = channelIds.slice(i, i + 50)
      const channels = await this.getMultipleChannels(youtubeAPI, batch)
      
      for (const channel of channels) {
        const videoCount = parseInt(channel.statistics?.videoCount || '0', 10)
        channelDetails.set(channel.id, videoCount)
      }
    }

    // Convert YouTube subscriptions to our format with video counts
    const discoveredSubscriptions: DiscoveredSubscription[] = youtubeSubscriptions.map(sub => ({
      externalId: sub.snippet.resourceId.channelId,
      title: sub.snippet.title,
      creatorName: sub.snippet.title, // For YouTube, channel title is the creator name
      description: sub.snippet.description,
      thumbnailUrl: sub.snippet.thumbnails?.medium?.url || sub.snippet.thumbnails?.default?.url,
      subscriptionUrl: `https://youtube.com/channel/${sub.snippet.resourceId.channelId}`,
      provider: 'youtube' as const,
      isUserSubscribed: userSubscriptionIds.has(sub.snippet.resourceId.channelId),
      totalEpisodes: channelDetails.get(sub.snippet.resourceId.channelId) || 0
    }))

    return {
      provider: 'youtube',
      subscriptions: discoveredSubscriptions,
      totalFound: youtubeSubscriptions.length
    }
  }

  private async getMultipleChannels(api: YouTubeAPI, channelIds: string[]): Promise<YouTubeChannel[]> {
    // YouTube's channels endpoint supports batch fetching
    const baseUrl = 'https://www.googleapis.com/youtube/v3'
    const params = new URLSearchParams({
      part: 'snippet,statistics',
      id: channelIds.join(',')
    })

    const response = await fetch(
      `${baseUrl}/channels?${params.toString()}`,
      {
        headers: {
          'Authorization': `Bearer ${api.getAccessToken()}`,
          'Content-Type': 'application/json'
        }
      }
    )

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`YouTube API error: ${response.status} ${error}`)
    }

    const data = await response.json() as { items: YouTubeChannel[] }
    return data.items
  }

  async updateUserSubscriptions(
    userId: string,
    provider: 'spotify' | 'youtube',
    subscriptionChoices: Array<{
      externalId: string
      title: string
      creatorName: string
      description?: string
      thumbnailUrl?: string
      subscriptionUrl?: string
      selected: boolean
      totalEpisodes?: number
    }>
  ): Promise<{ added: number; removed: number; newSubscriptionIds: string[] }> {
    const newSubscriptionIds: string[] = []

    // Get all existing user subscriptions once at the beginning
    const existingUserSubs = await this.subscriptionRepository.getUserSubscriptions(userId)
    const existingUserSubMap = new Map(existingUserSubs.map(us => [us.subscription.externalId, us]))
    
    // Prepare batch operations
    const toCreate: Array<Omit<UserSubscription, 'createdAt' | 'updatedAt'>> = []
    const toUpdate: Array<{ id: string; isActive: boolean }> = []
    const subscriptionsToEnsure: Array<{
      choice: typeof subscriptionChoices[0]
      needsUserSub: boolean
    }> = []
    
    // First, determine what operations we need
    for (const choice of subscriptionChoices) {
      const existingUserSub = existingUserSubMap.get(choice.externalId)
      
      if (choice.selected) {
        if (!existingUserSub) {
          // Need to create new user subscription
          subscriptionsToEnsure.push({ choice, needsUserSub: true })
        } else if (!existingUserSub.isActive) {
          // Need to reactivate existing subscription
          toUpdate.push({ id: existingUserSub.id, isActive: true })
          newSubscriptionIds.push(existingUserSub.subscriptionId)
        }
      } else {
        if (existingUserSub && existingUserSub.isActive) {
          // Need to deactivate subscription
          toUpdate.push({ id: existingUserSub.id, isActive: false })
        }
      }
    }
    
    // Ensure all subscriptions exist in the database (batch process)
    const SUBSCRIPTION_BATCH_SIZE = 20
    const subscriptionMap = new Map<string, Subscription>()
    
    for (let i = 0; i < subscriptionsToEnsure.length; i += SUBSCRIPTION_BATCH_SIZE) {
      const batch = subscriptionsToEnsure.slice(i, i + SUBSCRIPTION_BATCH_SIZE)
      
      const subscriptionPromises = batch.map(async ({ choice }) => {
        const subscription = await this.subscriptionRepository.findOrCreateSubscription({
          providerId: provider,
          externalId: choice.externalId,
          title: choice.title,
          creatorName: choice.creatorName,
          description: choice.description,
          thumbnailUrl: choice.thumbnailUrl,
          subscriptionUrl: choice.subscriptionUrl,
          totalEpisodes: choice.totalEpisodes
        })
        return { externalId: choice.externalId, subscription }
      })
      
      const results = await Promise.all(subscriptionPromises)
      for (const { externalId, subscription } of results) {
        subscriptionMap.set(externalId, subscription)
      }
    }
    
    // Prepare new user subscriptions
    for (const { choice, needsUserSub } of subscriptionsToEnsure) {
      if (needsUserSub) {
        const subscription = subscriptionMap.get(choice.externalId)
        if (subscription) {
          toCreate.push({
            id: `${userId}-${subscription.id}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            userId,
            subscriptionId: subscription.id,
            isActive: true
          })
          newSubscriptionIds.push(subscription.id)
        }
      }
    }
    
    // Execute batch operations
    const operations: Promise<void>[] = []
    
    // Batch create new user subscriptions
    if (toCreate.length > 0) {
      if (this.subscriptionRepository.batchCreateUserSubscriptions) {
        operations.push(this.subscriptionRepository.batchCreateUserSubscriptions(toCreate))
      } else {
        // Fallback to individual creates
        for (const sub of toCreate) {
          operations.push(this.subscriptionRepository.createUserSubscription(sub).then(() => {}))
        }
      }
    }
    
    // Batch update existing user subscriptions
    if (toUpdate.length > 0) {
      if (this.subscriptionRepository.batchUpdateUserSubscriptions) {
        operations.push(this.subscriptionRepository.batchUpdateUserSubscriptions(toUpdate))
      } else {
        // Fallback to individual updates
        for (const update of toUpdate) {
          operations.push(
            this.subscriptionRepository.updateUserSubscription(update.id, { isActive: update.isActive })
              .then(() => {})
          )
        }
      }
    }
    
    // Execute all operations
    await Promise.all(operations)
    
    // Calculate results
    const added = toCreate.length + toUpdate.filter(u => u.isActive).length
    const removed = toUpdate.filter(u => !u.isActive).length

    return { added, removed, newSubscriptionIds }
  }

}