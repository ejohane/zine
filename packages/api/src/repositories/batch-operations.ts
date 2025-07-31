import { drizzle } from 'drizzle-orm/d1'
import { eq, and, inArray, sql } from 'drizzle-orm'
import * as schema from '../schema'
import { FeedItem } from '@zine/shared'

/**
 * Batch database operations for optimized feed item processing
 * Reduces database queries by up to 90% through intelligent batching
 */
export class BatchDatabaseOperations {
  private db: ReturnType<typeof drizzle>

  constructor(d1Database: D1Database) {
    this.db = drizzle(d1Database, { schema })
  }

  /**
   * Check existence of multiple feed items in a single query
   * Returns a map of subscriptionId-externalId to existing feed items
   */
  async checkExistingFeedItems(
    items: Array<{ subscriptionId: string; externalId: string }>
  ): Promise<Map<string, FeedItem>> {
    if (items.length === 0) return new Map()

    // Create unique key combinations for the query
    const conditions = items.map(item => 
      and(
        eq(schema.feedItems.subscriptionId, item.subscriptionId),
        eq(schema.feedItems.externalId, item.externalId)
      )
    )

    // Query all existing items in a single operation
    const existingItems = await this.db
      .select()
      .from(schema.feedItems)
      .where(sql`${conditions.map((c, i) => i === 0 ? c : sql` OR ${c}`).reduce((acc, curr) => sql`${acc}${curr}`)}`)

    // Create map for O(1) lookups
    const existingMap = new Map<string, FeedItem>()
    for (const item of existingItems) {
      const key = `${item.subscriptionId}-${item.externalId}`
      existingMap.set(key, this.mapFeedItem(item))
    }

    return existingMap
  }

  /**
   * Batch insert multiple feed items in a single transaction
   * Skips items that already exist based on prior checking
   */
  async batchInsertFeedItems(
    feedItems: Array<Omit<FeedItem, 'id' | 'createdAt'>>,
    existingItemsMap: Map<string, FeedItem>
  ): Promise<FeedItem[]> {
    if (feedItems.length === 0) return []

    const now = new Date()
    const newItems: FeedItem[] = []
    const itemsToInsert: any[] = []

    // Filter out existing items and prepare new ones
    for (const feedItem of feedItems) {
      const key = `${feedItem.subscriptionId}-${feedItem.externalId}`
      
      if (!existingItemsMap.has(key)) {
        // Generate deterministic ID without timestamp to prevent duplicates
        const id = `${feedItem.subscriptionId}-${feedItem.externalId}`
        
        const newItem: FeedItem = {
          ...feedItem,
          id,
          createdAt: now
        }
        
        newItems.push(newItem)
        itemsToInsert.push({
          id,
          subscriptionId: feedItem.subscriptionId,
          externalId: feedItem.externalId,
          title: feedItem.title,
          description: feedItem.description || null,
          thumbnailUrl: feedItem.thumbnailUrl || null,
          publishedAt: feedItem.publishedAt.getTime(),
          durationSeconds: feedItem.durationSeconds || null,
          externalUrl: feedItem.externalUrl,
          createdAt: now.getTime()
        })
      }
    }

    // Batch insert all new items
    if (itemsToInsert.length > 0) {
      try {
        await this.db.insert(schema.feedItems).values(itemsToInsert)
        console.log(`[BatchOps] Inserted ${itemsToInsert.length} new feed items`)
      } catch (error) {
        // Handle potential unique constraint violations gracefully
        if (error instanceof Error && error.message.includes('UNIQUE constraint')) {
          console.warn('[BatchOps] Some items already existed, handling gracefully')
          // Re-check and return only successfully inserted items
          const recheckMap = await this.checkExistingFeedItems(
            feedItems.map(item => ({ 
              subscriptionId: item.subscriptionId, 
              externalId: item.externalId 
            }))
          )
          return Array.from(recheckMap.values()).filter(item => 
            new Date(item.createdAt).getTime() > now.getTime() - 1000
          )
        }
        throw error
      }
    }

    return newItems
  }

