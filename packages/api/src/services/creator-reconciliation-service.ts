import { D1Database } from '@cloudflare/workers-types'
import { CreatorRepository, type Creator } from '../repositories/creator-repository'
import { ContentSourceRepository, type ContentSource } from '../repositories/content-source-repository'
import { CreatorExtractionService, type ExtractedCreator } from './creator-extraction-service'
import { calculateNameSimilarity, normalizeCreatorName, normalizeCreatorNameWithSuffixes } from '../utils/creator-matching'
import { extractHandleFromSubscriptionUrl } from '../utils/handle-extraction'
import type { YouTubeAPI } from '../external/youtube-api'

/**
 * Result of creator reconciliation attempt
 */
export interface ReconciliationResult {
  creator: Creator | null
  matchMethod?: 'exact_id' | 'handle' | 'domain_fuzzy' | 'related_domain' | 'platform_fuzzy' | 'new_creator' | 'none'
  similarity?: number
  timedOut: boolean
  executionTimeMs: number
}

/**
 * Options for creator reconciliation
 */
export interface ReconciliationOptions {
  timeoutMs?: number // Default: 200ms
  platform?: string  // Platform hint for better matching
  subscriptionUrl?: string // Optional URL for handle extraction
  youtubeApi?: YouTubeAPI // Optional for handle extraction via API
}

/**
 * Service for reconciling creators across platforms
 * 
 * Multi-tier matching strategy:
 * 1. Exact ID match (fastest, most reliable)
 * 2. Handle match (cross-platform via @username)
 * 3. Domain + fuzzy name (same platform, similar name)
 * 4. Related domains + high similarity (cross-platform with verification)
 * 5. Platform fuzzy match (fallback, requires high similarity)
 * 
 * Features:
 * - Timeout protection (default 200ms)
 * - Graceful degradation
 * - Comprehensive logging
 * - Performance tracking
 */
export class CreatorReconciliationService {
  private repository: CreatorRepository
  private contentSourceRepository: ContentSourceRepository
  private extractionService: CreatorExtractionService

  constructor(db: D1Database) {
    this.repository = new CreatorRepository(db)
    this.contentSourceRepository = new ContentSourceRepository(db)
    this.extractionService = new CreatorExtractionService()
  }

  /**
   * Attempt to find an existing creator match
   * 
   * @param creatorData - Creator information to reconcile
   * @param options - Reconciliation options
   * @returns ReconciliationResult with match details
   */
  async reconcileCreator(
    creatorData: Partial<Creator>,
    options: ReconciliationOptions = {}
  ): Promise<ReconciliationResult> {
    const startTime = Date.now()
    const timeout = options.timeoutMs || 200
    const timeoutPromise = this.createTimeout(timeout)

    console.log('[CreatorReconciliation] Starting reconciliation', {
      creatorName: creatorData.name,
      creatorHandle: creatorData.handle,
      platform: options.platform,
      timeout
    })

    try {
      const result = await Promise.race([
        this.performReconciliation(creatorData, options),
        timeoutPromise
      ])

      const executionTime = Date.now() - startTime

      if (result === 'TIMEOUT') {
        console.warn('[CreatorReconciliation] Reconciliation timed out', {
          creatorName: creatorData.name,
          timeoutMs: timeout,
          executionTimeMs: executionTime
        })
        return {
          creator: null,
          matchMethod: 'none',
          timedOut: true,
          executionTimeMs: executionTime
        }
      }

      console.log('[CreatorReconciliation] Reconciliation completed', {
        creatorName: creatorData.name,
        matchMethod: result.matchMethod,
        similarity: result.similarity,
        executionTimeMs: executionTime
      })

      return {
        ...result,
        timedOut: false,
        executionTimeMs: executionTime
      }
    } catch (error) {
      const executionTime = Date.now() - startTime
      console.error('[CreatorReconciliation] Reconciliation failed', {
        creatorName: creatorData.name,
        error: error instanceof Error ? error.message : String(error),
        executionTimeMs: executionTime
      })

      return {
        creator: null,
        matchMethod: 'none',
        timedOut: false,
        executionTimeMs: executionTime
      }
    }
  }

