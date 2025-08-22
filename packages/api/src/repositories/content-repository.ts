/**
 * Content Repository
 * Handles all database operations for the unified content table
 */

import { drizzle } from 'drizzle-orm/d1'
import { eq, and, or, inArray, like, desc, sql } from 'drizzle-orm'
import * as schema from '../schema'
import type { Content, NewContent } from '../schema'

export interface ContentRepositoryOptions {
  limit?: number
  offset?: number
  orderBy?: 'createdAt' | 'updatedAt' | 'publishedAt'
  orderDirection?: 'asc' | 'desc'
}

export interface ContentDeduplicationMatch {
  id: string
  score: number
  reasons: string[]
}

/**
 * Repository for content operations using D1 database
 */
export class ContentRepository {
  private db: ReturnType<typeof drizzle>

  constructor(d1Database: D1Database) {
    this.db = drizzle(d1Database, { schema })
  }

  /**
   * Find content by ID
   */
  async findById(id: string): Promise<Content | null> {
    const results = await this.db
      .select()
      .from(schema.content)
      .where(eq(schema.content.id, id))
      .limit(1)
    
    return results.length > 0 ? results[0] : null
  }

  /**
   * Find content by URL
   */
  async findByUrl(url: string): Promise<Content | null> {
    const results = await this.db
      .select()
      .from(schema.content)
      .where(or(
        eq(schema.content.url, url),
        eq(schema.content.canonicalUrl, url)
      ))
      .limit(1)
    
    return results.length > 0 ? results[0] : null
  }

  /**
   * Find content by fingerprint
   */
  async findByFingerprint(fingerprint: string): Promise<Content[]> {
    return await this.db
      .select()
      .from(schema.content)
      .where(eq(schema.content.contentFingerprint, fingerprint))
  }

  /**
   * Find multiple content items by IDs
   */
  async findByIds(ids: string[]): Promise<Content[]> {
    if (ids.length === 0) return []
    
    // Handle SQLite's 999 variable limit
    const results: Content[] = []
    const chunkSize = 500
    
    for (let i = 0; i < ids.length; i += chunkSize) {
      const chunk = ids.slice(i, i + chunkSize)
      const chunkResults = await this.db
        .select()
        .from(schema.content)
        .where(inArray(schema.content.id, chunk))
      
      results.push(...chunkResults)
    }
    
    return results
  }

  /**
   * Upsert content (insert or update)
   */
  async upsert(contentData: Partial<NewContent>): Promise<Content> {
    if (!contentData.id) {
      throw new Error('Content ID is required for upsert')
    }

    const now = new Date()
    const existing = await this.findById(contentData.id)

    if (existing) {
      // Update existing content
      const updateData: any = {
        ...contentData,
        updatedAt: now
      }
      
      // Don't overwrite createdAt
      delete updateData.createdAt
      delete updateData.id // Can't update primary key

      await this.db
        .update(schema.content)
        .set(updateData)
        .where(eq(schema.content.id, contentData.id))

      return (await this.findById(contentData.id))!
    } else {
      // Insert new content
      const insertData: NewContent = {
        externalId: '',
        provider: '',
        url: '',
        title: '',
        createdAt: now,
        updatedAt: now,
        ...contentData
      } as NewContent

      await this.db
        .insert(schema.content)
        .values(insertData)

      return (await this.findById(contentData.id))!
    }
  }

  /**
   * Batch upsert content
   */
  async upsertBatch(contents: Partial<NewContent>[]): Promise<Content[]> {
    const results: Content[] = []
    
    // Process in chunks to avoid SQLite limits
    const chunkSize = 100
    for (let i = 0; i < contents.length; i += chunkSize) {
      const chunk = contents.slice(i, i + chunkSize)
      
      // Process each item in the chunk
      const chunkResults = await Promise.all(
        chunk.map(content => this.upsert(content))
      )
      
      results.push(...chunkResults)
    }
    
    return results
  }

