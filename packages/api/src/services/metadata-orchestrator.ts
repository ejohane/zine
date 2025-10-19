import type { Env } from '../types'
import { SpotifyMetadataService } from '../external/spotify-metadata-service'
import { YouTubeMetadataService } from '../external/youtube-metadata-service'
import { enhancedMetadataExtractor } from '@zine/shared'
import { normalizeUrl, detectPlatform } from '@zine/shared'

export interface OrchestrationResult {
  metadata: any
  source: 'database' | 'native_api' | 'oembed' | 'html_scrape' | 'minimal'
  cached: boolean
  provider: string
  extractionTime: number
  cacheControl?: string
  etag?: string
  lastModified?: string
}

interface RetryConfig {
  maxAttempts: number
  baseDelay: number
  maxDelay: number
}

export class MetadataOrchestrator {
  private spotifyService: SpotifyMetadataService
  private youtubeService: YouTubeMetadataService
  private retryConfig: RetryConfig = {
    maxAttempts: 3,
    baseDelay: 1000,
    maxDelay: 10000
  }
  
  // In-memory cache for the current request lifecycle
  private memoryCache = new Map<string, {
    data: any
    timestamp: number
    etag: string
  }>()
  
  // Cache configuration
  private readonly CACHE_TTL = {
    database: 86400000, // 24 hours
    native_api: 3600000, // 1 hour
    oembed: 3600000, // 1 hour
    html_scrape: 1800000, // 30 minutes
    minimal: 600000 // 10 minutes
  }
  
  private readonly STALE_WHILE_REVALIDATE = 300000 // 5 minutes

  constructor(env: Env) {
    this.spotifyService = new SpotifyMetadataService(env)
    this.youtubeService = new YouTubeMetadataService(env)
  }

  /**
   * Main orchestration method - implements the fallback chain
   */
  async extract(url: string, userId?: string, existingMetadata?: any): Promise<OrchestrationResult> {
    const startTime = Date.now()
    const normalized = normalizeUrl(url)
    const platform = detectPlatform(url)
    const cacheKey = `${normalized.normalized}:${userId || 'anonymous'}`

    console.log('[MetadataOrchestrator] Starting extraction for:', {
      url,
      normalized: normalized.normalized,
      platform,
      userId,
      hasExisting: !!existingMetadata
    })

    // Check memory cache first
    const cachedData = this.memoryCache.get(cacheKey)
    if (cachedData && (Date.now() - cachedData.timestamp) < this.CACHE_TTL.database) {
      console.log('[MetadataOrchestrator] Using memory cache')
      return {
        metadata: cachedData.data,
        source: 'database',
        cached: true,
        provider: platform,
        extractionTime: 0,
        cacheControl: this.getCacheControlHeader('database'),
        etag: cachedData.etag
      }
    }

    // 1. Return database metadata if available
    if (existingMetadata) {
      console.log('[MetadataOrchestrator] Using existing database metadata')
      const etag = this.generateEtag(existingMetadata)
      const result = {
        metadata: existingMetadata,
        source: 'database' as const,
        cached: true,
        provider: platform,
        extractionTime: Date.now() - startTime,
        cacheControl: this.getCacheControlHeader('database'),
        etag,
        lastModified: new Date().toUTCString()
      }
      
      // Store in memory cache
      this.memoryCache.set(cacheKey, {
        data: existingMetadata,
        timestamp: Date.now(),
        etag
      })
      
      return result
    }

    // 2. Try native API with auth (if available)
    if (userId) {
      const nativeResult = await this.tryNativeApi(normalized.normalized, platform, userId)
      if (nativeResult) {
        console.log('[MetadataOrchestrator] Successfully extracted via native API')
        const etag = this.generateEtag(nativeResult)
        
        // Cache the result
        this.memoryCache.set(cacheKey, {
          data: nativeResult,
          timestamp: Date.now(),
          etag
        })
        
        return {
          metadata: nativeResult,
          source: 'native_api',
          cached: false,
          provider: platform,
          extractionTime: Date.now() - startTime,
          cacheControl: this.getCacheControlHeader('native_api'),
          etag,
          lastModified: new Date().toUTCString()
        }
      }
    }

    // 3. Try oEmbed extraction (uses enhanced metadata extractor)
    const oembedResult = await this.tryOEmbed(normalized.normalized, platform)
    if (oembedResult) {
      console.log('[MetadataOrchestrator] Successfully extracted via oEmbed')
      const etag = this.generateEtag(oembedResult)
      
      // Cache the result
      this.memoryCache.set(cacheKey, {
        data: oembedResult,
        timestamp: Date.now(),
        etag
      })
      
      return {
        metadata: oembedResult,
        source: 'oembed',
        cached: false,
        provider: platform,
        extractionTime: Date.now() - startTime,
        cacheControl: this.getCacheControlHeader('oembed'),
        etag,
        lastModified: new Date().toUTCString()
      }
    }

    // 4. Try basic HTML scraping (as last resort)
    const htmlResult = await this.tryHtmlScraping(normalized.normalized)
    if (htmlResult) {
      console.log('[MetadataOrchestrator] Successfully extracted via HTML scraping')
      const etag = this.generateEtag(htmlResult)
      
      // Cache the result
      this.memoryCache.set(cacheKey, {
        data: htmlResult,
        timestamp: Date.now(),
        etag
      })
      
      return {
        metadata: htmlResult,
        source: 'html_scrape',
        cached: false,
        provider: platform,
        extractionTime: Date.now() - startTime,
        cacheControl: this.getCacheControlHeader('html_scrape'),
        etag,
        lastModified: new Date().toUTCString()
      }
    }

    // 5. Return minimal metadata as final fallback
    console.log('[MetadataOrchestrator] All extraction methods failed, returning minimal metadata')
    const minimalMetadata = this.createMinimalMetadata(normalized.normalized, platform)
    const etag = this.generateEtag(minimalMetadata)
    
    return {
      metadata: minimalMetadata,
      source: 'minimal',
      cached: false,
      provider: platform,
      extractionTime: Date.now() - startTime,
      cacheControl: this.getCacheControlHeader('minimal'),
      etag,
      lastModified: new Date().toUTCString()
    }
  }

