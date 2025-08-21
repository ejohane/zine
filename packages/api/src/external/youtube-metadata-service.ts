import type { Env } from '../types'
import { OAuthTokenService } from '../services/oauth-token-service'

export interface YouTubeMetadata {
  title: string
  description?: string
  thumbnailUrl?: string
  duration?: number
  channelName?: string
  channelId?: string
  publishedAt?: string
  viewCount?: number
  likeCount?: number
  type: 'video' | 'playlist' | 'channel'
  url: string
  raw?: any
}

interface YouTubeVideo {
  id: string
  snippet: {
    title: string
    description: string
    publishedAt: string
    channelId: string
    channelTitle: string
    thumbnails: {
      default?: { url: string; width: number; height: number }
      medium?: { url: string; width: number; height: number }
      high?: { url: string; width: number; height: number }
      standard?: { url: string; width: number; height: number }
      maxres?: { url: string; width: number; height: number }
    }
  }
  contentDetails?: {
    duration: string
    dimension: string
    definition: string
  }
  statistics?: {
    viewCount: string
    likeCount: string
    commentCount: string
  }
}

interface YouTubePlaylist {
  id: string
  snippet: {
    title: string
    description: string
    publishedAt: string
    channelId: string
    channelTitle: string
    thumbnails: {
      default?: { url: string; width: number; height: number }
      medium?: { url: string; width: number; height: number }
      high?: { url: string; width: number; height: number }
      standard?: { url: string; width: number; height: number }
      maxres?: { url: string; width: number; height: number }
    }
  }
  contentDetails?: {
    itemCount: number
  }
}

interface YouTubeChannel {
  id: string
  snippet: {
    title: string
    description: string
    publishedAt: string
    thumbnails: {
      default?: { url: string; width: number; height: number }
      medium?: { url: string; width: number; height: number }
      high?: { url: string; width: number; height: number }
    }
    customUrl?: string
  }
  statistics?: {
    viewCount: string
    subscriberCount: string
    videoCount: string
  }
}

export class YouTubeMetadataService {
  private baseUrl = 'https://www.googleapis.com/youtube/v3'
  private tokenService: OAuthTokenService

  constructor(env: Env) {
    this.tokenService = new OAuthTokenService(env)
  }

  /**
   * Extract metadata from a YouTube URL
   */
  async getMetadata(url: string, userId?: string): Promise<YouTubeMetadata | null> {
    try {
      const parsed = this.parseYouTubeUrl(url)
      if (!parsed) {
        console.log('[YouTubeMetadataService] Invalid YouTube URL:', url)
        return null
      }

      // Get user token if available
      let accessToken: string | null = null
      if (userId) {
        accessToken = await this.tokenService.getValidToken(userId, 'youtube')
      }

      if (!accessToken) {
        console.log('[YouTubeMetadataService] No valid token available for user:', userId)
        return null
      }

      // Fetch metadata based on type
      switch (parsed.type) {
        case 'video':
          return this.getVideoMetadata(parsed.id, accessToken, url)
        case 'playlist':
          return this.getPlaylistMetadata(parsed.id, accessToken, url)
        case 'channel':
          return this.getChannelMetadata(parsed.id, accessToken, url)
        default:
          console.log('[YouTubeMetadataService] Unsupported YouTube type:', parsed.type)
          return null
      }
    } catch (error) {
      console.error('[YouTubeMetadataService] Error getting metadata:', error)
      return null
    }
  }

  /**
   * Parse YouTube URL to extract type and ID
   */
  private parseYouTubeUrl(url: string): { type: 'video' | 'playlist' | 'channel'; id: string } | null {
    try {
      const urlObj = new URL(url)
      
      // Handle youtu.be short URLs
      if (urlObj.hostname === 'youtu.be') {
        const videoId = urlObj.pathname.slice(1).split('?')[0]
        if (videoId) {
          return { type: 'video', id: videoId }
        }
      }

      // Handle youtube.com URLs
      if (urlObj.hostname === 'www.youtube.com' || urlObj.hostname === 'youtube.com' || urlObj.hostname === 'm.youtube.com') {
        // Video URLs
        if (urlObj.pathname === '/watch') {
          const videoId = urlObj.searchParams.get('v')
          if (videoId) {
            return { type: 'video', id: videoId }
          }
        }

        // Playlist URLs
        if (urlObj.pathname === '/playlist') {
          const playlistId = urlObj.searchParams.get('list')
          if (playlistId) {
            return { type: 'playlist', id: playlistId }
          }
        }

        // Channel URLs
        if (urlObj.pathname.startsWith('/channel/')) {
          const channelId = urlObj.pathname.split('/')[2]
          if (channelId) {
            return { type: 'channel', id: channelId }
          }
        }

        // User/c/@ channel URLs
        if (urlObj.pathname.startsWith('/@') || urlObj.pathname.startsWith('/c/') || urlObj.pathname.startsWith('/user/')) {
          // These require additional API calls to resolve to channel ID
          // For now, we'll skip these
          console.log('[YouTubeMetadataService] Custom channel URLs not yet supported:', url)
          return null
        }

        // Embedded video URLs
        if (urlObj.pathname.startsWith('/embed/')) {
          const videoId = urlObj.pathname.split('/')[2]?.split('?')[0]
          if (videoId) {
            return { type: 'video', id: videoId }
          }
        }
      }

      return null
    } catch {
      return null
    }
  }