  /**
   * Perform the actual reconciliation logic
   */
  private async performReconciliation(
    creatorData: Partial<Creator>,
    options: ReconciliationOptions
  ): Promise<Omit<ReconciliationResult, 'timedOut' | 'executionTimeMs'>> {
    // Tier 1: Exact ID match
    if (creatorData.id) {
      const exactMatch = await this.repository.getCreator(creatorData.id)
      if (exactMatch) {
        console.log('[CreatorReconciliation] Tier 1: Exact ID match', { id: creatorData.id })
        return {
          creator: exactMatch,
          matchMethod: 'exact_id',
          similarity: 1.0
        }
      }
    }

    // Tier 2: Handle match (cross-platform)
    let handle = creatorData.handle

    // If no handle provided but we have a subscription URL, try to extract it
    if (!handle && options.subscriptionUrl) {
      handle = await extractHandleFromSubscriptionUrl(
        options.subscriptionUrl,
        options.youtubeApi
      )
      console.log('[CreatorReconciliation] Extracted handle from URL', {
        url: options.subscriptionUrl,
        handle
      })
    }

    if (handle) {
      const handleMatch = await this.repository.findByHandle(handle)
      if (handleMatch) {
        console.log('[CreatorReconciliation] Tier 2: Handle match', { handle })
        return {
          creator: handleMatch,
          matchMethod: 'handle',
          similarity: 1.0
        }
      }
    }

    // Extract domain for domain-based matching
    const domain = creatorData.url ? this.extractDomain(creatorData.url) : null

    // Tier 3: Domain + fuzzy name match (same platform)
    if (domain && creatorData.name) {
      const domainMatches = await this.repository.findByDomainPattern(domain)

      for (const candidate of domainMatches) {
        // Normalize names before comparison
        const name1 = normalizeCreatorNameWithSuffixes(creatorData.name)
        const name2 = normalizeCreatorNameWithSuffixes(candidate.name)

        const nameMatch = calculateNameSimilarity(name1, name2)

        if (nameMatch.match && nameMatch.similarity > 0.85) {
          console.log('[CreatorReconciliation] Tier 3: Domain + fuzzy name match', {
            domain,
            name1,
            name2,
            similarity: nameMatch.similarity
          })
          return {
            creator: candidate,
            matchMethod: 'domain_fuzzy',
            similarity: nameMatch.similarity
          }
        }
      }
    }

    // Tier 4: Related domains + high similarity (cross-platform)
    if (domain && creatorData.name) {
      const relatedDomains = this.getRelatedDomains(domain)

      for (const relatedDomain of relatedDomains) {
        const candidates = await this.repository.findByDomainPattern(relatedDomain)

        for (const candidate of candidates) {
          const name1 = normalizeCreatorNameWithSuffixes(creatorData.name)
          const name2 = normalizeCreatorNameWithSuffixes(candidate.name)

          const nameMatch = calculateNameSimilarity(name1, name2)

          // Require higher threshold for cross-platform matching
          if (nameMatch.match && nameMatch.similarity > 0.9) {
            console.log('[CreatorReconciliation] Tier 4: Related domain + high similarity', {
              domain,
              relatedDomain,
              name1,
              name2,
              similarity: nameMatch.similarity
            })
            return {
              creator: candidate,
              matchMethod: 'related_domain',
              similarity: nameMatch.similarity
            }
          }
        }
      }
    }

    // Tier 5: Cross-platform substring match (for content creators on multiple platforms)
    // This handles cases like "All-In Podcast" (YouTube) matching "All-In with Chamath..." (Spotify)
    if (creatorData.name && creatorData.name.length >= 5) {
      // Get recent creators to search (limit scope for performance)
      const allCreators = await this.repository.getRecentCreators(200)
      
      const name1Normalized = normalizeCreatorNameWithSuffixes(creatorData.name)
      const name1Core = normalizeCreatorName(name1Normalized)
      
      // Extract meaningful words (skip common words)
      const commonWords = new Set(['the', 'a', 'an', 'with', 'and', 'or', 'podcast', 'show', 'channel'])
      const name1Words = name1Core.split(' ').filter((w: string) => w.length > 2 && !commonWords.has(w))
      
      let bestMatch: { creator: Creator; similarity: number } | null = null
      
      for (const candidate of allCreators) {
        // Skip if same platform (Tier 6 will handle that)
        if (candidate.platforms?.includes(options.platform || '')) {
          continue
        }
        
        const name2Normalized = normalizeCreatorNameWithSuffixes(candidate.name)
        const name2Core = normalizeCreatorName(name2Normalized)
        const name2Words = name2Core.split(' ').filter((w: string) => w.length > 2 && !commonWords.has(w))
        
        // Check for significant word overlap
        const matchingWords = name1Words.filter((w: string) => name2Words.includes(w))
        
        if (matchingWords.length >= 2 || (matchingWords.length >= 1 && name1Words.length <= 2)) {
          // Found significant word overlap - calculate more detailed similarity
          const nameMatch = calculateNameSimilarity(name1Normalized, name2Normalized)
          
          // Boost similarity based on word overlap
          const wordOverlapRatio = matchingWords.length / Math.max(name1Words.length, name2Words.length)
          const boostedSimilarity = Math.min(1.0, nameMatch.similarity + (wordOverlapRatio * 0.3))
          
          // Lower threshold for cross-platform (0.5 instead of 0.85)
          if (boostedSimilarity > 0.5 && (!bestMatch || boostedSimilarity > bestMatch.similarity)) {
            bestMatch = { creator: candidate, similarity: boostedSimilarity }
          }
        }
      }
      
      if (bestMatch) {
        console.log('[CreatorReconciliation] Tier 5: Cross-platform substring match', {
          candidateName: creatorData.name,
          matchedName: bestMatch.creator.name,
          matchedPlatforms: bestMatch.creator.platforms,
          similarity: bestMatch.similarity
        })
        return {
          creator: bestMatch.creator,
          matchMethod: 'platform_fuzzy',
          similarity: bestMatch.similarity
        }
      }
    }
    
    // Tier 6: Same-platform fuzzy match (strictest fallback)
    if (options.platform && creatorData.name) {
      const platformCreators = await this.repository.findByPlatform(options.platform)

      let bestMatch: Creator | null = null
      let bestSimilarity = 0.95 // Very high threshold when no other context

      for (const candidate of platformCreators) {
        const name1 = normalizeCreatorNameWithSuffixes(creatorData.name)
        const name2 = normalizeCreatorNameWithSuffixes(candidate.name)

        const nameMatch = calculateNameSimilarity(name1, name2)

        if (nameMatch.match && nameMatch.similarity > bestSimilarity) {
          bestMatch = candidate
          bestSimilarity = nameMatch.similarity
        }
      }

      if (bestMatch) {
        console.log('[CreatorReconciliation] Tier 6: Same-platform fuzzy match', {
          platform: options.platform,
          name: creatorData.name,
          matchedName: bestMatch.name,
          similarity: bestSimilarity
        })
        return {
          creator: bestMatch,
          matchMethod: 'platform_fuzzy',
          similarity: bestSimilarity
        }
      }
    }

    console.log('[CreatorReconciliation] No match found', {
      creatorName: creatorData.name,
      handle,
      domain,
      platform: options.platform
    })

    return {
      creator: null,
      matchMethod: 'none'
    }
  }