  /**
   * Try native API extraction with user authentication
   */
  private async tryNativeApi(url: string, platform: string, userId: string): Promise<any | null> {
    try {
      switch (platform) {
        case 'spotify':
          return await this.withRetry(
            () => this.spotifyService.getMetadata(url, userId),
            'Spotify native API'
          )
        
        case 'youtube':
          return await this.withRetry(
            () => this.youtubeService.getMetadata(url, userId),
            'YouTube native API'
          )
        
        default:
          return null
      }
    } catch (error) {
      console.error(`[MetadataOrchestrator] Native API extraction failed for ${platform}:`, error)
      return null
    }
  }

  /**
   * Try oEmbed extraction using enhanced metadata extractor
   */
  private async tryOEmbed(url: string, _platform: string): Promise<any | null> {
    try {
      console.log('[MetadataOrchestrator] Attempting enhanced metadata extraction for:', url)
      const result = await this.withRetry(
        async () => {
          const extraction = await enhancedMetadataExtractor.extractMetadata(url)
          console.log('[MetadataOrchestrator] Enhanced extraction result:', { success: extraction.success, hasMetadata: !!extraction.metadata, error: extraction.error })
          if (extraction.success && extraction.metadata) {
            return extraction.metadata
          }
          throw new Error(extraction.error || 'Extraction failed')
        },
        'oEmbed extraction'
      )
      return result
    } catch (error) {
      console.error('[MetadataOrchestrator] oEmbed extraction failed:', error)
      return null
    }
  }

