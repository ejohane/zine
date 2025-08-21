/**
 * Preview Service - Optimized metadata extraction with database-first approach
 */

import type { Context } from 'hono'
import { D1MetadataRepository, type ExistingMetadata } from '../repositories/metadata-repository'
import { normalizeUrl } from '@zine/shared'
import { enhancedMetadataExtractor } from '@zine/shared'
import { OAuthTokenService } from './oauth-token-service'

export interface PreviewResponse {
  success: boolean
  metadata?: {
    url: string
    normalizedUrl: string
    title: string
    description?: string | null
    imageUrl?: string | null
    thumbnailUrl?: string | null
    faviconUrl?: string | null
    publishedAt?: Date | null
    author?: string | null
    provider?: string | null
    duration?: number | null
    viewCount?: number | null
    platform?: string | null
    language?: string | null
    contentType?: string | null
    creator?: any
  }
  source: 'database' | 'native_api' | 'oembed' | 'scraper'
  cached: boolean
  provider?: string
  error?: string
  performanceMetrics?: {
    totalTime: number
    databaseLookupTime?: number
    externalApiTime?: number
  }
}

export class PreviewService {
  private metadataRepo: D1MetadataRepository
  private oauthTokenService: OAuthTokenService
  
  constructor(ctx: Context) {
    const db = ctx.env.DB
    this.metadataRepo = new D1MetadataRepository(db)
    this.oauthTokenService = new OAuthTokenService(ctx.env)
  }
  
  /**
   * Get preview metadata using database-first approach
   */
  async getPreview(url: string, userId?: string): Promise<PreviewResponse> {
    const startTime = Date.now()
    let databaseLookupTime: number | undefined
    let externalApiTime: number | undefined
    
    try {
      // Step 1: Normalize URL
      const normalized = normalizeUrl(url)
      
      // Step 2: Check database first
      const dbStartTime = Date.now()
      const existingMetadata = await this.metadataRepo.findByUrl(url)
      databaseLookupTime = Date.now() - dbStartTime
      
      if (existingMetadata) {
        // Found in database - return cached metadata
        return {
          success: true,
          metadata: this.transformMetadata(existingMetadata),
          source: 'database',
          cached: true,
          provider: existingMetadata.provider || existingMetadata.platform || 'unknown',
          performanceMetrics: {
            totalTime: Date.now() - startTime,
            databaseLookupTime
          }
        }
      }
      
      // Step 3: Not in database - check OAuth availability for native API access
      let tokenAvailable = false
      let provider: 'spotify' | 'youtube' | null = null
      
      if (userId && normalized.platform) {
        // Check if URL is from a supported platform
        if (normalized.platform === 'youtube' && this.isYouTubeUrl(normalized.normalized)) {
          const availability = await this.oauthTokenService.checkTokenAvailability(userId, 'youtube')
          if (availability.available) {
            tokenAvailable = true
            provider = 'youtube'
            console.log(`[PreviewService] YouTube token available for user ${userId}, will use native API in future phases`)
          }
        } else if (normalized.platform === 'spotify' && this.isSpotifyUrl(normalized.normalized)) {
          const availability = await this.oauthTokenService.checkTokenAvailability(userId, 'spotify')
          if (availability.available) {
            tokenAvailable = true
            provider = 'spotify'
            console.log(`[PreviewService] Spotify token available for user ${userId}, will use native API in future phases`)
          }
        }
      }
      
      // Step 4: Fetch from external source (native API or fallback)
      // TODO: In Phase 6-7, implement native API calls when tokenAvailable is true
      // For now, use the existing metadata extractor but log the availability
      if (tokenAvailable && provider) {
        console.log(`[PreviewService] Token available for ${provider}, but native API not yet implemented (Phase 6-7)`)
      }
      
      const apiStartTime = Date.now()
      const metadataResult = await enhancedMetadataExtractor.extractMetadata(url)
      externalApiTime = Date.now() - apiStartTime
      
      if (!metadataResult.success) {
        return {
          success: false,
          source: 'scraper',
          cached: false,
          error: metadataResult.error || 'Failed to extract metadata',
          performanceMetrics: {
            totalTime: Date.now() - startTime,
            databaseLookupTime,
            externalApiTime
          }
        }
      }
      
      const metadata = metadataResult.metadata!
      
      // Transform to preview response format
      return {
        success: true,
        metadata: {
          url: url,
          normalizedUrl: normalized.normalized,
          title: metadata.title,
          description: metadata.description,
          imageUrl: metadata.thumbnailUrl,
          thumbnailUrl: metadata.thumbnailUrl,
          faviconUrl: metadata.faviconUrl,
          publishedAt: metadata.publishedAt,
          author: metadata.articleMetadata?.authorName || metadata.creator?.name,
          provider: metadata.source,
          duration: metadata.videoMetadata?.duration || metadata.podcastMetadata?.duration,
          viewCount: metadata.videoMetadata?.viewCount,
          platform: normalized.platform,
          language: metadata.language,
          contentType: metadata.contentType,
          creator: metadata.creator
        },
        source: this.determineSource(metadataResult),
        cached: false,
        provider: metadata.source || normalized.platform || 'web',
        performanceMetrics: {
          totalTime: Date.now() - startTime,
          databaseLookupTime,
          externalApiTime
        }
      }
      
    } catch (error) {
      return {
        success: false,
        source: 'scraper',
        cached: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        performanceMetrics: {
          totalTime: Date.now() - startTime,
          databaseLookupTime,
          externalApiTime
        }
      }
    }
  }
  
  /**
   * Transform database metadata to preview response format
   */
  private transformMetadata(metadata: ExistingMetadata) {
    return {
      url: metadata.url,
      normalizedUrl: metadata.normalizedUrl,
      title: metadata.title || 'Untitled',
      description: metadata.description,
      imageUrl: metadata.imageUrl,
      thumbnailUrl: metadata.imageUrl,
      faviconUrl: null,
      publishedAt: metadata.publishedAt,
      author: metadata.author,
      provider: metadata.provider,
      duration: metadata.duration,
      viewCount: metadata.viewCount,
      platform: metadata.platform,
      language: null,
      contentType: null,
      creator: metadata.author ? { name: metadata.author } : null
    }
  }
  
  /**
   * Determine the source of metadata extraction
   */
  private determineSource(metadataResult: any): 'database' | 'native_api' | 'oembed' | 'scraper' {
    // TODO: In Phase 5-7, this will check if native API was used
    // For now, check if oEmbed was used based on the metadata
    if (metadataResult.metadata?.oembedData) {
      return 'oembed'
    }
    return 'scraper'
  }
  
  /**
   * Batch preview for multiple URLs (optimized for performance)
   */
  async getBatchPreview(urls: string[], userId?: string): Promise<PreviewResponse[]> {
    // Process URLs in parallel for better performance
    const promises = urls.map(url => this.getPreview(url, userId))
    return Promise.all(promises)
  }
  
  /**
   * Invalidate cached metadata for a URL
   */
  async invalidateCache(_url: string): Promise<boolean> {
    // TODO: Implement cache invalidation
    // This would mark the database entry as stale or delete it
    return true
  }
  
  /**
   * Check if URL is a YouTube URL
   */
  private isYouTubeUrl(url: string): boolean {
    return /^https?:\/\/(www\.)?(youtube\.com|youtu\.be|m\.youtube\.com)/.test(url)
  }
  
  /**
   * Check if URL is a Spotify URL
   */
  private isSpotifyUrl(url: string): boolean {
    return /^https?:\/\/(open|play)\.spotify\.com/.test(url)
  }
}