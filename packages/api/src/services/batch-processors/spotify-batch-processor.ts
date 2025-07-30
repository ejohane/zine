import { Subscription, FeedItem } from '@zine/shared'
import { SpotifyAPI, SpotifyShow, SpotifyEpisode } from '../../external/spotify-api'
import { BaseBatchProcessor, BatchProcessorResult, BatchProcessorOptions } from './batch-processor.interface'

interface ShowWithEpisodes {
  show: SpotifyShow
  episodes: SpotifyEpisode[]
}

interface MultipleShowsResponse {
  shows: (SpotifyShow | null)[]
}

export class SpotifyBatchProcessor extends BaseBatchProcessor {
  protected providerId = 'spotify'

  async processBatch(
    subscriptions: Subscription[],
    accessToken: string,
    options?: Partial<BatchProcessorOptions>
  ): Promise<BatchProcessorResult[]> {
    const opts = { ...this.getDefaultOptions(), ...options }
    const spotifyAPI = new SpotifyAPI(accessToken)

    // Test connection first
    const connectionValid = await spotifyAPI.testConnection()
    if (!connectionValid) {
      throw new Error('Spotify API connection failed - token may be invalid')
    }

    console.log(`[SpotifyBatchProcessor] Processing ${subscriptions.length} subscriptions in batches of ${opts.maxBatchSize}`)

    // Group subscriptions by external ID for batch fetching
    const subscriptionsByExternalId = new Map<string, Subscription>()
    subscriptions.forEach(sub => {
      subscriptionsByExternalId.set(sub.externalId, sub)
    })

    const showIds = Array.from(subscriptionsByExternalId.keys())
    const showChunks = this.chunk(showIds, opts.maxBatchSize)

    // Fetch all shows in batches
    const allShows: SpotifyShow[] = []
    for (const chunk of showChunks) {
      const shows = await this.retryOperation(
        () => this.getMultipleShows(spotifyAPI, chunk),
        opts.retryAttempts,
        opts.retryDelay
      )
      allShows.push(...shows)
    }

    console.log(`[SpotifyBatchProcessor] Fetched metadata for ${allShows.length} shows`)

    // Now fetch episodes for each show with concurrency control
    const showsWithEpisodes = await this.processWithConcurrency(
      allShows,
      async (show) => {
        const episodes = await this.retryOperation(
          () => spotifyAPI.getLatestEpisodes(show.id, 20),
          opts.retryAttempts,
          opts.retryDelay
        )
        return { show, episodes }
      },
      opts.maxConcurrency
    )

    // Convert to results
    return this.convertToResults(showsWithEpisodes, subscriptionsByExternalId)
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

    const data = await response.json() as MultipleShowsResponse
    
    // Filter out null shows (deleted or unavailable)
    return data.shows.filter((show): show is SpotifyShow => show !== null)
  }

  private convertToResults(
    showsWithEpisodes: ShowWithEpisodes[],
    subscriptionsByExternalId: Map<string, Subscription>
  ): BatchProcessorResult[] {
    const results: BatchProcessorResult[] = []

    for (const { show, episodes } of showsWithEpisodes) {
      const subscription = subscriptionsByExternalId.get(show.id)
      if (!subscription) continue

      const newItems: FeedItem[] = episodes.map(episode => ({
        id: `spotify-${episode.id}`,
        subscriptionId: subscription.id,
        externalId: episode.id,
        title: episode.name,
        description: episode.description,
        thumbnailUrl: episode.images?.[0]?.url,
        publishedAt: new Date(episode.release_date),
        durationSeconds: Math.round(episode.duration_ms / 1000),
        externalUrl: episode.external_urls.spotify,
        createdAt: new Date()
      }))

      results.push({
        subscriptionId: subscription.id,
        subscriptionTitle: subscription.title,
        newItems
      })
    }

    // Add results for subscriptions that had errors or no shows found
    for (const subscription of subscriptionsByExternalId.values()) {
      if (!results.find(r => r.subscriptionId === subscription.id)) {
        results.push({
          subscriptionId: subscription.id,
          subscriptionTitle: subscription.title,
          newItems: [],
          error: 'Show not found or unavailable'
        })
      }
    }

    return results
  }

  getDefaultOptions(): BatchProcessorOptions {
    return {
      maxBatchSize: 50, // Spotify's limit for batch show fetching
      maxConcurrency: 10, // Higher concurrency for episode fetching
      retryAttempts: 3,
      retryDelay: 1000
    }
  }
}