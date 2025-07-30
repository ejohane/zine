import { FeedItem } from '@zine/shared'

/**
 * LRU cache for feed item deduplication
 * Provides sub-millisecond lookups for recent items
 */
export class DeduplicationCache {
  private cache: Map<string, CacheEntry>
  private readonly maxSize: number
  private readonly ttlMs: number
  private hits = 0
  private misses = 0

  constructor(options: {
    maxSize?: number
    ttlMinutes?: number
  } = {}) {
    this.maxSize = options.maxSize || 10000
    this.ttlMs = (options.ttlMinutes || 60) * 60 * 1000
    this.cache = new Map()
  }

  /**
   * Check if a feed item exists in cache
   */
  has(subscriptionId: string, externalId: string): boolean {
    const key = this.makeKey(subscriptionId, externalId)
    const entry = this.cache.get(key)

    if (!entry) {
      this.misses++
      return false
    }

    // Check if entry is expired
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key)
      this.misses++
      return false
    }

    // Move to end (most recently used)
    this.cache.delete(key)
    this.cache.set(key, entry)
    this.hits++
    return true
  }

  /**
   * Add a feed item to cache
   */
  add(feedItem: FeedItem): void {
    const key = this.makeKey(feedItem.subscriptionId, feedItem.externalId)
    
    // Evict oldest entry if at capacity
    if (this.cache.size >= this.maxSize && !this.cache.has(key)) {
      const firstKey = this.cache.keys().next().value
      if (firstKey) {
        this.cache.delete(firstKey)
      }
    }

    this.cache.set(key, {
      feedItem,
      expiresAt: Date.now() + this.ttlMs
    })
  }

  /**
   * Add multiple feed items to cache
   */
  addBatch(feedItems: FeedItem[]): void {
    for (const item of feedItems) {
      this.add(item)
    }
  }

  /**
   * Warm cache with recent items
   */
  warmCache(recentItems: Map<string, Set<string>>): void {
    let warmedCount = 0
    const expiresAt = Date.now() + this.ttlMs

    for (const [subscriptionId, externalIds] of recentItems) {
      for (const externalId of externalIds) {
        if (warmedCount >= this.maxSize) return

        const key = this.makeKey(subscriptionId, externalId)
        this.cache.set(key, {
          feedItem: null, // We only need to know it exists
          expiresAt
        })
        warmedCount++
      }
    }

    console.log(`[DeduplicationCache] Warmed cache with ${warmedCount} recent items`)
  }

  /**
   * Clear expired entries
   */
  evictExpired(): number {
    const now = Date.now()
    let evicted = 0

    for (const [key, entry] of this.cache) {
      if (now > entry.expiresAt) {
        this.cache.delete(key)
        evicted++
      }
    }

    return evicted
  }

  /**
   * Get cache statistics
   */
  getStats(): CacheStats {
    const total = this.hits + this.misses
    const hitRate = total > 0 ? (this.hits / total) * 100 : 0

    return {
      size: this.cache.size,
      maxSize: this.maxSize,
      hits: this.hits,
      misses: this.misses,
      hitRate: Math.round(hitRate * 100) / 100,
      ttlMinutes: this.ttlMs / 60000
    }
  }

  /**
   * Reset cache statistics
   */
  resetStats(): void {
    this.hits = 0
    this.misses = 0
  }

  /**
   * Clear entire cache
   */
  clear(): void {
    this.cache.clear()
    this.resetStats()
  }

  /**
   * Get cache size
   */
  get size(): number {
    return this.cache.size
  }

  private makeKey(subscriptionId: string, externalId: string): string {
    return `${subscriptionId}:${externalId}`
  }
}

interface CacheEntry {
  feedItem: FeedItem | null
  expiresAt: number
}

export interface CacheStats {
  size: number
  maxSize: number
  hits: number
  misses: number
  hitRate: number
  ttlMinutes: number
}