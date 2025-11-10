/**
 * Creator name normalization and similarity utilities
 * Ported from packages/shared/src/creator-service.ts for database reconciliation
 */

export interface NameMatchResult {
  match: boolean
  similarity: number
  method: 'exact' | 'fuzzy' | 'substring' | 'none'
}

/**
 * Normalize creator name for comparison
 * Removes special characters, normalizes whitespace, converts to lowercase
 * 
 * Examples:
 * - "@Creator Name" -> "creator name"
 * - "Creator   Name!!" -> "creator name"
 * - "Creator - Official Channel" -> "creator official channel"
 */
export function normalizeCreatorName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^\w\s]/g, '') // Remove punctuation
    .replace(/\s+/g, ' ')    // Normalize whitespace to single space
    .trim()
}

/**
 * Normalize creator name by removing common suffixes and prefixes
 * Used for matching creators across platforms where names may vary slightly
 * 
 * Examples:
 * - "@username" -> "username"
 * - "Creator Official" -> "Creator"
 * - "Channel Name - Music" -> "Channel Name"
 * - "Podcast Name - Podcast" -> "Podcast Name"
 */
export function normalizeCreatorNameWithSuffixes(name: string): string {
  let normalized = name.trim()
  
  // Remove @ prefix
  normalized = normalized.replace(/^@/, '')
  
  // Remove common suffixes (case insensitive)
  normalized = normalized.replace(/\s+(?:Official|Channel|Music|Podcast|VEVO)$/i, '')
  
  return normalized
}

/**
 * Calculate Levenshtein distance between two strings
 * Returns the minimum number of single-character edits (insertions, deletions, or substitutions)
 * required to change one string into the other.
 * 
 * Used for fuzzy matching of creator names when exact matching fails.
 * 
 * @param str1 - First string
 * @param str2 - Second string  
 * @returns The edit distance between the two strings
 */
export function levenshteinDistance(str1: string, str2: string): number {
  const m = str1.length
  const n = str2.length

  // Create matrix
  const dp: number[][] = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0))

  // Initialize first row and column
  for (let i = 0; i <= m; i++) dp[i][0] = i
  for (let j = 0; j <= n; j++) dp[0][j] = j

  // Fill matrix using dynamic programming
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (str1[i - 1] === str2[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1]
      } else {
        dp[i][j] = Math.min(
          dp[i - 1][j] + 1,      // deletion
          dp[i][j - 1] + 1,      // insertion
          dp[i - 1][j - 1] + 1   // substitution
        )
      }
    }
  }

  return dp[m][n]
}

/**
 * Calculate name similarity score using multiple matching strategies
 * Returns a score between 0 and 1, where 1 is an exact match
 * 
 * Matching strategies (in order):
 * 1. Exact match: normalized names are identical
 * 2. Substring match: one name contains the other
 * 3. Fuzzy match: Levenshtein distance-based similarity
 * 
 * @param name1 - First creator name
 * @param name2 - Second creator name
 * @returns NameMatchResult with match status, similarity score, and method used
 */
export function calculateNameSimilarity(name1: string, name2: string): NameMatchResult {
  const n1 = normalizeCreatorName(name1)
  const n2 = normalizeCreatorName(name2)

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
  const distance = levenshteinDistance(n1, n2)
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
 * Async-compatible version of calculateNameSimilarity
 * Useful for database contexts where other operations may be async
 * 
 * @param name1 - First creator name
 * @param name2 - Second creator name
 * @returns Promise resolving to NameMatchResult
 */
export async function calculateNameSimilarityAsync(
  name1: string,
  name2: string
): Promise<NameMatchResult> {
  return calculateNameSimilarity(name1, name2)
}