  /**
   * Find duplicate content
   */
  async findDuplicates(content: Content): Promise<ContentDeduplicationMatch[]> {
    const matches: ContentDeduplicationMatch[] = []
    
    // 1. Check by fingerprint (exact match)
    if (content.contentFingerprint) {
      const fingerprintMatches = await this.findByFingerprint(content.contentFingerprint)
      for (const match of fingerprintMatches) {
        if (match.id !== content.id) {
          matches.push({
            id: match.id,
            score: 1.0,
            reasons: ['Exact fingerprint match']
          })
        }
      }
    }
    
    // 2. Check by normalized title and creator (fuzzy match)
    if (content.normalizedTitle && content.creatorName) {
      const titleMatches = await this.db
        .select()
        .from(schema.content)
        .where(and(
          eq(schema.content.normalizedTitle, content.normalizedTitle),
          eq(schema.content.creatorName, content.creatorName),
          sql`${schema.content.id} != ${content.id}`
        ))
        .limit(10)
      
      for (const match of titleMatches) {
        const existing = matches.find(m => m.id === match.id)
        if (!existing) {
          matches.push({
            id: match.id,
            score: 0.8,
            reasons: ['Same title and creator']
          })
        }
      }
    }
    
    // 3. Check by provider and external ID (platform match)
    if (content.provider && content.externalId) {
      const platformMatches = await this.db
        .select()
        .from(schema.content)
        .where(and(
          eq(schema.content.provider, content.provider),
          eq(schema.content.externalId, content.externalId),
          sql`${schema.content.id} != ${content.id}`
        ))
        .limit(5)
      
      for (const match of platformMatches) {
        const existing = matches.find(m => m.id === match.id)
        if (!existing) {
          matches.push({
            id: match.id,
            score: 1.0,
            reasons: ['Same platform ID']
          })
        } else {
          existing.score = 1.0
          existing.reasons.push('Same platform ID')
        }
      }
    }
    
    // 4. Check by URL
    const urlMatches = await this.db
      .select()
      .from(schema.content)
      .where(and(
        or(
          eq(schema.content.url, content.url),
          eq(schema.content.canonicalUrl, content.url),
          eq(schema.content.url, content.canonicalUrl || ''),
          eq(schema.content.canonicalUrl, content.canonicalUrl || '')
        ),
        sql`${schema.content.id} != ${content.id}`
      ))
      .limit(5)
    
    for (const match of urlMatches) {
      const existing = matches.find(m => m.id === match.id)
      if (!existing) {
        matches.push({
          id: match.id,
          score: 0.9,
          reasons: ['Same URL']
        })
      } else {
        existing.score = Math.max(existing.score, 0.9)
        existing.reasons.push('Same URL')
      }
    }
    
    // Sort by score descending
    return matches.sort((a, b) => b.score - a.score)
  }

  /**
   * Merge duplicate content
   */
  async mergeDuplicates(primaryId: string, duplicateIds: string[]): Promise<void> {
    if (duplicateIds.length === 0) return
    
    // Get primary content
    const primary = await this.findById(primaryId)
    if (!primary) {
      throw new Error(`Primary content ${primaryId} not found`)
    }
    
    // Get all duplicates
    const duplicates = await this.findByIds(duplicateIds)
    
    // Merge metadata from duplicates into primary
    const mergedData: Partial<Content> = { ...primary }
    
    for (const duplicate of duplicates) {
      // Merge engagement metrics (take max values)
      if (duplicate.viewCount && (!mergedData.viewCount || duplicate.viewCount > mergedData.viewCount)) {
        mergedData.viewCount = duplicate.viewCount
      }
      if (duplicate.likeCount && (!mergedData.likeCount || duplicate.likeCount > mergedData.likeCount)) {
        mergedData.likeCount = duplicate.likeCount
      }
      if (duplicate.commentCount && (!mergedData.commentCount || duplicate.commentCount > mergedData.commentCount)) {
        mergedData.commentCount = duplicate.commentCount
      }
      
      // Merge missing fields
      if (!mergedData.thumbnailUrl && duplicate.thumbnailUrl) {
        mergedData.thumbnailUrl = duplicate.thumbnailUrl
      }
      if (!mergedData.description && duplicate.description) {
        mergedData.description = duplicate.description
      }
      if (!mergedData.creatorName && duplicate.creatorName) {
        mergedData.creatorName = duplicate.creatorName
        mergedData.creatorId = duplicate.creatorId
      }
      
      // Merge metadata objects
      if (duplicate.enrichmentMetadata) {
        mergedData.enrichmentMetadata = JSON.stringify({
          ...(typeof mergedData.enrichmentMetadata === 'string' ? JSON.parse(mergedData.enrichmentMetadata) : mergedData.enrichmentMetadata || {}),
          ...(typeof duplicate.enrichmentMetadata === 'string' ? JSON.parse(duplicate.enrichmentMetadata) : duplicate.enrichmentMetadata)
        })
      }
    }
    
    // Update primary with merged data
    await this.db
      .update(schema.content)
      .set({
        ...mergedData,
        updatedAt: new Date()
      })
      .where(eq(schema.content.id, primaryId))
    
    // Update all references to duplicates to point to primary
    // Update bookmarks
    await this.db
      .update(schema.bookmarks)
      .set({ contentId: primaryId })
      .where(inArray(schema.bookmarks.contentId, duplicateIds))
    
    // Update feed_items
    await this.db
      .update(schema.feedItems)
      .set({ contentId: primaryId })
      .where(inArray(schema.feedItems.contentId, duplicateIds))
    
    // Delete duplicate content
    await this.db
      .delete(schema.content)
      .where(inArray(schema.content.id, duplicateIds))
  }

