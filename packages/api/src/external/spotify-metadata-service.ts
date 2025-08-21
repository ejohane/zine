import type { Env } from '../types'
import { OAuthTokenService } from '../services/oauth-token-service'

export interface SpotifyMetadata {
  title: string
  description?: string
  thumbnailUrl?: string
  duration?: number
  artist?: string
  album?: string
  releaseDate?: string
  previewUrl?: string
  explicit?: boolean
  type: 'track' | 'episode' | 'show' | 'playlist' | 'album' | 'artist'
  url: string
  raw?: any
}

interface SpotifyTrack {
  id: string
  name: string
  duration_ms: number
  explicit: boolean
  preview_url: string | null
  external_urls: {
    spotify: string
  }
  artists: Array<{
    id: string
    name: string
  }>
  album: {
    id: string
    name: string
    release_date: string
    images: Array<{
      url: string
      height: number
      width: number
    }>
  }
}

interface SpotifyEpisode {
  id: string
  name: string
  description: string
  duration_ms: number
  release_date: string
  external_urls: {
    spotify: string
  }
  images: Array<{
    url: string
    height: number
    width: number
  }>
  show: {
    id: string
    name: string
    publisher: string
  }
}

interface SpotifyShow {
  id: string
  name: string
  description: string
  publisher: string
  total_episodes: number
  external_urls: {
    spotify: string
  }
  images: Array<{
    url: string
    height: number
    width: number
  }>
}

interface SpotifyPlaylist {
  id: string
  name: string
  description: string | null
  external_urls: {
    spotify: string
  }
  images: Array<{
    url: string
    height: number
    width: number
  }>
  owner: {
    display_name: string
  }
  tracks: {
    total: number
  }
}

interface SpotifyAlbum {
  id: string
  name: string
  release_date: string
  total_tracks: number
  external_urls: {
    spotify: string
  }
  images: Array<{
    url: string
    height: number
    width: number
  }>
  artists: Array<{
    id: string
    name: string
  }>
}

interface SpotifyArtist {
  id: string
  name: string
  genres: string[]
  followers: {
    total: number
  }
  external_urls: {
    spotify: string
  }
  images: Array<{
    url: string
    height: number
    width: number
  }>
}

export class SpotifyMetadataService {
  private baseUrl = 'https://api.spotify.com/v1'
  private tokenService: OAuthTokenService

  constructor(env: Env) {
    this.tokenService = new OAuthTokenService(env)
  }

  /**
   * Extract metadata from a Spotify URL
   */
  async getMetadata(url: string, userId?: string): Promise<SpotifyMetadata | null> {
    try {
      const parsed = this.parseSpotifyUrl(url)
      if (!parsed) {
        console.log('[SpotifyMetadataService] Invalid Spotify URL:', url)
        return null
      }

      // Get user token if available
      let accessToken: string | null = null
      if (userId) {
        accessToken = await this.tokenService.getValidToken(userId, 'spotify')
      }

      if (!accessToken) {
        console.log('[SpotifyMetadataService] No valid token available for user:', userId)
        return null
      }

      // Fetch metadata based on type
      switch (parsed.type) {
        case 'track':
          return this.getTrackMetadata(parsed.id, accessToken, url)
        case 'episode':
          return this.getEpisodeMetadata(parsed.id, accessToken, url)
        case 'show':
          return this.getShowMetadata(parsed.id, accessToken, url)
        case 'playlist':
          return this.getPlaylistMetadata(parsed.id, accessToken, url)
        case 'album':
          return this.getAlbumMetadata(parsed.id, accessToken, url)
        case 'artist':
          return this.getArtistMetadata(parsed.id, accessToken, url)
        default:
          console.log('[SpotifyMetadataService] Unsupported Spotify type:', parsed.type)
          return null
      }
    } catch (error) {
      console.error('[SpotifyMetadataService] Error getting metadata:', error)
      return null
    }
  }

  /**
   * Parse Spotify URL to extract type and ID
   */
  private parseSpotifyUrl(url: string): { type: string; id: string } | null {
    try {
      const urlObj = new URL(url)
      
      // Handle open.spotify.com URLs
      if (urlObj.hostname === 'open.spotify.com' || urlObj.hostname === 'play.spotify.com') {
        const pathParts = urlObj.pathname.split('/').filter(Boolean)
        if (pathParts.length >= 2) {
          const [type, id] = pathParts
          return { type, id: id.split('?')[0] }
        }
      }

      // Handle spotify: URIs
      if (url.startsWith('spotify:')) {
        const parts = url.split(':')
        if (parts.length >= 3) {
          return { type: parts[1], id: parts[2] }
        }
      }

      return null
    } catch {
      return null
    }
  }

