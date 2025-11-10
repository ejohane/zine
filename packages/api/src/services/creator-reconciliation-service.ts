import { D1Database } from '@cloudflare/workers-types'
import { CreatorRepository, type Creator } from '../repositories/creator-repository'
import { calculateNameSimilarity, normalizeCreatorNameWithSuffixes } from '../utils/creator-matching'
import { extractHandleFromSubscriptionUrl } from '../utils/handle-extraction'
import type { YouTubeAPI } from '../external/youtube-api'

/**
 * Result of creator reconciliation attempt
 */
export interface ReconciliationResult {
  creator: Creator | null
  matchMethod?: 'exact_id' | 'handle' | 'domain_fuzzy' | 'related_domain' | 'platform_fuzzy' | 'none'
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

  constructor(db: D1Database) {
    this.repository = new CreatorRepository(db)
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

    // Tier 5: Platform fuzzy match (fallback)
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
        console.log('[CreatorReconciliation] Tier 5: Platform fuzzy match', {
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
