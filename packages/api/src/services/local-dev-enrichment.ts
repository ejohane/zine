/**
 * Local Development Enrichment Service
 * Uses YouTube API key instead of OAuth for local testing
 */

export class LocalDevEnrichmentService {
  private readonly YOUTUBE_API_BASE = 'https://www.googleapis.com/youtube/v3'
  
  constructor(private apiKey: string) {
    console.log('[LocalDevEnrichment] Initialized with API key:', apiKey ? 'present' : 'missing')
  }

  /**
   * Enrich YouTube video using API key (for local dev only)
   */
  async enrichYouTubeWithApiKey(videoId: string): Promise<any> {
    console.log('[LocalDevEnrichment] ===== ENRICHING WITH API KEY =====')
    console.log('[LocalDevEnrichment] Video ID:', videoId)
    
    try {
      // Fetch video data
      const videoUrl = `${this.YOUTUBE_API_BASE}/videos?part=snippet,statistics,contentDetails&id=${videoId}&key=${this.apiKey}`
      console.log('[LocalDevEnrichment] Fetching video...')
      
      const videoResponse = await fetch(videoUrl)
      if (!videoResponse.ok) {
        console.error('[LocalDevEnrichment] Video fetch failed:', videoResponse.status)
        throw new Error(`YouTube API error: ${videoResponse.status}`)
      }
      
      const videoData = await videoResponse.json() as any
      if (!videoData.items || videoData.items.length === 0) {
        console.error('[LocalDevEnrichment] No video found')
        return null
      }
      
      const video = videoData.items[0]
      console.log('[LocalDevEnrichment] Video fetched:', {
        title: video.snippet?.title,
        channelId: video.snippet?.channelId,
        channelTitle: video.snippet?.channelTitle
      })
      
      // Fetch channel data for creator avatar
      if (video.snippet?.channelId) {
        console.log('[LocalDevEnrichment] Fetching channel data for avatar...')
        const channelUrl = `${this.YOUTUBE_API_BASE}/channels?part=snippet,statistics&id=${video.snippet.channelId}&key=${this.apiKey}`
        
        const channelResponse = await fetch(channelUrl)
        if (channelResponse.ok) {
          const channelData = await channelResponse.json() as any
          if (channelData.items && channelData.items.length > 0) {
            const channel = channelData.items[0]
            console.log('[LocalDevEnrichment] Channel fetched:', {
              id: channel.id,
              title: channel.snippet?.title,
              hasThumbnails: !!channel.snippet?.thumbnails,
              thumbnailSizes: channel.snippet?.thumbnails ? Object.keys(channel.snippet.thumbnails) : []
            })
            
            // Add channel data to video for processing
            video.channelData = channel
            
            // Log the actual thumbnail URLs
            if (channel.snippet?.thumbnails) {
              console.log('[LocalDevEnrichment] Channel thumbnails:')
              console.log('  - Default:', channel.snippet.thumbnails.default?.url)
              console.log('  - Medium:', channel.snippet.thumbnails.medium?.url) 
              console.log('  - High:', channel.snippet.thumbnails.high?.url)
            }
          }
        } else {
          console.warn('[LocalDevEnrichment] Channel fetch failed:', channelResponse.status)
        }
      }
      
      console.log('[LocalDevEnrichment] ✅ Enrichment complete')
      return video
      
    } catch (error) {
      console.error('[LocalDevEnrichment] Error:', error)
      throw error
    }
  }
}