  /**
   * Search content
   */
  async search(query: string, options: ContentRepositoryOptions = {}): Promise<Content[]> {
    const searchPattern = `%${query}%`
    
    // Build query with all conditions at once
    const orderColumn = options.orderBy === 'publishedAt' 
      ? schema.content.publishedAt
      : options.orderBy === 'updatedAt'
      ? schema.content.updatedAt
      : schema.content.createdAt
    
    const results = await this.db
      .select()
      .from(schema.content)
      .where(or(
        like(schema.content.title, searchPattern),
        like(schema.content.description, searchPattern),
        like(schema.content.creatorName, searchPattern),
        like(schema.content.normalizedTitle, searchPattern)
      ))
      .orderBy(options.orderDirection === 'asc' ? orderColumn : desc(orderColumn))
      .limit(options.limit || 100)
      .offset(options.offset || 0)
    
    return results
  }

  /**
   * Get content by provider
   */
  async getByProvider(provider: string, options: ContentRepositoryOptions = {}): Promise<Content[]> {
    const results = await this.db
      .select()
      .from(schema.content)
      .where(eq(schema.content.provider, provider))
      .orderBy(options.orderDirection === 'asc' ? schema.content.createdAt : desc(schema.content.createdAt))
      .limit(options.limit || 100)
      .offset(options.offset || 0)
    
    return results
  }

  /**
   * Delete content by ID
   */
  async delete(id: string): Promise<void> {
    await this.db
      .delete(schema.content)
      .where(eq(schema.content.id, id))
  }

  /**
   * Get content statistics
   */
  async getStatistics(): Promise<{
    totalCount: number
    byProvider: Record<string, number>
    byContentType: Record<string, number>
    withEngagement: number
    withCreator: number
    lastUpdated: Date | null
  }> {
    // Get total count
    const totalResult = await this.db
      .select({ count: sql<number>`count(*)` })
      .from(schema.content)
    
    const totalCount = totalResult[0]?.count || 0
    
    // Get count by provider
    const providerResults = await this.db
      .select({
        provider: schema.content.provider,
        count: sql<number>`count(*)`
      })
      .from(schema.content)
      .groupBy(schema.content.provider)
    
    const byProvider: Record<string, number> = {}
    for (const row of providerResults) {
      if (row.provider) {
        byProvider[row.provider] = row.count
      }
    }
    
    // Get count by content type
    const typeResults = await this.db
      .select({
        contentType: schema.content.contentType,
        count: sql<number>`count(*)`
      })
      .from(schema.content)
      .groupBy(schema.content.contentType)
    
    const byContentType: Record<string, number> = {}
    for (const row of typeResults) {
      if (row.contentType) {
        byContentType[row.contentType] = row.count
      }
    }
    
    // Get count with engagement data
    const engagementResult = await this.db
      .select({ count: sql<number>`count(*)` })
      .from(schema.content)
      .where(or(
        sql`${schema.content.viewCount} > 0`,
        sql`${schema.content.likeCount} > 0`
      ))
    
    const withEngagement = engagementResult[0]?.count || 0
    
    // Get count with creator data
    const creatorResult = await this.db
      .select({ count: sql<number>`count(*)` })
      .from(schema.content)
      .where(sql`${schema.content.creatorName} IS NOT NULL`)
    
    const withCreator = creatorResult[0]?.count || 0
    
    // Get last updated
    const lastUpdatedResult = await this.db
      .select({ lastUpdated: schema.content.updatedAt })
      .from(schema.content)
      .orderBy(desc(schema.content.updatedAt))
      .limit(1)
    
    const lastUpdated = lastUpdatedResult[0]?.lastUpdated || null
    
    return {
      totalCount,
      byProvider,
      byContentType,
      withEngagement,
      withCreator,
      lastUpdated
    }
  }
}