  /**
   * Reconcile a content source to a creator (Two-Tier Model)
   * 
   * This method implements the two-tier model reconciliation:
   * 1. Extract creator info from the content source
   * 2. Find existing creator match using extracted data
   * 3. If match found, link content source to creator and update metadata
   * 4. If no match, create new creator from extracted data
   * 
   * @param contentSource - Content source to reconcile
   * @param options - Reconciliation options
   * @returns The matched or created creator
   */
  async reconcileContentSource(
    contentSource: ContentSource,
    options: ReconciliationOptions = {}
  ): Promise<{
    creator: Creator
    isNew: boolean
    matchMethod: string
    confidence: number
  }> {
    console.log('[CreatorReconciliation] Reconciling content source:', {
      id: contentSource.id,
      platform: contentSource.platform,
      sourceType: contentSource.sourceType,
      title: contentSource.title
    })

    // Step 1: Extract creator info from content source
    const extractionResult = await this.extractionService.extractCreator(contentSource)

    if (!extractionResult.success || !extractionResult.creator) {
      throw new Error(`Failed to extract creator from content source: ${extractionResult.error}`)
    }

    const extractedCreator = extractionResult.creator

    console.log('[CreatorReconciliation] Creator extracted:', {
      name: extractedCreator.name,
      handle: extractedCreator.handle,
      platform: extractedCreator.platform,
      confidence: extractedCreator.extractionConfidence
    })

    // Step 2: Try to find existing creator match
    const reconciliationResult = await this.reconcileCreator(
      {
        name: extractedCreator.name,
        handle: extractedCreator.handle,
        url: extractedCreator.url
      },
      {
        ...options,
        platform: extractedCreator.platform
      }
    )

    let creator: Creator
    let isNew = false
    let matchMethod = reconciliationResult.matchMethod || 'none'
    let confidence = reconciliationResult.similarity || extractedCreator.extractionConfidence

    if (reconciliationResult.creator) {
      // Step 3a: Match found - link content source and update metadata
      creator = reconciliationResult.creator

      console.log('[CreatorReconciliation] Existing creator matched:', {
        creatorId: creator.id,
        matchMethod,
        similarity: reconciliationResult.similarity
      })

      // Link content source to creator
      await this.linkContentSourceToCreator(contentSource, creator, extractedCreator)

    } else {
      // Step 3b: No match - create new creator
      console.log('[CreatorReconciliation] No match found, creating new creator')

      creator = await this.createCreatorFromExtraction(extractedCreator, contentSource)
      isNew = true
      matchMethod = 'new_creator'
    }

    return {
      creator,
      isNew,
      matchMethod,
      confidence
    }
  }

