import { SubscriptionRepository, FeedItemRepository, UserAccount } from '@zine/shared'
import { SpotifyAPI } from '../external/spotify-api'
import { YouTubeAPI } from '../external/youtube-api'

export interface InitialFeedPopulationResult {
  subscriptionId: string
  subscriptionTitle: string
  itemsAdded: number
  error?: string
}

export class InitialFeedPopulationService {
  constructor(
    private subscriptionRepository: SubscriptionRepository,
    private feedItemRepository: FeedItemRepository
  ) {}

  async populateInitialFeedForUser(
    userId: string,
    subscriptionIds: string[]
  ): Promise<InitialFeedPopulationResult[]> {
    const results: InitialFeedPopulationResult[] = []
    const twentyFourHoursAgo = new Date()
    twentyFourHoursAgo.setHours(twentyFourHoursAgo.getHours() - 24)

    console.log(`[InitialFeedPopulation] Populating initial feed for user ${userId} with ${subscriptionIds.length} subscriptions`)

    // Group subscriptions by provider
    const subscriptionsByProvider = new Map<string, string[]>()
    
    for (const subscriptionId of subscriptionIds) {
      const subscription = await this.subscriptionRepository.getSubscription(subscriptionId)
      if (!subscription) continue
      
      const providerSubs = subscriptionsByProvider.get(subscription.providerId) || []
      providerSubs.push(subscriptionId)
      subscriptionsByProvider.set(subscription.providerId, providerSubs)
    }

    // Process each provider
    for (const [providerId, subIds] of subscriptionsByProvider) {
      const userAccount = await this.subscriptionRepository.getValidUserAccount(userId, providerId)
      if (!userAccount) {
        console.error(`[InitialFeedPopulation] No valid account for provider ${providerId}`)
        continue
      }

      if (providerId === 'spotify') {
        const spotifyResults = await this.populateSpotifyFeeds(subIds, userAccount, twentyFourHoursAgo, userId)
        results.push(...spotifyResults)
      } else if (providerId === 'youtube') {
        const youtubeResults = await this.populateYouTubeFeeds(subIds, userAccount, twentyFourHoursAgo, userId)
        results.push(...youtubeResults)
      }
    }

    console.log(`[InitialFeedPopulation] Completed initial feed population for user ${userId}. Total items added: ${results.reduce((sum, r) => sum + r.itemsAdded, 0)}`)
    
    return results
  }

  private async populateSpotifyFeeds(
    subscriptionIds: string[],
    userAccount: UserAccount,
    cutoffDate: Date,
    userId: string
  ): Promise<InitialFeedPopulationResult[]> {
    const results: InitialFeedPopulationResult[] = []
    const spotifyAPI = new SpotifyAPI(userAccount.accessToken)

    for (const subscriptionId of subscriptionIds) {
      try {
        const subscription = await this.subscriptionRepository.getSubscription(subscriptionId)
        if (!subscription) continue

        // Fetch latest episodes (limited to 20)
        const episodes = await spotifyAPI.getLatestEpisodes(subscription.externalId, 20)
        
        // Filter to only episodes from the last 24 hours
        const recentEpisodes = episodes.filter(episode => {
          const publishedAt = new Date(episode.release_date)
          return publishedAt >= cutoffDate
        })

        console.log(`[InitialFeedPopulation] Found ${recentEpisodes.length} recent episodes for ${subscription.title}`)

        // Create feed items for recent episodes
        const feedItems = []
        for (const episode of recentEpisodes) {
          const feedItem = await this.feedItemRepository.findOrCreateFeedItem({
            subscriptionId: subscription.id,
            externalId: episode.id,
            title: episode.name,
            description: episode.description,
            thumbnailUrl: episode.images?.[0]?.url,
            publishedAt: new Date(episode.release_date),
            durationSeconds: Math.round(episode.duration_ms / 1000),
            externalUrl: episode.external_urls.spotify
          })

          // Check if this is actually new (created within last 5 seconds)
          const isNew = feedItem.createdAt.getTime() > Date.now() - 5000
          if (isNew) {
            feedItems.push(feedItem)
          }
        }

        // Create user feed items
        if (feedItems.length > 0) {
          const userFeedItems = feedItems.map(feedItem => ({
            id: `${userId}-${feedItem.id}`,
            userId,
            feedItemId: feedItem.id,
            isRead: false
          }))

          await this.feedItemRepository.createUserFeedItems(userFeedItems)
        }

        results.push({
          subscriptionId: subscription.id,
          subscriptionTitle: subscription.title,
          itemsAdded: feedItems.length
        })
      } catch (error) {
        const subscription = await this.subscriptionRepository.getSubscription(subscriptionId)
        results.push({
          subscriptionId,
          subscriptionTitle: subscription?.title || 'Unknown',
          itemsAdded: 0,
          error: error instanceof Error ? error.message : 'Unknown error'
        })
      }
    }

    return results
  }

  private async populateYouTubeFeeds(
    subscriptionIds: string[],
    userAccount: UserAccount,
    cutoffDate: Date,
    userId: string
  ): Promise<InitialFeedPopulationResult[]> {
    const results: InitialFeedPopulationResult[] = []
    const youtubeAPI = new YouTubeAPI(userAccount.accessToken)

    for (const subscriptionId of subscriptionIds) {
      try {
        const subscription = await this.subscriptionRepository.getSubscription(subscriptionId)
        if (!subscription) continue

        // Fetch latest videos (limited to 20)
        const videos = await youtubeAPI.getLatestVideos(subscription.externalId, 20)
        
        // Filter to only videos from the last 24 hours
        const recentVideos = videos.filter(video => {
          const publishedAt = new Date(video.snippet.publishedAt)
          return publishedAt >= cutoffDate
        })

        console.log(`[InitialFeedPopulation] Found ${recentVideos.length} recent videos for ${subscription.title}`)

        // Create feed items for recent videos
        const feedItems = []
        for (const video of recentVideos) {
          const feedItem = await this.feedItemRepository.findOrCreateFeedItem({
            subscriptionId: subscription.id,
            externalId: video.id,
            title: video.snippet.title,
            description: video.snippet.description,
            thumbnailUrl: video.snippet.thumbnails?.medium?.url || video.snippet.thumbnails?.default?.url,
            publishedAt: new Date(video.snippet.publishedAt),
            durationSeconds: YouTubeAPI.parseDuration(video.contentDetails.duration),
            externalUrl: `https://youtube.com/watch?v=${video.id}`
          })

          // Check if this is actually new (created within last 5 seconds)
          const isNew = feedItem.createdAt.getTime() > Date.now() - 5000
          if (isNew) {
            feedItems.push(feedItem)
          }
        }

        // Create user feed items
        if (feedItems.length > 0) {
          const userFeedItems = feedItems.map(feedItem => ({
            id: `${userId}-${feedItem.id}`,
            userId,
            feedItemId: feedItem.id,
            isRead: false
          }))

          await this.feedItemRepository.createUserFeedItems(userFeedItems)
        }

        results.push({
          subscriptionId: subscription.id,
          subscriptionTitle: subscription.title,
          itemsAdded: feedItems.length
        })
      } catch (error) {
        const subscription = await this.subscriptionRepository.getSubscription(subscriptionId)
        results.push({
          subscriptionId,
          subscriptionTitle: subscription?.title || 'Unknown',
          itemsAdded: 0,
          error: error instanceof Error ? error.message : 'Unknown error'
        })
      }
    }

    return results
  }
}