/**
 * Integrated Content Enrichment Service
 * Orchestrates enrichment from multiple sources with smart fallbacks
 */

import { ContentEnrichmentService, Content, EnrichmentOptions, EnrichmentResult } from './content-enrichment-service'
import { enhancedMetadataExtractor } from './enhanced-metadata-extractor'
import { normalizeUrl, detectPlatform } from './url-normalizer'

export interface IntegratedEnrichmentOptions extends EnrichmentOptions {
  userId?: string
  useApis?: boolean
  apiEnrichmentService?: any // Will be injected from API layer
  oembedFallback?: boolean
  opengraphFallback?: boolean
}

export interface IntegratedEnrichmentResult extends EnrichmentResult {
  apiUsed?: boolean
  fallbackUsed?: boolean
  enrichmentChain?: string[]
}

/**
 * Service that integrates multiple enrichment sources with intelligent fallbacks
 */
export class IntegratedEnrichmentService {
  private enrichmentChain: string[] = []
  private baseEnrichmentService = new ContentEnrichmentService()

  /**
   * Enhanced enrichment with API integration and fallbacks
   */
  async enrichContentWithApis(
    url: string, 
    options: IntegratedEnrichmentOptions = {}
  ): Promise<IntegratedEnrichmentResult> {
    this.enrichmentChain = []
    
    try {
      // 1. Normalize URL and detect platform
      normalizeUrl(url) // Validate URL format
      const platform = detectPlatform(url)
      
      console.log('[IntegratedEnrichment] Starting enrichment for:', {
        url,
        platform,
        userId: options.userId,
        useApis: options.useApis
      })

      // 2. Try API enrichment first if available
      if (options.useApis && options.apiEnrichmentService && options.userId) {
        const apiResult = await this.tryApiEnrichment(
          url,
          platform,
          options.userId,
          options.apiEnrichmentService
        )
        
        if (apiResult.success) {
          this.enrichmentChain.push(`${platform}_api`)
          return {
            ...apiResult,
            apiUsed: true,
            enrichmentChain: this.enrichmentChain
          }
        }
      }

      // 3. Fall back to oEmbed for supported platforms
      if (options.oembedFallback !== false) {
        const oembedResult = await this.tryOembedEnrichment(url, platform)
        if (oembedResult.success) {
          this.enrichmentChain.push('oembed')
          return {
            ...oembedResult,
            fallbackUsed: true,
            enrichmentChain: this.enrichmentChain
          }
        }
      }

      // 4. Fall back to OpenGraph/meta tags extraction
      if (options.opengraphFallback !== false) {
        const metadataResult = await this.tryMetadataExtraction(url)
        if (metadataResult.success) {
          this.enrichmentChain.push('opengraph')
          return {
            ...metadataResult,
            fallbackUsed: true,
            enrichmentChain: this.enrichmentChain
          }
        }
      }

      // 5. Use base enrichment as last resort
      const baseResult = await this.baseEnrichmentService.enrichContent(url, options)
      this.enrichmentChain.push('base_extractor')
      
      return {
        ...baseResult,
        fallbackUsed: true,
        enrichmentChain: this.enrichmentChain
      }
      
    } catch (error) {
      console.error('[IntegratedEnrichment] Error:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        enrichmentChain: this.enrichmentChain
      }
    }
  }

  /**
   * Try enrichment using platform APIs
   */
  private async tryApiEnrichment(
    url: string,
    platform: string,
    userId: string,
    apiEnrichmentService: any
  ): Promise<IntegratedEnrichmentResult> {
    try {
      // Extract content ID based on platform
      let contentId: string | null = null
      
      if (platform === 'youtube') {
        contentId = this.extractYouTubeId(url)
      } else if (platform === 'spotify') {
        contentId = this.extractSpotifyId(url)
      }

      if (!contentId) {
        return { success: false, error: 'Could not extract content ID from URL' }
      }

      // Call the API enrichment service
      const apiResult = await apiEnrichmentService.enrichWithApi({
        provider: platform,
        contentId,
        userId,
        forceRefresh: false
      })

      if (!apiResult.success) {
        return { success: false, error: apiResult.error }
      }

      // Transform API response to Content format
      const content = this.transformApiResponse(url, platform, contentId, apiResult.data)
      
      return {
        success: true,
        content,
        source: apiResult.source
      }
    } catch (error) {
      console.error(`[IntegratedEnrichment] API enrichment failed for ${platform}:`, error)
      return {
        success: false,
        error: error instanceof Error ? error.message : 'API enrichment failed'
      }
    }
  }

