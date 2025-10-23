/**
 * Enhanced metadata extraction with proper HTML parsing and JSON-LD support
 */

import { parseHTML } from 'linkedom'
import { resolveSpotifyResource } from './url-normalizer'
import { extractArticleContent } from './article-content-extractor'

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
  fullTextContent?: string
  fullTextExtractedAt?: Date
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
    console.log('[EnhancedMetadataExtractor] Starting extraction for URL:', url)
    try {
      const normalized = normalizeUrl(url)
      const platform = detectPlatform(url)
      
      console.log('[EnhancedMetadataExtractor] Detected platform:', platform)
      console.log('[EnhancedMetadataExtractor] Normalized URL:', normalized.normalized)
      
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), this.timeout)
      
      try {
        let metadata: EnhancedExtractedMetadata
        
        // Route to platform-specific extractors first
        switch (platform) {
          case 'youtube':
            console.log('[EnhancedMetadataExtractor] Using YouTube extractor')
            metadata = await this.extractYouTubeMetadata(normalized.normalized, controller.signal)
            break
          case 'spotify':
            console.log('[EnhancedMetadataExtractor] Using Spotify extractor')
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
        
        console.error(`Platform-specific extraction failed for ${platform}:`, error)
        
        // If platform-specific extraction fails, try enhanced web extraction
        if (platform !== 'web') {
          try {
            console.log(`Attempting fallback to enhanced web extraction for ${platform}`)
            const fallbackMetadata = await this.extractEnhancedWebMetadata(normalized.normalized, controller.signal)
            return { success: true, metadata: fallbackMetadata }
          } catch (fallbackError) {
            console.error(`Enhanced web extraction also failed for ${platform}:`, fallbackError)
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
    console.log('[EnhancedMetadataExtractor] Fetching HTML from:', url)
    
    try {
      const response = await fetch(url, {
        signal: signal as any,
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; Zine/1.0; +https://zine.dev)',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5',
          'Accept-Encoding': 'gzip, deflate, br',
          'Cache-Control': 'no-cache'
        }
      })

      console.log('[EnhancedMetadataExtractor] Received response:', {
        status: response.status,
        statusText: response.statusText,
        contentType: response.headers.get('content-type')
      })

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }

      const html = await response.text()
      console.log('[EnhancedMetadataExtractor] Received HTML:', `${html.length} bytes`)
      
      return this.parseEnhancedHtmlMetadata(html, url)
    } catch (error) {
      console.error('[EnhancedMetadataExtractor] Error fetching or parsing HTML:', error)
      throw error
    }
  }

  /**
   * Parse HTML with enhanced extraction including JSON-LD
   */
  private async parseEnhancedHtmlMetadata(html: string, url: string): Promise<EnhancedExtractedMetadata> {
    try {
      console.log('[EnhancedMetadataExtractor] Parsing HTML for:', url, `(${html.length} bytes)`)
      
      // Parse HTML using linkedom for proper DOM manipulation
      const parsed = parseHTML(html) as any
      const document = parsed.document as LinkedOMDocument

      // Extract JSON-LD structured data
      const jsonLdData = this.extractJsonLd(document)
      console.log('[EnhancedMetadataExtractor] Found JSON-LD data:', jsonLdData.length, 'entries')

      // Get meta tags
      const metaTags = this.extractMetaTags(document)
      console.log('[EnhancedMetadataExtractor] Extracted meta tags:', metaTags.size)

      // Extract title with priority: JSON-LD > Open Graph > Twitter > HTML title
      const title = this.extractTitle(jsonLdData, metaTags, document, url)
      console.log('[EnhancedMetadataExtractor] Extracted title:', title)

      // Extract description
      const description = this.extractDescription(jsonLdData, metaTags, document)
      console.log('[EnhancedMetadataExtractor] Extracted description:', description ? `${description.substring(0, 50)}...` : 'none')

      // Extract images
      const { thumbnailUrl, faviconUrl } = this.extractImages(jsonLdData, metaTags, document, url)

      // Extract dates
      const publishedAt = this.extractPublishedDate(jsonLdData, metaTags, document)

      // Extract language
      const language = this.extractLanguage(document, metaTags)

      // Extract creator information
      const creator = this.extractCreator(jsonLdData, metaTags, document, url)
      console.log('[EnhancedMetadataExtractor] Extracted creator:', creator?.name || 'none')

      // Determine content type and source
      const { contentType, source } = this.inferContentTypeAndSource(url, jsonLdData, metaTags)

      // Extract content-specific metadata
      const { videoMetadata, podcastMetadata, articleMetadata, postMetadata } =
        this.extractContentSpecificMetadata(jsonLdData, metaTags, document, contentType)

      // Extract full-text content for articles
      let fullTextContent: string | undefined
      let fullTextExtractedAt: Date | undefined

      if (contentType === 'article') {
        try {
          const articleContent = await extractArticleContent(url, html)
          if (articleContent.success && articleContent.html) {
            fullTextContent = articleContent.html
            fullTextExtractedAt = new Date()
          }
        } catch (error) {
          console.error('[EnhancedMetadataExtractor] Full-text extraction failed:', error)
          // Continue without full-text content
        }
      }

      const result = {
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
        postMetadata,
        fullTextContent,
        fullTextExtractedAt
      }
      
      console.log('[EnhancedMetadataExtractor] Successfully parsed metadata:', {
        title: result.title,
        hasDescription: !!result.description,
        hasCreator: !!result.creator,
        contentType: result.contentType
      })
      
      return result
    } catch (error) {
      console.error('[EnhancedMetadataExtractor] Error parsing HTML metadata:', error)
      throw error
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
    
    try {
      // Extract meta tags with property attribute (Open Graph, etc.)
      const propertyMetas = document.querySelectorAll('meta[property]')
      console.log('[EnhancedMetadataExtractor] Found meta[property] tags:', propertyMetas.length)
      
      propertyMetas.forEach((meta: any) => {
        const property = meta.getAttribute('property')
        const content = meta.getAttribute('content')
        if (property && content) {
          metaTags.set(property.toLowerCase(), content)
          console.log('[EnhancedMetadataExtractor] Meta property:', property, '=', content.substring(0, 50))
        }
      })
      
      // Extract meta tags with name attribute (Twitter, description, etc.)
      const nameMetas = document.querySelectorAll('meta[name]')
      console.log('[EnhancedMetadataExtractor] Found meta[name] tags:', nameMetas.length)
      
      nameMetas.forEach((meta: any) => {
        const name = meta.getAttribute('name')
        const content = meta.getAttribute('content')
        if (name && content) {
          metaTags.set(name.toLowerCase(), content)
          console.log('[EnhancedMetadataExtractor] Meta name:', name, '=', content.substring(0, 50))
        }
      })
    } catch (error) {
      console.error('[EnhancedMetadataExtractor] Error extracting meta tags:', error)
    }
    
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
    
    // Extract featured image with priority:
    // 1. og:image (Open Graph) - most reliable for articles
    // 2. First content image (from article body)
    // 3. JSON-LD image
    // 4. Twitter image
    // 5. Favicon as last resort

    // Priority 1: Open Graph image
    thumbnailUrl = metaTags.get('og:image') || metaTags.get('og:image:url')

    // Priority 2: First content image (article-specific)
    if (!thumbnailUrl) {
      thumbnailUrl = this.extractFirstContentImage(document, url)
    }

    // Priority 3: JSON-LD image
    if (!thumbnailUrl) {
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
    }

    // Priority 4: Twitter image
    if (!thumbnailUrl) {
      thumbnailUrl = metaTags.get('twitter:image') || metaTags.get('twitter:image:src')
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

    // Priority 5: Use favicon as thumbnail if nothing else found
    if (!thumbnailUrl && faviconUrl) {
      thumbnailUrl = faviconUrl
    }

    // Resolve relative URLs
    if (thumbnailUrl) {
      thumbnailUrl = this.resolveUrl(thumbnailUrl, url)
    }

    return { thumbnailUrl, faviconUrl }
  }

  /**
   * Extract the first meaningful content image from article
   */
  private extractFirstContentImage(document: LinkedOMDocument, url: string): string | undefined {
    // Look for images in common article content containers
    const contentSelectors = [
      'article img[src]',
      '[role="main"] img[src]',
      '.article-content img[src]',
      '.post-content img[src]',
      '.entry-content img[src]',
      'main img[src]',
      'img[src]'
    ]

    for (const selector of contentSelectors) {
      const images = document.querySelectorAll(selector)
      for (const img of images) {
        const imgElement = img as any
        const src = imgElement.getAttribute('src')

        // Filter out common non-content images
        if (src &&
            !src.toLowerCase().includes('icon') &&
            !src.toLowerCase().includes('logo') &&
            !src.toLowerCase().includes('avatar') &&
            !src.toLowerCase().includes('profile') &&
            !src.toLowerCase().includes('badge') &&
            !src.toLowerCase().includes('button') &&
            !src.startsWith('data:')) {

          // Check if image has reasonable dimensions (if available)
          const width = imgElement.getAttribute('width')
          const height = imgElement.getAttribute('height')
          if (width && height) {
            const w = parseInt(width)
            const h = parseInt(height)
            // Skip tiny images (likely icons/decorations)
            if (w < 200 || h < 100) {
              continue
            }
          }

          return this.resolveUrl(src, url)
        }
      }
    }

    return undefined
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
   * Extract creator information with confidence-based fallback chain
   */
  private extractCreator(jsonLdData: any[], metaTags: Map<string, string>, document: LinkedOMDocument, url: string): Creator | undefined {
    const context = this.analyzeContentContext(url, metaTags, document)
    
    console.log('[CreatorExtraction] Starting extraction for:', url)
    console.log('[CreatorExtraction] Context:', {
      isPersonalSite: context.isPersonalSite,
      isNewsOrganization: context.isNewsOrganization,
      contentType: context.contentType,
      hasByline: context.hasByline
    })
    
    // TIER 1: Structured Metadata (Confidence: 95%)
    const structuredCreator = this.extractFromStructuredData(jsonLdData, metaTags)
    if (structuredCreator) {
      console.log('[CreatorExtraction] ✅ TIER 1: Found creator via structured data:', structuredCreator.name)
      return { ...structuredCreator, extractionMethod: 'json-ld', confidence: 95 }
    }
    console.log('[CreatorExtraction] ❌ TIER 1: No structured data found')

    // TIER 2: Semantic HTML (Confidence: 75-85%)
    const semanticCreator = this.extractFromSemanticHtml(document, url)
    if (semanticCreator) {
      console.log('[CreatorExtraction] ✅ TIER 2: Found creator via semantic HTML:', semanticCreator.name)
      return { ...semanticCreator, extractionMethod: 'semantic-html', confidence: 80 }
    }
    console.log('[CreatorExtraction] ❌ TIER 2: No semantic HTML found')

    // TIER 3: Heuristic Patterns (Confidence: 50-70%)
    const heuristicCreator = this.extractFromHeuristics(document, url, context)
    if (heuristicCreator) {
      console.log('[CreatorExtraction] ✅ TIER 3: Found creator via heuristics:', heuristicCreator.name, `(confidence: ${heuristicCreator.confidence})`)
      return { ...heuristicCreator, extractionMethod: 'heuristic', confidence: heuristicCreator.confidence || 60 }
    }
    console.log('[CreatorExtraction] ❌ TIER 3: No heuristic patterns found')

    // TIER 4: Domain-based (Personal sites only, Confidence: 40-60%)
    if (context.isPersonalSite) {
      const domainCreator = this.extractFromDomain(url, document, context)
      if (domainCreator) {
        console.log('[CreatorExtraction] ✅ TIER 4: Found creator via domain:', domainCreator.name, `(confidence: ${domainCreator.confidence})`)
        return { ...domainCreator, extractionMethod: 'domain', confidence: domainCreator.confidence || 50 }
      }
      console.log('[CreatorExtraction] ❌ TIER 4: No domain match found')
    } else {
      console.log('[CreatorExtraction] ⏭️  TIER 4: Skipped (not a personal site)')
    }

    console.log('[CreatorExtraction] ⚠️  All extraction tiers failed - no creator found')
    return undefined
  }

  /**
   * Analyze content context to guide extraction strategy
   */
  private analyzeContentContext(url: string, metaTags: Map<string, string>, document: LinkedOMDocument): {
    isPersonalSite: boolean
    isNewsOrganization: boolean
    contentType: 'article' | 'blog-post' | 'news' | 'unknown'
    hasByline: boolean
  } {
    try {
      const urlObj = new URL(url)
      const domain = urlObj.hostname.toLowerCase()

      // Known news organizations (should NOT use site header as author)
      const newsOrganizations = [
        'nytimes.com', 'washingtonpost.com', 'wsj.com', 'ft.com',
        'theguardian.com', 'bbc.com', 'cnn.com', 'reuters.com',
        'bloomberg.com', 'techcrunch.com', 'theverge.com', 'wired.com'
      ]
      const isNewsOrganization = newsOrganizations.some(org => domain.includes(org))

      // Personal site indicators
      const hasPersonalPatterns = (
        !domain.includes('www.') ||
        domain.split('.').length === 2 ||
        metaTags.get('og:type') === 'blog'
      )

      // Check if there's a visible byline
      const hasByline = !!(
        document.querySelector('[rel="author"]') ||
        document.querySelector('.byline') ||
        document.querySelector('.author') ||
        document.querySelector('.post-author')
      )

      // Determine content type
      let contentType: 'article' | 'blog-post' | 'news' | 'unknown' = 'unknown'
      const ogType = metaTags.get('og:type')
      if (ogType === 'article' || metaTags.get('article:author')) {
        contentType = isNewsOrganization ? 'news' : 'article'
      } else if (url.includes('/blog/') || url.includes('/post/')) {
        contentType = 'blog-post'
      }

      return {
        isPersonalSite: hasPersonalPatterns && !isNewsOrganization,
        isNewsOrganization,
        contentType,
        hasByline
      }
    } catch {
      return {
        isPersonalSite: false,
        isNewsOrganization: false,
        contentType: 'unknown',
        hasByline: false
      }
    }
  }

  /**
   * Extract image URL from various structured data formats
   */
  private extractImageUrl(image: any): string | undefined {
    if (!image) return undefined
    if (typeof image === 'string') return image
    if (typeof image === 'object') {
      return image.url || image.contentUrl || image.thumbnailUrl || undefined
    }
    return undefined
  }

  /**
   * TIER 1: Extract from structured data (JSON-LD, meta tags)
   */
  private extractFromStructuredData(jsonLdData: any[], metaTags: Map<string, string>): Creator | undefined {
    // Try JSON-LD first
    for (const data of jsonLdData) {
      // Try author field
      if (data.author) {
        const author = Array.isArray(data.author) ? data.author[0] : data.author
        if (typeof author === 'object') {
          return {
            id: author['@id'] || `web:${this.slugifyAuthorName(author.name || 'unknown')}`,
            name: author.name || 'Unknown Author',
            url: author.url,
            bio: author.description,
            avatarUrl: this.extractImageUrl(author.image)
          }
        } else if (typeof author === 'string') {
          return {
            id: `web:${this.slugifyAuthorName(author)}`,
            name: author
          }
        }
      }

      // Try creator field
      if (data.creator) {
        const creator = Array.isArray(data.creator) ? data.creator[0] : data.creator
        if (typeof creator === 'object') {
          return {
            id: creator['@id'] || `web:${this.slugifyAuthorName(creator.name || 'unknown')}`,
            name: creator.name || 'Unknown Creator',
            url: creator.url,
            bio: creator.description,
            avatarUrl: this.extractImageUrl(creator.image)
          }
        }
      }

      // Try publisher field (for personal blogs that use Organization schema)
      // Only use if publisher is a Person or has a personal name
      if (data.publisher && data['@type'] === 'Article') {
        const publisher = data.publisher
        if (typeof publisher === 'object' && publisher.name) {
          // Check if publisher looks like a personal blog (not a big organization)
          const name = publisher.name
          const isLikelyPersonal = (
            publisher['@type'] === 'Person' ||
            // Name looks like a person's name (2-4 words, each capitalized)
            /^[A-Z][a-z]+(\s[A-Z][a-z]+){1,3}$/.test(name)
          )
          
          if (isLikelyPersonal) {
            return {
              id: publisher['@id'] || `web:${this.slugifyAuthorName(name)}`,
              name,
              url: publisher.url,
              bio: publisher.description,
              avatarUrl: this.extractImageUrl(publisher.logo) || this.extractImageUrl(publisher.image)
            }
          }
        }
      }
    }

    // Try article-specific meta tags
    const articleAuthor = metaTags.get('article:author')
    if (articleAuthor) {
      return {
        id: `web:${this.slugifyAuthorName(articleAuthor)}`,
        name: articleAuthor
      }
    }

    // Try generic author meta tag
    const authorName = metaTags.get('author')
    if (authorName) {
      return {
        id: `web:${this.slugifyAuthorName(authorName)}`,
        name: authorName
      }
    }

    return undefined
  }

  /**
   * TIER 2: Extract from semantic HTML
   */
  private extractFromSemanticHtml(document: LinkedOMDocument, url: string): Creator | undefined {
    // Try rel="author" links
    const authorLink = document.querySelector('[rel="author"]') as any
    if (authorLink) {
      const name = authorLink.textContent?.trim()
      const href = authorLink.getAttribute('href')
      if (name) {
        return {
          id: `web:${this.slugifyAuthorName(name)}`,
          name,
          url: href ? this.resolveUrl(href, url) : undefined
        }
      }
    }

    // Try common author class selectors
    const authorSelectors = [
      '.author-name',
      '.byline',
      '.post-author',
      '.article-author',
      '[itemprop="author"]',
      '[itemprop="author"] [itemprop="name"]'
    ]

    for (const selector of authorSelectors) {
      const element = document.querySelector(selector) as any
      if (element) {
        const name = element.textContent?.trim()
        if (name && name.length > 0 && name.length < 100) {
          // Get associated URL if available
          let authorUrl: string | undefined
          const linkElement = element.closest('a') || element.querySelector('a')
          if (linkElement) {
            const href = linkElement.getAttribute('href')
            if (href) {
              authorUrl = this.resolveUrl(href, url)
            }
          }

          return {
            id: `web:${this.slugifyAuthorName(name)}`,
            name,
            url: authorUrl
          }
        }
      }
    }

    // Try <address> in <article> context
    const articleElement = document.querySelector('article')
    if (articleElement) {
      const addressElement = articleElement.querySelector('address') as any
      if (addressElement) {
        const name = addressElement.textContent?.trim()
        if (name && name.length > 0 && name.length < 100) {
          return {
            id: `web:${this.slugifyAuthorName(name)}`,
            name
          }
        }
      }
    }

    return undefined
  }

  /**
   * TIER 3: Extract using heuristic patterns
   */
  private extractFromHeuristics(document: LinkedOMDocument, _url: string, context: any): (Creator & { confidence?: number }) | undefined {
    // Look for "By [Name]" patterns in article header
    const articleElement = document.querySelector('article') || document.body
    if (articleElement) {
      const headerText = this.extractArticleHeader(articleElement as any)
      const bylineMatch = headerText.match(/(?:by|written by|posted by|author:)\s+([A-Z][a-zA-Z\s\-']+?)(?:\s+on|\s+\||$|\n)/i)
      if (bylineMatch) {
        const name = bylineMatch[1].trim()
        if (name.length > 2 && name.length < 50) {
          return {
            id: `web:${this.slugifyAuthorName(name)}`,
            name,
            confidence: 65
          }
        }
      }
    }

    // Check footer for author information (lower confidence)
    const footer = document.querySelector('footer') as any
    if (footer && context.isPersonalSite) {
      const footerText = footer.textContent || ''
      const copyrightMatch = footerText.match(/©\s*\d{4}\s+([A-Z][a-zA-Z\s\-']+?)(?:\s|$|\.|,)/i)
      if (copyrightMatch) {
        const name = copyrightMatch[1].trim()
        if (name.length > 2 && name.length < 50 && !name.toLowerCase().includes('all rights')) {
          return {
            id: `web:${this.slugifyAuthorName(name)}`,
            name,
            confidence: 55
          }
        }
      }
    }

    return undefined
  }

  /**
   * TIER 4: Extract from domain (personal sites only)
   */
  private extractFromDomain(url: string, document: LinkedOMDocument, context: any): (Creator & { confidence?: number }) | undefined {
    try {
      const urlObj = new URL(url)
      const domain = urlObj.hostname.toLowerCase().replace('www.', '')

      // Extract site header/branding (highest confidence for personal sites)
      const headerSelectors = [
        'header h1 a',
        'header h2 a',
        'header h3 a',
        'header .site-title',
        'header .blog-title',
        '.site-header h1',
        '.site-header h2',
        '.site-header h3'
      ]

      for (const selector of headerSelectors) {
        const element = document.querySelector(selector) as any
        if (element) {
          const name = element.textContent?.trim()
          const href = element.getAttribute('href')
          
          // Validate: should be short, point to home, and match domain pattern
          if (name && 
              name.length > 2 && 
              name.length < 50 && 
              (href === '/' || href === urlObj.origin || href === url)) {
            
            // Cross-validate with domain name
            const confidence = this.calculateDomainNameMatch(name, domain)
            
            if (confidence >= 40) {
              return {
                id: `web:${this.slugifyAuthorName(name)}`,
                name: this.capitalizeProperName(name),
                url: urlObj.origin,
                confidence
              }
            }
          }
        }
      }

      // Fallback: Extract from domain name itself
      if (context.isPersonalSite && domain.split('.').length === 2) {
        const domainName = domain.split('.')[0]
        const name = this.extractNameFromDomain(domainName)
        if (name) {
          return {
            id: `web:${this.slugifyAuthorName(name)}`,
            name,
            url: urlObj.origin,
            confidence: 40
          }
        }
      }

      return undefined
    } catch {
      return undefined
    }
  }

  /**
   * Extract text from article header area
   */
  private extractArticleHeader(element: any): string {
    const headerSelectors = ['header', '.article-header', '.post-header', '.entry-header']
    
    for (const selector of headerSelectors) {
      const header = element.querySelector(selector)
      if (header) {
        return header.textContent || ''
      }
    }

    // Fallback: Get first 500 characters
    const text = element.textContent || ''
    return text.substring(0, 500)
  }

  /**
   * Calculate confidence score based on domain name match
   */
  private calculateDomainNameMatch(name: string, domain: string): number {
    const normalizedName = name.toLowerCase().replace(/[^a-z]/g, '')
    const domainPart = domain.split('.')[0].replace(/[^a-z]/g, '')
    
    // Exact match or very close match
    if (normalizedName === domainPart) return 75
    if (domainPart.includes(normalizedName) || normalizedName.includes(domainPart)) return 60
    
    // Partial match (e.g., "sean goedecke" vs "seangoedecke")
    const nameWithoutSpaces = name.toLowerCase().replace(/\s+/g, '')
    if (nameWithoutSpaces === domainPart) return 70
    if (domainPart.includes(nameWithoutSpaces) || nameWithoutSpaces.includes(domainPart)) return 55
    
    // Check if it's a reasonable personal name pattern
    const words = name.split(/\s+/)
    if (words.length >= 2 && words.length <= 4) {
      return 45
    }
    
    return 0
  }

  /**
   * Extract likely name from domain
   */
  private extractNameFromDomain(domain: string): string | null {
    // Remove common prefixes/suffixes
    let cleaned = domain.replace(/^(blog|site|web|my)/, '')
                       .replace(/(blog|site|web)$/, '')
    
    // Check for name patterns (firstname, firstnamelastname, firstname-lastname)
    if (cleaned.length < 3 || cleaned.length > 30) return null
    
    // Convert camelCase or dash-separated to proper name
    const name = cleaned
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .replace(/[-_]/g, ' ')
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ')
    
    return name
  }

  /**
   * Capitalize proper names correctly
   */
  private capitalizeProperName(name: string): string {
    return name
      .split(' ')
      .map(word => {
        if (word.length === 0) return word
        return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
      })
      .join(' ')
  }

  /**
   * Helper to slugify author names for consistent IDs
   */
  private slugifyAuthorName(name: string): string {
    return name
      .toLowerCase()
      .trim()
      .replace(/[^\w\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
  }

  /**
   * Extract all authors from article (primary + secondary)
   */
  private extractAllAuthors(jsonLdData: any[], metaTags: Map<string, string>): {
    primary?: string
    secondary?: string[]
  } {
    const authors: string[] = []

    // Try JSON-LD first
    for (const data of jsonLdData) {
      if (data.author) {
        if (Array.isArray(data.author)) {
          // Multiple authors
          data.author.forEach((author: any) => {
            const name = typeof author === 'object' ? author.name : author
            if (name && typeof name === 'string') {
              authors.push(name)
            }
          })
        } else {
          // Single author
          const name = typeof data.author === 'object' ? data.author.name : data.author
          if (name && typeof name === 'string') {
            authors.push(name)
          }
        }
        break
      }
    }

    if (authors.length === 0) {
      // Try meta tags
      const articleAuthor = metaTags.get('article:author') || metaTags.get('author')
      if (articleAuthor) {
        authors.push(articleAuthor)
      }
    }

    if (authors.length === 0) {
      return {}
    }

    return {
      primary: authors[0],
      secondary: authors.length > 1 ? authors.slice(1) : undefined
    }
  }

  /**
   * Infer content type and source from URL and metadata
   */
  private inferContentTypeAndSource(url: string, jsonLdData: any[], metaTags: Map<string, string>): {
    contentType: ContentType
    source: Source
  } {
    const urlLower = url.toLowerCase()

    // Check JSON-LD for type information (enhanced article detection)
    for (const data of jsonLdData) {
      const type = data['@type']?.toLowerCase()
      if (type) {
        if (type.includes('videoobject') || type.includes('video')) {
          return { contentType: 'video', source: 'web' }
        }
        if (type.includes('article') || type.includes('blogposting') || type.includes('newsarticle') || type.includes('scholarlyarticle') || type.includes('technicalArticle')) {
          return { contentType: 'article', source: 'web' }
        }
        if (type.includes('podcast') || type.includes('audio')) {
          return { contentType: 'podcast', source: 'web' }
        }
      }
    }

    // Check Open Graph type (prioritize article detection)
    const ogType = metaTags.get('og:type')
    if (ogType) {
      const ogTypeLower = ogType.toLowerCase()
      if (ogTypeLower.includes('video')) {
        return { contentType: 'video', source: 'web' }
      }
      if (ogTypeLower === 'article' || ogTypeLower.includes('article')) {
        return { contentType: 'article', source: 'web' }
      }
    }

    // Check for article-specific meta tags
    const articleAuthor = metaTags.get('article:author')
    const articlePublishedTime = metaTags.get('article:published_time')
    const articleModifiedTime = metaTags.get('article:modified_time')
    if (articleAuthor || articlePublishedTime || articleModifiedTime) {
      return { contentType: 'article', source: 'web' }
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
    metaTags: Map<string, string>,
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
      let isPaywalled = false

      // Try to get word count from JSON-LD first
      for (const data of jsonLdData) {
        if (data.wordCount) {
          wordCount = data.wordCount
          readingTime = wordCount ? Math.ceil(wordCount / 200) : undefined
          break
        }
      }

      // If not found, estimate word count from content
      if (!wordCount) {
        const textContent = this.extractMainTextContent(document)
        if (textContent) {
          const words = textContent.trim().split(/\s+/).filter(w => w.length > 0)
          wordCount = words.length
          readingTime = wordCount > 0 ? Math.ceil(wordCount / 200) : undefined
        }
      }

      // Extract all authors (primary + secondary)
      const authors = this.extractAllAuthors(jsonLdData, metaTags)

      // Detect paywalled content
      isPaywalled = this.detectPaywall(document, metaTags)

      const articleMetadata: ArticleMetadata = {
        wordCount,
        readingTime,
        authorName: authors.primary,
        secondaryAuthors: authors.secondary,
        isPaywalled: isPaywalled || undefined
      }

      // Remove undefined values
      Object.keys(articleMetadata).forEach(key => {
        if (articleMetadata[key as keyof ArticleMetadata] === undefined) {
          delete articleMetadata[key as keyof ArticleMetadata]
        }
      })

      if (Object.keys(articleMetadata).length > 0) {
        result.articleMetadata = articleMetadata
      }
    }

    return result
  }

  /**
   * Extract main text content from article, excluding navigation, footer, ads
   */
  private extractMainTextContent(document: LinkedOMDocument): string {
    const body = document.body as any
    if (!body) return ''

    // Clone the body to avoid modifying the original
    const clone = body.cloneNode(true) as any

    // Remove non-content elements
    const selectorsToRemove = [
      'script',
      'style',
      'nav',
      'header',
      'footer',
      'aside',
      'iframe',
      '[role="navigation"]',
      '[role="complementary"]',
      '[role="banner"]',
      '[role="contentinfo"]',
      '.nav',
      '.navigation',
      '.sidebar',
      '.footer',
      '.header',
      '.advertisement',
      '.ad',
      '.social-share',
      '.comments'
    ]

    selectorsToRemove.forEach(selector => {
      const elements = clone.querySelectorAll(selector)
      elements.forEach((el: any) => el.remove())
    })

    return clone.textContent || ''
  }

  /**
   * Detect if article is behind a paywall
   */
  private detectPaywall(document: LinkedOMDocument, metaTags: Map<string, string>): boolean {
    // Check for paywall indicators in meta tags
    const isAccessibleForFree = metaTags.get('isAccessibleForFree')
    if (isAccessibleForFree === 'false' || isAccessibleForFree === 'False') {
      return true
    }

    // Check HTML content for common paywall indicators
    const body = document.body as any
    if (!body) return false

    const htmlContent = body.textContent?.toLowerCase() || ''
    const paywallIndicators = [
      'subscriber-only',
      'subscribers only',
      'member-only',
      'members only',
      'paywall',
      'subscribe to read',
      'subscription required',
      'login to continue',
      'sign in to read',
      'become a member',
      'premium content',
      'exclusive to members'
    ]

    return paywallIndicators.some(indicator => htmlContent.includes(indicator))
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
    const resource = resolveSpotifyResource(url)
    if (!resource) {
      return null
    }

    return {
      type: resource.type as SpotifyInfo['type'],
      id: resource.id
    }
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
    const resolved = resolution.resolved
    
    // If avatar is missing and we have a URL, try to enhance with avatar
    if (resolved && !resolved.avatarUrl && resolved.url) {
      this.enhanceCreatorWithAvatar(resolved).catch(err => {
        console.warn('[EnhancedMetadataExtractor] Failed to enhance creator avatar:', err)
      })
    }
    
    return resolved
  }
  
  /**
   * Enhance creator with avatar by scraping their profile page or using fallbacks
   */
  private async enhanceCreatorWithAvatar(creator: Creator): Promise<void> {
    if (!creator.url) return
    
    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 5000)
      
      // Try to fetch the author's profile page
      const response = await fetch(creator.url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; Zine/1.0)',
          'Accept': 'text/html'
        },
        signal: controller.signal as any
      })
      
      clearTimeout(timeoutId)
      
      if (!response.ok) return
      
      const html = await response.text()
      const parsed = parseHTML(html) as any
      const document = parsed.document as LinkedOMDocument
      
      // Try common avatar selectors
      const avatarSelectors = [
        'img.avatar',
        'img.author-avatar',
        'img.profile-image',
        'img.author-image',
        '[itemprop="image"]',
        '.about img',
        '.profile img',
        'header img'
      ]
      
      for (const selector of avatarSelectors) {
        const img = document.querySelector(selector) as any
        if (img) {
          const src = img.getAttribute('src')
          if (src && !src.includes('placeholder') && !src.includes('default')) {
            creator.avatarUrl = this.resolveUrl(src, creator.url)
            return
          }
        }
      }
      
      // Fallback: Look for og:image on the profile page
      const metaTags = this.extractMetaTags(document)
      const ogImage = metaTags.get('og:image')
      if (ogImage) {
        creator.avatarUrl = ogImage
      }
    } catch (error) {
      // Silently fail - avatar is optional
      console.warn('[EnhancedMetadataExtractor] Could not fetch creator avatar:', error)
    }
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
      
      const response = await fetch(oembedUrl, { signal: signal as any })
      if (!response.ok) {
        throw new Error(`YouTube oEmbed API failed: ${response.status}`)
      }

      const oembedData = await response.json() as YouTubeOEmbedResponse

      // Try to fetch the video page for additional metadata, but don't fail if it doesn't work
      let pageMetadata: EnhancedExtractedMetadata | undefined
      let duration: number | undefined
      
      try {
        pageMetadata = await this.extractEnhancedWebMetadata(url, signal)
        // Extract duration from page metadata if available
        if (pageMetadata?.videoMetadata?.duration) {
          duration = pageMetadata.videoMetadata.duration
        }
      } catch (pageError) {
        console.warn('Failed to extract additional YouTube page metadata:', pageError)
        // Continue with oEmbed data only
      }

      // Parse creator information from oEmbed
      // Extract channel ID from author_url if available
      let channelId: string | undefined
      if (oembedData.author_url) {
        // Try to extract channel ID from URL patterns:
        // https://www.youtube.com/channel/UCxxxxxx
        // https://www.youtube.com/c/channelname
        // https://www.youtube.com/@handle
        const channelMatch = oembedData.author_url.match(/\/channel\/([^/?]+)/)
        const customMatch = oembedData.author_url.match(/\/c\/([^/?]+)/)
        const handleMatch = oembedData.author_url.match(/\/@([^/?]+)/)
        
        if (channelMatch) {
          channelId = channelMatch[1]
        } else if (customMatch) {
          // For custom URLs, we'd need to resolve to channel ID via API
          channelId = customMatch[1]
        } else if (handleMatch) {
          // For @handles, we'd need to resolve to channel ID via API
          channelId = handleMatch[1]
        }
      }
      
      const creator: Creator = {
        id: channelId ? `youtube:${channelId}` : `youtube:${oembedData.author_name || 'unknown'}`,
        name: oembedData.author_name || 'Unknown Creator',
        url: oembedData.author_url,
        handle: oembedData.author_name ? `@${oembedData.author_name.replace(/\s+/g, '')}` : undefined,
        // Note: Avatar URL cannot be obtained from oEmbed API
        // It requires YouTube Data API with authentication
        avatarUrl: undefined
      }

      // Extract video metadata
      const videoMetadata: VideoMetadata = {
        duration,
        viewCount: undefined, // Would need YouTube Data API for this
        likeCount: undefined, // Would need YouTube Data API for this
        channelId: undefined, // Would need YouTube Data API for this
        categoryId: undefined // Would need YouTube Data API for this
      }

      // Note: YouTube oEmbed API doesn't provide video descriptions.
      // The pageMetadata description is from HTML meta tags which often contains
      // generic YouTube homepage text rather than the actual video description.
      // Full video description is only available via YouTube Data API v3 with OAuth.
      let description = pageMetadata?.description
      if (description && (
        description.includes('Enjoy the videos and music you love') ||
        description.includes('Share your videos with friends, family, and the world')
      )) {
        description = undefined // Don't use generic YouTube description
      }

      return {
        title: oembedData.title || pageMetadata?.title || 'Untitled Video',
        description: description,
        thumbnailUrl: oembedData.thumbnail_url || pageMetadata?.thumbnailUrl,
        faviconUrl: pageMetadata?.faviconUrl || 'https://www.youtube.com/favicon.ico',
        publishedAt: pageMetadata?.publishedAt,
        language: pageMetadata?.language,
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
        console.warn('Could not extract Spotify information from URL:', url)
        throw new Error('Could not extract Spotify information from URL')
      }

      console.log('Extracting Spotify metadata for:', spotifyData)

      // Use Spotify oEmbed API (doesn't require authentication)
      const oembedUrl = `https://open.spotify.com/oembed?url=${encodeURIComponent(url)}`
      
      console.log('Fetching Spotify oEmbed from:', oembedUrl)
      
      let response: Response
      try {
        response = await fetch(oembedUrl, { 
          signal: signal as any,
          headers: {
            'Accept': 'application/json'
          }
        })
      } catch (fetchError) {
        console.error('Fetch error for Spotify oEmbed:', fetchError)
        console.error('Fetch error details:', {
          message: fetchError instanceof Error ? fetchError.message : String(fetchError),
          stack: fetchError instanceof Error ? fetchError.stack : undefined,
          url: oembedUrl
        })
        throw new Error(`Failed to fetch Spotify oEmbed: ${fetchError instanceof Error ? fetchError.message : String(fetchError)}`)
      }
      
      if (!response.ok) {
        console.error(`Spotify oEmbed API failed with status ${response.status}`)
        const responseText = await response.text()
        console.error('Response body:', responseText)
        throw new Error(`Spotify oEmbed API failed: ${response.status}`)
      }

      const oembedData = await response.json() as SpotifyOEmbedResponse
      console.log('Spotify oEmbed data received:', oembedData)

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

      // Extract content-specific metadata
      let podcastMetadata: PodcastMetadata | undefined
      if (contentType === 'podcast') {
        // Extract episode information from title or description
        const episodeTitleMatch = oembedData.title?.match(/^([^|·•]+)/)
        podcastMetadata = {
          episodeTitle: episodeTitleMatch?.[1]?.trim() || oembedData.title,
          seriesName: creator?.name,
          duration: undefined // Would need Spotify Web API for duration
        }
      }

      return {
        title: oembedData.title || 'Untitled',
        description: undefined, // oEmbed doesn't provide description
        thumbnailUrl: oembedData.thumbnail_url,
        faviconUrl: 'https://www.scdn.co/i/_global/favicon.png',
        publishedAt: undefined, // oEmbed doesn't provide publish date
        language: undefined, // oEmbed doesn't provide language
        source: 'spotify',
        contentType,
        creator: this.resolveCreator(creator),
        podcastMetadata
      }

    } catch (error) {
      console.error('Spotify metadata extraction failed:', error)
      console.error('Error details:', {
        message: error instanceof Error ? error.message : String(error),
        url,
        stack: error instanceof Error ? error.stack : undefined
      })
      
      // Fallback to enhanced web extraction if Spotify-specific extraction fails
      console.log('Falling back to enhanced web extraction for Spotify URL')
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
      
      const response = await fetch(oembedUrl, { signal: signal as any })
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
