import { SubscriptionRepository, UserAccount } from '@zine/shared'
import { SpotifyAPI } from '../external/spotify-api'
import { YouTubeAPI } from '../external/youtube-api'

export interface DiscoveredSubscription {
  externalId: string
  title: string
  creatorName: string
  description?: string
  thumbnailUrl?: string
  subscriptionUrl?: string
  provider: 'spotify' | 'youtube'
  isUserSubscribed: boolean // Whether user has selected this subscription in Zine
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
    // Get user's OAuth account for this provider
    const userAccount = await this.subscriptionRepository.getUserAccount(userId, provider)
    
    if (!userAccount) {
      throw new Error(`No ${provider} account connected for user`)
    }

    // Check if token is expired and needs refresh
    if (this.isTokenExpired(userAccount)) {
      throw new Error(`${provider} token expired - please reconnect your account`)
    }

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
      isUserSubscribed: userSubscriptionIds.has(show.id)
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

    // Convert YouTube subscriptions to our format
    const discoveredSubscriptions: DiscoveredSubscription[] = youtubeSubscriptions.map(sub => ({
      externalId: sub.snippet.resourceId.channelId,
      title: sub.snippet.title,
      creatorName: sub.snippet.title, // For YouTube, channel title is the creator name
      description: sub.snippet.description,
      thumbnailUrl: sub.snippet.thumbnails?.medium?.url || sub.snippet.thumbnails?.default?.url,
      subscriptionUrl: `https://youtube.com/channel/${sub.snippet.resourceId.channelId}`,
      provider: 'youtube' as const,
      isUserSubscribed: userSubscriptionIds.has(sub.snippet.resourceId.channelId)
    }))

    return {
      provider: 'youtube',
      subscriptions: discoveredSubscriptions,
      totalFound: youtubeSubscriptions.length
    }
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
    }>
  ): Promise<{ added: number; removed: number }> {
    let added = 0
    let removed = 0

    for (const choice of subscriptionChoices) {
      // Find or create the subscription in our database
      const subscription = await this.subscriptionRepository.findOrCreateSubscription({
        providerId: provider,
        externalId: choice.externalId,
        title: choice.title,
        creatorName: choice.creatorName,
        description: choice.description,
        thumbnailUrl: choice.thumbnailUrl,
        subscriptionUrl: choice.subscriptionUrl
      })

      // Check if user already has this subscription
      const existingUserSubs = await this.subscriptionRepository.getUserSubscriptions(userId)
      const existingUserSub = existingUserSubs.find(us => us.subscriptionId === subscription.id)

      if (choice.selected) {
        if (!existingUserSub) {
          // Add new user subscription
          await this.subscriptionRepository.createUserSubscription({
            id: `${userId}-${subscription.id}-${Date.now()}`,
            userId,
            subscriptionId: subscription.id,
            isActive: true
          })
          added++
        } else if (!existingUserSub.isActive) {
          // Reactivate existing subscription
          await this.subscriptionRepository.updateUserSubscription(existingUserSub.id, {
            isActive: true
          })
          added++
        }
      } else {
        if (existingUserSub && existingUserSub.isActive) {
          // Deactivate subscription
          await this.subscriptionRepository.updateUserSubscription(existingUserSub.id, {
            isActive: false
          })
          removed++
        }
      }
    }

    return { added, removed }
  }

  private isTokenExpired(userAccount: UserAccount): boolean {
    if (!userAccount.expiresAt) {
      return false // No expiration date means token doesn't expire
    }
    
    // Add 5 minute buffer before expiration
    const bufferMs = 5 * 60 * 1000
    return new Date().getTime() > (userAccount.expiresAt.getTime() - bufferMs)
  }
}