  /**
   * Link a content source to a creator and update metadata
   * Updates alternative names, platform handles, and content source IDs
   */
  private async linkContentSourceToCreator(
    contentSource: ContentSource,
    creator: Creator,
    extractedCreator: ExtractedCreator
  ): Promise<void> {
    console.log('[CreatorReconciliation] Linking content source to creator:', {
      contentSourceId: contentSource.id,
      creatorId: creator.id
    })

    // Update content source with creator_id
    await this.contentSourceRepository.updateContentSource(contentSource.id, {
      creatorId: creator.id
    })

    // Update creator metadata
    const updates: any = {}

    // Add platform if not already present
    const platforms = creator.platforms || []
    if (!platforms.includes(extractedCreator.platform)) {
      updates.platforms = [...platforms, extractedCreator.platform]
    }

    // Add content source ID
    const contentSourceIds = creator.contentSourceIds || []
    if (!contentSourceIds.includes(contentSource.id)) {
      updates.contentSourceIds = [...contentSourceIds, contentSource.id]
    }

    // Add alternative names from extracted creator
    const alternativeNames = creator.alternativeNames || []
    const newAltNames = [
      ...(extractedCreator.alternativeNames || []),
      contentSource.title // Also add the content source title
    ].filter(name => {
      const normalized = name.toLowerCase().trim()
      const creatorNameNormalized = creator.name.toLowerCase().trim()
      // Don't add if it's the same as the creator name or already exists
      return normalized !== creatorNameNormalized && 
             !alternativeNames.some(existing => existing.toLowerCase().trim() === normalized)
    })

    if (newAltNames.length > 0) {
      updates.alternativeNames = [...alternativeNames, ...newAltNames]
    }

    // Add platform handle
    if (extractedCreator.handle) {
      const platformHandles = creator.platformHandles || {}
      if (!platformHandles[extractedCreator.platform]) {
        updates.platformHandles = {
          ...platformHandles,
          [extractedCreator.platform]: extractedCreator.handle
        }
      }
    }

    // Update total subscribers
    if (extractedCreator.subscriberCount) {
      const currentTotal = creator.totalSubscribers || 0
      updates.totalSubscribers = currentTotal + extractedCreator.subscriberCount
    }

    // Set primary platform if not set (first platform wins)
    if (!creator.primaryPlatform && extractedCreator.platform) {
      updates.primaryPlatform = extractedCreator.platform
    }

    // Update reconciliation confidence
    // Use weighted average of existing confidence and new extraction confidence
    const existingConfidence = creator.reconciliationConfidence || 1.0
    const newConfidence = extractedCreator.extractionConfidence
    updates.reconciliationConfidence = (existingConfidence + newConfidence) / 2

    // Apply updates if any
    if (Object.keys(updates).length > 0) {
      await this.repository.updateCreatorConsolidation(creator.id, updates)
      console.log('[CreatorReconciliation] Creator metadata updated:', {
        creatorId: creator.id,
        updates: Object.keys(updates)
      })
    }
  }

