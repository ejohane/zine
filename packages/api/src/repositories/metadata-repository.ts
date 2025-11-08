import { drizzle } from 'drizzle-orm/d1'
import { eq, or } from 'drizzle-orm'
import { bookmarks, feedItems, content, creators } from '../schema'
import { normalizeUrl } from '@zine/shared'

export interface ExistingMetadata {
  url: string
  normalizedUrl: string
  title: string | null
  description: string | null
  imageUrl: string | null
  publishedAt: Date | null
  author: string | null
  provider: string | null
  duration: number | null
  viewCount: number | null
  platform: string | null
  source: 'bookmark' | 'feed'
  createdAt: Date
  updatedAt: Date
}

export class MetadataRepository {
  private db: ReturnType<typeof drizzle>
  
  constructor(database: D1Database) {
    this.db = drizzle(database)
  }
  
  /**
   * Check if metadata already exists for a URL
   * Searches in both bookmarks and feed items with normalized URL matching
   */
  async findExistingMetadata(url: string): Promise<ExistingMetadata | null> {
    // Try bookmarks first (user's own data is priority)
    const bookmarkData = await this.findInBookmarks(url)
    if (bookmarkData) {
      return bookmarkData
    }
    
    // Then check feed items (shared subscription data)
    
    return this.findInFeedItems(url)
  }
  
  async findInBookmarks(url: string): Promise<ExistingMetadata | null> {
    const normalized = normalizeUrl(url)
    const normalizedUrl = normalized.normalized
    
    // Query bookmarks joined with content table
    const results = await this.db
      .select({
        bookmark: bookmarks,
        content: content,
        creator: creators
      })
      .from(bookmarks)
      .innerJoin(content, eq(bookmarks.contentId, content.id))
      .leftJoin(creators, eq(content.creatorId, creators.id))
      .where(
        or(
          eq(content.url, url),
          eq(content.url, normalizedUrl),
          eq(content.canonicalUrl, url),
          eq(content.canonicalUrl, normalizedUrl)
        )
      )
      .limit(1)
    
    if (results.length === 0) return null
    
    const result = results[0]
    
    // Parse metadata for additional fields
    let duration = result.content.durationSeconds
    let viewCount = result.content.viewCount
    let author = result.creator?.name
    
    // Try to get more data from metadata fields if available
    if (result.content.statisticsMetadata) {
      try {
        const stats = JSON.parse(result.content.statisticsMetadata)
        viewCount = stats.viewCount || viewCount
      } catch {}
    }
    
    if (result.content.technicalMetadata) {
      try {
        const tech = JSON.parse(result.content.technicalMetadata)
        duration = tech.duration || duration
      } catch {}
    }
    
    return {
      url: result.content.url,
      normalizedUrl: result.content.canonicalUrl || normalizedUrl,
      title: result.content.title,
      description: result.content.description,
      imageUrl: result.content.thumbnailUrl,
      publishedAt: result.content.publishedAt,
      author: author || null,
      provider: result.content.provider,
      duration,
      viewCount,
      platform: result.content.provider,
      source: 'bookmark',
      createdAt: result.content.createdAt,
      updatedAt: result.content.updatedAt
    }
  }
  
  async findInFeedItems(url: string): Promise<ExistingMetadata | null> {
    const normalized = normalizeUrl(url)
    const normalizedUrl = normalized.normalized
    
    // Query feed items joined with content table
    const results = await this.db
      .select({
        feedItem: feedItems,
        content: content,
        creator: creators
      })
      .from(feedItems)
      .innerJoin(content, eq(feedItems.contentId, content.id))
      .leftJoin(creators, eq(content.creatorId, creators.id))
      .where(
        or(
          eq(content.url, url),
          eq(content.url, normalizedUrl),
          eq(content.canonicalUrl, url),
          eq(content.canonicalUrl, normalizedUrl)
        )
      )
      .limit(1)
    
    if (results.length === 0) return null
    
    const result = results[0]
    
    // Parse metadata for additional fields
    let duration = result.content.durationSeconds
    let viewCount = result.content.viewCount
    let author = result.creator?.name
    
    // Try to get more data from metadata fields if available
    if (result.content.statisticsMetadata) {
      try {
        const stats = JSON.parse(result.content.statisticsMetadata)
        viewCount = stats.viewCount || viewCount
      } catch {}
    }
    
    if (result.content.technicalMetadata) {
      try {
        const tech = JSON.parse(result.content.technicalMetadata)
        duration = tech.duration || duration
      } catch {}
    }
    
    return {
      url: result.content.url,
      normalizedUrl: result.content.canonicalUrl || normalizedUrl,
      title: result.content.title,
      description: result.content.description,
      imageUrl: result.content.thumbnailUrl,
      publishedAt: result.content.publishedAt,
      author: author || null,
      provider: result.content.provider,
      duration,
      viewCount,
      platform: result.content.provider,
      source: 'feed',
      createdAt: result.content.createdAt,
      updatedAt: result.content.updatedAt
    }
  }
  
  /**
   * Get metadata stats for dashboard
   */
  async getMetadataStats(): Promise<{
    totalBookmarks: number
    totalFeedItems: number
    bookmarksWithMetadata: number
    feedItemsWithMetadata: number
  }> {
    // Count total bookmarks
    const bookmarksCount = await this.db
      .select({
        total: content.id,
        hasMetadata: content.enrichmentMetadata
      })
      .from(bookmarks)
      .innerJoin(content, eq(bookmarks.contentId, content.id))
    
    // Count total feed items
    const feedItemsCount = await this.db
      .select({
        total: content.id,
        hasMetadata: content.enrichmentMetadata
      })
      .from(feedItems)
      .innerJoin(content, eq(feedItems.contentId, content.id))
    
    const totalBookmarks = bookmarksCount.length
    const bookmarksWithMetadata = bookmarksCount.filter(b => b.hasMetadata).length
    
    const totalFeedItems = feedItemsCount.length
    const feedItemsWithMetadata = feedItemsCount.filter(f => f.hasMetadata).length
    
    return {
      totalBookmarks,
      totalFeedItems,
      bookmarksWithMetadata,
      feedItemsWithMetadata
    }
  }
}