/**
 * Metadata extraction service for bookmark URLs
 */

import { normalizeUrl, detectPlatform } from './url-normalizer'
import type { 
  Creator, 
  Source, 
  ContentType, 
  VideoMetadata, 
  PodcastMetadata, 
  ArticleMetadata, 
  PostMetadata 
} from './types'

export interface ExtractedMetadata {
  title: string
  description?: string
  thumbnailUrl?: string
  faviconUrl?: string
  publishedAt?: Date
  language?: string
  source: Source
  contentType: ContentType
  creator?: Creator
  videoMetadata?: VideoMetadata
  podcastMetadata?: PodcastMetadata
  articleMetadata?: ArticleMetadata
  postMetadata?: PostMetadata
}

export interface MetadataExtractionResult {
  success: boolean
  metadata?: ExtractedMetadata
  error?: string
}

/**
 * Main metadata extraction service
 */
export class MetadataExtractor {
  private timeout: number = 10000 // 10 seconds

  constructor(options?: { timeout?: number }) {
    if (options?.timeout) {
      this.timeout = options.timeout
    }
  }

  /**
   * Extract metadata from a URL
   */
  async extractMetadata(url: string): Promise<MetadataExtractionResult> {
    try {
      // Normalize the URL first
      const normalized = normalizeUrl(url)
      const platform = detectPlatform(url)
      
      // Set timeout for the entire extraction process
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), this.timeout)
      