  /**
   * Get track metadata
   */
  private async getTrackMetadata(id: string, accessToken: string, originalUrl: string): Promise<SpotifyMetadata | null> {
    try {
      const response = await fetch(`${this.baseUrl}/tracks/${id}`, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      })

      if (!response.ok) {
        if (response.status === 401) {
          console.log('[SpotifyMetadataService] Token expired or invalid')
        }
        throw new Error(`Spotify API error: ${response.status}`)
      }

      const track: SpotifyTrack = await response.json()

      return {
        title: track.name,
        artist: track.artists.map(a => a.name).join(', '),
        album: track.album.name,
        thumbnailUrl: track.album.images[0]?.url,
        duration: Math.floor(track.duration_ms / 1000),
        releaseDate: track.album.release_date,
        previewUrl: track.preview_url || undefined,
        explicit: track.explicit,
        type: 'track',
        url: originalUrl,
        raw: track
      }
    } catch (error) {
      console.error('[SpotifyMetadataService] Error fetching track:', error)
      return null
    }
  }

  /**
   * Get episode metadata
   */
  private async getEpisodeMetadata(id: string, accessToken: string, originalUrl: string): Promise<SpotifyMetadata | null> {
    try {
      const response = await fetch(`${this.baseUrl}/episodes/${id}`, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      })

      if (!response.ok) {
        throw new Error(`Spotify API error: ${response.status}`)
      }

      const episode: SpotifyEpisode = await response.json()

      return {
        title: episode.name,
        description: episode.description,
        artist: episode.show.publisher,
        album: episode.show.name,
        thumbnailUrl: episode.images[0]?.url,
        duration: Math.floor(episode.duration_ms / 1000),
        releaseDate: episode.release_date,
        type: 'episode',
        url: originalUrl,
        raw: episode
      }
    } catch (error) {
      console.error('[SpotifyMetadataService] Error fetching episode:', error)
      return null
    }
  }

  /**
   * Get show metadata
   */
  private async getShowMetadata(id: string, accessToken: string, originalUrl: string): Promise<SpotifyMetadata | null> {
    try {
      const response = await fetch(`${this.baseUrl}/shows/${id}`, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      })

      if (!response.ok) {
        throw new Error(`Spotify API error: ${response.status}`)
      }

      const show: SpotifyShow = await response.json()

      return {
        title: show.name,
        description: show.description,
        artist: show.publisher,
        thumbnailUrl: show.images[0]?.url,
        type: 'show',
        url: originalUrl,
        raw: show
      }
    } catch (error) {
      console.error('[SpotifyMetadataService] Error fetching show:', error)
      return null
    }
  }

  /**
   * Get playlist metadata
   */
  private async getPlaylistMetadata(id: string, accessToken: string, originalUrl: string): Promise<SpotifyMetadata | null> {
    try {
      const response = await fetch(`${this.baseUrl}/playlists/${id}`, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      })

      if (!response.ok) {
        throw new Error(`Spotify API error: ${response.status}`)
      }

      const playlist: SpotifyPlaylist = await response.json()

      return {
        title: playlist.name,
        description: playlist.description || undefined,
        artist: playlist.owner.display_name,
        thumbnailUrl: playlist.images[0]?.url,
        type: 'playlist',
        url: originalUrl,
        raw: playlist
      }
    } catch (error) {
      console.error('[SpotifyMetadataService] Error fetching playlist:', error)
      return null
    }
  }

  /**
   * Get album metadata
   */
  private async getAlbumMetadata(id: string, accessToken: string, originalUrl: string): Promise<SpotifyMetadata | null> {
    try {
      const response = await fetch(`${this.baseUrl}/albums/${id}`, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      })

      if (!response.ok) {
        throw new Error(`Spotify API error: ${response.status}`)
      }

      const album: SpotifyAlbum = await response.json()

      return {
        title: album.name,
        artist: album.artists.map(a => a.name).join(', '),
        thumbnailUrl: album.images[0]?.url,
        releaseDate: album.release_date,
        type: 'album',
        url: originalUrl,
        raw: album
      }
    } catch (error) {
      console.error('[SpotifyMetadataService] Error fetching album:', error)
      return null
    }
  }

  /**
   * Get artist metadata
   */
  private async getArtistMetadata(id: string, accessToken: string, originalUrl: string): Promise<SpotifyMetadata | null> {
    try {
      const response = await fetch(`${this.baseUrl}/artists/${id}`, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      })

      if (!response.ok) {
        throw new Error(`Spotify API error: ${response.status}`)
      }

      const artist: SpotifyArtist = await response.json()

      return {
        title: artist.name,
        description: artist.genres.join(', ') || undefined,
        thumbnailUrl: artist.images[0]?.url,
        type: 'artist',
        url: originalUrl,
        raw: artist
      }
    } catch (error) {
      console.error('[SpotifyMetadataService] Error fetching artist:', error)
      return null
    }
  }

  /**
   * Check if a URL is a Spotify URL
   */
  static isSpotifyUrl(url: string): boolean {
    try {
      const urlObj = new URL(url)
      return urlObj.hostname === 'open.spotify.com' || 
             urlObj.hostname === 'play.spotify.com' ||
             url.startsWith('spotify:')
    } catch {
      return false
    }
  }
}