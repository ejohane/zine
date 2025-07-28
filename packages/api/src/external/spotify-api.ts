export interface SpotifyShow {
  id: string
  name: string
  description: string
  images: Array<{
    url: string
    height: number
    width: number
  }>
  external_urls: {
    spotify: string
  }
  publisher: string
  total_episodes: number
}

export interface SpotifyShowsResponse {
  items: Array<{
    added_at: string
    show: SpotifyShow
  }>
  next: string | null
  total: number
}

export interface SpotifyEpisode {
  id: string
  name: string
  description: string
  release_date: string
  duration_ms: number
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
  }
}

export interface SpotifyEpisodesResponse {
  items: SpotifyEpisode[]
  next: string | null
  total: number
}

export class SpotifyAPI {
  private baseUrl = 'https://api.spotify.com/v1'

  constructor(private accessToken: string) {}

  async getUserPodcasts(limit: number = 50, offset: number = 0): Promise<SpotifyShowsResponse> {
    const response = await fetch(
      `${this.baseUrl}/me/shows?limit=${limit}&offset=${offset}`,
      {
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json'
        }
      }
    )

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`Spotify API error: ${response.status} ${error}`)
    }

    return response.json()
  }

  async getAllUserPodcasts(): Promise<SpotifyShow[]> {
    const allShows: SpotifyShow[] = []
    let nextUrl: string | null = null
    let offset = 0
    const limit = 50

    do {
      const response = await this.getUserPodcasts(limit, offset)
      allShows.push(...response.items.map(item => item.show))
      
      nextUrl = response.next
      offset += limit
      
      // Safety limit to prevent infinite loops
      if (offset > 1000) {
        console.warn('Spotify: Hit safety limit of 1000 shows')
        break
      }
    } while (nextUrl)

    return allShows
  }

  async getShow(showId: string): Promise<SpotifyShow> {
    const response = await fetch(
      `${this.baseUrl}/shows/${showId}`,
      {
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json'
        }
      }
    )

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`Spotify API error: ${response.status} ${error}`)
    }

    return response.json()
  }

  async getShowEpisodes(showId: string, limit: number = 50, offset: number = 0): Promise<SpotifyEpisodesResponse> {
    const response = await fetch(
      `${this.baseUrl}/shows/${showId}/episodes?limit=${limit}&offset=${offset}`,
      {
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json'
        }
      }
    )

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`Spotify API error: ${response.status} ${error}`)
    }

    return response.json()
  }

  async getLatestEpisodes(showId: string, maxEpisodes: number = 20): Promise<SpotifyEpisode[]> {
    const allEpisodes: SpotifyEpisode[] = []
    let offset = 0
    const limit = Math.min(50, maxEpisodes)

    do {
      const response = await this.getShowEpisodes(showId, limit, offset)
      allEpisodes.push(...response.items)
      
      offset += limit
      
      // Stop if we have enough episodes or there are no more
      if (allEpisodes.length >= maxEpisodes || !response.next) {
        break
      }
    } while (allEpisodes.length < maxEpisodes)

    return allEpisodes.slice(0, maxEpisodes)
  }

  // Test the access token by making a simple API call
  async testConnection(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/me`, {
        headers: {
          'Authorization': `Bearer ${this.accessToken}`
        }
      })
      return response.ok
    } catch (error) {
      return false
    }
  }
}