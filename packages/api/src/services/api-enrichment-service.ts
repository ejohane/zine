/**
 * API Enrichment Service
 * Handles API-based content enrichment using OAuth tokens when available
 */

import type { Bindings } from '../index'
import { DualModeTokenService } from './dual-mode-token-service'
import { parseYouTubeDate, parseSpotifyDate } from '../utils/date-normalization'

export interface ApiEnrichmentOptions {
  provider: 'youtube' | 'spotify'
  contentId: string
  userId?: string
  forceRefresh?: boolean
}

export interface YouTubeVideoDetails {
  id: string
  snippet?: {
    title: string
    description: string
    channelId: string
    channelTitle: string
    publishedAt: string
    thumbnails: {
      default?: { url: string }
      medium?: { url: string }
      high?: { url: string }
      maxres?: { url: string }
    }
    tags?: string[]
    categoryId?: string
    liveBroadcastContent?: string
    defaultAudioLanguage?: string
  }
  statistics?: {
    viewCount: string
    likeCount: string
    commentCount: string
    favoriteCount: string
  }
  contentDetails?: {
    duration: string
    dimension: string
    definition: string
    caption: string
    hasCustomThumbnail: boolean
  }
  status?: {
    privacyStatus: string
    madeForKids?: boolean
  }
}

export interface SpotifyEpisodeDetails {
  id: string
  name: string
  description: string
  html_description?: string
  explicit: boolean
  duration_ms: number
  release_date: string
  images: Array<{
    url: string
    height?: number
    width?: number
  }>
  show?: {
    id: string
    name: string
    publisher: string
    description: string
    images: Array<{
      url: string
      height?: number
      width?: number
    }>
  }
  languages?: string[]
  is_playable?: boolean
  resume_point?: {
    fully_played: boolean
    resume_position_ms: number
  }
}

export interface ApiEnrichmentResult {
  success: boolean
  data?: any
  source: 'youtube_api' | 'spotify_api' | 'none'
  error?: string
  cached?: boolean
  quotaUsed?: number
}

/**
 * Service for enriching content using platform APIs with OAuth tokens
 */
export class ApiEnrichmentService {
  private tokenService: DualModeTokenService
  private env: Bindings
  private cache: Map<string, { data: any; timestamp: number }> = new Map()
  private readonly CACHE_TTL = 15 * 60 * 1000 // 15 minutes
  private readonly YOUTUBE_API_BASE = 'https://www.googleapis.com/youtube/v3'
  private readonly SPOTIFY_API_BASE = 'https://api.spotify.com/v1'
  
  // Rate limiting
  private rateLimits = {
    youtube: { remaining: 10000, resetAt: 0 }, // YouTube has daily quota
    spotify: { remaining: 180, resetAt: 0 } // Spotify has rate limits per app
  }

  constructor(env: Bindings) {
    this.env = env
    this.tokenService = new DualModeTokenService(env as any)
  }

