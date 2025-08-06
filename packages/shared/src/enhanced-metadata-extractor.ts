/**
 * Enhanced metadata extraction with proper HTML parsing and JSON-LD support
 */

import { parseHTML } from 'linkedom'

// Type definitions for linkedom
type LinkedOMDocument = {
  querySelectorAll: (selector: string) => any[]
  querySelector: (selector: string) => any | null
  documentElement: any
  body: any | null
}

// YouTube oEmbed response type
interface YouTubeOEmbedResponse {
  title?: string
  author_name?: string
  author_url?: string
  thumbnail_url?: string
  thumbnail_width?: number
  thumbnail_height?: number
  html?: string
  width?: number
  height?: number
  provider_name?: string
  provider_url?: string
  type?: string
  version?: string
}

// Spotify oEmbed response type
interface SpotifyOEmbedResponse {
  title?: string
  thumbnail_url?: string
  thumbnail_width?: number
  thumbnail_height?: number
  html?: string
  width?: number
  height?: number
  provider_name?: string
  provider_url?: string
  type?: string
  version?: string
}

// Spotify URL information
interface SpotifyInfo {
  type: 'track' | 'album' | 'artist' | 'playlist' | 'episode' | 'show'
  id: string
}

// Twitter oEmbed response type
interface TwitterOEmbedResponse {
  url?: string
  author_name?: string
  author_url?: string
  html?: string
  width?: number
  height?: number
  type?: string
  cache_age?: string
  provider_name?: string
  provider_url?: string
  version?: string
}

// Twitter URL information
interface TwitterInfo {
  username: string
  tweetId: string
}

// Substack URL information
interface SubstackInfo {
  subdomain: string
  postSlug?: string
}
import { normalizeUrl, detectPlatform } from './url-normalizer'
import { creatorService } from './creator-service'
import type { 
  Creator, 
  Source, 
  ContentType, 
  VideoMetadata, 
  PodcastMetadata, 
  ArticleMetadata, 
  PostMetadata 
} from './types'

export interface EnhancedExtractedMetadata {
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

export interface EnhancedMetadataExtractionResult {
  success: boolean
  metadata?: EnhancedExtractedMetadata
  error?: string
}

/**
 * Enhanced metadata extraction service with proper HTML parsing
 */
export class EnhancedMetadataExtractor {
  private timeout: number = 10000 // 10 seconds

  constructor(options?: { timeout?: number }) {
    if (options?.timeout) {
      this.timeout = options.timeout
    }
  }

  /**
   * Extract metadata from a URL with enhanced parsing
   */
  async extractMetadata(url: string): Promise<EnhancedMetadataExtractionResult> {
    try {
      const normalized = normalizeUrl(url)
      const platform = detectPlatform(url)
      
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), this.timeout)
      
      try {
        let metadata: EnhancedExtractedMetadata
        
        // Route to platform-specific extractors first
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
            metadata = await this.extractEnhancedWebMetadata(normalized.normalized, controller.signal)
        }
        
