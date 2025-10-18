/**
 * Creator resolution and normalization service
 */

import type { Creator } from './types'
import { DateNormalizer } from './date-normalizer'

export interface CreatorResolutionResult {
  resolved: Creator
  wasNormalized: boolean
  duplicateOf?: string
  similarityScore?: number
}

export interface NameMatchResult {
  match: boolean
  similarity: number
  method: 'exact' | 'fuzzy' | 'substring' | 'none'
}

/**
 * Service for resolving and normalizing creator information across platforms
 */
export class CreatorService {
  private creatorCache = new Map<string, Creator>()

  /**
   * Resolve and normalize creator information
   */
  resolveCreator(creator: Creator): CreatorResolutionResult {
    // Normalize the creator data
    const normalized = this.normalizeCreator(creator)
    
    // Check for existing creators (duplicate detection)
    const existing = this.findExistingCreator(normalized)
    
    if (existing) {
      // Merge with existing creator data
      const merged = this.mergeCreators(existing, normalized)
      this.creatorCache.set(merged.id, merged)
      
      return {
        resolved: merged,
        wasNormalized: true,
        duplicateOf: existing.id !== normalized.id ? existing.id : undefined
      }
    }

    // Cache the normalized creator
    this.creatorCache.set(normalized.id, normalized)
    
    return {
      resolved: normalized,
      wasNormalized: normalized.id !== creator.id || normalized.name !== creator.name
    }
  }

  /**
   * Normalize creator data (clean up names, URLs, handles)
   */
  private normalizeCreator(creator: Creator): Creator {
    // Normalize name
    let normalizedName = creator.name.trim()
    
    // Remove common prefixes/suffixes
    normalizedName = normalizedName.replace(/^@/, '') // Remove @ prefix
    normalizedName = normalizedName.replace(/\s+(?:Official|Channel|Music|Podcast)$/i, '') // Remove common suffixes
    
    // Normalize handle
    let normalizedHandle = creator.handle?.trim()
    if (normalizedHandle) {
      normalizedHandle = normalizedHandle.startsWith('@') ? normalizedHandle : `@${normalizedHandle}`
    } else if (creator.name.startsWith('@')) {
      normalizedHandle = creator.name
      normalizedName = creator.name.replace(/^@/, '')
    }

    // Normalize URL
    let normalizedUrl = creator.url
    if (normalizedUrl) {
      try {
        const url = new URL(normalizedUrl)
        // Remove tracking parameters
        url.searchParams.delete('utm_source')
        url.searchParams.delete('utm_medium')
        url.searchParams.delete('utm_campaign')
        url.searchParams.delete('ref')
        normalizedUrl = url.toString()
      } catch {
        // Keep original URL if parsing fails
      }
    }

    // Generate normalized ID based on platform and name
    const normalizedId = this.generateNormalizedId(creator.id, normalizedName, normalizedHandle)

    return {
      ...creator,
      id: normalizedId,
      name: normalizedName,
      handle: normalizedHandle,
      url: normalizedUrl
    }
  }

  /**
   * Generate a normalized ID for the creator
   */
  private generateNormalizedId(originalId: string, name: string, handle?: string): string {
    // Extract platform from original ID
    const platform = originalId.split(':')[0]
    
    // Use handle if available, otherwise use normalized name
    const identifier = handle ? handle.replace('@', '') : name.toLowerCase().replace(/\s+/g, '')
    
    return `${platform}:${identifier}`
  }

