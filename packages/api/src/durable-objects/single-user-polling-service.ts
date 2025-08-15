import { Subscription } from '@zine/shared'
import { SpotifyAPI } from '../external/spotify-api'
import { YouTubeAPI } from '../external/youtube-api'
import { OAuthTokenData } from './user-subscription-manager'
import type { Env } from '../types'

export interface UserPollResult {
  provider: 'spotify' | 'youtube'
  subscriptionId: string
  subscriptionTitle: string
  newItemsFound: number
  errors?: string[]
}

interface LastSeenEpisode {
  subscriptionId: string
  lastEpisodeId: string
  lastEpisodeDate: string
  lastCheckTime: string
}

export class SingleUserPollingService {
  private userId: string
  private db: D1Database

  constructor(userId: string, env: Env) {
    this.userId = userId
    this.db = env.DB
  }

  async pollUserSubscriptions(tokens: Map<string, OAuthTokenData>): Promise<UserPollResult[]> {
    const results: UserPollResult[] = []
    console.log(`[SingleUserPolling] Starting poll for user ${this.userId}`)

    // Get user's subscriptions from database
    const subscriptions = await this.getUserSubscriptions()
    if (subscriptions.length === 0) {
      console.log(`[SingleUserPolling] No subscriptions found for user ${this.userId}`)
      return results
    }

    // Group subscriptions by provider
    const subscriptionsByProvider = new Map<string, Subscription[]>()
    for (const sub of subscriptions) {
      const provider = sub.providerId
      if (!subscriptionsByProvider.has(provider)) {
        subscriptionsByProvider.set(provider, [])
      }
      subscriptionsByProvider.get(provider)!.push(sub)
    }

    // Process each provider's subscriptions
    for (const [provider, providerSubscriptions] of subscriptionsByProvider) {
      const token = tokens.get(provider)
      if (!token) {
        console.log(`[SingleUserPolling] No token available for ${provider}`)
        continue
      }

      try {
        const providerResults = await this.pollProviderSubscriptions(
          provider as 'spotify' | 'youtube',
          providerSubscriptions,
          token
        )
        results.push(...providerResults)
      } catch (error) {
        console.error(`[SingleUserPolling] Error polling ${provider}:`, error)
        results.push({
          provider: provider as 'spotify' | 'youtube',
          subscriptionId: 'error',
          subscriptionTitle: `${provider} polling error`,
          newItemsFound: 0,
          errors: [error instanceof Error ? error.message : String(error)]
        })
      }
    }

    return results
  }

  private async getUserSubscriptions(): Promise<(Subscription & { providerId: string })[]> {
    const result = await this.db.prepare(`
      SELECT 
        s.id,
        s.external_id,
        s.title,
        s.creator_name,
        s.description,
        s.thumbnail_url,
        s.subscription_url,
        s.total_episodes,
        s.last_polled_at,
        s.created_at,
        s.provider_id
      FROM subscriptions s
      INNER JOIN user_subscriptions us ON s.id = us.subscription_id
      WHERE us.user_id = ? AND us.is_active = 1
    `).bind(this.userId).all()

    return result.results.map(row => ({
      id: row.id as string,
      externalId: row.external_id as string,
      title: row.title as string,
      creatorName: row.creator_name as string || row.title as string, // Use title as fallback
      description: row.description as string,
      thumbnailUrl: row.thumbnail_url as string,
      feedUrl: '', // feed_url not in database, using empty string
      subscriptionUrl: row.subscription_url as string || '',
      totalEpisodes: row.total_episodes as number || 0,
      createdAt: new Date(row.created_at as string),
      providerId: row.provider_id as string
    }))
  }

  private async pollProviderSubscriptions(
    provider: 'spotify' | 'youtube',
    subscriptions: Subscription[],
    token: OAuthTokenData
  ): Promise<UserPollResult[]> {
    if (provider === 'spotify') {
      return this.pollSpotifySubscriptions(subscriptions, token)
    } else {
      return this.pollYouTubeSubscriptions(subscriptions, token)
    }
  }