        clearTimeout(timeoutId)
        return { success: true, metadata }
        
      } catch (error) {
        clearTimeout(timeoutId)
        
        // If platform-specific extraction fails, try enhanced web extraction
        if (platform !== 'web') {
          try {
            const fallbackMetadata = await this.extractEnhancedWebMetadata(normalized.normalized, controller.signal)
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
   * Enhanced web metadata extraction with proper HTML parsing and JSON-LD
   */
  private async extractEnhancedWebMetadata(url: string, signal: AbortSignal): Promise<EnhancedExtractedMetadata> {
    const response = await fetch(url, {
      signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; Zine/1.0; +https://zine.dev)',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Accept-Encoding': 'gzip, deflate, br',
        'Cache-Control': 'no-cache'
      }
    })

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`)
    }

    const html = await response.text()
    return this.parseEnhancedHtmlMetadata(html, url)
  }

  /**
   * Parse HTML with enhanced extraction including JSON-LD
   */
  private parseEnhancedHtmlMetadata(html: string, url: string): EnhancedExtractedMetadata {
    // Parse HTML using linkedom for proper DOM manipulation
    const parsed = parseHTML(html)
    const document = parsed as unknown as LinkedOMDocument
    
    // Extract JSON-LD structured data
    const jsonLdData = this.extractJsonLd(document)
    
    // Get meta tags
    const metaTags = this.extractMetaTags(document)
    
    // Extract title with priority: JSON-LD > Open Graph > Twitter > HTML title
    const title = this.extractTitle(jsonLdData, metaTags, document, url)
    
    // Extract description
    const description = this.extractDescription(jsonLdData, metaTags, document)
    
    // Extract images
    const { thumbnailUrl, faviconUrl } = this.extractImages(jsonLdData, metaTags, document, url)
    
    // Extract dates
    const publishedAt = this.extractPublishedDate(jsonLdData, metaTags, document)
    
    // Extract language
    const language = this.extractLanguage(document, metaTags)
    
    // Extract creator information
    const creator = this.extractCreator(jsonLdData, metaTags, document, url)
    
    // Determine content type and source
    const { contentType, source } = this.inferContentTypeAndSource(url, jsonLdData, metaTags)
    
    // Extract content-specific metadata
    const { videoMetadata, podcastMetadata, articleMetadata, postMetadata } = 
      this.extractContentSpecificMetadata(jsonLdData, metaTags, document, contentType)

    return {
      title,
      description,
      thumbnailUrl,
      faviconUrl,
      publishedAt,
      language,
      source,
      contentType,
      creator: this.resolveCreator(creator),
      videoMetadata,
      podcastMetadata,
      articleMetadata,
      postMetadata
    }
  }

  /**
   * Extract JSON-LD structured data
   */
  private extractJsonLd(document: LinkedOMDocument): any[] {
    const jsonLdScripts = document.querySelectorAll('script[type="application/ld+json"]')
    const jsonLdData: any[] = []
    
    jsonLdScripts.forEach((script: any) => {
      try {
        const data = JSON.parse(script.textContent || '')
        if (Array.isArray(data)) {
          jsonLdData.push(...data)
        } else {
          jsonLdData.push(data)
        }
      } catch (error) {
        // Ignore invalid JSON-LD
      }
    })
    
    return jsonLdData
  }

  /**
   * Extract meta tags into a convenient map
   */
  private extractMetaTags(document: LinkedOMDocument): Map<string, string> {
    const metaTags = new Map<string, string>()
    
    // Extract meta tags with property attribute (Open Graph, etc.)
    document.querySelectorAll('meta[property]').forEach((meta: any) => {
      const property = meta.getAttribute('property')
      const content = meta.getAttribute('content')
      if (property && content) {
        metaTags.set(property.toLowerCase(), content)
      }
    })
    
    // Extract meta tags with name attribute (Twitter, description, etc.)
    document.querySelectorAll('meta[name]').forEach((meta: any) => {
      const name = meta.getAttribute('name')
      const content = meta.getAttribute('content')
      if (name && content) {
        metaTags.set(name.toLowerCase(), content)
      }
    })
    
    return metaTags
  }

  /**
   * Extract title with fallback priority
   */
  private extractTitle(jsonLdData: any[], metaTags: Map<string, string>, document: LinkedOMDocument, url: string): string {
    // Try JSON-LD first
    for (const data of jsonLdData) {
      if (data.headline) return data.headline
      if (data.name) return data.name
      if (data.title) return data.title
    }
    
    // Try Open Graph
    const ogTitle = metaTags.get('og:title')
    if (ogTitle) return ogTitle
    
    // Try Twitter
    const twitterTitle = metaTags.get('twitter:title')
    if (twitterTitle) return twitterTitle
    
    // Try HTML title
    const titleElement = document.querySelector('title') as any
    if (titleElement?.textContent) return titleElement.textContent.trim()
    
    // Try h1 as fallback
    const h1Element = document.querySelector('h1') as any
    if (h1Element?.textContent) return h1Element.textContent.trim()
    
    // Extract from URL as last resort
    try {
      const urlObj = new URL(url)
      return urlObj.pathname.split('/').pop() || urlObj.hostname
    } catch {
      return 'Untitled'
    }
  }

  /**
   * Extract description with fallback priority
   */
  private extractDescription(jsonLdData: any[], metaTags: Map<string, string>, document: LinkedOMDocument): string | undefined {
    // Try JSON-LD first
    for (const data of jsonLdData) {
      if (data.description) return data.description
    }
    
    // Try Open Graph
    const ogDescription = metaTags.get('og:description')
    if (ogDescription) return ogDescription
    
    // Try Twitter
    const twitterDescription = metaTags.get('twitter:description')
    if (twitterDescription) return twitterDescription
    
    // Try meta description
    const metaDescription = metaTags.get('description')
    if (metaDescription) return metaDescription
    
    // Try to extract from first paragraph
    const firstParagraph = document.querySelector('p') as any
    if (firstParagraph?.textContent) {
      const text = firstParagraph.textContent.trim()
      if (text.length > 50) {
        return text.length > 200 ? text.substring(0, 200) + '...' : text
      }
    }
    
    return undefined
  }

  /**
   * Extract images (thumbnail and favicon)
   */
  private extractImages(jsonLdData: any[], metaTags: Map<string, string>, document: LinkedOMDocument, url: string): {
    thumbnailUrl?: string
    faviconUrl?: string
  } {
    let thumbnailUrl: string | undefined
    let faviconUrl: string | undefined
    
    // Extract thumbnail
    // Try JSON-LD first
    for (const data of jsonLdData) {
      if (data.image) {
        thumbnailUrl = typeof data.image === 'string' ? data.image : data.image.url || data.image[0]?.url
        if (thumbnailUrl) break
      }
      if (data.thumbnailUrl) {
        thumbnailUrl = data.thumbnailUrl
        break
      }
    }
    
    // Try Open Graph
    if (!thumbnailUrl) {
      thumbnailUrl = metaTags.get('og:image') || metaTags.get('og:image:url')
    }
    
    // Try Twitter
    if (!thumbnailUrl) {
      thumbnailUrl = metaTags.get('twitter:image') || metaTags.get('twitter:image:src')
    }
    
    // Try to find first reasonable image in content
    if (!thumbnailUrl) {
      const images = document.querySelectorAll('img[src]')
      for (const img of images) {
        const imgElement = img as any
        const src = imgElement.getAttribute('src')
        if (src && !src.includes('icon') && !src.includes('logo') && !src.includes('avatar')) {
          thumbnailUrl = this.resolveUrl(src, url)
          break
        }
      }
    }
    
    // Extract favicon
    // Try link rel="icon"
    const iconLink = document.querySelector('link[rel*="icon"]') as any
    if (iconLink) {
      const href = iconLink.getAttribute('href')
      if (href) {
        faviconUrl = this.resolveUrl(href, url)
      }
    }
    
    // Fallback to /favicon.ico
    if (!faviconUrl) {
      try {
        const urlObj = new URL(url)
        faviconUrl = `${urlObj.origin}/favicon.ico`
      } catch {
        // Ignore
      }
    }
    
    return { thumbnailUrl, faviconUrl }
  }

  /**
   * Extract published date
   */
  private extractPublishedDate(jsonLdData: any[], metaTags: Map<string, string>, document: LinkedOMDocument): Date | undefined {
    // Try JSON-LD first
    for (const data of jsonLdData) {
      const dateFields = ['datePublished', 'dateCreated', 'publishedAt', 'createdAt']
      for (const field of dateFields) {
        if (data[field]) {
          const date = new Date(data[field])
          if (!isNaN(date.getTime())) return date
        }
      }
    }
    
    // Try meta tags
    const metaDateFields = [
      'article:published_time',
      'article:published',
      'published_time',
      'datepublished',
      'date'
    ]
    
    for (const field of metaDateFields) {
      const dateStr = metaTags.get(field)
      if (dateStr) {
        const date = new Date(dateStr)
        if (!isNaN(date.getTime())) return date
      }
    }
    
    // Try time elements
    const timeElement = document.querySelector('time[datetime]') as any
    if (timeElement) {
      const datetime = timeElement.getAttribute('datetime')
      if (datetime) {
        const date = new Date(datetime)
        if (!isNaN(date.getTime())) return date
      }
    }
    
    return undefined
  }

  /**
   * Extract language
   */
  private extractLanguage(document: LinkedOMDocument, metaTags: Map<string, string>): string | undefined {
    // Try html lang attribute
    const htmlLang = (document.documentElement as any).getAttribute('lang')
    if (htmlLang) return htmlLang
    
    // Try meta language
    return metaTags.get('language') || metaTags.get('content-language')
  }

  /**
   * Extract creator information
   */
  private extractCreator(jsonLdData: any[], metaTags: Map<string, string>, _document: LinkedOMDocument, _url: string): Creator | undefined {
    // Try JSON-LD first
    for (const data of jsonLdData) {
      if (data.author) {
        const author = Array.isArray(data.author) ? data.author[0] : data.author
        if (typeof author === 'object') {
          return {
            id: author['@id'] || `web:${author.name || 'unknown'}`,
            name: author.name || 'Unknown Author',
            url: author.url,
            bio: author.description,
            avatarUrl: author.image?.url || author.image
          }
        } else if (typeof author === 'string') {
          return {
            id: `web:${author}`,
            name: author
          }
        }
      }
      
      if (data.creator) {
        const creator = Array.isArray(data.creator) ? data.creator[0] : data.creator
        if (typeof creator === 'object') {
          return {
            id: creator['@id'] || `web:${creator.name || 'unknown'}`,
            name: creator.name || 'Unknown Creator',
            url: creator.url,
            bio: creator.description,
            avatarUrl: creator.image?.url || creator.image
          }
        }
      }
    }
    
    // Try meta tags
    const authorName = metaTags.get('author') || metaTags.get('article:author')
    if (authorName) {
      return {
        id: `web:${authorName}`,
        name: authorName
      }
    }
    
    return undefined
  }

  /**
   * Infer content type and source from URL and metadata
   */
  private inferContentTypeAndSource(url: string, jsonLdData: any[], metaTags: Map<string, string>): {
    contentType: ContentType
    source: Source
  } {
    const urlLower = url.toLowerCase()
    
    // Check JSON-LD for type information
    for (const data of jsonLdData) {
      const type = data['@type']?.toLowerCase()
      if (type) {
        if (type.includes('videoobject') || type.includes('video')) {
          return { contentType: 'video', source: 'web' }
        }
        if (type.includes('article') || type.includes('blogposting') || type.includes('newsarticle')) {
          return { contentType: 'article', source: 'web' }
        }
        if (type.includes('podcast') || type.includes('audio')) {
          return { contentType: 'podcast', source: 'web' }
        }
      }
    }
    
    // Check Open Graph type
    const ogType = metaTags.get('og:type')
    if (ogType) {
      if (ogType.includes('video')) {
        return { contentType: 'video', source: 'web' }
      }
      if (ogType.includes('article')) {
        return { contentType: 'article', source: 'web' }
      }
    }
    
    // Infer from URL patterns
    if (urlLower.includes('blog') || urlLower.includes('article') || urlLower.includes('post')) {
      return { contentType: 'article', source: 'web' }
    }
    
    if (urlLower.includes('video') || urlLower.includes('watch')) {
      return { contentType: 'video', source: 'web' }
    }
    
    if (urlLower.includes('podcast') || urlLower.includes('audio')) {
      return { contentType: 'podcast', source: 'web' }
    }
    
    return { contentType: 'link', source: 'web' }
  }

  /**
   * Extract content-specific metadata
   */
  private extractContentSpecificMetadata(
    jsonLdData: any[], 
    _metaTags: Map<string, string>, 
    document: LinkedOMDocument, 
    contentType: ContentType
  ): {
    videoMetadata?: VideoMetadata
    podcastMetadata?: PodcastMetadata
    articleMetadata?: ArticleMetadata
    postMetadata?: PostMetadata
  } {
    const result: any = {}
    
    if (contentType === 'video') {
      // Extract video metadata
      for (const data of jsonLdData) {
        if (data.duration) {
          result.videoMetadata = {
            duration: this.parseDuration(data.duration)
          }
          break
        }
      }
    }
    
    if (contentType === 'article') {
      // Extract article metadata
      let wordCount: number | undefined
      let readingTime: number | undefined
      
      // Try to estimate word count from content
      const textContent = (document.body as any)?.textContent || ''
      if (textContent) {
        wordCount = textContent.trim().split(/\s+/).length
        readingTime = wordCount ? Math.ceil(wordCount / 200) : undefined // Assume 200 WPM reading speed
      }
      
      for (const data of jsonLdData) {
        if (data.wordCount) {
          wordCount = data.wordCount
          readingTime = wordCount ? Math.ceil(wordCount / 200) : undefined
          break
        }
      }
      
      if (wordCount || readingTime) {
        result.articleMetadata = { wordCount, readingTime }
      }
    }
    
    return result
  }

  /**
   * Parse ISO 8601 duration to seconds
   */
  private parseDuration(duration: string): number | undefined {
    if (!duration) return undefined
    
    // Handle ISO 8601 duration format (PT1H30M)
    const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/)
    if (match) {
      const hours = parseInt(match[1] || '0')
      const minutes = parseInt(match[2] || '0')
      const seconds = parseInt(match[3] || '0')
      return hours * 3600 + minutes * 60 + seconds
    }
    
    // Handle simple numeric seconds
    const numericMatch = duration.match(/^\d+$/)
    if (numericMatch) {
      return parseInt(duration)
    }
    
    return undefined
  }

  /**
   * Resolve relative URLs to absolute URLs
   */
  private resolveUrl(href: string, baseUrl: string): string {
    try {
      return new URL(href, baseUrl).toString()
    } catch {
      return href
    }
  }

  /**
   * Extract YouTube video ID from various URL formats
   */
  private extractYouTubeVideoId(url: string): string | null {
    const patterns = [
      /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
      /youtube\.com\/v\/([a-zA-Z0-9_-]{11})/,
      /youtube\.com\/watch\?.*&v=([a-zA-Z0-9_-]{11})/
    ]

    for (const pattern of patterns) {
      const match = url.match(pattern)
      if (match) {
        return match[1]
      }
    }

    return null
  }

  /**
   * Extract Spotify information from URL
   */
  private extractSpotifyInfo(url: string): SpotifyInfo | null {
    // Pattern for Spotify URLs: https://open.spotify.com/{type}/{id}
    const pattern = /(?:open\.spotify\.com\/|spotify:)(track|album|artist|playlist|episode|show)(?:\/|:)([a-zA-Z0-9]+)/
    const match = url.match(pattern)
    
    if (match) {
      return {
        type: match[1] as SpotifyInfo['type'],
        id: match[2]
      }
    }

    return null
  }

  /**
   * Extract Twitter information from URL
   */
  private extractTwitterInfo(url: string): TwitterInfo | null {
    // Patterns for Twitter/X URLs: https://twitter.com/username/status/tweetId or https://x.com/username/status/tweetId
    const patterns = [
      /(?:twitter\.com|x\.com)\/([^\/]+)\/status\/(\d+)/,
      /(?:twitter\.com|x\.com)\/([^\/]+)\/statuses\/(\d+)/
    ]

    for (const pattern of patterns) {
      const match = url.match(pattern)
      if (match) {
        return {
          username: match[1],
          tweetId: match[2]
        }
      }
    }

    return null
  }

  /**
   * Extract Substack information from URL
   */
  private extractSubstackInfo(url: string): SubstackInfo | null {
    // Pattern for Substack URLs: https://subdomain.substack.com/p/post-slug
    const pattern = /https?:\/\/([^.]+)\.substack\.com(?:\/p\/([^\/\?]+))?/
    const match = url.match(pattern)
    
    if (match) {
      return {
        subdomain: match[1],
        postSlug: match[2]
      }
    }

    return null
  }

  /**
   * Resolve and normalize creator information
   */
  private resolveCreator(creator: Creator | undefined): Creator | undefined {
    if (!creator) return undefined
    
    const resolution = creatorService.resolveCreator(creator)
    return resolution.resolved
  }

  /**
   * Extract YouTube metadata using YouTube Data API v3
   */
  private async extractYouTubeMetadata(url: string, signal: AbortSignal): Promise<EnhancedExtractedMetadata> {
    try {
      // Extract video ID from URL
      const videoId = this.extractYouTubeVideoId(url)
      if (!videoId) {
        throw new Error('Could not extract video ID from YouTube URL')
      }

      // For now, we'll use oEmbed API as it doesn't require API key
      // In production, you'd want to use YouTube Data API v3 with proper API key
      const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`
      
      const response = await fetch(oembedUrl, { signal })
      if (!response.ok) {
        throw new Error(`YouTube oEmbed API failed: ${response.status}`)
      }

      const oembedData = await response.json() as YouTubeOEmbedResponse

      // Also fetch the video page for additional metadata
      const pageMetadata = await this.extractEnhancedWebMetadata(url, signal)

      // Extract duration from page metadata if available
      let duration: number | undefined
      if (pageMetadata.videoMetadata?.duration) {
        duration = pageMetadata.videoMetadata.duration
      }

      // Parse creator information from oEmbed
      const creator: Creator = {
        id: `youtube:${oembedData.author_name || 'unknown'}`,
        name: oembedData.author_name || 'Unknown Creator',
        url: oembedData.author_url,
        handle: oembedData.author_name ? `@${oembedData.author_name.replace(/\s+/g, '')}` : undefined
      }

      // Extract video metadata
      const videoMetadata: VideoMetadata = {
        duration,
        viewCount: undefined, // Would need YouTube Data API for this
        likeCount: undefined, // Would need YouTube Data API for this
        channelId: undefined, // Would need YouTube Data API for this
        categoryId: undefined // Would need YouTube Data API for this
      }

      return {
        title: oembedData.title || pageMetadata.title,
        description: pageMetadata.description,
        thumbnailUrl: oembedData.thumbnail_url || pageMetadata.thumbnailUrl,
        faviconUrl: pageMetadata.faviconUrl,
        publishedAt: pageMetadata.publishedAt,
        language: pageMetadata.language,
        source: 'youtube',
        contentType: 'video',
        creator: this.resolveCreator(creator),
        videoMetadata
      }

    } catch (error) {
      // Fallback to enhanced web extraction if YouTube-specific extraction fails
      const fallback = await this.extractEnhancedWebMetadata(url, signal)
      return {
        ...fallback,
        source: 'youtube',
        contentType: 'video'
      }
    }
  }

  /**
   * Extract Spotify metadata using Spotify oEmbed API
   */
  private async extractSpotifyMetadata(url: string, signal: AbortSignal): Promise<EnhancedExtractedMetadata> {
    try {
      // Extract Spotify ID and type from URL
      const spotifyData = this.extractSpotifyInfo(url)
      if (!spotifyData) {
        throw new Error('Could not extract Spotify information from URL')
      }

      // Use Spotify oEmbed API (doesn't require authentication)
      const oembedUrl = `https://open.spotify.com/oembed?url=${encodeURIComponent(url)}`
      
      const response = await fetch(oembedUrl, { signal })
      if (!response.ok) {
        throw new Error(`Spotify oEmbed API failed: ${response.status}`)
      }

      const oembedData = await response.json() as SpotifyOEmbedResponse

      // Also fetch the page for additional metadata
      const pageMetadata = await this.extractEnhancedWebMetadata(url, signal)

      // Determine content type based on Spotify URL
      const contentType: ContentType = spotifyData.type === 'episode' ? 'podcast' : 
                                     spotifyData.type === 'track' || spotifyData.type === 'album' ? 'video' : 'link'

      // Extract creator information
      let creator: Creator | undefined
      if (oembedData.title) {
        // Parse artist/author from title (usually in format "Title by Artist" or "Artist - Title")
        const byMatch = oembedData.title.match(/(?:by|·|•|\|)\s*([^·•|]+)$/)
        const dashMatch = oembedData.title.match(/^([^-]+)\s*-/)
        
        const artistMatch = byMatch || dashMatch
        if (artistMatch && Array.isArray(artistMatch)) {
          const artistName = artistMatch[1]?.trim()
          if (artistName) {
            creator = {
              id: `spotify:${artistName.replace(/\s+/g, '').toLowerCase()}`,
              name: artistName,
              url: undefined // Would need Spotify Web API for artist profile URL
            }
          }
        }
      }
      
      // Fallback to page metadata creator if no artist found
      if (!creator && pageMetadata.creator) {
        creator = pageMetadata.creator
      }

      // Extract content-specific metadata
      let podcastMetadata: PodcastMetadata | undefined
      if (contentType === 'podcast') {
        // Extract episode information from title or description
        const episodeTitleMatch = oembedData.title?.match(/^([^|·•]+)/)
        podcastMetadata = {
          episodeTitle: episodeTitleMatch?.[1]?.trim(),
          seriesName: creator?.name,
          duration: undefined // Would need Spotify Web API for duration
        }
      }

      return {
        title: oembedData.title || pageMetadata.title,
        description: pageMetadata.description,
        thumbnailUrl: oembedData.thumbnail_url || pageMetadata.thumbnailUrl,
        faviconUrl: pageMetadata.faviconUrl,
        publishedAt: pageMetadata.publishedAt,
        language: pageMetadata.language,
        source: 'spotify',
        contentType,
        creator: this.resolveCreator(creator),
        podcastMetadata
      }

    } catch (error) {
      // Fallback to enhanced web extraction if Spotify-specific extraction fails
      const fallback = await this.extractEnhancedWebMetadata(url, signal)
      return {
        ...fallback,
        source: 'spotify',
        contentType: 'podcast' // Default assumption for Spotify content
      }
    }
  }

  /**
   * Extract Twitter/X metadata using Twitter oEmbed API
   */
  private async extractTwitterMetadata(url: string, signal: AbortSignal): Promise<EnhancedExtractedMetadata> {
    try {
      // Extract tweet information
      const tweetInfo = this.extractTwitterInfo(url)
      if (!tweetInfo) {
        throw new Error('Could not extract tweet information from URL')
      }

      // Use Twitter oEmbed API (public, no authentication required)
      const oembedUrl = `https://publish.twitter.com/oembed?url=${encodeURIComponent(url)}&omit_script=true`
      
      const response = await fetch(oembedUrl, { signal })
      if (!response.ok) {
        throw new Error(`Twitter oEmbed API failed: ${response.status}`)
      }

      const oembedData = await response.json() as TwitterOEmbedResponse

      // Also fetch the page for additional metadata (though Twitter blocks most crawlers)
      let pageMetadata: EnhancedExtractedMetadata | undefined
      try {
        pageMetadata = await this.extractEnhancedWebMetadata(url, signal)
      } catch {
        // Twitter often blocks crawlers, so this is expected to fail
      }

      // Extract creator information from author_name
      let creator: Creator | undefined
      if (oembedData.author_name) {
        // Remove the @ symbol if present
        const handle = oembedData.author_name.replace(/^@/, '')
        creator = {
          id: `twitter:${handle}`,
          name: oembedData.author_name,
          handle: `@${handle}`,
          url: oembedData.author_url
        }
      }

      // Extract post content from HTML
      let postText: string | undefined
      if (oembedData.html) {
        // Extract text content from the tweet HTML
        const textMatch = oembedData.html.match(/<p[^>]*>(.*?)<\/p>/s)
        if (textMatch) {
          // Clean up HTML entities and links
          postText = textMatch[1]
            .replace(/<[^>]+>/g, '') // Remove HTML tags
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&quot;/g, '"')
            .trim()
        }
      }

      // Extract post metadata
      const postMetadata: PostMetadata = {
        postText,
        likeCount: undefined, // Not available via oEmbed
        repostCount: undefined // Not available via oEmbed
      }

      // Use the tweet content as description if available
      const description = postText || pageMetadata?.description

      const resolvedCreator = this.resolveCreator(creator)

      return {
        title: `Tweet by ${resolvedCreator?.name || 'Twitter User'}`,
        description,
        thumbnailUrl: pageMetadata?.thumbnailUrl,
        faviconUrl: pageMetadata?.faviconUrl || 'https://abs.twimg.com/favicons/twitter.ico',
        publishedAt: pageMetadata?.publishedAt,
        language: pageMetadata?.language,
        source: 'x',
        contentType: 'post',
        creator: resolvedCreator,
        postMetadata
      }

    } catch (error) {
      // Fallback to enhanced web extraction if Twitter-specific extraction fails
      const fallback = await this.extractEnhancedWebMetadata(url, signal)
      return {
        ...fallback,
        source: 'x',
        contentType: 'post'
      }
    }
  }

