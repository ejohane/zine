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

    console.log(`[InitialFeedPopulation] Populating initial feed for user ${userId} with ${subscriptionIds.length} subscriptions (latest item only)`)

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
        const spotifyResults = await this.populateSpotifyFeeds(subIds, userAccount, userId)
        results.push(...spotifyResults)
      } else if (providerId === 'youtube') {
        const youtubeResults = await this.populateYouTubeFeeds(subIds, userAccount, userId)
        results.push(...youtubeResults)
      }
    }

    console.log(`[InitialFeedPopulation] Completed initial feed population for user ${userId}. Total items added: ${results.reduce((sum, r) => sum + r.itemsAdded, 0)}`)
    
    return results
  }

  private async populateSpotifyFeeds(
    subscriptionIds: string[],
    userAccount: UserAccount,
    userId: string
  ): Promise<InitialFeedPopulationResult[]> {
    const results: InitialFeedPopulationResult[] = []
    if (!userAccount.accessToken) {
      console.log('[InitialFeedPopulation] No access token for Spotify')
      return results
    }
    const spotifyAPI = new SpotifyAPI(userAccount.accessToken)

    for (const subscriptionId of subscriptionIds) {
      try {
        const subscription = await this.subscriptionRepository.getSubscription(subscriptionId)
        if (!subscription) continue

        // Fetch only the latest episode
        const episodes = await spotifyAPI.getLatestEpisodes(subscription.externalId, 1)
        
        console.log(`[InitialFeedPopulation] Found ${episodes.length} latest episode for ${subscription.title}`)

        // Create feed items for the latest episode
        const feedItems = []
        for (const episode of episodes) {
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

        // Filter out items that are already bookmarked
        let itemsAddedCount = 0
        if (feedItems.length > 0) {
          const provider = subscription.id.split('-')[0] || 'unknown'
          const contentIds = feedItems.map(item => `${provider}-${item.externalId}`)
          const bookmarkedContentIds = await this.feedItemRepository.getBookmarkedContentIds(userId, contentIds)

          const unbookmarkedFeedItems = feedItems.filter((item) => {
            const contentId = `${provider}-${item.externalId}`
            return !bookmarkedContentIds.has(contentId)
          })

          // Create user feed items only for unbookmarked content
          if (unbookmarkedFeedItems.length > 0) {
            const userFeedItems = unbookmarkedFeedItems.map(feedItem => ({
              id: `${userId}-${feedItem.id}`,
              userId,
              feedItemId: feedItem.id,
              isRead: false
            }))

            await this.feedItemRepository.createUserFeedItems(userFeedItems)
            itemsAddedCount = unbookmarkedFeedItems.length
          }

          if (feedItems.length - unbookmarkedFeedItems.length > 0) {
            console.log(`[InitialFeedPopulation] Filtered out ${feedItems.length - unbookmarkedFeedItems.length} bookmarked items for ${subscription.title}`)
          }
        }

        results.push({
          subscriptionId: subscription.id,
          subscriptionTitle: subscription.title,
          itemsAdded: itemsAddedCount
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
    userId: string
  ): Promise<InitialFeedPopulationResult[]> {
    const results: InitialFeedPopulationResult[] = []
    if (!userAccount.accessToken) {
      console.log('[InitialFeedPopulation] No access token for YouTube')
      return results
    }
    const youtubeAPI = new YouTubeAPI(userAccount.accessToken)

    for (const subscriptionId of subscriptionIds) {
      try {
        const subscription = await this.subscriptionRepository.getSubscription(subscriptionId)
        if (!subscription) continue

        // Fetch only the latest video
        const videos = await youtubeAPI.getLatestVideos(subscription.externalId, 1)
        
        console.log(`[InitialFeedPopulation] Found ${videos.length} latest video for ${subscription.title}`)

        // Create feed items for the latest video
        const feedItems = []
        for (const video of videos) {
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

        // Filter out items that are already bookmarked
        let itemsAddedCount = 0
        if (feedItems.length > 0) {
          const provider = subscription.id.split('-')[0] || 'unknown'
          const contentIds = feedItems.map(item => `${provider}-${item.externalId}`)
          const bookmarkedContentIds = await this.feedItemRepository.getBookmarkedContentIds(userId, contentIds)

          const unbookmarkedFeedItems = feedItems.filter((item) => {
            const contentId = `${provider}-${item.externalId}`
            return !bookmarkedContentIds.has(contentId)
          })

          // Create user feed items only for unbookmarked content
          if (unbookmarkedFeedItems.length > 0) {
            const userFeedItems = unbookmarkedFeedItems.map(feedItem => ({
              id: `${userId}-${feedItem.id}`,
              userId,
              feedItemId: feedItem.id,
              isRead: false
            }))

            await this.feedItemRepository.createUserFeedItems(userFeedItems)
            itemsAddedCount = unbookmarkedFeedItems.length
          }

          if (feedItems.length - unbookmarkedFeedItems.length > 0) {
            console.log(`[InitialFeedPopulation] Filtered out ${feedItems.length - unbookmarkedFeedItems.length} bookmarked items for ${subscription.title}`)
          }
        }

        results.push({
          subscriptionId: subscription.id,
          subscriptionTitle: subscription.title,
          itemsAdded: itemsAddedCount
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