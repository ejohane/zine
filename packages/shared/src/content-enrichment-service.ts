/**
 * Content Enrichment Service
 * Enriches content with metadata from various sources
 */

import { enhancedMetadataExtractor } from './enhanced-metadata-extractor'
import { normalizeUrl, resolveSpotifyResource } from './url-normalizer'
import { DateNormalizer } from './date-normalizer'
import { sha256HashSync } from './crypto-utils'

// Content type definitions
export interface Content {
  id: string
  externalId: string
  provider: string
  url: string
  canonicalUrl?: string
  title: string
  description?: string
  thumbnailUrl?: string
  faviconUrl?: string
  publishedAt?: Date
  durationSeconds?: number
  
  // Engagement metrics
  viewCount?: number
  likeCount?: number
  commentCount?: number
  shareCount?: number
  saveCount?: number
  popularityScore?: number
  engagementRate?: number
  trendingScore?: number
  
  // Creator information
  creatorId?: string
  creatorName?: string
  creatorHandle?: string
  creatorThumbnail?: string
  creatorVerified?: boolean
  creatorSubscriberCount?: number
  creatorFollowerCount?: number
  
  // Series/Episode context
  seriesId?: string
  seriesName?: string
  episodeNumber?: number
  seasonNumber?: number
  totalEpisodesInSeries?: number
  isLatestEpisode?: boolean
  seriesMetadata?: any
  
  // Content classification
  contentType?: string
  category?: string
  subcategory?: string
  language?: string
  isExplicit?: boolean
  ageRestriction?: string
  tags?: string[]
  topics?: string[]
  
  // Technical metadata
  hasCaptions?: boolean
  hasTranscript?: boolean
  hasHd?: boolean
  has4k?: boolean
  videoQuality?: string
  audioQuality?: string
  audioLanguages?: string[]
  captionLanguages?: string[]
  
  // Cross-platform matching
  contentFingerprint?: string
  publisherCanonicalId?: string
  normalizedTitle?: string
  episodeIdentifier?: string
  crossPlatformMatches?: any[]
  
  // Aggregated metadata
  statisticsMetadata?: any
  technicalMetadata?: any
  enrichmentMetadata?: any
  extendedMetadata?: any
  
  // Tracking
  createdAt: Date
  updatedAt: Date
  lastEnrichedAt?: Date
  enrichmentVersion?: number
  enrichmentSource?: string
}

export interface EnrichmentOptions {
  forceRefresh?: boolean
  includeEngagement?: boolean
  includeCreator?: boolean
  includeTechnical?: boolean
  maxAge?: number // Max age in seconds before refresh
}

export interface EnrichmentResult {
  success: boolean
  content?: Content
  error?: string
  source?: string
}

interface CacheEntry {
  content: Content
  timestamp: number
}

/**
 * Service for enriching content with metadata from various sources
 */
export class ContentEnrichmentService {
  private cache: Map<string, CacheEntry> = new Map()
  private readonly CACHE_TTL = 15 * 60 * 1000 // 15 minutes
  private readonly MAX_RETRIES = 3
  private readonly RETRY_DELAY = 1000 // 1 second