  /**
   * Try basic HTML scraping with improved meta tag extraction
   */
  private async tryHtmlScraping(url: string): Promise<any | null> {
    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; Zine/1.0)',
          'Accept': 'text/html,application/xhtml+xml'
        }
      })

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }

      const html = await response.text()
      
      // Extract metadata with improved regex patterns
      // Title: try og:title, twitter:title, then <title>
      const ogTitleMatch = html.match(/<meta\s+property=["']og:title["']\s+content=["']([^"']+)["']/i)
      const twitterTitleMatch = html.match(/<meta\s+name=["']twitter:title["']\s+content=["']([^"']+)["']/i)
      const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i)
      
      // Description: try og:description, twitter:description, then meta description
      const ogDescMatch = html.match(/<meta\s+property=["']og:description["']\s+content=["']([^"']+)["']/i)
      const twitterDescMatch = html.match(/<meta\s+name=["']twitter:description["']\s+content=["']([^"']+)["']/i)
      const descriptionMatch = html.match(/<meta\s+name=["']description["']\s+content=["']([^"']+)["']/i)
      
      // Image: try og:image, twitter:image
      const ogImageMatch = html.match(/<meta\s+property=["']og:image["']\s+content=["']([^"']+)["']/i)
      const twitterImageMatch = html.match(/<meta\s+name=["']twitter:image["']\s+content=["']([^"']+)["']/i)
      
      // Author: try article:author, og:article:author, author meta tag
      const ogAuthorMatch = html.match(/<meta\s+property=["'](?:og:)?article:author["']\s+content=["']([^"']+)["']/i)
      const authorMatch = html.match(/<meta\s+name=["']author["']\s+content=["']([^"']+)["']/i)
      
      const title = ogTitleMatch?.[1]?.trim() || twitterTitleMatch?.[1]?.trim() || titleMatch?.[1]?.trim()
      const description = ogDescMatch?.[1]?.trim() || twitterDescMatch?.[1]?.trim() || descriptionMatch?.[1]?.trim()
      const thumbnailUrl = ogImageMatch?.[1]?.trim() || twitterImageMatch?.[1]?.trim()
      const author = ogAuthorMatch?.[1]?.trim() || authorMatch?.[1]?.trim()
      
      if (title || description) {
        return {
          title: title || 'Untitled',
          description,
          thumbnailUrl,
          creator: author ? { name: author } : undefined
        }
      }

      return null
    } catch (error) {
      console.error('[MetadataOrchestrator] HTML scraping failed:', error)
      return null
    }
  }

  /**
   * Create minimal metadata from URL structure
   */
  private createMinimalMetadata(url: string, platform: string): any {
    try {
      const urlObj = new URL(url)
      const pathParts = urlObj.pathname.split('/').filter(Boolean)
      
      // Try to extract meaningful title from URL
      let title = 'Untitled'
      if (pathParts.length > 0) {
        title = pathParts[pathParts.length - 1]
          .replace(/[-_]/g, ' ')
          .replace(/\.[^.]+$/, '') // Remove file extension
          .replace(/^\w/, c => c.toUpperCase()) // Capitalize first letter
      } else {
        title = urlObj.hostname.replace('www.', '')
      }

      return {
        title,
        description: `Content from ${urlObj.hostname}`,
        url,
        source: platform,
        contentType: 'link'
      }
    } catch {
      return {
        title: 'Untitled',
        description: 'Unable to extract metadata',
        url,
        source: platform,
        contentType: 'link'
      }
    }
  }

  /**
   * Retry mechanism with exponential backoff
   */
  private async withRetry<T>(
    fn: () => Promise<T>,
    operationName: string
  ): Promise<T | null> {
    let lastError: Error | null = null
    
    for (let attempt = 1; attempt <= this.retryConfig.maxAttempts; attempt++) {
      try {
        console.log(`[MetadataOrchestrator] Attempt ${attempt}/${this.retryConfig.maxAttempts} for ${operationName}`)
        return await fn()
      } catch (error) {
        lastError = error as Error
        console.error(`[MetadataOrchestrator] Attempt ${attempt} failed for ${operationName}:`, error)
        
        if (attempt < this.retryConfig.maxAttempts) {
          // Calculate exponential backoff delay
          const delay = Math.min(
            this.retryConfig.baseDelay * Math.pow(2, attempt - 1),
            this.retryConfig.maxDelay
          )
          console.log(`[MetadataOrchestrator] Retrying in ${delay}ms...`)
          await new Promise(resolve => setTimeout(resolve, delay))
        }
      }
    }
    
    console.error(`[MetadataOrchestrator] All retry attempts failed for ${operationName}:`, lastError)
    return null
  }

  /**
   * Circuit breaker pattern implementation
   */
  private circuitBreakers = new Map<string, {
    failures: number
    lastFailureTime: number
    isOpen: boolean
    nextAttemptTime: number
  }>()
  
  private readonly CIRCUIT_BREAKER_THRESHOLD = 5
  private readonly CIRCUIT_BREAKER_RESET_TIME = 60000 // 1 minute

  private isCircuitOpen(service: string): boolean {
    const breaker = this.circuitBreakers.get(service)
    if (!breaker) return false
    
    const now = Date.now()
    
    // Check if circuit should be reset
    if (breaker.isOpen && now >= breaker.nextAttemptTime) {
      console.log(`[MetadataOrchestrator] Resetting circuit breaker for ${service}`)
      breaker.isOpen = false
      breaker.failures = 0
      return false
    }
    
    return breaker.isOpen
  }

  private recordSuccess(service: string): void {
    const breaker = this.circuitBreakers.get(service)
    if (breaker) {
      breaker.failures = 0
      breaker.isOpen = false
    }
  }

  private recordFailure(service: string): void {
    const now = Date.now()
    let breaker = this.circuitBreakers.get(service)
    
    if (!breaker) {
      breaker = {
        failures: 0,
        lastFailureTime: now,
        isOpen: false,
        nextAttemptTime: 0
      }
      this.circuitBreakers.set(service, breaker)
    }
    
    breaker.failures++
    breaker.lastFailureTime = now
    
    if (breaker.failures >= this.CIRCUIT_BREAKER_THRESHOLD) {
      breaker.isOpen = true
      breaker.nextAttemptTime = now + this.CIRCUIT_BREAKER_RESET_TIME
      console.log(`[MetadataOrchestrator] Circuit breaker opened for ${service}, will retry at ${new Date(breaker.nextAttemptTime).toISOString()}`)
    }
  }

  /**
   * Enhanced extraction with circuit breaker
   */
  async extractWithCircuitBreaker(url: string, userId?: string, existingMetadata?: any): Promise<OrchestrationResult> {
    const platform = detectPlatform(url)
    const service = `${platform}_native_api`
    
    // Check if circuit is open for this service
    if (this.isCircuitOpen(service)) {
      console.log(`[MetadataOrchestrator] Circuit breaker is open for ${service}, skipping native API`)
      // Skip native API and go directly to fallback
      return this.extract(url, undefined, existingMetadata)
    }
    
    try {
      const result = await this.extract(url, userId, existingMetadata)
      
      // Record success if native API was used
      if (result.source === 'native_api') {
        this.recordSuccess(service)
      }
      
      return result
    } catch (error) {
      // Record failure if it was a native API failure
      this.recordFailure(service)
      throw error
    }
  }

  /**
   * Generate cache control header based on source
   */
  private getCacheControlHeader(source: keyof typeof this.CACHE_TTL): string {
    const maxAge = Math.floor(this.CACHE_TTL[source] / 1000)
    const staleWhileRevalidate = Math.floor(this.STALE_WHILE_REVALIDATE / 1000)
    return `public, max-age=${maxAge}, stale-while-revalidate=${staleWhileRevalidate}`
  }

  /**
   * Generate ETag for metadata
   */
  private generateEtag(metadata: any): string {
    // Simple hash function for ETag generation
    const str = JSON.stringify(metadata)
    let hash = 0
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i)
      hash = ((hash << 5) - hash) + char
      hash = hash & hash // Convert to 32-bit integer
    }
    return `"${Math.abs(hash).toString(16)}"`
  }

  /**
   * Implement stale-while-revalidate pattern
   */
  async extractWithStaleWhileRevalidate(
    url: string,
    userId?: string,
    existingMetadata?: any,
    ifNoneMatch?: string
  ): Promise<OrchestrationResult & { notModified?: boolean }> {
    const result = await this.extractWithCircuitBreaker(url, userId, existingMetadata)
    
    // Check if client has the same version (ETag match)
    if (ifNoneMatch && result.etag === ifNoneMatch) {
      return {
        ...result,
        notModified: true
      }
    }
    
    // If data is stale but within revalidation window, return stale data
    // and trigger background refresh
    if (result.cached && result.source === 'database') {
      const cacheKey = `${url}:${userId || 'anonymous'}`
      const cachedData = this.memoryCache.get(cacheKey)
      
      if (cachedData) {
        const age = Date.now() - cachedData.timestamp
        const maxAge = this.CACHE_TTL[result.source]
        
        if (age > maxAge && age < maxAge + this.STALE_WHILE_REVALIDATE) {
          // Return stale data immediately
          console.log('[MetadataOrchestrator] Serving stale data while revalidating')
          
          // Trigger background refresh (non-blocking)
          this.backgroundRefresh(url, userId).catch(error => {
            console.error('[MetadataOrchestrator] Background refresh failed:', error)
          })
          
          return {
            ...result,
            cacheControl: `public, max-age=0, stale-while-revalidate=${Math.floor(this.STALE_WHILE_REVALIDATE / 1000)}`
          }
        }
      }
    }
    
    return result
  }

  /**
   * Background refresh for stale-while-revalidate
   */
  private async backgroundRefresh(url: string, userId?: string): Promise<void> {
    console.log('[MetadataOrchestrator] Starting background refresh for:', url)
    
    try {
      // Clear from memory cache to force fresh fetch
      const normalized = normalizeUrl(url)
      const cacheKey = `${normalized.normalized}:${userId || 'anonymous'}`
      this.memoryCache.delete(cacheKey)
      
      // Fetch fresh data
      await this.extract(url, userId)
      console.log('[MetadataOrchestrator] Background refresh completed for:', url)
    } catch (error) {
      console.error('[MetadataOrchestrator] Background refresh error:', error)
    }
  }
}