  /**
   * Normalize name for comparison
   */
  private normalizeName(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^\w\s]/g, '') // Remove punctuation
      .replace(/\s+/g, ' ') // Normalize whitespace
      .trim()
  }

  /**
   * Calculate Levenshtein distance between two strings
   */
  private levenshteinDistance(str1: string, str2: string): number {
    const m = str1.length
    const n = str2.length

    // Create matrix
    const dp: number[][] = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0))

    // Initialize first row and column
    for (let i = 0; i <= m; i++) dp[i][0] = i
    for (let j = 0; j <= n; j++) dp[0][j] = j

    // Fill matrix
    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        if (str1[i - 1] === str2[j - 1]) {
          dp[i][j] = dp[i - 1][j - 1]
        } else {
          dp[i][j] = Math.min(
            dp[i - 1][j] + 1,    // deletion
            dp[i][j - 1] + 1,    // insertion
            dp[i - 1][j - 1] + 1 // substitution
          )
        }
      }
    }

    return dp[m][n]
  }

  /**
   * Calculate name similarity score (0-1)
   */
  calculateNameSimilarity(name1: string, name2: string): NameMatchResult {
    const n1 = this.normalizeName(name1)
    const n2 = this.normalizeName(name2)

    // Exact match
    if (n1 === n2) {
      return { match: true, similarity: 1.0, method: 'exact' }
    }

    // Substring match
    if (n1.includes(n2) || n2.includes(n1)) {
      // Calculate ratio of shorter to longer
      const shorter = Math.min(n1.length, n2.length)
      const longer = Math.max(n1.length, n2.length)
      const similarity = shorter / longer
      return {
        match: similarity > 0.7,
        similarity,
        method: 'substring'
      }
    }

    // Fuzzy match using Levenshtein distance
    const distance = this.levenshteinDistance(n1, n2)
    const maxLength = Math.max(n1.length, n2.length)
    const similarity = 1 - (distance / maxLength)

    // Consider it a match if similarity > 0.85
    return {
      match: similarity > 0.85,
      similarity,
      method: similarity > 0.85 ? 'fuzzy' : 'none'
    }
  }

  /**
   * Find existing creator by various matching strategies
   */
  private findExistingCreator(creator: Creator): Creator | undefined {
    // Exact ID match
    const exactMatch = this.creatorCache.get(creator.id)
    if (exactMatch) {
      return exactMatch
    }

    // Track best fuzzy match
    let bestMatch: Creator | undefined
    let bestSimilarity = 0.85 // Minimum threshold for fuzzy matching

    // Find by similar criteria
    for (const [, existingCreator] of this.creatorCache) {
      // 1. Same handle across platforms (e.g., @username on Twitter and YouTube)
      if (creator.handle && existingCreator.handle &&
          creator.handle.toLowerCase() === existingCreator.handle.toLowerCase()) {
        return existingCreator
      }

      // 2. Extract domains for domain-based matching
      const creatorDomain = creator.url ? this.extractDomain(creator.url) : null
      const existingDomain = existingCreator.url ? this.extractDomain(existingCreator.url) : null

      // 3. Same domain - use fuzzy name matching
      if (creatorDomain && existingDomain && creatorDomain === existingDomain) {
        const nameMatch = this.calculateNameSimilarity(creator.name, existingCreator.name)
        if (nameMatch.match && nameMatch.similarity > bestSimilarity) {
          bestMatch = existingCreator
          bestSimilarity = nameMatch.similarity
        }
      }

      // 4. Related domains (e.g., youtube.com and youtu.be) - require higher similarity
      if (creatorDomain && existingDomain && this.areRelatedDomains(creatorDomain, existingDomain)) {
        const nameMatch = this.calculateNameSimilarity(creator.name, existingCreator.name)
        // Require higher threshold (0.9) for cross-platform matching
        if (nameMatch.match && nameMatch.similarity > 0.9) {
          bestMatch = existingCreator
          bestSimilarity = nameMatch.similarity
        }
      }

      // 5. No domain available - use fuzzy matching with high threshold
      if (!creatorDomain || !existingDomain) {
        const nameMatch = this.calculateNameSimilarity(creator.name, existingCreator.name)
        // Require very high threshold (0.95) when no domain to verify
        if (nameMatch.match && nameMatch.similarity > 0.95) {
          bestMatch = existingCreator
          bestSimilarity = nameMatch.similarity
        }
      }
    }

    return bestMatch
  }

  /**
   * Merge creator data, preferring more complete information
   */
  private mergeCreators(existing: Creator, newCreator: Creator): Creator {
    return {
      id: existing.id, // Keep existing ID
      name: this.preferComplete(existing.name, newCreator.name) || existing.name,
      handle: this.preferComplete(existing.handle, newCreator.handle) || existing.handle,
      avatarUrl: this.preferComplete(existing.avatarUrl, newCreator.avatarUrl) || existing.avatarUrl,
      bio: this.preferComplete(existing.bio, newCreator.bio) || existing.bio,
      url: this.preferComplete(existing.url, newCreator.url) || existing.url,
      platforms: this.mergePlatforms(existing.platforms, newCreator.platforms),
      externalLinks: this.mergeExternalLinks(existing.externalLinks, newCreator.externalLinks),
      createdAt: existing.createdAt || newCreator.createdAt,
      updatedAt: DateNormalizer.now()
    }
  }

  /**
   * Prefer the more complete (longer, non-empty) value
   */
  private preferComplete(a?: string, b?: string): string | undefined {
    if (!a && !b) return undefined
    if (!a) return b
    if (!b) return a
    return a.length >= b.length ? a : b
  }

  /**
   * Merge platform arrays
   */
  private mergePlatforms(existing?: string[], newPlatforms?: string[]): string[] | undefined {
    if (!existing && !newPlatforms) return undefined
    const combined = new Set([...(existing || []), ...(newPlatforms || [])])
    return Array.from(combined)
  }

  /**
   * Merge external links arrays
   */
  private mergeExternalLinks(
    existing?: Array<{ title: string; url: string }>, 
    newLinks?: Array<{ title: string; url: string }>
  ): Array<{ title: string; url: string }> | undefined {
    if (!existing && !newLinks) return undefined
    
    const linkMap = new Map<string, { title: string; url: string }>()
    
    // Add existing links
    existing?.forEach(link => linkMap.set(link.url, link))
    
    // Add new links (may overwrite with better titles)
    newLinks?.forEach(link => {
      const existing = linkMap.get(link.url)
      if (!existing || link.title.length > existing.title.length) {
        linkMap.set(link.url, link)
      }
    })
    
    return Array.from(linkMap.values())
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
   * Check if domains are related (same creator across platforms)
   */
  private areRelatedDomains(domain1: string, domain2: string): boolean {
    // Known related domains for cross-platform creator matching
    const relatedDomains = [
      ['youtube.com', 'youtu.be'],
      ['twitter.com', 'x.com'],
      ['open.spotify.com', 'spotify.com'],
      ['substack.com', 'substackcdn.com']
    ]

    return relatedDomains.some(group => 
      group.includes(domain1) && group.includes(domain2)
    )
  }

  /**
   * Get creator from cache
   */
  getCreator(id: string): Creator | undefined {
    return this.creatorCache.get(id)
  }

  /**
   * Get all cached creators
   */
  getAllCreators(): Creator[] {
    return Array.from(this.creatorCache.values())
  }

  /**
   * Clear cache (useful for testing)
   */
  clearCache(): void {
    this.creatorCache.clear()
  }
}

// Export singleton instance
export const creatorService = new CreatorService()