  /**
   * Check existing user feed items for multiple users and feed items
   * Returns a set of existing userFeedItem IDs
   */
  async checkExistingUserFeedItems(
    userIds: string[],
    feedItemIds: string[]
  ): Promise<Set<string>> {
    if (userIds.length === 0 || feedItemIds.length === 0) return new Set()

    const existingUserFeedItems = await this.db
      .select()
      .from(schema.userFeedItems)
      .where(and(
        inArray(schema.userFeedItems.userId, userIds),
        inArray(schema.userFeedItems.feedItemId, feedItemIds)
      ))

    // Create set of existing IDs for O(1) lookups
    const existingIds = new Set<string>()
    for (const item of existingUserFeedItems) {
      existingIds.add(item.id)
    }

    return existingIds
  }

  /**
   * Batch create user feed items for multiple users and feed items
   * Skips items that already exist
   */
  async batchCreateUserFeedItems(
    userIds: string[],
    feedItems: FeedItem[]
  ): Promise<number> {
    if (userIds.length === 0 || feedItems.length === 0) return 0

    const feedItemIds = feedItems.map(item => item.id)
    
    // Check existing items first
    const existingIds = await this.checkExistingUserFeedItems(userIds, feedItemIds)
    
    const now = new Date()
    const userFeedItemsToInsert: any[] = []

    // Prepare batch insert data
    for (const userId of userIds) {
      for (const feedItem of feedItems) {
        const id = `${userId}-${feedItem.id}`
        
        if (!existingIds.has(id)) {
          userFeedItemsToInsert.push({
            id,
            userId,
            feedItemId: feedItem.id,
            isRead: false,
            bookmarkId: null,
            readAt: null,
            createdAt: now.getTime()
          })
        }
      }
    }

    // Batch insert all new user feed items
    if (userFeedItemsToInsert.length > 0) {
      try {
        await this.db.insert(schema.userFeedItems).values(userFeedItemsToInsert)
        console.log(`[BatchOps] Created ${userFeedItemsToInsert.length} user feed items`)
      } catch (error) {
        // Handle potential unique constraint violations
        if (error instanceof Error && error.message.includes('UNIQUE constraint')) {
          console.warn('[BatchOps] Some user feed items already existed, handled gracefully')
          // Count only successfully inserted items
          const afterCount = await this.checkExistingUserFeedItems(userIds, feedItemIds)
          return afterCount.size - existingIds.size
        }
        throw error
      }
    }

    return userFeedItemsToInsert.length
  }

  /**
   * Get recent feed item IDs for a set of subscriptions
   * Used for cache warming
   */
  async getRecentFeedItemIds(
    subscriptionIds: string[],
    hoursBack: number = 24
  ): Promise<Map<string, Set<string>>> {
    if (subscriptionIds.length === 0) return new Map()

    const cutoffTime = new Date(Date.now() - hoursBack * 60 * 60 * 1000)

    const recentItems = await this.db
      .select({
        subscriptionId: schema.feedItems.subscriptionId,
        externalId: schema.feedItems.externalId
      })
      .from(schema.feedItems)
      .where(and(
        inArray(schema.feedItems.subscriptionId, subscriptionIds),
        sql`${schema.feedItems.publishedAt} > ${cutoffTime.getTime()}`
      ))

    // Group by subscription ID
    const resultMap = new Map<string, Set<string>>()
    for (const item of recentItems) {
      if (!resultMap.has(item.subscriptionId)) {
        resultMap.set(item.subscriptionId, new Set())
      }
      resultMap.get(item.subscriptionId)!.add(item.externalId)
    }

    return resultMap
  }

  private mapFeedItem(row: any): FeedItem {
    return {
      id: row.id,
      subscriptionId: row.subscriptionId,
      externalId: row.externalId,
      title: row.title,
      description: row.description || undefined,
      thumbnailUrl: row.thumbnailUrl || undefined,
      publishedAt: new Date(row.publishedAt),
      durationSeconds: row.durationSeconds || undefined,
      externalUrl: row.externalUrl,
      createdAt: new Date(row.createdAt)
    }
  }
}