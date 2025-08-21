export class ContentMatchingService {
  /**
   * Generate a unique fingerprint for content based on normalized metadata
   */
  static async generateContentFingerprint(content: {
    title: string
    episodeNumber?: number
    seasonNumber?: number
    durationSeconds?: number
    publishedAt: Date
  }): Promise<string> {
    // Normalize and hash key content attributes
    const components = [
      this.normalizeTitle(content.title),
      content.episodeNumber || '',
      content.seasonNumber || '',
      content.durationSeconds ? Math.floor(content.durationSeconds / 10) : '', // 10-second buckets for duration tolerance
      this.formatDate(content.publishedAt), // Day-level precision
    ].filter(Boolean).join('|')
    
    // Use Web Crypto API for Cloudflare Workers compatibility
    const encoder = new TextEncoder()
    const data = encoder.encode(components)
    const hashBuffer = await crypto.subtle.digest('SHA-256', data)
    const hashArray = Array.from(new Uint8Array(hashBuffer))
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
    
    return hashHex
  }

  /**
   * Normalize title for matching
   */
  static normalizeTitle(title: string): string {
    return title
      .toLowerCase()
      .replace(/[^\w\s]/g, '') // Remove special characters
      .replace(/\s+/g, ' ') // Normalize whitespace
      .replace(/ep(isode)?\s*\d+/gi, '') // Remove episode markers
      .replace(/s\d+e\d+/gi, '') // Remove season/episode notation
      .trim()
  }

  /**
   * Format date for consistent comparison
   */
  private static formatDate(date: Date): string {
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  }

  /**
   * Generate episode identifier for series content
   */
  static generateEpisodeIdentifier(episodeNumber?: number, seasonNumber?: number): string | undefined {
    if (seasonNumber && episodeNumber) {
      return `S${String(seasonNumber).padStart(2, '0')}E${String(episodeNumber).padStart(2, '0')}`
    }
    if (episodeNumber) {
      return `E${String(episodeNumber).padStart(3, '0')}`
    }
    return undefined
  }

  /**
   * Calculate match confidence between two content items
   */
  static calculateMatchConfidence(
    content1: {
      normalizedTitle?: string
      publisherCanonicalId?: string
      durationSeconds?: number
      publishedAt: Date
      episodeNumber?: number
    },
    content2: {
      normalizedTitle?: string
      publisherCanonicalId?: string
      durationSeconds?: number
      publishedAt: Date
      episodeNumber?: number
    }
  ): { confidence: number; reasons: string[] } {
    const scores: Array<{ factor: string; weight: number; score: number }> = []
    
    // Title similarity (40% weight)
    if (content1.normalizedTitle && content2.normalizedTitle) {
      const titleSimilarity = this.calculateStringSimilarity(
        content1.normalizedTitle,
        content2.normalizedTitle
      )
      scores.push({
        factor: 'title_match',
        weight: 0.40,
        score: titleSimilarity
      })
    }
    
    // Publisher match (30% weight)
    if (content1.publisherCanonicalId && content2.publisherCanonicalId) {
      const publisherMatch = content1.publisherCanonicalId === content2.publisherCanonicalId ? 1 : 0
      scores.push({
        factor: 'publisher_match',
        weight: 0.30,
        score: publisherMatch
      })
    }
    
    // Duration similarity (15% weight)
    if (content1.durationSeconds && content2.durationSeconds) {
      const durationDiff = Math.abs(content1.durationSeconds - content2.durationSeconds)
      const durationScore = Math.max(0, 1 - (durationDiff / content1.durationSeconds))
      scores.push({
        factor: 'duration_match',
        weight: 0.15,
        score: durationScore
      })
    }
    
    // Publish date proximity (10% weight)
    const daysDiff = Math.abs(
      (content1.publishedAt.getTime() - content2.publishedAt.getTime()) / (1000 * 60 * 60 * 24)
    )
    const dateScore = Math.max(0, 1 - (daysDiff / 7)) // Within a week
    scores.push({
      factor: 'date_match',
      weight: 0.10,
      score: dateScore
    })
    
    // Episode number match (5% weight, if applicable)
    if (content1.episodeNumber && content2.episodeNumber) {
      const episodeMatch = content1.episodeNumber === content2.episodeNumber ? 1 : 0
      scores.push({
        factor: 'episode_match',
        weight: 0.05,
        score: episodeMatch
      })
    }
    
    // Calculate weighted average
    const totalScore = scores.reduce((sum, s) => sum + (s.score * s.weight), 0)
    const matchReasons = scores.filter(s => s.score > 0.5).map(s => s.factor)
    
    return {
      confidence: totalScore,
      reasons: matchReasons
    }
  }

  /**
   * Calculate string similarity using Levenshtein distance
   */
  private static calculateStringSimilarity(str1: string, str2: string): number {
    const longer = str1.length > str2.length ? str1 : str2
    const shorter = str1.length > str2.length ? str2 : str1
    
    if (longer.length === 0) return 1.0
    
    const editDistance = this.levenshteinDistance(longer, shorter)
    return (longer.length - editDistance) / longer.length
  }

  /**
   * Calculate Levenshtein distance between two strings
   */
  private static levenshteinDistance(str1: string, str2: string): number {
    const matrix: number[][] = []
    
    for (let i = 0; i <= str2.length; i++) {
      matrix[i] = [i]
    }
    
    for (let j = 0; j <= str1.length; j++) {
      matrix[0][j] = j
    }
    
    for (let i = 1; i <= str2.length; i++) {
      for (let j = 1; j <= str1.length; j++) {
        if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1]
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1, // substitution
            matrix[i][j - 1] + 1,     // insertion
            matrix[i - 1][j] + 1      // deletion
          )
        }
      }
    }
    
    return matrix[str2.length][str1.length]
  }
}

// Known publisher mappings for cross-platform matching
export const KNOWN_PUBLISHER_MAPPINGS = {
  'Joe Rogan Experience': {
    youtube: { id: 'UCzQUP1qoWDoEbmsQxvdjxgQ', name: 'PowerfulJRE' },
    spotify: { id: '4rOoJ6Egrf8K2IrywzwOMk', name: 'The Joe Rogan Experience' }
  },
  'Lex Fridman Podcast': {
    youtube: { id: 'UCSHZKyawb77ixDdsGog4iWA', name: 'Lex Fridman' },
    spotify: { id: '2MAi0BvDc6GTFvKFPXnkCL', name: 'Lex Fridman Podcast' }
  },
  'The Tim Ferriss Show': {
    youtube: { id: 'UCznv7Vf9nBdJYvBagFdAHWw', name: 'Tim Ferriss' },
    spotify: { id: '5qSUyCrk0KjdXAMGHke4Gm', name: 'The Tim Ferriss Show' }
  },
  'Huberman Lab': {
    youtube: { id: 'UC2D2CMWXMOVWx7giW1n3LIg', name: 'Andrew Huberman' },
    spotify: { id: '79CkJF3UJTHFV8Dse3P0kh', name: 'Huberman Lab' }
  },
  'The Daily': {
    youtube: { id: 'UCqnbDFdCpuN8CMEg0VuEBqA', name: 'The New York Times' },
    spotify: { id: '3IM0lmZxpFAY7CwMuv9H4g', name: 'The Daily' }
  }
  // Add more known mappings as discovered
}