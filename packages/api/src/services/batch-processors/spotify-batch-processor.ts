import { Subscription, FeedItem } from '@zine/shared'
import { SpotifyAPI, SpotifyShow, SpotifyEpisode } from '../../external/spotify-api'
import { BaseBatchProcessor, BatchProcessorResult, BatchProcessorOptions } from './batch-processor.interface'
import { RATE_LIMITER_CONFIGS } from '../../utils/rate-limiter'
import { ProgressTracker, ConsoleProgressReporter } from '../../utils/progress-tracker'

interface ShowWithEpisodes {
  show: SpotifyShow
  episodes: SpotifyEpisode[]
}

interface MultipleShowsResponse {
  shows: (SpotifyShow | null)[]
}

export class SpotifyBatchProcessor extends BaseBatchProcessor {
  protected providerId = 'spotify'

  constructor() {
    super()
    // Initialize rate limiter and circuit breaker with Spotify-specific settings
    this.initializeProcessingUtilities(
      RATE_LIMITER_CONFIGS.spotify,
      {
        failureThreshold: 5,
        failureWindow: 60000,
        recoveryTimeout: 30000,
        successThreshold: 3,
        name: 'spotify',
        isFailure: (error: any) => {
          // Consider rate limit errors and server errors as failures
          return error.status === 429 || (error.status >= 500 && error.status < 600)
        }
      }
    )
  }

  async processBatch(
    subscriptions: Subscription[],
    accessToken: string,
    options?: Partial<BatchProcessorOptions>
  ): Promise<BatchProcessorResult[]> {
    const opts = { ...this.getDefaultOptions(), ...options }
    const spotifyAPI = new SpotifyAPI(accessToken)

    // Initialize progress tracking
    const progressTracker = new ProgressTracker(subscriptions.length)
    this.progressTracker = progressTracker
    
    if (opts.onProgress) {
      progressTracker.onProgress((_update, metrics) => {
        opts.onProgress!(metrics.completedTasks + metrics.failedTasks, metrics.totalTasks)
      })
    }
    
    // Create console reporter for detailed progress
    const reporter = new ConsoleProgressReporter(progressTracker)
    progressTracker.start()

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

    // Fetch all shows in batches with rate limiting
    const allShows: SpotifyShow[] = []
    for (const chunk of showChunks) {
      if (this.rateLimiter && opts.useRateLimiter) {
        await this.rateLimiter.consume(1)
      }
      
      const shows = await this.retryOperation(
        () => this.getMultipleShows(spotifyAPI, chunk),
        opts.retryAttempts,
        opts.retryDelay
      )
      allShows.push(...shows)
    }

    console.log(`[SpotifyBatchProcessor] Fetched metadata for ${allShows.length} shows`)

    // Filter shows that have new episodes by comparing total_episodes
    const showsWithChanges = allShows.filter(show => {
      const subscription = subscriptionsByExternalId.get(show.id)
      if (!subscription || subscription.totalEpisodes === undefined) {
        // If we don't have a previous count, we need to check
        return true
      }
      // Only check shows where total_episodes has increased
      return show.total_episodes > subscription.totalEpisodes
    })

    console.log(`[SpotifyBatchProcessor] ${showsWithChanges.length} shows have new episodes (out of ${allShows.length})`)

    // Now fetch episodes only for shows with changes
    const showsWithEpisodes = await this.processWithConcurrency(
      showsWithChanges,
      async (show) => {
        progressTracker.taskStarted(show.id, { showName: show.name })
        
        try {
          const episodes = await this.retryOperation(
            () => spotifyAPI.getLatestEpisodes(show.id, 20),
            opts.retryAttempts,
            opts.retryDelay
          )
          
          progressTracker.taskCompleted(show.id, { episodeCount: episodes.length })
          return { show, episodes }
        } catch (error) {
          progressTracker.taskFailed(show.id, error as Error)
          throw error
        }
      },
      opts.maxConcurrency,
      {
        onProgress: opts.onProgress,
        useRateLimiter: opts.useRateLimiter,
        useCircuitBreaker: opts.useCircuitBreaker
      }
    )

    // Print summary
    reporter.printSummary()

    // Convert to results
    return this.convertToResults(showsWithEpisodes, allShows, subscriptionsByExternalId)
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
    allShows: SpotifyShow[],
    subscriptionsByExternalId: Map<string, Subscription>
  ): BatchProcessorResult[] {
    const results: BatchProcessorResult[] = []
    const processedSubscriptionIds = new Set<string>()

    // First, add results for shows where we fetched episodes
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
        newItems,
        totalEpisodes: show.total_episodes
      })
      processedSubscriptionIds.add(subscription.id)
    }

    // Add results for shows that haven't changed (still need to update totalEpisodes)
    for (const show of allShows) {
      const subscription = subscriptionsByExternalId.get(show.id)
      if (!subscription || processedSubscriptionIds.has(subscription.id)) continue

      results.push({
        subscriptionId: subscription.id,
        subscriptionTitle: subscription.title,
        newItems: [],
        totalEpisodes: show.total_episodes
      })
      processedSubscriptionIds.add(subscription.id)
    }

    // Add results for subscriptions that had errors or no shows found
    for (const subscription of subscriptionsByExternalId.values()) {
      if (!processedSubscriptionIds.has(subscription.id)) {
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
      maxConcurrency: 5, // Optimized: fewer shows need episode fetching with total_episodes check
      retryAttempts: 3,
      retryDelay: 1000
    }
  }
}