  private async pollSpotifySubscriptions(
    subscriptions: Subscription[],
    token: OAuthTokenData
  ): Promise<UserPollResult[]> {
    const results: UserPollResult[] = []
    const spotifyAPI = new SpotifyAPI(token.accessToken)

    if (subscriptions.length === 0) {
      return results
    }

    console.log(`[SingleUserPolling] Batch fetching ${subscriptions.length} Spotify shows`)

    // Step 1: Get last seen episodes for all subscriptions
    const subscriptionIds = subscriptions.map(s => s.id)
    const lastSeenEpisodes = await this.getLastSeenEpisodes(subscriptionIds)

    // Step 2: Batch fetch all shows
    const showIds = subscriptions.map(s => s.externalId)
    const subscriptionMap = new Map(subscriptions.map(s => [s.externalId, s]))
    
    let shows: Array<{ id: string; name: string; total_episodes: number }> = []
    try {
      shows = await spotifyAPI.getMultipleShows(showIds)
    } catch (error) {
      console.error(`[SingleUserPolling] Error batch fetching Spotify shows:`, error)
      // Fall back to individual fetching if batch fails
      for (const subscription of subscriptions) {
        results.push({
          provider: 'spotify',
          subscriptionId: subscription.id,
          subscriptionTitle: subscription.title,
          newItemsFound: 0,
          errors: [error instanceof Error ? error.message : String(error)]
        })
      }
      return results
    }

    // Step 2: Identify shows with new episodes
    const showsWithNewEpisodes: Array<{ show: any; subscription: Subscription }> = []
    const showsToUpdate: Array<{ subscriptionId: string; totalEpisodes: number }> = []

    for (const show of shows) {
      const subscription = subscriptionMap.get(show.id)
      if (!subscription) continue

      // Check if total episodes has changed
      if (subscription.totalEpisodes === undefined || show.total_episodes > subscription.totalEpisodes) {
        showsWithNewEpisodes.push({ show, subscription })
      }
      
      // Track total episodes update
      if (show.total_episodes !== subscription.totalEpisodes) {
        showsToUpdate.push({
          subscriptionId: subscription.id,
          totalEpisodes: show.total_episodes
        })
      }
    }

    console.log(`[SingleUserPolling] ${showsWithNewEpisodes.length} shows have new episodes (out of ${shows.length})`)

    // Step 3: Fetch episodes only for shows with changes (with parallel processing)
    const episodeFetchPromises = showsWithNewEpisodes.map(async ({ show, subscription }) => {
      try {
        // Determine how many episodes to fetch based on last seen
        const lastSeen = lastSeenEpisodes.get(subscription.id)
        const episodesToFetch = lastSeen ? Math.min(20, show.total_episodes - (subscription.totalEpisodes || 0) + 5) : 10
        
        const episodes = await spotifyAPI.getShowEpisodes(subscription.externalId, episodesToFetch)
        
        // If we have a last seen episode, filter out episodes we've already processed
        let episodesToProcess = episodes.items
        if (lastSeen && lastSeen.lastEpisodeId) {
          const lastSeenIndex = episodesToProcess.findIndex(ep => ep.id === lastSeen.lastEpisodeId)
          if (lastSeenIndex >= 0) {
            // Only process episodes newer than the last seen one
            episodesToProcess = episodesToProcess.slice(0, lastSeenIndex)
          }
        }
        
        // Check for new episodes (this also handles deduplication at the database level)
        const newItems = await this.checkForNewItems(subscription.id, episodesToProcess.map(ep => ({
          externalId: ep.id,
          title: ep.name,
          description: ep.description,
          thumbnailUrl: ep.images?.[0]?.url || '',
          publishedAt: new Date(ep.release_date),
          durationSeconds: Math.floor(ep.duration_ms / 1000),
          externalUrl: ep.external_urls.spotify
        })))

        // Create feed items for new episodes
        if (newItems.length > 0) {
          await this.createFeedItems(subscription.id, newItems)
        }

        return {
          provider: 'spotify' as const,
          subscriptionId: subscription.id,
          subscriptionTitle: subscription.title,
          newItemsFound: newItems.length
        }
      } catch (error) {
        console.error(`[SingleUserPolling] Error fetching episodes for ${subscription.id}:`, error)
        return {
          provider: 'spotify' as const,
          subscriptionId: subscription.id,
          subscriptionTitle: subscription.title,
          newItemsFound: 0,
          errors: [error instanceof Error ? error.message : String(error)]
        }
      }
    })

    // Process episodes in batches to avoid overwhelming the API
    const batchSize = 5
    for (let i = 0; i < episodeFetchPromises.length; i += batchSize) {
      const batch = episodeFetchPromises.slice(i, i + batchSize)
      const batchResults = await Promise.all(batch)
      results.push(...batchResults)
    }

    // Add results for shows without new episodes
    for (const subscription of subscriptions) {
      if (!results.find(r => r.subscriptionId === subscription.id)) {
        results.push({
          provider: 'spotify',
          subscriptionId: subscription.id,
          subscriptionTitle: subscription.title,
          newItemsFound: 0
        })
      }
    }

    // Step 4: Batch update total episodes
    for (const update of showsToUpdate) {
      await this.updateSubscriptionTotalEpisodes(update.subscriptionId, update.totalEpisodes)
    }

    console.log(`[SingleUserPolling] Spotify polling complete. Processed ${results.length} subscriptions, found ${results.reduce((sum, r) => sum + r.newItemsFound, 0)} new items`)

    return results
  }