  /**
   * Try oEmbed enrichment
   */
  private async tryOembedEnrichment(url: string, platform: string): Promise<IntegratedEnrichmentResult> {
    try {
      let oembedUrl: string | null = null
      
      // Construct oEmbed URL based on platform
      if (platform === 'youtube') {
        oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`
      } else if (platform === 'spotify') {
        oembedUrl = `https://open.spotify.com/oembed?url=${encodeURIComponent(url)}`
      } else if (platform === 'twitter') {
        oembedUrl = `https://publish.twitter.com/oembed?url=${encodeURIComponent(url)}`
      }

      if (!oembedUrl) {
        return { success: false, error: 'Platform does not support oEmbed' }
      }

      const response = await fetch(oembedUrl, {
        headers: { 'Accept': 'application/json' },
        signal: AbortSignal.timeout(5000) as any
      })

      if (!response.ok) {
        return { success: false, error: `oEmbed request failed: ${response.status}` }
      }

      const oembedData = await response.json() as any
      const content = this.transformOembedResponse(url, platform, oembedData)
      
      return {
        success: true,
        content,
        source: 'oembed'
      }
    } catch (error) {
      console.error(`[IntegratedEnrichment] oEmbed failed for ${platform}:`, error)
      return {
        success: false,
        error: error instanceof Error ? error.message : 'oEmbed enrichment failed'
      }
    }
  }

  /**
   * Try metadata extraction using enhanced extractor
   */
  private async tryMetadataExtraction(url: string): Promise<IntegratedEnrichmentResult> {
    try {
      const result = await enhancedMetadataExtractor.extractMetadata(url)
      
      if (!result.success || !result.metadata) {
        return { success: false, error: result.error || 'Metadata extraction failed' }
      }

      const metadata = result.metadata
      const normalized = normalizeUrl(url)
      const platform = detectPlatform(url)
      const now = new Date()

      // Create content from extracted metadata
      const content: Content = {
        id: `${platform}-${this.generateContentId(url)}`,
        externalId: this.generateContentId(url),
        provider: platform,
        url,
        canonicalUrl: normalized.normalized,
        title: metadata.title,
        description: metadata.description,
        thumbnailUrl: metadata.thumbnailUrl,
        faviconUrl: metadata.faviconUrl,
        publishedAt: metadata.publishedAt,
        createdAt: now,
        updatedAt: now,
        lastEnrichedAt: now,
        enrichmentVersion: 1,
        enrichmentSource: 'metadata_extractor',
        contentType: metadata.contentType,
        creatorName: metadata.creator?.name,
        creatorId: metadata.creator?.id,
        creatorHandle: metadata.creator?.handle,
        creatorThumbnail: metadata.creator?.avatarUrl
      }

      // Add platform-specific metadata
      if (metadata.videoMetadata) {
        content.durationSeconds = metadata.videoMetadata.duration
        content.viewCount = metadata.videoMetadata.viewCount
        content.likeCount = metadata.videoMetadata.likeCount
        content.statisticsMetadata = metadata.videoMetadata
      }

      if (metadata.podcastMetadata) {
        content.episodeNumber = metadata.podcastMetadata.episodeNumber
        content.seriesName = metadata.podcastMetadata.seriesName
        content.durationSeconds = metadata.podcastMetadata.duration
        content.technicalMetadata = metadata.podcastMetadata
      }

      if (metadata.articleMetadata) {
        content.extendedMetadata = metadata.articleMetadata
      }

      if (metadata.postMetadata) {
        content.likeCount = metadata.postMetadata.likeCount
        content.shareCount = metadata.postMetadata.repostCount
        content.statisticsMetadata = metadata.postMetadata
      }

      return {
        success: true,
        content,
        source: 'metadata_extractor'
      }
    } catch (error) {
      console.error('[IntegratedEnrichment] Metadata extraction failed:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Metadata extraction failed'
      }
    }
  }

