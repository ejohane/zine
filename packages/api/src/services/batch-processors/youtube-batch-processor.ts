import { Subscription, FeedItem } from '@zine/shared'
import { YouTubeAPI, YouTubeChannel, YouTubeVideoDetails } from '../../external/youtube-api'
import { BaseBatchProcessor, BatchProcessorResult, BatchProcessorOptions } from './batch-processor.interface'
import { RATE_LIMITER_CONFIGS } from '../../utils/rate-limiter'
import { ProgressTracker, ConsoleProgressReporter } from '../../utils/progress-tracker'

interface ChannelWithVideos {
  channel: YouTubeChannel
  videos: YouTubeVideoDetails[]
}

interface PlaylistItemsResponse {
  items: Array<{
    contentDetails: {
      videoId: string
    }
  }>
}

interface ChannelWithStats extends YouTubeChannel {
  statistics: {
    viewCount: string
    subscriberCount: string
    hiddenSubscriberCount: boolean
    videoCount: string
  }
  contentDetails?: {
    relatedPlaylists?: {
      uploads?: string
    }
  }
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
    
    // Track subrequests for Cloudflare limit
    let subrequestCount = 0
    const MAX_SUBREQUESTS = 45 // Leave buffer for other operations
    
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

    console.log(`[YouTubeBatchProcessor] Processing ${subscriptions.length} subscriptions with optimized batching`)

    // Group subscriptions by channel ID
    const subscriptionsByChannelId = new Map<string, Subscription>()
    subscriptions.forEach(sub => {
      subscriptionsByChannelId.set(sub.externalId, sub)
    })

    const channelIds = Array.from(subscriptionsByChannelId.keys())
    const channelChunks = this.chunk(channelIds, opts.maxBatchSize)

    // Step 1: Batch fetch channels with statistics & contentDetails
    const allChannels: ChannelWithStats[] = []
    for (const chunk of channelChunks) {
      if (subrequestCount >= MAX_SUBREQUESTS) {
        console.log(`[YouTubeBatchProcessor] Reached subrequest limit, stopping at ${allChannels.length} channels`)
        break
      }
      
      if (this.rateLimiter && opts.useRateLimiter) {
        await this.rateLimiter.consume(1)
      }
      
      const channels = await this.retryOperation(
        () => this.getMultipleChannelsWithStats(youtubeAPI, chunk),
        opts.retryAttempts,
        opts.retryDelay
      )
      allChannels.push(...channels)
      subrequestCount++
    }

    console.log(`[YouTubeBatchProcessor] Fetched metadata for ${allChannels.length} channels with statistics`)

    // Step 2: Filter channels with new videos (change detection)
    const channelsWithChanges = this.detectChanges(allChannels, subscriptionsByChannelId)
    console.log(`[YouTubeBatchProcessor] ${channelsWithChanges.length} channels have new content`)

    // Step 3: Batch fetch video IDs from uploads playlists (only for channels with changes)
    const allVideoIds: string[] = []
    const videoIdsByChannel = new Map<string, string[]>()
    
    // Process channels with changes in small batches to stay under subrequest limit
    const BATCH_SIZE = 5 // Process 5 channels at a time
    const changeBatches = this.chunk(channelsWithChanges, BATCH_SIZE)
    
    for (const batch of changeBatches) {
      if (subrequestCount >= MAX_SUBREQUESTS) {
        console.log(`[YouTubeBatchProcessor] Reached subrequest limit`)
        break
      }
      
      // Parallel fetch within batch
      const batchPromises = batch.map(async (channel) => {
        progressTracker.taskStarted(channel.id, { channelName: channel.snippet.title })
        
        try {
          const uploadsPlaylistId = channel.contentDetails?.relatedPlaylists?.uploads
          if (!uploadsPlaylistId) {
            progressTracker.taskCompleted(channel.id, { videoCount: 0 })
            return { channelId: channel.id, videoIds: [] }
          }
          
          // Use playlistItems.list instead of search (1 quota unit vs 100)
          const videoIds = await this.retryOperation(
            () => this.getPlaylistVideoIds(youtubeAPI, uploadsPlaylistId, 20),
            opts.retryAttempts,
            opts.retryDelay
          )
          
          progressTracker.taskCompleted(channel.id, { videoCount: videoIds.length })
          return { channelId: channel.id, videoIds }
        } catch (error) {
          progressTracker.taskFailed(channel.id, error as Error)
          return { channelId: channel.id, videoIds: [] }
        }
      })
      
      const results = await Promise.all(batchPromises)
      subrequestCount += batch.length
      
      for (const result of results) {
        videoIdsByChannel.set(result.channelId, result.videoIds)
        allVideoIds.push(...result.videoIds)
      }
    }
    
    console.log(`[YouTubeBatchProcessor] Collected ${allVideoIds.length} video IDs from ${channelsWithChanges.length} channels`)
    
    // Step 4: Batch fetch all video details at once
    const allVideos: YouTubeVideoDetails[] = []
    const videoChunks = this.chunk(allVideoIds, 50) // YouTube allows 50 video IDs per request
    
    for (const chunk of videoChunks) {
      if (subrequestCount >= MAX_SUBREQUESTS) {
        console.log(`[YouTubeBatchProcessor] Reached subrequest limit`)
        break
      }
      
      if (this.rateLimiter && opts.useRateLimiter) {
        await this.rateLimiter.consume(1)
      }
      
      const videos = await this.retryOperation(
        () => this.getMultipleVideos(youtubeAPI, chunk),
        opts.retryAttempts,
        opts.retryDelay
      )
      allVideos.push(...videos)
      subrequestCount++
    }
    