      try {
        let metadata: ExtractedMetadata
        
        // Route to platform-specific extractors
        switch (platform) {
          case 'youtube':
            metadata = await this.extractYouTubeMetadata(normalized.normalized, controller.signal)
            break
          case 'spotify':
            metadata = await this.extractSpotifyMetadata(normalized.normalized, controller.signal)
            break
          case 'x':
          case 'twitter':
            metadata = await this.extractTwitterMetadata(normalized.normalized, controller.signal)
            break
          case 'substack':
            metadata = await this.extractSubstackMetadata(normalized.normalized, controller.signal)
            break
          default:
            metadata = await this.extractGenericMetadata(normalized.normalized, controller.signal)
        }
        
        clearTimeout(timeoutId)
        return { success: true, metadata }
        
      } catch (error) {
        clearTimeout(timeoutId)
        
        // If platform-specific extraction fails, try generic extraction
        if (platform !== 'web') {
          try {
            const fallbackMetadata = await this.extractGenericMetadata(normalized.normalized, controller.signal)
            return { success: true, metadata: fallbackMetadata }
          } catch (fallbackError) {
            return this.createMinimalMetadata(url, normalized.normalized, platform as Source)
          }
        }
        
        return this.createMinimalMetadata(url, normalized.normalized, platform as Source)
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error during metadata extraction'
      }
    }
  }

  /**
   * Extract YouTube metadata
   */
  private async extractYouTubeMetadata(url: string, signal: AbortSignal): Promise<ExtractedMetadata> {
    // For now, fallback to generic HTML extraction
    // In Phase 3, we'll implement YouTube API integration
    const generic = await this.extractGenericMetadata(url, signal)
    return {
      ...generic,
      source: 'youtube',
      contentType: 'video'
    }
  }

  /**
   * Extract Spotify metadata
   */
  private async extractSpotifyMetadata(url: string, signal: AbortSignal): Promise<ExtractedMetadata> {
    // For now, fallback to generic HTML extraction
    // In Phase 3, we'll implement Spotify API integration
    const generic = await this.extractGenericMetadata(url, signal)
    return {
      ...generic,
      source: 'spotify',
      contentType: 'podcast' // Could be 'podcast' or 'video' depending on content
    }
  }

  /**
   * Extract Twitter/X metadata
   */
  private async extractTwitterMetadata(url: string, signal: AbortSignal): Promise<ExtractedMetadata> {
    // For now, fallback to generic HTML extraction
    // In Phase 3, we'll implement Twitter oEmbed API integration
    const generic = await this.extractGenericMetadata(url, signal)
    return {
      ...generic,
      source: 'x',
      contentType: 'post'
    }
  }

  /**
   * Extract Substack metadata
   */
  private async extractSubstackMetadata(url: string, signal: AbortSignal): Promise<ExtractedMetadata> {
    // For now, fallback to generic HTML extraction
    // In Phase 3, we'll implement Substack-specific extraction
    const generic = await this.extractGenericMetadata(url, signal)
    return {
      ...generic,
      source: 'substack',
      contentType: 'article'
    }
  }

  /**
   * Extract generic web metadata using HTML meta tags
   */
  private async extractGenericMetadata(url: string, signal: AbortSignal): Promise<ExtractedMetadata> {
    const response = await fetch(url, {
      signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; Zine/1.0; +https://zine.dev)'
      }
    })

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`)
    }

    const html = await response.text()
    return this.parseHtmlMetadata(html, url)
  }

  /**
   * Parse HTML metadata from page content
   */
  private parseHtmlMetadata(html: string, url: string): ExtractedMetadata {
    // Basic HTML parsing - in a real implementation, we'd use a proper HTML parser
    // For Cloudflare Workers, we'd use something like linkedom
    
    const getMetaContent = (property: string): string | undefined => {
      const patterns = [
        new RegExp(`<meta[^>]*property=["\']${property}["\'][^>]*content=["\']([^"\']*)["\']`, 'i'),
        new RegExp(`<meta[^>]*content=["\']([^"\']*)["\'][^>]*property=["\']${property}["\']`, 'i'),
        new RegExp(`<meta[^>]*name=["\']${property}["\'][^>]*content=["\']([^"\']*)["\']`, 'i'),
        new RegExp(`<meta[^>]*content=["\']([^"\']*)["\'][^>]*name=["\']${property}["\']`, 'i'),
      ]
      
      for (const pattern of patterns) {
        const match = html.match(pattern)
        if (match) {
          return match[1]
        }
      }
      return undefined
    }

    const getTitle = (): string => {
      // Try Open Graph title first
      let title = getMetaContent('og:title')
      if (title) return title

      // Try Twitter title
      title = getMetaContent('twitter:title')
      if (title) return title

      // Fall back to HTML title tag
      const titleMatch = html.match(/<title[^>]*>([^<]*)<\/title>/i)
      if (titleMatch) return titleMatch[1]

      // Extract from URL as last resort
      try {
        const urlObj = new URL(url)
        return urlObj.pathname.split('/').pop() || urlObj.hostname
      } catch {
        return 'Untitled'
      }
    }

    const getDescription = (): string | undefined => {
      // Try Open Graph description
      let desc = getMetaContent('og:description')
      if (desc) return desc

      // Try Twitter description
      desc = getMetaContent('twitter:description')
      if (desc) return desc

      // Try meta description
      desc = getMetaContent('description')
      if (desc) return desc

      return undefined
    }

    const getThumbnail = (): string | undefined => {
      // Try Open Graph image
      let image = getMetaContent('og:image')
      if (image) return image

      // Try Twitter image
      image = getMetaContent('twitter:image')
      if (image) return image

      return undefined
    }

    const getFavicon = (): string | undefined => {
      // Look for favicon link
      const faviconMatch = html.match(/<link[^>]*rel=["\'](?:icon|shortcut icon)["\'][^>]*href=["\']([^"\']*)["\']/i)
      if (faviconMatch) {
        const href = faviconMatch[1]
        if (href.startsWith('http')) {
          return href
        } else {
          try {
            const urlObj = new URL(url)
            return new URL(href, urlObj.origin).toString()
          } catch {
            return undefined
          }
        }
      }

      // Fallback to standard favicon location
      try {
        const urlObj = new URL(url)
        return `${urlObj.origin}/favicon.ico`
      } catch {
        return undefined
      }
    }

    const getLanguage = (): string | undefined => {
      // Try HTML lang attribute
      const langMatch = html.match(/<html[^>]*lang=["\']([^"\']*)["\']/i)
      if (langMatch) return langMatch[1]

      // Try meta language
      return getMetaContent('language')
    }

    const getPublishedDate = (): Date | undefined => {
      // Try various date formats
      const dateProperties = [
        'article:published_time',
        'article:published',
        'published_time',
        'datePublished',
        'date'
      ]

      for (const prop of dateProperties) {
        const dateStr = getMetaContent(prop)
        if (dateStr) {
          const date = new Date(dateStr)
          if (!isNaN(date.getTime())) {
            return date
          }
        }
      }

      return undefined
    }

    // Determine content type based on URL and content
    const inferContentType = (): ContentType => {
      const urlLower = url.toLowerCase()
      
      if (urlLower.includes('youtube.com/watch') || urlLower.includes('youtu.be/')) {
        return 'video'
      }
      if (urlLower.includes('spotify.com/episode') || urlLower.includes('podcast')) {
        return 'podcast'
      }
      if (urlLower.includes('twitter.com/') || urlLower.includes('x.com/')) {
        return 'post'
      }
      
      // Check for article indicators
      const articleKeywords = ['article', 'blog', 'post', 'news']
      if (articleKeywords.some(keyword => urlLower.includes(keyword))) {
        return 'article'
      }
      
      return 'link'
    }

    return {
      title: getTitle(),
      description: getDescription(),
      thumbnailUrl: getThumbnail(),
      faviconUrl: getFavicon(),
      publishedAt: getPublishedDate(),
      language: getLanguage(),
      source: 'web',
      contentType: inferContentType()
    }
  }

  /**
   * Create minimal metadata when extraction fails
   */
  private createMinimalMetadata(originalUrl: string, _normalizedUrl: string, source: Source): MetadataExtractionResult {
    try {
      const urlObj = new URL(originalUrl)
      const title = urlObj.pathname.split('/').pop() || urlObj.hostname
      
      return {
        success: true,
        metadata: {
          title,
          source,
          contentType: 'link'
        }
      }
    } catch {
      return {
        success: true,
        metadata: {
          title: 'Untitled Bookmark',
          source,
          contentType: 'link'
        }
      }
    }
  }
}

// Default instance
export const metadataExtractor = new MetadataExtractor()