  /**
   * Transform API response to Content format
   */
  private transformApiResponse(url: string, platform: string, contentId: string, apiData: any): Content {
    const now = new Date()
    const normalized = normalizeUrl(url)
    
    const content: Content = {
      id: `${platform}-${contentId}`,
      externalId: contentId,
      provider: platform,
      url,
      canonicalUrl: normalized.normalized,
      title: '',
      createdAt: now,
      updatedAt: now,
      lastEnrichedAt: now,
      enrichmentVersion: 2,
      enrichmentSource: `${platform}_api`
    }

    if (platform === 'youtube' && apiData.snippet) {
      content.title = apiData.snippet.title
      content.description = apiData.snippet.description
      content.thumbnailUrl = apiData.snippet.thumbnails?.maxres?.url || 
                            apiData.snippet.thumbnails?.high?.url ||
                            apiData.snippet.thumbnails?.medium?.url
      content.publishedAt = apiData.snippet.publishedAt ? new Date(apiData.snippet.publishedAt) : undefined
      content.creatorId = apiData.snippet.channelId
      content.creatorName = apiData.snippet.channelTitle
      content.tags = apiData.snippet.tags
      content.category = apiData.snippet.categoryId
      content.language = apiData.snippet.defaultAudioLanguage
      content.contentType = 'video'
      
      if (apiData.statistics) {
        content.viewCount = parseInt(apiData.statistics.viewCount || '0')
        content.likeCount = parseInt(apiData.statistics.likeCount || '0')
        content.commentCount = parseInt(apiData.statistics.commentCount || '0')
      }
      
      if (apiData.contentDetails) {
        content.durationSeconds = this.parseYouTubeDuration(apiData.contentDetails.duration)
        content.hasCaptions = apiData.contentDetails.caption === 'true'
        content.videoQuality = apiData.contentDetails.definition === 'hd' ? '1080p' : '480p'
      }
      
      content.statisticsMetadata = apiData.statistics
      content.technicalMetadata = apiData.contentDetails
    } else if (platform === 'spotify' && apiData) {
      content.title = apiData.name
      content.description = apiData.description
      content.thumbnailUrl = apiData.images?.[0]?.url
      content.publishedAt = apiData.release_date ? new Date(apiData.release_date) : undefined
      content.durationSeconds = Math.floor((apiData.duration_ms || 0) / 1000)
      content.isExplicit = apiData.explicit
      content.language = apiData.languages?.[0]
      content.contentType = 'podcast'
      
      if (apiData.show) {
        content.seriesId = apiData.show.id
        content.seriesName = apiData.show.name
        content.creatorName = apiData.show.publisher
      }
      
      content.technicalMetadata = {
        duration_ms: apiData.duration_ms,
        languages: apiData.languages,
        is_playable: apiData.is_playable
      }
    }

    // Calculate engagement metrics
    if (content.viewCount) {
      const engagements = (content.likeCount || 0) + (content.commentCount || 0) + (content.shareCount || 0)
      content.engagementRate = content.viewCount > 0 ? engagements / content.viewCount : 0
      
      if (content.viewCount > 1000000) {
        content.popularityScore = Math.min(100, Math.floor(Math.log10(content.viewCount) * 10))
      }
    }

    // Generate fingerprint and normalized title
    content.contentFingerprint = this.createContentFingerprint(content)
    content.normalizedTitle = this.normalizeContentTitle(content.title)

    return content
  }

  /**
   * Transform oEmbed response to Content format
   */
  private transformOembedResponse(url: string, platform: string, oembedData: any): Content {
    const now = new Date()
    const normalized = normalizeUrl(url)
    const contentId = this.generateContentId(url)
    
    const content: Content = {
      id: `${platform}-${contentId}`,
      externalId: contentId,
      provider: platform,
      url,
      canonicalUrl: normalized.normalized,
      title: oembedData.title || '',
      description: oembedData.description,
      thumbnailUrl: oembedData.thumbnail_url,
      createdAt: now,
      updatedAt: now,
      lastEnrichedAt: now,
      enrichmentVersion: 1,
      enrichmentSource: 'oembed',
      contentType: platform === 'youtube' ? 'video' : platform === 'spotify' ? 'podcast' : 'post'
    }

    // Add creator information if available
    if (oembedData.author_name) {
      content.creatorName = oembedData.author_name
    }

    // Platform-specific handling
    if (platform === 'youtube' && oembedData.author_url) {
      // Extract channel ID from author URL
      const channelMatch = oembedData.author_url.match(/channel\/([^/?]+)/)
      if (channelMatch) {
        content.creatorId = channelMatch[1]
      }
    }

    content.enrichmentMetadata = { oembed: oembedData }

    return content
  }

  /**
   * Helper methods
   */
  private extractYouTubeId(url: string): string | null {
    const patterns = [
      /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\n?#]+)/,
      /youtube\.com\/shorts\/([^&\n?#]+)/
    ]
    
    for (const pattern of patterns) {
      const match = url.match(pattern)
      if (match) return match[1]
    }
    
    return null
  }

  private extractSpotifyId(url: string): string | null {
    const match = url.match(/spotify\.com\/(?:track|album|artist|playlist|episode|show)\/([^?/]+)/)
    return match ? match[1] : null
  }

  private generateContentId(url: string): string {
    const encoder = new TextEncoder()
    const data = encoder.encode(url)
    return Array.from(new Uint8Array(data))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('')
      .substring(0, 16)
  }

  private createContentFingerprint(content: Content): string {
    const parts = [
      content.provider,
      content.externalId,
      content.normalizedTitle || content.title,
      content.creatorName || '',
      content.seriesName || '',
      content.episodeNumber?.toString() || ''
    ].filter(Boolean).join('|')
    
    const encoder = new TextEncoder()
    const data = encoder.encode(parts)
    return Array.from(new Uint8Array(data))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('')
  }

  private normalizeContentTitle(title: string): string {
    return title
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
  }

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

// Export singleton instance
export const integratedEnrichmentService = new IntegratedEnrichmentService()