    console.log(`[YouTubeBatchProcessor] Fetched details for ${allVideos.length} videos`)
    
    // Group videos back by channel
    const channelsWithVideos: ChannelWithVideos[] = allChannels.map(channel => {
      const channelVideoIds = videoIdsByChannel.get(channel.id) || []
      const channelVideos = allVideos.filter(video => channelVideoIds.includes(video.id))
      return { channel, videos: channelVideos }
    })

    // Print summary
    reporter.printSummary()
    console.log(`[YouTubeBatchProcessor] Total subrequests used: ${subrequestCount}/${MAX_SUBREQUESTS}`)

    // Step 5: Update stored metadata for change detection
    await this.updateChannelMetadata(allChannels, subscriptionsByChannelId)

    // Convert to results
    return this.convertToResults(channelsWithVideos, subscriptionsByChannelId)
  }

  private async getMultipleChannelsWithStats(api: YouTubeAPI, channelIds: string[]): Promise<ChannelWithStats[]> {
    // YouTube's channels endpoint supports batch fetching
    const baseUrl = 'https://www.googleapis.com/youtube/v3'
    const params = new URLSearchParams({
      part: 'snippet,statistics,contentDetails', // Added contentDetails for uploads playlist
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

    const data = await response.json() as { items: ChannelWithStats[] }
    return data.items
  }
  
  private detectChanges(channels: ChannelWithStats[], subscriptionsByChannelId: Map<string, Subscription>): ChannelWithStats[] {
    return channels.filter(channel => {
      const subscription = subscriptionsByChannelId.get(channel.id)
      if (!subscription) return true // New channel, fetch videos
      
      const currentVideoCount = parseInt(channel.statistics.videoCount)
      const storedVideoCount = (subscription as any).videoCount || 0
      
      // Only fetch if video count increased or we don't have stored count
      return currentVideoCount > storedVideoCount || storedVideoCount === 0
    })
  }
  
  private async getPlaylistVideoIds(api: YouTubeAPI, playlistId: string, maxResults: number = 20): Promise<string[]> {
    const baseUrl = 'https://www.googleapis.com/youtube/v3'
    const params = new URLSearchParams({
      part: 'contentDetails',
      playlistId,
      maxResults: maxResults.toString()
    })
    
    const response = await fetch(
      `${baseUrl}/playlistItems?${params.toString()}`,
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
    
    const data = await response.json() as PlaylistItemsResponse
    return data.items.map(item => item.contentDetails.videoId)
  }
  
  private async updateChannelMetadata(channels: ChannelWithStats[], subscriptionsByChannelId: Map<string, Subscription>): Promise<void> {
    // This would normally update the database with new video counts and playlist IDs
    // For now, we'll just log the updates that would be made
    for (const channel of channels) {
      const subscription = subscriptionsByChannelId.get(channel.id)
      if (subscription) {
        const updates = {
          videoCount: parseInt(channel.statistics.videoCount),
          uploadsPlaylistId: channel.contentDetails?.relatedPlaylists?.uploads
        }
        console.log(`[YouTubeBatchProcessor] Would update ${subscription.title}: videoCount=${updates.videoCount}`)
      }
    }
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

      const newItems: FeedItem[] = videos.map(video => {
        // Determine content type based on duration and live status
        const durationSeconds = YouTubeAPI.parseDuration(video.contentDetails.duration)
        let contentType: string = 'video'
        if (video.snippet.liveBroadcastContent === 'live') {
          contentType = 'live'
        } else if (durationSeconds && durationSeconds <= 60) {
          contentType = 'short'
        }

        // Calculate popularity score (0-100 normalized)
        let popularityScore: number | undefined
        if (video.statistics?.viewCount) {
          const viewCount = parseInt(video.statistics.viewCount)
          // Simple logarithmic scaling for popularity
          popularityScore = Math.min(100, Math.floor(Math.log10(viewCount + 1) * 10))
        }

        return {
          id: `youtube-${video.id}`,
          subscriptionId: subscription.id,
          externalId: video.id,
          title: video.snippet.title,
          description: video.snippet.description,
          thumbnailUrl: video.snippet.thumbnails?.medium?.url || video.snippet.thumbnails?.default?.url,
          publishedAt: new Date(video.snippet.publishedAt),
          durationSeconds,
          externalUrl: `https://youtube.com/watch?v=${video.id}`,
          
          // Phase 1: New engagement metrics
          viewCount: video.statistics?.viewCount ? parseInt(video.statistics.viewCount) : undefined,
          likeCount: video.statistics?.likeCount ? parseInt(video.statistics.likeCount) : undefined,
          commentCount: video.statistics?.commentCount ? parseInt(video.statistics.commentCount) : undefined,
          popularityScore,
          
          // Phase 1: New classification fields
          language: video.snippet.defaultLanguage || video.snippet.defaultAudioLanguage,
          isExplicit: false, // YouTube doesn't have explicit flag in API
          contentType,
          category: video.snippet.categoryId,
          tags: video.snippet.tags ? JSON.stringify(video.snippet.tags) : undefined,
          
          createdAt: new Date()
        } as FeedItem
      })

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
      maxConcurrency: 5, // Can increase this now with optimized batching
      retryAttempts: 3,
      retryDelay: 1000
    }
  }
}