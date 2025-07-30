import { Subscription, FeedItem } from '@zine/shared'
import { YouTubeAPI, YouTubeChannel, YouTubeVideoDetails } from '../../external/youtube-api'
import { BaseBatchProcessor, BatchProcessorResult, BatchProcessorOptions } from './batch-processor.interface'
import { RATE_LIMITER_CONFIGS } from '../../utils/rate-limiter'
import { ProgressTracker, ConsoleProgressReporter } from '../../utils/progress-tracker'

interface ChannelWithVideos {
  channel: YouTubeChannel
  videos: YouTubeVideoDetails[]
}

interface MultipleChannelsResponse {
  items: YouTubeChannel[]
}

export class YouTubeBatchProcessor extends BaseBatchProcessor {
  protected providerId = 'youtube'

  constructor() {
    super()
    // Initialize rate limiter and circuit breaker with YouTube-specific settings
    this.initializeProcessingUtilities(
      RATE_LIMITER_CONFIGS.youtube,
      {
        failureThreshold: 3, // YouTube has stricter limits
        failureWindow: 60000,
        recoveryTimeout: 60000, // Longer recovery for YouTube
        successThreshold: 2,
        name: 'youtube',
        isFailure: (error: any) => {
          // Consider quota exceeded and server errors as failures
          return error.status === 429 || error.status === 403 || (error.status >= 500 && error.status < 600)
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
    // YouTube has lower rate limits, reduce concurrency
    opts.maxConcurrency = Math.min(opts.maxConcurrency, 3)
    
    const youtubeAPI = new YouTubeAPI(accessToken)

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
    const connectionValid = await youtubeAPI.testConnection()
    if (!connectionValid) {
      throw new Error('YouTube API connection failed - token may be invalid')
    }

    console.log(`[YouTubeBatchProcessor] Processing ${subscriptions.length} subscriptions in batches of ${opts.maxBatchSize}`)

    // Group subscriptions by channel ID
    const subscriptionsByChannelId = new Map<string, Subscription>()
    subscriptions.forEach(sub => {
      subscriptionsByChannelId.set(sub.externalId, sub)
    })

    const channelIds = Array.from(subscriptionsByChannelId.keys())
    const channelChunks = this.chunk(channelIds, opts.maxBatchSize)

    // Fetch all channels in batches with rate limiting
    const allChannels: YouTubeChannel[] = []
    for (const chunk of channelChunks) {
      if (this.rateLimiter && opts.useRateLimiter) {
        await this.rateLimiter.consume(1)
      }
      
      const channels = await this.retryOperation(
        () => this.getMultipleChannels(youtubeAPI, chunk),
        opts.retryAttempts,
        opts.retryDelay
      )
      allChannels.push(...channels)
    }

    console.log(`[YouTubeBatchProcessor] Fetched metadata for ${allChannels.length} channels`)

    // Fetch latest videos for each channel with concurrency control
    const channelsWithVideos = await this.processWithConcurrency(
      allChannels,
      async (channel) => {
        progressTracker.taskStarted(channel.id, { channelName: channel.snippet.title })
        
        try {
          // First get video IDs from search
          const searchResponse = await this.retryOperation(
            () => youtubeAPI.getChannelVideos(channel.id, 20),
            opts.retryAttempts,
            opts.retryDelay
          )

          if (searchResponse.items.length === 0) {
            progressTracker.taskCompleted(channel.id, { videoCount: 0 })
            return { channel, videos: [] }
          }

          // Then batch fetch video details with rate limiting
          const videoIds = searchResponse.items.map(item => item.id.videoId)
          if (this.rateLimiter && opts.useRateLimiter) {
            await this.rateLimiter.consume(1)
          }
          
          const videos = await this.retryOperation(
            () => this.getMultipleVideos(youtubeAPI, videoIds),
            opts.retryAttempts,
            opts.retryDelay
          )

          progressTracker.taskCompleted(channel.id, { videoCount: videos.length })
          return { channel, videos }
        } catch (error) {
          progressTracker.taskFailed(channel.id, error as Error)
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
    return this.convertToResults(channelsWithVideos, subscriptionsByChannelId)
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

    const data = await response.json() as MultipleChannelsResponse
    return data.items
  }

  private async getMultipleVideos(api: YouTubeAPI, videoIds: string[]): Promise<YouTubeVideoDetails[]> {
    // Use existing API method which already supports batch fetching
    return api.getVideoDetails(videoIds)
  }

  private convertToResults(
    channelsWithVideos: ChannelWithVideos[],
    subscriptionsByChannelId: Map<string, Subscription>
  ): BatchProcessorResult[] {
    const results: BatchProcessorResult[] = []

    for (const { channel, videos } of channelsWithVideos) {
      const subscription = subscriptionsByChannelId.get(channel.id)
      if (!subscription) continue

      const newItems: FeedItem[] = videos.map(video => ({
        id: `youtube-${video.id}`,
        subscriptionId: subscription.id,
        externalId: video.id,
        title: video.snippet.title,
        description: video.snippet.description,
        thumbnailUrl: video.snippet.thumbnails?.medium?.url || video.snippet.thumbnails?.default?.url,
        publishedAt: new Date(video.snippet.publishedAt),
        durationSeconds: YouTubeAPI.parseDuration(video.contentDetails.duration),
        externalUrl: `https://youtube.com/watch?v=${video.id}`,
        createdAt: new Date()
      }))

      results.push({
        subscriptionId: subscription.id,
        subscriptionTitle: subscription.title,
        newItems
      })
    }

    // Add results for subscriptions that had errors or no channels found
    for (const subscription of subscriptionsByChannelId.values()) {
      if (!results.find(r => r.subscriptionId === subscription.id)) {
        results.push({
          subscriptionId: subscription.id,
          subscriptionTitle: subscription.title,
          newItems: [],
          error: 'Channel not found or unavailable'
        })
      }
    }

    return results
  }

  getDefaultOptions(): BatchProcessorOptions {
    return {
      maxBatchSize: 50, // YouTube's limit for batch channel/video fetching
      maxConcurrency: 5, // Lower concurrency to respect rate limits
      retryAttempts: 3,
      retryDelay: 1000
    }
  }
}