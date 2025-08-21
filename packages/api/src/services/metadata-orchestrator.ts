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

    console.log('[MetadataOrchestrator] Starting extraction for:', {
      url,
      normalized: normalized.normalized,
      platform,
      userId,
      hasExisting: !!existingMetadata
    })

    // 1. Return database metadata if available
    if (existingMetadata) {
      console.log('[MetadataOrchestrator] Using existing database metadata')
      return {
        metadata: existingMetadata,
        source: 'database',
        cached: true,
        provider: platform,
        extractionTime: Date.now() - startTime
      }
    }

    // 2. Try native API with auth (if available)
    if (userId) {
      const nativeResult = await this.tryNativeApi(normalized.normalized, platform, userId)
      if (nativeResult) {
        console.log('[MetadataOrchestrator] Successfully extracted via native API')
        return {
          metadata: nativeResult,
          source: 'native_api',
          cached: false,
          provider: platform,
          extractionTime: Date.now() - startTime
        }
      }
    }

    // 3. Try oEmbed extraction (uses enhanced metadata extractor)
    const oembedResult = await this.tryOEmbed(normalized.normalized, platform)
    if (oembedResult) {
      console.log('[MetadataOrchestrator] Successfully extracted via oEmbed')
      return {
        metadata: oembedResult,
        source: 'oembed',
        cached: false,
        provider: platform,
        extractionTime: Date.now() - startTime
      }
    }

    // 4. Try basic HTML scraping (as last resort)
    const htmlResult = await this.tryHtmlScraping(normalized.normalized)
    if (htmlResult) {
      console.log('[MetadataOrchestrator] Successfully extracted via HTML scraping')
      return {
        metadata: htmlResult,
        source: 'html_scrape',
        cached: false,
        provider: platform,
        extractionTime: Date.now() - startTime
      }
    }

    // 5. Return minimal metadata as final fallback
    console.log('[MetadataOrchestrator] All extraction methods failed, returning minimal metadata')
    return {
      metadata: this.createMinimalMetadata(normalized.normalized, platform),
      source: 'minimal',
      cached: false,
      provider: platform,
      extractionTime: Date.now() - startTime
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
      const result = await this.withRetry(
        async () => {
          const extraction = await enhancedMetadataExtractor.extractMetadata(url)
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
   * Try basic HTML scraping
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
      
      // Extract basic metadata from HTML
      const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i)
      const descriptionMatch = html.match(/<meta\s+name=["']description["']\s+content=["']([^"']+)["']/i)
      const ogImageMatch = html.match(/<meta\s+property=["']og:image["']\s+content=["']([^"']+)["']/i)
      
      if (titleMatch || descriptionMatch) {
        return {
          title: titleMatch?.[1]?.trim() || 'Untitled',
          description: descriptionMatch?.[1]?.trim(),
          thumbnailUrl: ogImageMatch?.[1]?.trim()
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
}