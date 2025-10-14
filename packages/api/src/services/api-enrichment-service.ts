/**
 * API Enrichment Service
 * Handles API-based content enrichment using OAuth tokens when available
 */

import type { Bindings } from '../index'
import { DualModeTokenService } from './dual-mode-token-service'
import { parseYouTubeDate, parseSpotifyDate } from '../utils/date-normalization'

export type SpotifyResourceType = 'episode' | 'show' | 'track' | 'album' | 'playlist' | 'artist'

export interface ApiEnrichmentOptions {
  provider: 'youtube' | 'spotify'
  contentId: string
  userId?: string
  forceRefresh?: boolean
  resourceType?: SpotifyResourceType
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

export interface SpotifyShowDetails {
  id: string
  name: string
  description: string
  html_description?: string
  publisher: string
  images: Array<{
    url: string
    height?: number
    width?: number
  }>
  total_episodes?: number
  languages?: string[]
}

export interface SpotifyTrackDetails {
  id: string
  name: string
  description?: string | null
  duration_ms: number
  explicit: boolean
  preview_url?: string | null
  album: {
    id: string
    name: string
    release_date: string
    images: Array<{
      url: string
      height?: number
      width?: number
    }>
  }
  artists: Array<{
    id: string
    name: string
  }>
}

export interface SpotifyAlbumDetails {
  id: string
  name: string
  total_tracks: number
  release_date: string
  album_type?: string
  images: Array<{
    url: string
    height?: number
    width?: number
  }>
  artists: Array<{
    id: string
    name: string
  }>
}

export interface SpotifyPlaylistDetails {
  id: string
  name: string
  description: string | null
  images: Array<{
    url: string
    height?: number
    width?: number
  }>
  tracks: {
    total: number
  }
  owner: {
    display_name?: string | null
    id?: string
  }
}

export interface SpotifyArtistDetails {
  id: string
  name: string
  genres: string[]
  followers?: {
    total: number
  }
  images: Array<{
    url: string
    height?: number
    width?: number
  }>
}

type SpotifyApiItem =
  | (SpotifyEpisodeDetails & { __resourceType?: SpotifyResourceType })
  | (SpotifyShowDetails & { __resourceType?: SpotifyResourceType })
  | (SpotifyTrackDetails & { __resourceType?: SpotifyResourceType })
  | (SpotifyAlbumDetails & { __resourceType?: SpotifyResourceType })
  | (SpotifyPlaylistDetails & { __resourceType?: SpotifyResourceType })
  | (SpotifyArtistDetails & { __resourceType?: SpotifyResourceType })

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
    const cacheKey = `${options.provider}:${options.resourceType || 'unknown'}:${options.contentId}`
    
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
          result = await this.enrichSpotifyContent(options.contentId, options.resourceType, tokenData.accessToken)
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
   * Enrich Spotify content using the Spotify Web API
   */
  private async enrichSpotifyContent(
    contentId: string,
    resourceType: SpotifyResourceType | undefined,
    accessToken: string
  ): Promise<ApiEnrichmentResult> {
    const typesToTry: SpotifyResourceType[] = resourceType
      ? [resourceType]
      : ['episode', 'track', 'show', 'album', 'playlist', 'artist']

    for (const type of typesToTry) {
      try {
        const resource = await this.fetchSpotifyResource(type, contentId, accessToken)
        if (resource) {
          return {
            success: true,
            data: { ...resource, __resourceType: type },
            source: 'spotify_api'
          }
        }
      } catch (error) {
        console.error(`[ApiEnrichment] Spotify API error for ${type}:`, error)
        return {
          success: false,
          source: 'spotify_api',
          error: error instanceof Error ? error.message : 'Spotify API error'
        }
      }
    }

    return {
      success: false,
      source: 'spotify_api',
      error: 'Spotify resource not found for provided ID'
    }
  }

