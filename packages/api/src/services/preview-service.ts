/**
 * Preview Service - Optimized metadata extraction with database-first approach
 */

import type { Context } from 'hono'
import { MetadataRepository, type ExistingMetadata } from '../repositories/metadata-repository'
import { normalizeUrl } from '@zine/shared'
import { MetadataOrchestrator } from './metadata-orchestrator'

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
  cacheControl?: string
  etag?: string
  lastModified?: string
  notModified?: boolean
}

export class PreviewService {
  private metadataRepo: MetadataRepository
  private orchestrator: MetadataOrchestrator
  
  constructor(ctx: Context) {
    const db = ctx.env.DB
    this.metadataRepo = new MetadataRepository(db)
    this.orchestrator = new MetadataOrchestrator(ctx.env)
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
      const existingMetadata = await this.metadataRepo.findExistingMetadata(url)
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
      
      // Step 3: Use metadata orchestrator with fallback chain
      const apiStartTime = Date.now()
      const orchestrationResult = await this.orchestrator.extractWithCircuitBreaker(
        url,
        userId,
        existingMetadata
      )
      externalApiTime = Date.now() - apiStartTime
      
      const metadata = orchestrationResult.metadata
      
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
          author: metadata.articleMetadata?.authorName || metadata.channelName || metadata.creator?.name,
          provider: metadata.source,
          duration: metadata.videoMetadata?.duration || metadata.podcastMetadata?.duration,
          viewCount: metadata.videoMetadata?.viewCount,
          platform: normalized.platform,
          language: metadata.language,
          contentType: metadata.contentType,
          creator: metadata.creator
        },
        source: orchestrationResult.source === 'database' ? 'database' : 
                orchestrationResult.source === 'native_api' ? 'native_api' :
                orchestrationResult.source === 'oembed' ? 'oembed' : 'scraper',
        cached: orchestrationResult.cached,
        provider: orchestrationResult.provider || normalized.platform || 'web',
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
   * Get preview with cache support (including ETags)
   */
  async getPreviewWithCache(url: string, userId?: string, ifNoneMatch?: string): Promise<PreviewResponse> {
    const startTime = Date.now()
    let databaseLookupTime: number | undefined
    let externalApiTime: number | undefined
    
    try {
      // Step 1: Normalize URL
      const normalized = normalizeUrl(url)
      
      // Step 2: Check database first
      const dbStartTime = Date.now()
      const existingMetadata = await this.metadataRepo.findExistingMetadata(url)
      databaseLookupTime = Date.now() - dbStartTime
      
      // Step 3: Use orchestrator with stale-while-revalidate support
      const apiStartTime = Date.now()
      const orchestrationResult = await this.orchestrator.extractWithStaleWhileRevalidate(
        url,
        userId,
        existingMetadata,
        ifNoneMatch
      )
      externalApiTime = Date.now() - apiStartTime
      
      // Handle 304 Not Modified
      if (orchestrationResult.notModified) {
        return {
          success: true,
          source: orchestrationResult.source === 'database' ? 'database' : 
                  orchestrationResult.source === 'native_api' ? 'native_api' :
                  orchestrationResult.source === 'oembed' ? 'oembed' : 'scraper',
          cached: true,
          provider: orchestrationResult.provider,
          notModified: true,
          cacheControl: orchestrationResult.cacheControl,
          etag: orchestrationResult.etag,
          performanceMetrics: {
            totalTime: Date.now() - startTime,
            databaseLookupTime,
            externalApiTime
          }
        }
      }
      
      const metadata = orchestrationResult.metadata
      
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
          author: metadata.articleMetadata?.authorName || metadata.channelName || metadata.creator?.name,
          provider: metadata.source,
          duration: metadata.videoMetadata?.duration || metadata.podcastMetadata?.duration,
          viewCount: metadata.videoMetadata?.viewCount,
          platform: normalized.platform,
          language: metadata.language,
          contentType: metadata.contentType,
          creator: metadata.creator
        },
        source: orchestrationResult.source === 'database' ? 'database' : 
                orchestrationResult.source === 'native_api' ? 'native_api' :
                orchestrationResult.source === 'oembed' ? 'oembed' : 'scraper',
        cached: orchestrationResult.cached,
        provider: orchestrationResult.provider || normalized.platform || 'web',
        cacheControl: orchestrationResult.cacheControl,
        etag: orchestrationResult.etag,
        lastModified: orchestrationResult.lastModified,
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
}