  private async pollYouTubeSubscriptions(
    subscriptions: Subscription[],
    token: OAuthTokenData
  ): Promise<UserPollResult[]> {
    const results: UserPollResult[] = []
    const youtubeAPI = new YouTubeAPI(token.accessToken)

    for (const subscription of subscriptions) {
      try {
        // Fetch channel details and recent videos
        const searchResponse = await youtubeAPI.getChannelVideos(subscription.externalId, 10)
        
        // Get video details for duration information
        const videoIds = searchResponse.items.map(v => v.id.videoId)
        const videoDetails = videoIds.length > 0 ? await youtubeAPI.getVideoDetails(videoIds) : []

        // Check for new videos
        const newItems = await this.checkForNewItems(subscription.id, videoDetails.map(video => ({
          externalId: video.id,
          title: video.snippet.title,
          description: video.snippet.description,
          thumbnailUrl: video.snippet.thumbnails?.high?.url || '',
          publishedAt: new Date(video.snippet.publishedAt),
          durationSeconds: this.parseDuration(video.contentDetails?.duration || 'PT0S'),
          externalUrl: `https://www.youtube.com/watch?v=${video.id}`
        })))

        // Create feed items for new videos
        if (newItems.length > 0) {
          await this.createFeedItems(subscription.id, newItems)
        }

        results.push({
          provider: 'youtube',
          subscriptionId: subscription.id,
          subscriptionTitle: subscription.title,
          newItemsFound: newItems.length
        })
      } catch (error) {
        console.error(`[SingleUserPolling] Error polling YouTube subscription ${subscription.id}:`, error)
        results.push({
          provider: 'youtube',
          subscriptionId: subscription.id,
          subscriptionTitle: subscription.title,
          newItemsFound: 0,
          errors: [error instanceof Error ? error.message : String(error)]
        })
      }
    }

    return results
  }

  private async checkForNewItems(
    subscriptionId: string,
    items: Array<{
      externalId: string
      title: string
      description: string
      thumbnailUrl: string
      publishedAt: Date
      durationSeconds: number
      externalUrl: string
    }>
  ): Promise<typeof items> {
    if (items.length === 0) return []

    // Get existing external IDs for this subscription
    const externalIds = items.map(item => item.externalId)
    const placeholders = externalIds.map(() => '?').join(',')
    
    const existing = await this.db.prepare(`
      SELECT external_id 
      FROM feed_items 
      WHERE subscription_id = ? 
      AND external_id IN (${placeholders})
    `).bind(subscriptionId, ...externalIds).all()

    const existingIds = new Set(existing.results.map(row => row.external_id as string))
    
    return items.filter(item => !existingIds.has(item.externalId))
  }

  private async createFeedItems(
    subscriptionId: string,
    items: Array<{
      externalId: string
      title: string
      description: string
      thumbnailUrl: string
      publishedAt: Date
      durationSeconds: number
      externalUrl: string
    }>
  ): Promise<void> {
    const createdFeedItems: string[] = []

    // Create feed items
    for (const item of items) {
      const id = crypto.randomUUID()
      await this.db.prepare(`
        INSERT INTO feed_items (
          id, subscription_id, external_id, title, description, 
          thumbnail_url, published_at, duration_seconds, external_url, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        id,
        subscriptionId,
        item.externalId,
        item.title,
        item.description || '',
        item.thumbnailUrl || '',
        item.publishedAt.toISOString(),
        item.durationSeconds,
        item.externalUrl,
        new Date().toISOString()
      ).run()

      createdFeedItems.push(id)
    }

    // Create user feed item for this user
    for (const feedItemId of createdFeedItems) {
      const userFeedItemId = `${this.userId}-${feedItemId}`
      await this.db.prepare(`
        INSERT OR IGNORE INTO user_feed_items (
          id, user_id, feed_item_id, is_read, created_at
        ) VALUES (?, ?, ?, ?, ?)
      `).bind(
        userFeedItemId,
        this.userId,
        feedItemId,
        0,
        new Date().toISOString()
      ).run()
    }

    console.log(`[SingleUserPolling] Created ${createdFeedItems.length} feed items for subscription ${subscriptionId}`)
  }

  private async updateSubscriptionTotalEpisodes(subscriptionId: string, totalEpisodes: number): Promise<void> {
    await this.db.prepare(`
      UPDATE subscriptions 
      SET total_episodes = ? 
      WHERE id = ?
    `).bind(totalEpisodes, subscriptionId).run()
  }

  private parseDuration(duration: string): number {
    // Parse ISO 8601 duration (e.g., PT4M13S)
    const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/)
    if (!match) return 0

    const hours = parseInt(match[1] || '0')
    const minutes = parseInt(match[2] || '0')
    const seconds = parseInt(match[3] || '0')

    return hours * 3600 + minutes * 60 + seconds
  }

  private async getLastSeenEpisodes(subscriptionIds: string[]): Promise<Map<string, LastSeenEpisode>> {
    if (subscriptionIds.length === 0) return new Map()

    const placeholders = subscriptionIds.map(() => '?').join(',')
    const result = await this.db.prepare(`
      SELECT 
        subscription_id,
        MAX(external_id) as last_episode_id,
        MAX(published_at) as last_episode_date
      FROM feed_items
      WHERE subscription_id IN (${placeholders})
      GROUP BY subscription_id
    `).bind(...subscriptionIds).all()

    const lastSeenMap = new Map<string, LastSeenEpisode>()
    for (const row of result.results) {
      lastSeenMap.set(row.subscription_id as string, {
        subscriptionId: row.subscription_id as string,
        lastEpisodeId: row.last_episode_id as string,
        lastEpisodeDate: row.last_episode_date as string,
        lastCheckTime: new Date().toISOString()
      })
    }

    return lastSeenMap
  }

}