  /**
   * Create a new creator from extracted data
   */
  private async createCreatorFromExtraction(
    extractedCreator: ExtractedCreator,
    contentSource: ContentSource
  ): Promise<Creator> {
    console.log('[CreatorReconciliation] Creating new creator:', {
      name: extractedCreator.name,
      platform: extractedCreator.platform
    })

    // Generate creator ID
    const creatorId = `creator:${extractedCreator.platformId}`

    // Create creator
    await this.repository.upsertCreator({
      id: creatorId,
      name: extractedCreator.name,
      handle: extractedCreator.handle,
      avatarUrl: extractedCreator.avatarUrl,
      bio: extractedCreator.bio,
      url: extractedCreator.url,
      platform: extractedCreator.platform,
      verified: extractedCreator.verified,
      subscriberCount: extractedCreator.subscriberCount,
      followerCount: extractedCreator.followerCount
    })

    // Update with two-tier model fields
    const alternativeNames = [
      ...(extractedCreator.alternativeNames || []),
      contentSource.title
    ].filter(name => name.toLowerCase().trim() !== extractedCreator.name.toLowerCase().trim())

    const platformHandles = extractedCreator.handle ? {
      [extractedCreator.platform]: extractedCreator.handle
    } : undefined

    await this.repository.updateCreatorConsolidation(creatorId, {
      alternativeNames: alternativeNames.length > 0 ? alternativeNames : undefined,
      platformHandles,
      contentSourceIds: [contentSource.id],
      primaryPlatform: extractedCreator.platform,
      totalSubscribers: extractedCreator.subscriberCount,
      reconciliationConfidence: extractedCreator.extractionConfidence
    })

    // Link content source to creator
    await this.contentSourceRepository.updateContentSource(contentSource.id, {
      creatorId: creatorId
    })

    console.log('[CreatorReconciliation] New creator created:', {
      creatorId,
      contentSourceId: contentSource.id
    })

    // Fetch and return the updated creator
    const updatedCreator = await this.repository.getCreator(creatorId)
    if (!updatedCreator) {
      throw new Error('Failed to fetch newly created creator')
    }

    return updatedCreator
  }

  /**
   * Batch reconcile multiple content sources
   * Useful for migrations or bulk operations
   */
  async reconcileContentSources(
    contentSources: ContentSource[],
    options: ReconciliationOptions = {}
  ): Promise<Map<string, { creator: Creator; isNew: boolean; matchMethod: string }>> {
    console.log('[CreatorReconciliation] Batch reconciling content sources:', {
      count: contentSources.length
    })

    const results = new Map()

    for (const contentSource of contentSources) {
      try {
        const result = await this.reconcileContentSource(contentSource, options)
        results.set(contentSource.id, result)
      } catch (error) {
        console.error('[CreatorReconciliation] Failed to reconcile content source:', {
          contentSourceId: contentSource.id,
          error: error instanceof Error ? error.message : String(error)
        })
        // Continue with other sources
      }
    }

    console.log('[CreatorReconciliation] Batch reconciliation completed:', {
      total: contentSources.length,
      successful: results.size,
      failed: contentSources.length - results.size
    })

    return results
  }

  /**
   * Create a timeout promise
   */
  private createTimeout(ms: number): Promise<'TIMEOUT'> {
    return new Promise(resolve => setTimeout(() => resolve('TIMEOUT'), ms))
  }

  /**
   * Extract domain from URL
   */
  private extractDomain(url: string): string | null {
    try {
      return new URL(url).hostname.toLowerCase()
    } catch {
      return null
    }
  }

  /**
   * Get related domains for cross-platform matching
   */
  private getRelatedDomains(domain: string): string[] {
    const relatedDomains: Record<string, string[]> = {
      'youtube.com': ['youtu.be'],
      'youtu.be': ['youtube.com'],
      'twitter.com': ['x.com'],
      'x.com': ['twitter.com'],
      'open.spotify.com': ['spotify.com'],
      'spotify.com': ['open.spotify.com']
    }

    return relatedDomains[domain] || []
  }
}
