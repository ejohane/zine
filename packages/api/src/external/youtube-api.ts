export interface YouTubeChannel {
  id: string
  snippet: {
    title: string
    description: string
    thumbnails: {
      default?: { url: string }
      medium?: { url: string }
      high?: { url: string }
    }
    publishedAt: string
    customUrl?: string
  }
  statistics?: {
    subscriberCount: string
    videoCount: string
  }
}

export interface YouTubeSubscription {
  id: string
  snippet: {
    title: string
    description: string
    publishedAt: string
    thumbnails: {
      default?: { url: string }
      medium?: { url: string }
      high?: { url: string }
    }
    resourceId: {
      channelId: string
    }
  }
}

export interface YouTubeSubscriptionsResponse {
  items: YouTubeSubscription[]
  nextPageToken?: string
  pageInfo: {
    totalResults: number
    resultsPerPage: number
  }
}

export interface YouTubeVideo {
  id: {
    videoId: string
  }
  snippet: {
    title: string
    description: string
    publishedAt: string
    thumbnails: {
      default?: { url: string }
      medium?: { url: string }
      high?: { url: string }
    }
    channelId: string
    channelTitle: string
  }
}

export interface YouTubeVideoDetails {
  id: string
  snippet: {
    title: string
    description: string
    publishedAt: string
    thumbnails: {
      default?: { url: string }
      medium?: { url: string }
      high?: { url: string }
    }
    channelId: string
    channelTitle: string
  }
  contentDetails: {
    duration: string // ISO 8601 duration (e.g., "PT4M13S")
  }
}

export interface YouTubeSearchResponse {
  items: YouTubeVideo[]
  nextPageToken?: string
  pageInfo: {
    totalResults: number
    resultsPerPage: number
  }
}

export interface YouTubeVideosResponse {
  items: YouTubeVideoDetails[]
  nextPageToken?: string
  pageInfo: {
    totalResults: number
    resultsPerPage: number
  }
}

export class YouTubeAPI {
  private baseUrl = 'https://www.googleapis.com/youtube/v3'

  constructor(private accessToken: string) {}

  async getUserSubscriptions(
    maxResults: number = 50, 
    pageToken?: string
  ): Promise<YouTubeSubscriptionsResponse> {
    const params = new URLSearchParams({
      part: 'snippet',
      mine: 'true',
      maxResults: maxResults.toString(),
      order: 'alphabetical'
    })

    if (pageToken) {
      params.set('pageToken', pageToken)
    }

    const response = await fetch(
      `${this.baseUrl}/subscriptions?${params.toString()}`,
      {
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json'
        }
      }
    )

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`YouTube API error: ${response.status} ${error}`)
    }

    return response.json()
  }

  async getAllUserSubscriptions(): Promise<YouTubeSubscription[]> {
    const allSubscriptions: YouTubeSubscription[] = []
    let nextPageToken: string | undefined

    do {
      const response = await this.getUserSubscriptions(50, nextPageToken)
      allSubscriptions.push(...response.items)
      
      nextPageToken = response.nextPageToken
      
      // Safety limit to prevent infinite loops
      if (allSubscriptions.length > 2000) {
        console.warn('YouTube: Hit safety limit of 2000 subscriptions')
        break
      }
    } while (nextPageToken)

    return allSubscriptions
  }

  async getChannel(channelId: string): Promise<YouTubeChannel> {
    const params = new URLSearchParams({
      part: 'snippet,statistics',
      id: channelId
    })

    const response = await fetch(
      `${this.baseUrl}/channels?${params.toString()}`,
      {
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json'
        }
      }
    )

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`YouTube API error: ${response.status} ${error}`)
    }

    const data = await response.json() as { items?: YouTubeChannel[] }
    if (!data.items || data.items.length === 0) {
      throw new Error(`Channel not found: ${channelId}`)
    }

    return data.items[0]
  }

  async getChannelVideos(
    channelId: string, 
    maxResults: number = 25,
    pageToken?: string
  ): Promise<YouTubeSearchResponse> {
    const params = new URLSearchParams({
      part: 'snippet',
      channelId: channelId,
      type: 'video',
      order: 'date',
      maxResults: maxResults.toString()
    })

    if (pageToken) {
      params.set('pageToken', pageToken)
    }

    const response = await fetch(
      `${this.baseUrl}/search?${params.toString()}`,
      {
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json'
        }
      }
    )

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`YouTube API error: ${response.status} ${error}`)
    }

    return response.json()
  }

  async getVideoDetails(videoIds: string[]): Promise<YouTubeVideoDetails[]> {
    if (videoIds.length === 0) return []

    const params = new URLSearchParams({
      part: 'snippet,contentDetails',
      id: videoIds.join(',')
    })

    const response = await fetch(
      `${this.baseUrl}/videos?${params.toString()}`,
      {
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json'
        }
      }
    )

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`YouTube API error: ${response.status} ${error}`)
    }

    const data = await response.json() as YouTubeVideosResponse
    return data.items
  }

  async getLatestVideos(channelId: string, maxVideos: number = 20): Promise<YouTubeVideoDetails[]> {
    const searchResponse = await this.getChannelVideos(channelId, Math.min(50, maxVideos))
    
    if (searchResponse.items.length === 0) {
      return []
    }

    const videoIds = searchResponse.items.map(item => item.id.videoId)
    return this.getVideoDetails(videoIds)
  }

  // Utility function to convert ISO 8601 duration to seconds
  static parseDuration(duration: string): number | undefined {
    const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/)
    if (!match) return undefined

    const hours = parseInt(match[1] || '0')
    const minutes = parseInt(match[2] || '0')
    const seconds = parseInt(match[3] || '0')

    return hours * 3600 + minutes * 60 + seconds
  }

  // Test the access token by making a simple API call
  async testConnection(): Promise<boolean> {
    try {
      const response = await fetch(
        `${this.baseUrl}/channels?part=snippet&mine=true&maxResults=1`,
        {
          headers: {
            'Authorization': `Bearer ${this.accessToken}`
          }
        }
      )
      return response.ok
    } catch (error) {
      return false
    }
  }
}