  /**
   * Enrich content using platform APIs
   */
  async enrichWithApi(options: ApiEnrichmentOptions): Promise<ApiEnrichmentResult> {
    const cacheKey = `${options.provider}:${options.contentId}`
    
    // Check cache first
    if (!options.forceRefresh) {
      const cached = this.getFromCache(cacheKey)
      if (cached) {
        return {
          success: true,
          data: cached,
          source: `${options.provider}_api` as any,
          cached: true
        }
      }
    }

    // LOCAL DEVELOPMENT: Try API key approach for YouTube
    if (options.provider === 'youtube' && (this.env as any).YOUTUBE_API_KEY) {
      console.log('[ApiEnrichment] LOCAL DEV: Using YouTube API key instead of OAuth')
      const { LocalDevEnrichmentService } = await import('./local-dev-enrichment')
      const localService = new LocalDevEnrichmentService((this.env as any).YOUTUBE_API_KEY)
      
      try {
        const videoData = await localService.enrichYouTubeWithApiKey(options.contentId)
        if (videoData) {
          console.log('[ApiEnrichment] LOCAL DEV: Success with API key')
          return {
            success: true,
            data: videoData,
            source: 'youtube_api',
            quotaUsed: 4
          }
        }
      } catch (error) {
        console.error('[ApiEnrichment] LOCAL DEV: API key approach failed:', error)
      }
    }

    // Check if we have a valid token for the user
    if (!options.userId) {
      return {
        success: false,
        source: 'none',
        error: 'No user ID provided for API enrichment'
      }
    }

    try {
      // Get tokens for the user and check if the provider token exists and is valid
      console.log(`[ApiEnrichment] Getting tokens for user: ${options.userId}, provider: ${options.provider}`)
      const tokens = await this.tokenService.getTokens(options.userId)
      console.log(`[ApiEnrichment] Found ${tokens.size} tokens for user`)
      
      const tokenData = tokens.get(options.provider)
      console.log(`[ApiEnrichment] Token data for ${options.provider}:`, tokenData ? 'found' : 'not found')
      
      if (!tokenData || !tokenData.accessToken) {
        console.log(`[ApiEnrichment] No valid token - returning with error`)
        return {
          success: false,
          source: 'none',
          error: `No valid ${options.provider} token available`
        }
      }
      console.log(`[ApiEnrichment] Valid token found, proceeding with API enrichment`)
      
      // Check if token needs refresh
      if (tokenData.expiresAt && tokenData.expiresAt < new Date()) {
        // Try to refresh the token
        const refreshedTokens = await this.tokenService.refreshTokens(options.userId)
        const refreshedToken = refreshedTokens.get(options.provider)
        if (!refreshedToken || !refreshedToken.accessToken) {
          return {
            success: false,
            source: 'none',
            error: `Failed to refresh ${options.provider} token`
          }
        }
        tokenData.accessToken = refreshedToken.accessToken
      }

      // Check rate limits
      if (!this.checkRateLimit(options.provider)) {
        return {
          success: false,
          source: 'none',
          error: `Rate limit exceeded for ${options.provider}`
        }
      }

      // Call the appropriate API
      let result: ApiEnrichmentResult
      switch (options.provider) {
        case 'youtube':
          result = await this.enrichYouTubeContent(options.contentId, tokenData.accessToken)
          break
        case 'spotify':
          result = await this.enrichSpotifyContent(options.contentId, tokenData.accessToken)
          break
        default:
          return {
            success: false,
            source: 'none',
            error: `Unsupported provider: ${options.provider}`
          }
      }

      // Cache successful results
      if (result.success && result.data) {
        this.addToCache(cacheKey, result.data)
      }

      return result
    } catch (error) {
      console.error(`[ApiEnrichment] Error enriching ${options.provider} content:`, error)
      return {
        success: false,
        source: 'none',
        error: error instanceof Error ? error.message : 'Unknown error during API enrichment'
      }
    }
  }