  /**
   * Get video metadata
   */
  private async getVideoMetadata(id: string, accessToken: string, originalUrl: string): Promise<YouTubeMetadata | null> {
    try {
      const params = new URLSearchParams({
        part: 'snippet,contentDetails,statistics',
        id: id
      })

      const response = await fetch(`${this.baseUrl}/videos?${params}`, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/json'
        }
      })

      if (!response.ok) {
        if (response.status === 401) {
          console.log('[YouTubeMetadataService] Token expired or invalid')
        }
        throw new Error(`YouTube API error: ${response.status}`)
      }

      const data: any = await response.json()
      const video: YouTubeVideo = data.items?.[0]

      if (!video) {
        console.log('[YouTubeMetadataService] Video not found:', id)
        return null
      }

      // Parse ISO 8601 duration to seconds
      const duration = video.contentDetails?.duration
      const durationSeconds = duration ? this.parseISO8601Duration(duration) : undefined

      return {
        title: video.snippet.title,
        description: video.snippet.description,
        thumbnailUrl: this.getBestThumbnail(video.snippet.thumbnails),
        duration: durationSeconds,
        channelName: video.snippet.channelTitle,
        channelId: video.snippet.channelId,
        publishedAt: video.snippet.publishedAt,
        viewCount: video.statistics?.viewCount ? parseInt(video.statistics.viewCount) : undefined,
        likeCount: video.statistics?.likeCount ? parseInt(video.statistics.likeCount) : undefined,
        type: 'video',
        url: originalUrl,
        raw: video
      }
    } catch (error) {
      console.error('[YouTubeMetadataService] Error fetching video:', error)
      return null
    }
  }

  /**
   * Get playlist metadata
   */
  private async getPlaylistMetadata(id: string, accessToken: string, originalUrl: string): Promise<YouTubeMetadata | null> {
    try {
      const params = new URLSearchParams({
        part: 'snippet,contentDetails',
        id: id
      })

      const response = await fetch(`${this.baseUrl}/playlists?${params}`, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/json'
        }
      })

      if (!response.ok) {
        throw new Error(`YouTube API error: ${response.status}`)
      }

      const data: any = await response.json()
      const playlist: YouTubePlaylist = data.items?.[0]

      if (!playlist) {
        console.log('[YouTubeMetadataService] Playlist not found:', id)
        return null
      }

      return {
        title: playlist.snippet.title,
        description: playlist.snippet.description,
        thumbnailUrl: this.getBestThumbnail(playlist.snippet.thumbnails),
        channelName: playlist.snippet.channelTitle,
        channelId: playlist.snippet.channelId,
        publishedAt: playlist.snippet.publishedAt,
        type: 'playlist',
        url: originalUrl,
        raw: playlist
      }
    } catch (error) {
      console.error('[YouTubeMetadataService] Error fetching playlist:', error)
      return null
    }
  }

  /**
   * Get channel metadata
   */
  private async getChannelMetadata(id: string, accessToken: string, originalUrl: string): Promise<YouTubeMetadata | null> {
    try {
      const params = new URLSearchParams({
        part: 'snippet,statistics',
        id: id
      })

      const response = await fetch(`${this.baseUrl}/channels?${params}`, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/json'
        }
      })

      if (!response.ok) {
        throw new Error(`YouTube API error: ${response.status}`)
      }

      const data: any = await response.json()
      const channel: YouTubeChannel = data.items?.[0]

      if (!channel) {
        console.log('[YouTubeMetadataService] Channel not found:', id)
        return null
      }

      return {
        title: channel.snippet.title,
        description: channel.snippet.description,
        thumbnailUrl: this.getBestThumbnail(channel.snippet.thumbnails),
        publishedAt: channel.snippet.publishedAt,
        viewCount: channel.statistics?.viewCount ? parseInt(channel.statistics.viewCount) : undefined,
        type: 'channel',
        url: originalUrl,
        raw: channel
      }
    } catch (error) {
      console.error('[YouTubeMetadataService] Error fetching channel:', error)
      return null
    }
  }

  /**
   * Parse ISO 8601 duration to seconds
   */
  private parseISO8601Duration(duration: string): number {
    const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/)
    if (!match) return 0

    const hours = parseInt(match[1] || '0')
    const minutes = parseInt(match[2] || '0')
    const seconds = parseInt(match[3] || '0')

    return hours * 3600 + minutes * 60 + seconds
  }

  /**
   * Get the best available thumbnail URL
   */
  private getBestThumbnail(thumbnails: any): string | undefined {
    if (!thumbnails) return undefined
    
    // Prefer in order: maxres, standard, high, medium, default
    return thumbnails.maxres?.url ||
           thumbnails.standard?.url ||
           thumbnails.high?.url ||
           thumbnails.medium?.url ||
           thumbnails.default?.url ||
           undefined
  }

  /**
   * Check if a URL is a YouTube URL
   */
  static isYouTubeUrl(url: string): boolean {
    try {
      const urlObj = new URL(url)
      const hostname = urlObj.hostname.toLowerCase()
      return hostname === 'youtube.com' || 
             hostname === 'www.youtube.com' ||
             hostname === 'm.youtube.com' ||
             hostname === 'youtu.be'
    } catch {
      return false
    }
  }
}