  /**
   * Extract Substack metadata with enhanced article detection
   */
  private async extractSubstackMetadata(url: string, signal: AbortSignal): Promise<EnhancedExtractedMetadata> {
    try {
      // Substack has excellent structured data, so we can use enhanced web extraction
      // but with Substack-specific enhancements
      const baseMetadata = await this.extractEnhancedWebMetadata(url, signal)

      // Extract additional Substack-specific information
      const substackInfo = this.extractSubstackInfo(url)
      
      // Enhanced creator information for Substack
      let creator: Creator | undefined = baseMetadata.creator
      if (!creator && substackInfo) {
        // Extract creator from subdomain if no other creator info available
        creator = {
          id: `substack:${substackInfo.subdomain}`,
          name: `${substackInfo.subdomain} Newsletter`,
          url: `https://${substackInfo.subdomain}.substack.com`
        }
      }

      // Enhanced article metadata
      let articleMetadata: ArticleMetadata | undefined = baseMetadata.articleMetadata
      if (!articleMetadata) {
        // Estimate reading time if not already calculated
        const description = baseMetadata.description || ''
        if (description.length > 100) {
          const estimatedWords = description.split(/\s+/).length * 10 // Rough estimate: description is ~1/10 of full article
          articleMetadata = {
            wordCount: estimatedWords,
            readingTime: Math.ceil(estimatedWords / 200)
          }
        }
      }

      return {
        ...baseMetadata,
        source: 'substack',
        contentType: 'article',
        creator: this.resolveCreator(creator),
        articleMetadata
      }

    } catch (error) {
      // Fallback to enhanced web extraction if Substack-specific extraction fails
      const fallback = await this.extractEnhancedWebMetadata(url, signal)
      return {
        ...fallback,
        source: 'substack',
        contentType: 'article'
      }
    }
  }

  /**
   * Create minimal metadata when extraction fails
   */
  private createMinimalMetadata(originalUrl: string, _normalizedUrl: string, source: Source): EnhancedMetadataExtractionResult {
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

// Export enhanced instance
export const enhancedMetadataExtractor = new EnhancedMetadataExtractor()