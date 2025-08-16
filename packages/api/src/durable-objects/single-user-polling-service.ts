import { Subscription } from '@zine/shared'
import { SpotifyAPI, SpotifyShow } from '../external/spotify-api'
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
    const MAX_BATCH_SIZE = 50 // Spotify's limit for batch show fetching
    const MAX_EPISODE_CONCURRENT = 5 // Limit concurrent episode fetches to avoid timeouts
    let subrequestCount = 0
    const MAX_SUBREQUESTS = 45 // Conservative limit (Cloudflare allows 50)

    console.log(`[SingleUserPolling] Batch processing ${subscriptions.length} Spotify subscriptions`)

    // Step 1: Batch fetch all show metadata
    const showIds = subscriptions.map(s => s.externalId)
    const showBatches = this.chunk(showIds, MAX_BATCH_SIZE)
    const allShows = new Map<string, SpotifyShow>()

    for (const batch of showBatches) {
      if (subrequestCount >= MAX_SUBREQUESTS) {
        console.warn(`[SingleUserPolling] Approaching subrequest limit, stopping show fetching`)
        break
      }
      
      try {
        subrequestCount++
        const shows = await this.getMultipleShows(spotifyAPI, batch)
        shows.forEach(show => allShows.set(show.id, show))
      } catch (error) {
        console.error(`[SingleUserPolling] Error fetching batch of shows:`, error)
      }
    }

    console.log(`[SingleUserPolling] Fetched metadata for ${allShows.size} shows using ${subrequestCount} API calls`)

    // Step 2: Identify shows with new episodes by comparing total_episodes
    const showsNeedingEpisodeCheck: { subscription: Subscription; show: SpotifyShow }[] = []
    
    for (const subscription of subscriptions) {
      const show = allShows.get(subscription.externalId)
      if (!show) {
        results.push({
          provider: 'spotify',
          subscriptionId: subscription.id,
          subscriptionTitle: subscription.title,
          newItemsFound: 0,
          errors: ['Show not found or unavailable']
        })
        continue
      }

      // Check if show has new episodes
      if (subscription.totalEpisodes === undefined || show.total_episodes > subscription.totalEpisodes) {
        showsNeedingEpisodeCheck.push({ subscription, show })
      } else {
        // No new episodes, but still update total_episodes if different
        if (show.total_episodes !== subscription.totalEpisodes) {
          await this.updateSubscriptionTotalEpisodes(subscription.id, show.total_episodes)
        }
        results.push({
          provider: 'spotify',
          subscriptionId: subscription.id,
          subscriptionTitle: subscription.title,
          newItemsFound: 0
        })
      }
    }

    console.log(`[SingleUserPolling] ${showsNeedingEpisodeCheck.length} shows have potential new episodes`)

    // Step 3: Fetch episodes only for shows with changes (with concurrency limit)
    const episodeBatches = this.chunk(showsNeedingEpisodeCheck, MAX_EPISODE_CONCURRENT)
    
    for (const batch of episodeBatches) {
      if (subrequestCount >= MAX_SUBREQUESTS) {
        console.warn(`[SingleUserPolling] Subrequest limit reached, stopping episode fetching`)
        // Add remaining subscriptions as skipped
        for (const { subscription } of batch) {
          results.push({
            provider: 'spotify',
            subscriptionId: subscription.id,
            subscriptionTitle: subscription.title,
            newItemsFound: 0,
            errors: ['Skipped due to API limit']
          })
        }
        break
      }

      // Process batch concurrently
      const batchPromises = batch.map(async ({ subscription, show }) => {
        if (subrequestCount >= MAX_SUBREQUESTS) {
          return {
            provider: 'spotify' as const,
            subscriptionId: subscription.id,
            subscriptionTitle: subscription.title,
            newItemsFound: 0,
            errors: ['Skipped due to API limit']
          }
        }

        try {
          subrequestCount++
          const episodes = await spotifyAPI.getShowEpisodes(subscription.externalId, 10)

          // Check for new episodes
          const newItems = await this.checkForNewItems(subscription.id, episodes.items.map(ep => ({
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

          // Update total episodes
          if (show.total_episodes !== subscription.totalEpisodes) {
            await this.updateSubscriptionTotalEpisodes(subscription.id, show.total_episodes)
          }

          return {
            provider: 'spotify' as const,
            subscriptionId: subscription.id,
            subscriptionTitle: subscription.title,
            newItemsFound: newItems.length
          }
        } catch (error) {
          console.error(`[SingleUserPolling] Error polling episodes for ${subscription.id}:`, error)
          return {
            provider: 'spotify' as const,
            subscriptionId: subscription.id,
            subscriptionTitle: subscription.title,
            newItemsFound: 0,
            errors: [error instanceof Error ? error.message : String(error)]
          }
        }
      })

      const batchResults = await Promise.all(batchPromises)
      results.push(...batchResults)
    }

    console.log(`[SingleUserPolling] Spotify polling complete. Total API calls: ${subrequestCount}/${MAX_SUBREQUESTS}`)
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

  private chunk<T>(array: T[], size: number): T[][] {
    const chunks: T[][] = []
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size))
    }
    return chunks
  }

  private async getMultipleShows(api: SpotifyAPI, showIds: string[]): Promise<SpotifyShow[]> {
    // Spotify's "Get Multiple Shows" endpoint
    const baseUrl = 'https://api.spotify.com/v1'
    const params = new URLSearchParams({
      ids: showIds.join(','),
      market: 'US' // Required for episode availability
    })

    const response = await fetch(
      `${baseUrl}/shows?${params.toString()}`,
      {
        headers: {
          'Authorization': `Bearer ${api.getAccessToken()}`,
          'Content-Type': 'application/json'
        }
      }
    )

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`Spotify API error: ${response.status} ${error}`)
    }

    interface MultipleShowsResponse {
      shows: (SpotifyShow | null)[]
    }

    const data = await response.json() as MultipleShowsResponse
    
    // Filter out null shows (deleted or unavailable)
    return data.shows.filter((show): show is SpotifyShow => show !== null)
  }
}