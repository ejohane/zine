import { eq, or, sql } from 'drizzle-orm'
import type { D1Database } from '@cloudflare/workers-types'
import { drizzle } from 'drizzle-orm/d1'
import { bookmarks, feedItems } from '../schema'
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
  source: 'bookmark' | 'feed_item'
  createdAt: Date
  updatedAt?: Date
}

export interface MetadataRepository {
  findByUrl(url: string): Promise<ExistingMetadata | null>
  findInBookmarks(url: string): Promise<ExistingMetadata | null>
  findInFeedItems(url: string): Promise<ExistingMetadata | null>
}

export class D1MetadataRepository implements MetadataRepository {
  private db
  
  constructor(d1: D1Database) {
    this.db = drizzle(d1)
  }
  
  async findByUrl(url: string): Promise<ExistingMetadata | null> {
    // Try bookmarks first, then feed items
    const bookmark = await this.findInBookmarks(url)
    if (bookmark) return bookmark
    
    return this.findInFeedItems(url)
  }
  
  async findInBookmarks(url: string): Promise<ExistingMetadata | null> {
    const normalized = normalizeUrl(url)
    const normalizedUrl = normalized.normalized
    
    // Query bookmarks with both original and normalized URL
    const results = await this.db
      .select({
        url: bookmarks.url,
        title: bookmarks.title,
        description: bookmarks.description,
        imageUrl: bookmarks.thumbnailUrl,
        publishedAt: bookmarks.publishedAt,
        createdAt: bookmarks.createdAt,
        updatedAt: bookmarks.updatedAt,
        source: bookmarks.source,
        videoMetadata: bookmarks.videoMetadata,
        articleMetadata: bookmarks.articleMetadata
      })
      .from(bookmarks)
      .where(
        or(
          eq(bookmarks.url, url),
          eq(bookmarks.url, normalizedUrl),
          eq(bookmarks.originalUrl, url),
          eq(bookmarks.originalUrl, normalizedUrl)
        )
      )
      .limit(1)
    
    if (results.length === 0) return null
    
    // Parse metadata for additional fields
    let duration = null
    let viewCount = null
    let author = null
    
    if (results[0].videoMetadata) {
      try {
        const videoMeta = JSON.parse(results[0].videoMetadata)
        duration = videoMeta.duration || null
        viewCount = videoMeta.view_count || null
      } catch {}
    }
    
    if (results[0].articleMetadata) {
      try {
        const articleMeta = JSON.parse(results[0].articleMetadata)
        author = articleMeta.author_name || null
      } catch {}
    }
    
    return {
      url: results[0].url,
      normalizedUrl,
      title: results[0].title,
      description: results[0].description,
      imageUrl: results[0].imageUrl,
      publishedAt: results[0].publishedAt,
      author,
      provider: results[0].source,
      duration,
      viewCount,
      platform: results[0].source,
      source: 'bookmark',
      createdAt: results[0].createdAt,
      updatedAt: results[0].updatedAt
    }
  }
  
  async findInFeedItems(url: string): Promise<ExistingMetadata | null> {
    const normalized = normalizeUrl(url)
    const normalizedUrl = normalized.normalized
    
    // Query feed items with both original and normalized URL
    const results = await this.db
      .select({
        url: feedItems.externalUrl,
        title: feedItems.title,
        description: feedItems.description,
        imageUrl: feedItems.thumbnailUrl,
        publishedAt: feedItems.publishedAt,
        duration: feedItems.durationSeconds,
        createdAt: feedItems.createdAt,
        subscriptionId: feedItems.subscriptionId
      })
      .from(feedItems)
      .where(
        or(
          eq(feedItems.externalUrl, url),
          eq(feedItems.externalUrl, normalizedUrl)
        )
      )
      .limit(1)
    
    if (results.length === 0) return null
    
    // Determine provider from subscription
    let provider = 'unknown'
    const subscriptionId = results[0].subscriptionId
    if (subscriptionId.startsWith('spotify:')) {
      provider = 'spotify'
    } else if (subscriptionId.startsWith('youtube:')) {
      provider = 'youtube'
    }
    
    return {
      url: results[0].url,
      normalizedUrl,
      title: results[0].title,
      description: results[0].description,
      imageUrl: results[0].imageUrl,
      publishedAt: results[0].publishedAt,
      author: null,
      provider,
      duration: results[0].duration,
      viewCount: null,
      platform: provider,
      source: 'feed_item',
      createdAt: results[0].createdAt
    }
  }
  
  /**
   * Optimized composite query using UNION for single database hit
   * This is more efficient than two separate queries
   */
  async findByUrlOptimized(url: string): Promise<ExistingMetadata | null> {
    const normalized = normalizeUrl(url)
    const normalizedUrl = normalized.normalized
    
    // Raw SQL query with UNION for optimal performance
    const query = sql`
      WITH metadata AS (
        SELECT 
          url,
          title,
          description,
          thumbnail_url as imageUrl,
          published_at as publishedAt,
          NULL as author,
          source as provider,
          NULL as duration,
          NULL as viewCount,
          source as platform,
          'bookmark' as source,
          created_at as createdAt,
          updated_at as updatedAt
        FROM bookmarks
        WHERE url = ${url} OR url = ${normalizedUrl} OR original_url = ${url} OR original_url = ${normalizedUrl}
        
        UNION ALL
        
        SELECT 
          external_url as url,
          title,
          description,
          thumbnail_url as imageUrl,
          published_at as publishedAt,
          NULL as author,
          CASE
            WHEN subscription_id LIKE 'spotify:%' THEN 'spotify'
            WHEN subscription_id LIKE 'youtube:%' THEN 'youtube'
            ELSE 'unknown'
          END as provider,
          duration_seconds as duration,
          NULL as viewCount,
          CASE
            WHEN subscription_id LIKE 'spotify:%' THEN 'spotify'
            WHEN subscription_id LIKE 'youtube:%' THEN 'youtube'
            ELSE 'unknown'
          END as platform,
          'feed_item' as source,
          created_at as createdAt,
          NULL as updatedAt
        FROM feed_items
        WHERE external_url = ${url} OR external_url = ${normalizedUrl}
      )
      SELECT * FROM metadata
      ORDER BY createdAt DESC
      LIMIT 1
    `
    
    const results = await this.db.all(query)
    
    if (results.length === 0) return null
    
    const result = results[0] as any
    
    return {
      url: result.url,
      normalizedUrl,
      title: result.title,
      description: result.description,
      imageUrl: result.imageUrl,
      publishedAt: result.publishedAt ? new Date(result.publishedAt) : null,
      author: result.author,
      provider: result.provider,
      duration: result.duration,
      viewCount: result.viewCount,
      platform: result.platform,
      source: result.source as 'bookmark' | 'feed_item',
      createdAt: new Date(result.createdAt),
      updatedAt: result.updatedAt ? new Date(result.updatedAt) : undefined
    }
  }
}