  private async fetchSpotifyResource(
    type: SpotifyResourceType,
    contentId: string,
    accessToken: string
  ): Promise<SpotifyApiItem | null> {
    const endpoint = this.getSpotifyEndpoint(type)
    const url = `${this.SPOTIFY_API_BASE}/${endpoint}/${contentId}`

    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/json'
      }
    })

    this.updateSpotifyRateLimit(response)

    if (response.status === 404) {
      return null
    }

    if (!response.ok) {
      if (response.status === 401) {
        throw new Error('Spotify token expired or invalid')
      }
      if (response.status === 429) {
        const retryAfter = response.headers.get('retry-after')
        this.rateLimits.spotify.remaining = 0
        this.rateLimits.spotify.resetAt = Date.now() + (parseInt(retryAfter || '60') * 1000)
        throw new Error(`Spotify rate limit exceeded. Retry after ${retryAfter || '60'} seconds`)
      }
      throw new Error(`Spotify API error: ${response.status}`)
    }

    return (await response.json()) as SpotifyApiItem
  }

  private getSpotifyEndpoint(type: SpotifyResourceType): string {
    switch (type) {
      case 'episode':
        return 'episodes'
      case 'show':
        return 'shows'
      case 'track':
        return 'tracks'
      case 'album':
        return 'albums'
      case 'playlist':
        return 'playlists'
      case 'artist':
        return 'artists'
      default:
        return 'episodes'
    }
  }

  private updateSpotifyRateLimit(response: Response): void {
    const rateLimitRemaining = response.headers.get('x-ratelimit-remaining')
    const rateLimitReset = response.headers.get('x-ratelimit-reset')

    if (rateLimitRemaining) {
      this.rateLimits.spotify.remaining = parseInt(rateLimitRemaining, 10)
    }
    if (rateLimitReset) {
      this.rateLimits.spotify.resetAt = parseInt(rateLimitReset, 10) * 1000
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

  transformSpotifyApiResponse(item: SpotifyApiItem, explicitType?: SpotifyResourceType): any {
    const type = explicitType || (item as any).__resourceType || this.detectSpotifyResourceType(item)

    switch (type) {
      case 'episode': {
        const episode = item as SpotifyEpisodeDetails
        return {
          title: episode.name,
          description: episode.description,
          durationSeconds: Math.floor(episode.duration_ms / 1000),
          creatorId: episode.show?.id ? `spotify:${episode.show.id}` : undefined,
          creatorName: episode.show?.name,
          creatorHandle: undefined,
          creatorThumbnail: episode.show?.images?.[0]?.url,
          seriesId: episode.show?.id,
          seriesName: episode.show?.name,
          seriesMetadata: {
            publisher: episode.show?.publisher ?? null
          },
          language: episode.languages?.[0],
          isExplicit: episode.explicit,
          publishedAt: episode.release_date ? parseSpotifyDate(episode.release_date) : undefined,
          thumbnailUrl: episode.images?.[0]?.url,
          enrichmentMetadata: {
            spotifyResourceType: 'episode',
            htmlDescription: episode.html_description || null,
            resumePositionMs: episode.resume_point?.resume_position_ms ?? null
          }
        }
      }
      case 'show': {
        const show = item as SpotifyShowDetails
        return {
          title: show.name,
          description: show.description,
          creatorId: show.id ? `spotify:${show.id}` : undefined,
          creatorName: show.name,
          creatorThumbnail: show.images?.[0]?.url,
          seriesId: show.id,
          seriesName: show.name,
          language: show.languages?.[0],
          thumbnailUrl: show.images?.[0]?.url,
          seriesMetadata: {
            totalEpisodes: show.total_episodes ?? null,
            publisher: show.publisher ?? null
          },
          enrichmentMetadata: {
            spotifyResourceType: 'show'
          }
        }
      }
      case 'track': {
        const track = item as SpotifyTrackDetails
        const primaryArtist = track.artists?.[0]
        return {
          title: track.name,
          description: track.album ? `Track from ${track.album.name}` : track.description || null,
          durationSeconds: Math.floor(track.duration_ms / 1000),
          creatorId: primaryArtist?.id ? `spotify:${primaryArtist.id}` : undefined,
          creatorName: primaryArtist?.name,
          creatorThumbnail: undefined,
          seriesId: track.album?.id,
          seriesName: track.album?.name,
          isExplicit: track.explicit,
          publishedAt: track.album?.release_date ? parseSpotifyDate(track.album.release_date) : undefined,
          thumbnailUrl: track.album?.images?.[0]?.url,
          enrichmentMetadata: {
            spotifyResourceType: 'track',
            previewUrl: track.preview_url || null
          }
        }
      }
      case 'album': {
        const album = item as SpotifyAlbumDetails
        const primaryArtist = album.artists?.[0]
        return {
          title: album.name,
          description: primaryArtist ? `${primaryArtist.name} • ${album.total_tracks} tracks` : `${album.total_tracks} tracks`,
          creatorId: primaryArtist?.id ? `spotify:${primaryArtist.id}` : undefined,
          creatorName: primaryArtist?.name,
          seriesId: album.id,
          seriesName: album.name,
          publishedAt: album.release_date ? parseSpotifyDate(album.release_date) : undefined,
          thumbnailUrl: album.images?.[0]?.url,
          seriesMetadata: {
            totalTracks: album.total_tracks,
            albumType: album.album_type || null
          },
          enrichmentMetadata: {
            spotifyResourceType: 'album'
          }
        }
      }
      case 'playlist': {
        const playlist = item as SpotifyPlaylistDetails
        return {
          title: playlist.name,
          description: playlist.description,
          creatorId: playlist.owner?.id ? `spotify:user:${playlist.owner.id}` : undefined,
          creatorName: playlist.owner?.display_name || playlist.owner?.id,
          thumbnailUrl: playlist.images?.[0]?.url,
          seriesMetadata: {
            trackCount: playlist.tracks?.total ?? null
          },
          enrichmentMetadata: {
            spotifyResourceType: 'playlist'
          }
        }
      }
      case 'artist': {
        const artist = item as SpotifyArtistDetails
        return {
          title: artist.name,
          description: artist.genres?.length ? `Genres: ${artist.genres.join(', ')}` : null,
          creatorId: artist.id ? `spotify:${artist.id}` : undefined,
          creatorName: artist.name,
          creatorThumbnail: artist.images?.[0]?.url,
          thumbnailUrl: artist.images?.[0]?.url,
          statisticsMetadata: {
            followerCount: artist.followers?.total ?? null
          },
          enrichmentMetadata: {
            spotifyResourceType: 'artist'
          }
        }
      }
      default:
        return {}
    }
  }

  private detectSpotifyResourceType(item: SpotifyApiItem): SpotifyResourceType {
    const candidate = item as any

    if (candidate?.show && typeof candidate?.duration_ms === 'number') {
      return 'episode'
    }
    if (candidate?.album && typeof candidate?.duration_ms === 'number') {
      return 'track'
    }
    if (candidate?.total_tracks !== undefined && candidate?.artists) {
      return 'album'
    }
    if (candidate?.tracks && candidate?.owner) {
      return 'playlist'
    }
    if (candidate?.publisher && candidate?.total_episodes !== undefined) {
      return 'show'
    }
    if (candidate?.followers) {
      return 'artist'
    }
    return 'episode'
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
