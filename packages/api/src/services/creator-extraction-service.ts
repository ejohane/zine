/**
 * CreatorExtractionService
 * 
 * Extracts creator information from ContentSource objects.
 * Part of the Two-Tier Creator Model implementation.
 * 
 * This service bridges the gap between content sources (what users subscribe to)
 * and creators (who creates the content). It extracts creator metadata from
 * platform-specific content containers like YouTube channels and Spotify shows.
 * 
 * See: docs/features/creator-reconciliation/TWO_TIER_CREATOR_MODEL.md
 */

import type { ContentSource } from '../repositories/content-source-repository'

export interface ExtractedCreator {
  // Identity
  name: string
  handle?: string
  
  // Metadata
  avatarUrl?: string
  bio?: string
  url?: string
  
  // Platform info
  platform: string
  platformId: string  // Original platform ID (e.g., channel ID, show ID)
  
  // Verification & metrics
  verified?: boolean
  subscriberCount?: number
  followerCount?: number
  
  // Alternative identities
  alternativeNames?: string[]
  
  // Confidence in extraction
  extractionConfidence: number  // 0-1 scale
  extractionMethod: 'direct' | 'inferred' | 'metadata'
}

export interface CreatorExtractionResult {
  success: boolean
  creator?: ExtractedCreator
  error?: string
  warnings?: string[]
}

/**
 * Service for extracting creator information from content sources
 */
export class CreatorExtractionService {
  /**
   * Extract creator information from a content source
   */
  async extractCreator(contentSource: ContentSource): Promise<CreatorExtractionResult> {
    const warnings: string[] = []

    try {
      // Validate input
      if (!contentSource.platform) {
        return {
          success: false,
          error: 'Content source missing platform'
        }
      }

      // Route to platform-specific extraction
      let creator: ExtractedCreator | null = null

      switch (contentSource.platform.toLowerCase()) {
        case 'youtube':
          creator = await this.extractFromYouTube(contentSource, warnings)
          break
        
        case 'spotify':
          creator = await this.extractFromSpotify(contentSource, warnings)
          break
        
        default:
          return {
            success: false,
            error: `Unsupported platform: ${contentSource.platform}`
          }
      }

      if (!creator) {
        return {
          success: false,
          error: 'Failed to extract creator information',
          warnings
        }
      }

      return {
        success: true,
        creator,
        warnings: warnings.length > 0 ? warnings : undefined
      }

    } catch (error) {
      console.error('[CreatorExtractionService] Extraction error:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        warnings
      }
    }
  }

  /**
   * Extract creator from YouTube channel
   * 
   * For YouTube, the channel itself represents the creator.
   * We extract the channel name, handle, and metadata.
   */
  private async extractFromYouTube(
    contentSource: ContentSource,
    warnings: string[]
  ): Promise<ExtractedCreator | null> {
    // YouTube channels: the source_type should be 'channel'
    if (contentSource.sourceType !== 'channel') {
      warnings.push(`Unexpected YouTube source type: ${contentSource.sourceType}`)
    }

    // Extract creator name
    // For YouTube, creatorName might already be set, or we use the channel title
    const creatorName = contentSource.creatorName || contentSource.title
    if (!creatorName) {
      warnings.push('YouTube channel missing creator name and title')
      return null
    }

    // Extract handle from URL or metadata
    const handle = this.extractYouTubeHandle(contentSource)

    // Alternative names might include the channel name if different from creator
    const alternativeNames: string[] = []
    if (contentSource.title && contentSource.title !== creatorName) {
      alternativeNames.push(contentSource.title)
    }

    // Extract channel ID from external_id
    const platformId = contentSource.externalId

    const creator: ExtractedCreator = {
      name: creatorName,
      handle,
      avatarUrl: contentSource.thumbnailUrl,
      bio: contentSource.description,
      url: contentSource.url,
      platform: 'youtube',
      platformId,
      verified: contentSource.isVerified,
      subscriberCount: contentSource.subscriberCount,
      extractionConfidence: this.calculateYouTubeConfidence(contentSource),
      extractionMethod: 'direct',
      alternativeNames: alternativeNames.length > 0 ? alternativeNames : undefined
    }

    return creator
  }