  /**
   * Main enrichment method - enriches content from a URL
   */
  async enrichContent(url: string, options: EnrichmentOptions = {}): Promise<EnrichmentResult> {
    try {
      // Normalize URL
      const normalized = normalizeUrl(url)
      const canonicalUrl = normalized.normalized

      // Check cache if not forcing refresh
      if (!options.forceRefresh) {
        const cached = this.getFromCache(canonicalUrl)
        if (cached && !this.needsEnrichment(cached, options)) {
          return { success: true, content: cached, source: 'cache' }
        }
      }

      // Extract metadata with retries
      let metadataResult = null
      let lastError = null
      
      for (let attempt = 0; attempt < this.MAX_RETRIES; attempt++) {
        try {
          metadataResult = await enhancedMetadataExtractor.extractMetadata(url)
          if (metadataResult.success) break
        } catch (error) {
          lastError = error
          if (attempt < this.MAX_RETRIES - 1) {
            await this.delay(this.RETRY_DELAY * (attempt + 1))
          }
        }
      }

      if (!metadataResult?.success) {
        return {
          success: false,
          error: (lastError instanceof Error ? lastError.message : '') || metadataResult?.error || 'Failed to extract metadata'
        }
      }

      const metadata = metadataResult.metadata!
      const now = new Date()

      // Determine provider and external ID
      const { provider, externalId } = this.parseProviderInfo(url, metadata)

      // Create content object
      const content: Content = {
        id: `${provider}-${externalId}`,
        externalId,
        provider,
        url,
        canonicalUrl,
        title: metadata.title,
        description: metadata.description,
        thumbnailUrl: metadata.thumbnailUrl,
        faviconUrl: metadata.faviconUrl,
        publishedAt: metadata.publishedAt ? DateNormalizer.toDate(DateNormalizer.toUnixTimestamp(metadata.publishedAt)) || undefined : undefined,
        createdAt: now,
        updatedAt: now,
        lastEnrichedAt: now,
        enrichmentVersion: 1,
        enrichmentSource: String(metadata.source)
      }

      // Add provider-specific enrichment
      this.enrichProviderSpecific(content, metadata, options)

      // Generate content fingerprint for deduplication
      content.contentFingerprint = this.generateFingerprint(content)
      content.normalizedTitle = this.normalizeTitle(content.title)

      // Store enrichment metadata
      content.enrichmentMetadata = {
        extractedAt: now.toISOString(),
        source: String(metadata.source),
        raw: metadata
      }

      // Cache the enriched content
      this.addToCache(canonicalUrl, content)

      return { success: true, content, source: metadata.source }
    } catch (error) {
      console.error('Content enrichment error:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    }
  }

  /**
   * Batch enrichment for efficiency
   */
  async enrichBatch(urls: string[], options: EnrichmentOptions = {}): Promise<EnrichmentResult[]> {
    const results = await Promise.allSettled(
      urls.map(url => this.enrichContent(url, options))
    )
    
    return results.map(result => {
      if (result.status === 'fulfilled') {
        return result.value
      } else {
        return {
          success: false,
          error: result.reason?.message || 'Unknown error'
        }
      }
    })
  }

  /**
   * Refresh existing content
   */
  async refreshContent(_contentId: string, url: string, force: boolean = false): Promise<EnrichmentResult> {
    return this.enrichContent(url, { 
      forceRefresh: force,
      includeEngagement: true,
      includeCreator: true
    })
  }

  /**
   * Check if content needs enrichment
   */
  needsEnrichment(content: Content, options: EnrichmentOptions = {}): boolean {
    if (!content.lastEnrichedAt) return true
    
    const maxAge = options.maxAge || 24 * 60 * 60 // Default 24 hours
    const age = (Date.now() - new Date(content.lastEnrichedAt).getTime()) / 1000
    
    if (age > maxAge) return true
    
    // Check if specific data is missing but requested
    if (options.includeEngagement && !content.viewCount && !content.likeCount) return true
    if (options.includeCreator && !content.creatorName) return true
    if (options.includeTechnical && !content.technicalMetadata) return true
    
    return false
  }

  /**
   * Parse provider and external ID from URL
   */
  private parseProviderInfo(url: string, _metadata: any): { provider: string, externalId: string } {
    // YouTube
    if (url.includes('youtube.com') || url.includes('youtu.be')) {
      const videoId = this.extractYouTubeId(url)
      if (videoId) {
        return { provider: 'youtube', externalId: videoId }
      }
      // Fall back to URL hash for malformed YouTube URLs
      console.warn(`Failed to extract YouTube ID from URL: ${url}`)
      const urlHash = sha256HashSync(url).substring(0, 16)
      return { provider: 'youtube', externalId: `malformed-${urlHash}` }
    }
    
    // Spotify
    if (url.includes('spotify.com') || url.startsWith('spotify:')) {
      const contentId = this.extractSpotifyId(url)
      if (contentId) {
        return { provider: 'spotify', externalId: contentId }
      }
      // Fall back to URL hash for malformed Spotify URLs
      console.warn(`Failed to extract Spotify ID from URL: ${url}`)
      const urlHash = sha256HashSync(url).substring(0, 16)
      return { provider: 'spotify', externalId: `malformed-${urlHash}` }
    }
    
    // Twitter/X
    if (url.includes('twitter.com') || url.includes('x.com')) {
      const tweetId = this.extractTwitterId(url)
      if (tweetId) {
        return { provider: 'twitter', externalId: tweetId }
      }
      // Fall back to URL hash for malformed Twitter URLs
      console.warn(`Failed to extract Twitter/X ID from URL: ${url}`)
      const urlHash = sha256HashSync(url).substring(0, 16)
      return { provider: 'twitter', externalId: `malformed-${urlHash}` }
    }
    
    // Default to web with URL hash
    const urlHash = sha256HashSync(url).substring(0, 16)
    return { provider: 'web', externalId: urlHash }
  }

  /**
   * Add provider-specific enrichment
   */
  private enrichProviderSpecific(content: Content, metadata: any, _options: EnrichmentOptions) {
    // YouTube enrichment
    if (content.provider === 'youtube') {
      content.contentType = 'video'

      // Use video metadata if available
      if (metadata.videoMetadata) {
        const vm = metadata.videoMetadata
        content.durationSeconds = vm.duration
        content.viewCount = vm.viewCount
        content.likeCount = vm.likeCount
        content.category = vm.categoryId
        // Store raw statistics
        content.statisticsMetadata = vm
      }

      // Use creator information from metadata extractor
      if (metadata.creator) {
        content.creatorId = metadata.creator.id
        content.creatorName = metadata.creator.name
        content.creatorHandle = metadata.creator.handle
        content.creatorThumbnail = metadata.creator.avatarUrl
        content.creatorVerified = metadata.creator.verified
        content.creatorSubscriberCount = metadata.creator.subscriberCount
        content.creatorFollowerCount = metadata.creator.followerCount
      }
    }
    
    // Spotify enrichment  
    if (content.provider === 'spotify' && metadata.podcastMetadata) {
      const pm = metadata.podcastMetadata
      content.episodeNumber = pm.episodeNumber
      content.seriesName = pm.seriesName
      content.durationSeconds = pm.duration
      content.contentType = 'podcast'
      
      if (metadata.showInfo) {
        content.creatorName = metadata.showInfo.publisher
        content.seriesId = metadata.showInfo.showId
      }
      
      // Store raw metadata
      content.technicalMetadata = pm
    }
    
    // Twitter/X enrichment
    if (content.provider === 'twitter' && metadata.postMetadata) {
      const pm = metadata.postMetadata
      content.likeCount = pm.likeCount
      content.shareCount = pm.repostCount
      content.contentType = 'post'
      
      // Store raw metadata
      content.statisticsMetadata = pm
    }
    
    // Article enrichment
    if (metadata.articleMetadata) {
      const am = metadata.articleMetadata
      content.contentType = 'article'
      if (am.authorName) content.creatorName = am.authorName
      
      // Store article metadata
      content.extendedMetadata = am
    }
    
    // Calculate engagement metrics if we have data
    if (content.viewCount) {
      const engagements = (content.likeCount || 0) + (content.commentCount || 0) + (content.shareCount || 0)
      content.engagementRate = content.viewCount > 0 ? engagements / content.viewCount : 0
      
      // Simple popularity score (0-100)
      if (content.viewCount > 1000000) {
        content.popularityScore = Math.min(100, Math.floor(Math.log10(content.viewCount) * 10))
      }
    }
  }

  /**
   * Generate content fingerprint for deduplication
   */
  private generateFingerprint(content: Content): string {
    const parts = [
      content.provider,
      content.externalId,
      content.normalizedTitle || content.title,
      content.creatorName || '',
      content.seriesName || '',
      content.episodeNumber?.toString() || ''
    ].filter(Boolean).join('|')
    
    return sha256HashSync(parts)
  }

  /**
   * Normalize title for fuzzy matching
   */
  private normalizeTitle(title: string): string {
    return title
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, '') // Remove special characters
      .replace(/\s+/g, ' ') // Normalize whitespace
      .trim()
  }

  /**
   * Extract YouTube video ID from URL
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

  /**
   * Extract Spotify content ID from URL (supports tracks, albums, artists, playlists, episodes, shows)
   */
  private extractSpotifyId(url: string): string | null {
    const resource = resolveSpotifyResource(url)
    return resource?.id ?? null
  }

  /**
   * Extract Twitter/X tweet ID from URL
   */
  private extractTwitterId(url: string): string | null {
    const match = url.match(/(?:twitter|x)\.com\/\w+\/status\/(\d+)/)
    return match ? match[1] : null
  }

  /**
   * Cache management
   */
  private getFromCache(url: string): Content | null {
    const entry = this.cache.get(url)
    if (!entry) return null
    
    const age = Date.now() - entry.timestamp
    if (age > this.CACHE_TTL) {
      this.cache.delete(url)
      return null
    }
    
    return entry.content
  }

  private addToCache(url: string, content: Content): void {
    this.cache.set(url, {
      content,
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

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }
}

// Export singleton instance
export const contentEnrichmentService = new ContentEnrichmentService()