  /**
   * Enrich YouTube video using YouTube Data API v3
   */
  private async enrichYouTubeContent(videoId: string, accessToken: string): Promise<ApiEnrichmentResult> {
    console.log(`[ApiEnrichment] ===== YOUTUBE ENRICHMENT START =====`)
    console.log(`[ApiEnrichment] Video ID: ${videoId}`)
    
    // Check if this is an API key (for local dev) or OAuth token
    const isApiKey = accessToken && !accessToken.startsWith('ya29.'); // OAuth tokens start with ya29
    console.log(`[ApiEnrichment] Token type: ${isApiKey ? 'API_KEY' : 'OAUTH_TOKEN'}`)
    console.log(`[ApiEnrichment] Token present: ${!!accessToken}`)
    
    try {
      const parts = ['snippet', 'statistics', 'contentDetails', 'status']
      
      // Build URL based on token type
      let url: string;
      let headers: Record<string, string>;
      
      if (isApiKey) {
        // Use API key in query parameter
        url = `${this.YOUTUBE_API_BASE}/videos?part=${parts.join(',')}&id=${videoId}&key=${accessToken}`
        headers = { 'Accept': 'application/json' }
        console.log(`[ApiEnrichment] Using API key authentication`)
      } else {
        // Use OAuth token in header
        url = `${this.YOUTUBE_API_BASE}/videos?part=${parts.join(',')}&id=${videoId}`
        headers = {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/json'
        }
        console.log(`[ApiEnrichment] Using OAuth authentication`)
      }
      
      console.log(`[ApiEnrichment] Fetching video...`)
      const response = await fetch(url, { headers })
      console.log(`[ApiEnrichment] Video response status: ${response.status}`)

      if (!response.ok) {
        if (response.status === 401) {
          throw new Error('YouTube token expired or invalid')
        }
        if (response.status === 403) {
          const errorData = await response.json().catch(() => ({} as any))
          if ((errorData as any).error?.errors?.[0]?.reason === 'quotaExceeded') {
            this.rateLimits.youtube.remaining = 0
            this.rateLimits.youtube.resetAt = Date.now() + 24 * 60 * 60 * 1000 // Reset in 24 hours
            throw new Error('YouTube API quota exceeded')
          }
        }
        throw new Error(`YouTube API error: ${response.status}`)
      }

      const data = await response.json() as any
      
      if (!data.items || data.items.length === 0) {
        return {
          success: false,
          source: 'youtube_api',
          error: 'Video not found'
        }
      }

      const video = data.items[0] as YouTubeVideoDetails
      console.log('[ApiEnrichment] Video fetched:', {
        id: video.id,
        title: video.snippet?.title,
        channelId: video.snippet?.channelId,
        channelTitle: video.snippet?.channelTitle
      })
      
      // Fetch channel information to get the channel thumbnail and statistics
      let channelData = null
      if (video.snippet?.channelId) {
        console.log(`[ApiEnrichment] ===== FETCHING CHANNEL DATA =====`)
        console.log(`[ApiEnrichment] Channel ID: ${video.snippet.channelId}`)
        
        try {
          let channelUrl: string;
          let channelHeaders: Record<string, string>;
          
          if (isApiKey) {
            // Use API key in query parameter
            channelUrl = `${this.YOUTUBE_API_BASE}/channels?part=snippet,statistics&id=${video.snippet.channelId}&key=${accessToken}`
            channelHeaders = { 'Accept': 'application/json' }
            console.log(`[ApiEnrichment] Fetching channel with API key`)
          } else {
            // Use OAuth token in header
            channelUrl = `${this.YOUTUBE_API_BASE}/channels?part=snippet,statistics&id=${video.snippet.channelId}`
            channelHeaders = {
              'Authorization': `Bearer ${accessToken}`,
              'Accept': 'application/json'
            }
            console.log(`[ApiEnrichment] Fetching channel with OAuth`)
          }
          
          const channelResponse = await fetch(channelUrl, { headers: channelHeaders })
          
          if (channelResponse.ok) {
            const channelResult = await channelResponse.json() as any
            console.log('[ApiEnrichment] Raw channel API response:', JSON.stringify(channelResult, null, 2))
            
            if (channelResult.items && channelResult.items.length > 0) {
              channelData = channelResult.items[0]
              console.log('[ApiEnrichment] Channel data extracted:', {
                channelId: channelData.id,
                channelTitle: channelData.snippet?.title,
                thumbnails: channelData.snippet?.thumbnails,
                subscriberCount: channelData.statistics?.subscriberCount
              })
              console.log('[ApiEnrichment] Full channel snippet:', JSON.stringify(channelData.snippet, null, 2))
            } else {
              console.warn('[ApiEnrichment] No channel items in response')
            }
          } else {
            console.warn('[ApiEnrichment] Channel fetch failed:', channelResponse.status)
          }
        } catch (channelError) {
          console.warn('[ApiEnrichment] Failed to fetch channel data:', channelError)
          // Continue without channel data
        }
      }
      
      // Update rate limit tracking (approximate)
      this.rateLimits.youtube.remaining = Math.max(0, this.rateLimits.youtube.remaining - 4) // Video parts + channel costs quota

      // Add channel data to the video response
      if (channelData) {
        (video as any).channelData = channelData
      }

      return {
        success: true,
        data: video,
        source: 'youtube_api',
        quotaUsed: 4
      }
    } catch (error) {
      console.error('[ApiEnrichment] YouTube API error:', error)
      return {
        success: false,
        source: 'youtube_api',
        error: error instanceof Error ? error.message : 'YouTube API error'
      }
    }
  }