  /**
   * Extract creator from Spotify show
   * 
   * For Spotify, the show's publisher field represents the creator.
   * We extract the publisher name and show metadata.
   */
  private async extractFromSpotify(
    contentSource: ContentSource,
    warnings: string[]
  ): Promise<ExtractedCreator | null> {
    // Spotify shows: the source_type should be 'show'
    if (contentSource.sourceType !== 'show') {
      warnings.push(`Unexpected Spotify source type: ${contentSource.sourceType}`)
    }

    // Extract creator name from publisher field (stored in creatorName)
    const creatorName = contentSource.creatorName
    if (!creatorName) {
      warnings.push('Spotify show missing publisher/creator name')
      return null
    }

    // Alternative names include the show title
    const alternativeNames: string[] = []
    if (contentSource.title && contentSource.title !== creatorName) {
      alternativeNames.push(contentSource.title)
    }

    // Extract show ID from external_id
    const platformId = contentSource.externalId

    const creator: ExtractedCreator = {
      name: creatorName,
      avatarUrl: contentSource.thumbnailUrl,
      bio: contentSource.description,
      url: contentSource.url,
      platform: 'spotify',
      platformId,
      verified: contentSource.isVerified,
      // Spotify doesn't provide follower counts at the show level
      extractionConfidence: this.calculateSpotifyConfidence(contentSource),
      extractionMethod: 'metadata',
      alternativeNames: alternativeNames.length > 0 ? alternativeNames : undefined
    }

    return creator
  }

  /**
   * Extract YouTube handle from content source
   */
  private extractYouTubeHandle(contentSource: ContentSource): string | undefined {
    // Try to extract from URL first
    if (contentSource.url) {
      const handleMatch = contentSource.url.match(/@([a-zA-Z0-9_-]+)/)
      if (handleMatch) {
        return `@${handleMatch[1]}`
      }
    }

    // Try to extract from metadata
    if (contentSource.metadata && typeof contentSource.metadata === 'object') {
      const metadata = contentSource.metadata as Record<string, any>
      if (metadata.handle) {
        return metadata.handle.startsWith('@') ? metadata.handle : `@${metadata.handle}`
      }
      if (metadata.customUrl) {
        const handleMatch = metadata.customUrl.match(/@([a-zA-Z0-9_-]+)/)
        if (handleMatch) {
          return `@${handleMatch[1]}`
        }
      }
    }

    return undefined
  }

  /**
   * Calculate confidence score for YouTube creator extraction
   */
  private calculateYouTubeConfidence(contentSource: ContentSource): number {
    let confidence = 0.5 // Base confidence

    // Has creator name: +0.2
    if (contentSource.creatorName) {
      confidence += 0.2
    }

    // Has handle: +0.15
    if (this.extractYouTubeHandle(contentSource)) {
      confidence += 0.15
    }

    // Has avatar: +0.05
    if (contentSource.thumbnailUrl) {
      confidence += 0.05
    }

    // Has bio: +0.05
    if (contentSource.description) {
      confidence += 0.05
    }

    // Is verified: +0.05
    if (contentSource.isVerified) {
      confidence += 0.05
    }

    return Math.min(confidence, 1.0)
  }

  /**
   * Calculate confidence score for Spotify creator extraction
   */
  private calculateSpotifyConfidence(contentSource: ContentSource): number {
    let confidence = 0.5 // Base confidence

    // Has publisher/creator name: +0.3
    if (contentSource.creatorName) {
      confidence += 0.3
    }

    // Has avatar: +0.05
    if (contentSource.thumbnailUrl) {
      confidence += 0.05
    }

    // Has bio: +0.05
    if (contentSource.description) {
      confidence += 0.05
    }

    // Has show URL: +0.05
    if (contentSource.url) {
      confidence += 0.05
    }

    // Note: Spotify extraction is less confident because publisher names
    // can be ambiguous (e.g., "The New York Times" could be multiple shows)
    return Math.min(confidence, 0.8) // Cap at 0.8 for Spotify
  }

  /**
   * Batch extract creators from multiple content sources
   */
  async extractCreators(
    contentSources: ContentSource[]
  ): Promise<Map<string, CreatorExtractionResult>> {
    const results = new Map<string, CreatorExtractionResult>()

    for (const source of contentSources) {
      const result = await this.extractCreator(source)
      results.set(source.id, result)
    }

    return results
  }

  /**
   * Get extraction statistics
   */
  getStatistics(results: Map<string, CreatorExtractionResult>): {
    total: number
    successful: number
    failed: number
    byPlatform: Record<string, number>
    avgConfidence: number
  } {
    let total = 0
    let successful = 0
    let failed = 0
    const byPlatform: Record<string, number> = {}
    let totalConfidence = 0
    let confidenceCount = 0

    for (const result of results.values()) {
      total++
      if (result.success) {
        successful++
        if (result.creator) {
          const platform = result.creator.platform
          byPlatform[platform] = (byPlatform[platform] || 0) + 1
          totalConfidence += result.creator.extractionConfidence
          confidenceCount++
        }
      } else {
        failed++
      }
    }

    return {
      total,
      successful,
      failed,
      byPlatform,
      avgConfidence: confidenceCount > 0 ? totalConfidence / confidenceCount : 0
    }
  }
}