  /**
   * Enrich Spotify episode using Spotify Web API
   */
  private async enrichSpotifyContent(episodeId: string, accessToken: string): Promise<ApiEnrichmentResult> {
    try {
      const url = `${this.SPOTIFY_API_BASE}/episodes/${episodeId}`

      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/json'
        }
      })

      // Handle rate limiting
      const rateLimitRemaining = response.headers.get('x-ratelimit-remaining')
      const rateLimitReset = response.headers.get('x-ratelimit-reset')
      
      if (rateLimitRemaining) {
        this.rateLimits.spotify.remaining = parseInt(rateLimitRemaining)
      }
      if (rateLimitReset) {
        this.rateLimits.spotify.resetAt = parseInt(rateLimitReset) * 1000
      }

      if (!response.ok) {
        if (response.status === 401) {
          throw new Error('Spotify token expired or invalid')
        }
        if (response.status === 429) {
          const retryAfter = response.headers.get('retry-after')
          this.rateLimits.spotify.remaining = 0
          this.rateLimits.spotify.resetAt = Date.now() + (parseInt(retryAfter || '60') * 1000)
          throw new Error(`Spotify rate limit exceeded. Retry after ${retryAfter} seconds`)
        }
        throw new Error(`Spotify API error: ${response.status}`)
      }

      const episode = await response.json() as SpotifyEpisodeDetails

      return {
        success: true,
        data: episode,
        source: 'spotify_api'
      }
    } catch (error) {
      console.error('[ApiEnrichment] Spotify API error:', error)
      return {
        success: false,
        source: 'spotify_api',
        error: error instanceof Error ? error.message : 'Spotify API error'
      }
    }
  }

  /**
   * Check if we're within rate limits for a provider
   */
  private checkRateLimit(provider: 'youtube' | 'spotify'): boolean {
    const limit = this.rateLimits[provider]
    
    // Reset if time has passed
    if (Date.now() > limit.resetAt) {
      if (provider === 'youtube') {
        limit.remaining = 10000 // Daily quota
        limit.resetAt = 0
      } else {
        limit.remaining = 180 // Spotify per-app limit
        limit.resetAt = 0
      }
    }

    return limit.remaining > 0
  }

  /**
   * Get remaining quota/rate limit for a provider
   */
  getQuotaStatus(provider: 'youtube' | 'spotify'): {
    remaining: number
    resetAt: number
    percentage: number
  } {
    const limit = this.rateLimits[provider]
    const maxLimit = provider === 'youtube' ? 10000 : 180
    
    return {
      remaining: limit.remaining,
      resetAt: limit.resetAt,
      percentage: (limit.remaining / maxLimit) * 100
    }
  }

  /**
   * Cache management
   */
  private getFromCache(key: string): any | null {
    const entry = this.cache.get(key)
    if (!entry) return null
    
    const age = Date.now() - entry.timestamp
    if (age > this.CACHE_TTL) {
      this.cache.delete(key)
      return null
    }
    
    return entry.data
  }

  private addToCache(key: string, data: any): void {
    this.cache.set(key, {
      data,
      timestamp: Date.now()
    })
    
    // Clean old entries if cache is too large
    if (this.cache.size > 100) {
      const entries = Array.from(this.cache.entries())
      entries.sort((a, b) => a[1].timestamp - b[1].timestamp)
      
      // Remove oldest 20 entries
      for (let i = 0; i < 20; i++) {
        this.cache.delete(entries[i][0])
      }
    }
  }

  /**
   * Transform API response to ContentEnrichmentService format
   */
  transformYouTubeApiResponse(video: YouTubeVideoDetails & { channelData?: any }): any {
    console.log('[ApiEnrichment] transformYouTubeApiResponse called with:', {
      hasChannelData: !!video.channelData,
      channelSnippet: video.channelData?.snippet ? 'present' : 'missing',
      channelThumbnails: video.channelData?.snippet?.thumbnails ? 'present' : 'missing'
    })
    
    const duration = this.parseYouTubeDuration(video.contentDetails?.duration || '')
    
    // Extract channel thumbnail from channel data if available
    let channelThumbnail: string | undefined
    if (video.channelData?.snippet?.thumbnails) {
      const thumbnails = video.channelData.snippet.thumbnails
      console.log('[ApiEnrichment] Available thumbnail sizes:', Object.keys(thumbnails))
      
      // Prefer high quality thumbnail
      channelThumbnail = thumbnails.high?.url || 
                        thumbnails.medium?.url || 
                        thumbnails.default?.url
      console.log('[ApiEnrichment] Selected channel thumbnail:', channelThumbnail)
    } else {
      console.log('[ApiEnrichment] No channel data or thumbnails available', {
        hasChannelData: !!video.channelData,
        hasSnippet: !!video.channelData?.snippet,
        hasThumbnails: !!video.channelData?.snippet?.thumbnails
      })
    }
    
    const result = {
      viewCount: parseInt(video.statistics?.viewCount || '0'),
      likeCount: parseInt(video.statistics?.likeCount || '0'),
      commentCount: parseInt(video.statistics?.commentCount || '0'),
      durationSeconds: duration,
      creatorId: video.snippet?.channelId ? `youtube:${video.snippet.channelId}` : undefined,
      creatorName: video.snippet?.channelTitle,
      creatorHandle: video.channelData?.snippet?.customUrl || undefined, // Custom URL can be used as handle
      creatorThumbnail: channelThumbnail,
      creatorVerified: undefined, // YouTube API doesn't provide verification status directly
      creatorSubscriberCount: video.channelData?.statistics?.subscriberCount ? 
        parseInt(video.channelData.statistics.subscriberCount) : undefined,
      category: video.snippet?.categoryId,
      tags: video.snippet?.tags || [],
      language: video.snippet?.defaultAudioLanguage,
      hasCaptions: video.contentDetails?.caption === 'true',
      videoQuality: video.contentDetails?.definition === 'hd' ? '1080p' : '480p',
      // Return as Date object for Drizzle
      publishedAt: video.snippet?.publishedAt ? parseYouTubeDate(video.snippet.publishedAt) : undefined,
      isExplicit: video.status?.madeForKids === false
    }
    
    console.log('[ApiEnrichment] Transform result:', {
      creatorId: result.creatorId,
      creatorName: result.creatorName,
      creatorThumbnail: result.creatorThumbnail,
      creatorHandle: result.creatorHandle,
      creatorSubscriberCount: result.creatorSubscriberCount
    })
    
    return result
  }

  transformSpotifyApiResponse(episode: SpotifyEpisodeDetails): any {
    return {
      durationSeconds: Math.floor(episode.duration_ms / 1000),
      creatorId: episode.show?.id ? `spotify:${episode.show.id}` : undefined,
      creatorName: episode.show?.publisher,
      creatorHandle: undefined, // Spotify doesn't provide handles
      creatorThumbnail: episode.show?.images?.[0]?.url,
      seriesId: episode.show?.id,
      seriesName: episode.show?.name,
      language: episode.languages?.[0],
      isExplicit: episode.explicit,
      // Return as Date object for Drizzle
      publishedAt: episode.release_date ? parseSpotifyDate(episode.release_date) : undefined,
      description: episode.description,
      thumbnailUrl: episode.images?.[0]?.url
    }
  }

  /**
   * Parse YouTube duration format (ISO 8601) to seconds
   */
  private parseYouTubeDuration(duration: string): number {
    if (!duration) return 0
    
    const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/)
    if (!match) return 0
    
    const hours = parseInt(match[1] || '0')
    const minutes = parseInt(match[2] || '0')
    const seconds = parseInt(match[3] || '0')
    
    return hours * 3600 + minutes * 60 + seconds
  }
}