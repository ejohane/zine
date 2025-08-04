import { drizzle } from 'drizzle-orm/d1'
import { eq, and, inArray, or, gt } from 'drizzle-orm'
import * as schema from '../schema'
import { FeedItem } from '@zine/shared'

/**
 * Batch database operations for optimized feed item processing
 * Reduces database queries by up to 90% through intelligent batching
 */
export class BatchDatabaseOperations {
  private db: ReturnType<typeof drizzle>
  
  // Cloudflare D1 appears to have a lower limit than standard SQLite
  // Based on errors, the limit seems to be around 296-297 parameters
  // Setting to 250 to be extra safe
  private static readonly SQLITE_MAX_VARIABLES = 250
  private static readonly VARIABLES_PER_FEED_ITEM = 9 // Number of columns in feed_items insert
  private static readonly VARIABLES_PER_USER_FEED_ITEM = 7 // Number of columns in user_feed_items insert (id, userId, feedItemId, isRead, bookmarkId, readAt, createdAt)
  private static readonly VARIABLES_PER_CONDITION = 2 // subscriptionId + externalId per condition
  private static readonly SAFETY_BUFFER = 10 // Safety buffer to ensure we never exceed the limit

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

    console.log(`[BatchOps:checkExistingFeedItems] Checking ${items.length} items for existence`)
    const existingMap = new Map<string, FeedItem>()
    
    // Calculate max items per chunk based on variables per condition
    const maxItemsPerChunk = Math.floor(
      (BatchDatabaseOperations.SQLITE_MAX_VARIABLES - BatchDatabaseOperations.SAFETY_BUFFER) / 
      BatchDatabaseOperations.VARIABLES_PER_CONDITION
    )
    
    console.log(`[BatchOps:checkExistingFeedItems] Max items per chunk: ${maxItemsPerChunk} (${BatchDatabaseOperations.VARIABLES_PER_CONDITION} variables per item)`)
    
    // Process in chunks to avoid SQLite variable limit
    for (let i = 0; i < items.length; i += maxItemsPerChunk) {
      const chunk = items.slice(i, i + maxItemsPerChunk)
      const chunkNum = Math.floor(i / maxItemsPerChunk) + 1
      const totalChunks = Math.ceil(items.length / maxItemsPerChunk)
      
      console.log(`[BatchOps:checkExistingFeedItems] Processing chunk ${chunkNum}/${totalChunks} with ${chunk.length} items`)
      
      try {
        // Create conditions for this chunk
        const conditions = chunk.map(item => 
          and(
            eq(schema.feedItems.subscriptionId, item.subscriptionId),
            eq(schema.feedItems.externalId, item.externalId)
          )
        )
        
        // Query this chunk
        const existingItems = await this.db
          .select()
          .from(schema.feedItems)
          .where(or(...conditions))
        
        console.log(`[BatchOps:checkExistingFeedItems] Chunk ${chunkNum} found ${existingItems.length} existing items`)
        
        // Add to map
        for (const item of existingItems) {
          const key = `${item.subscriptionId}-${item.externalId}`
          existingMap.set(key, this.mapFeedItem(item))
        }
      } catch (error) {
        console.error(`[BatchOps:checkExistingFeedItems] Error processing chunk ${chunkNum}:`, error)
        console.error(`[BatchOps:checkExistingFeedItems] Chunk details:`, {
          chunkSize: chunk.length,
          variablesUsed: chunk.length * BatchDatabaseOperations.VARIABLES_PER_CONDITION,
          maxVariables: BatchDatabaseOperations.SQLITE_MAX_VARIABLES,
          errorMessage: error instanceof Error ? error.message : String(error)
        })
        throw error
      }
    }

    console.log(`[BatchOps:checkExistingFeedItems] Completed. Found ${existingMap.size} existing items`)
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

    // Calculate max items per insert based on variables per item
    const maxItemsPerInsert = Math.floor(
      (BatchDatabaseOperations.SQLITE_MAX_VARIABLES - BatchDatabaseOperations.SAFETY_BUFFER) / 
      BatchDatabaseOperations.VARIABLES_PER_FEED_ITEM
    )

    // Batch insert all new items in chunks
    if (itemsToInsert.length > 0) {
      try {
        let totalInserted = 0
        
        // Insert in chunks to avoid SQLite variable limit
        for (let i = 0; i < itemsToInsert.length; i += maxItemsPerInsert) {
          const chunk = itemsToInsert.slice(i, i + maxItemsPerInsert)
          const chunkNum = Math.floor(i / maxItemsPerInsert) + 1
          const totalChunks = Math.ceil(itemsToInsert.length / maxItemsPerInsert)
          
          console.log(`[BatchOps:batchInsertFeedItems] Inserting chunk ${chunkNum}/${totalChunks} with ${chunk.length} items (max per chunk: ${maxItemsPerInsert})`)
          
          try {
            await this.db.insert(schema.feedItems).values(chunk)
            totalInserted += chunk.length
          } catch (error) {
            console.error(`[BatchOps:batchInsertFeedItems] Error inserting chunk ${chunkNum}:`, error)
            console.error(`[BatchOps:batchInsertFeedItems] Chunk details:`, {
              chunkSize: chunk.length,
              variablesUsed: chunk.length * BatchDatabaseOperations.VARIABLES_PER_FEED_ITEM,
              maxVariables: BatchDatabaseOperations.SQLITE_MAX_VARIABLES
            })
            throw error
          }
        }
        
        console.log(`[BatchOps] Inserted ${totalInserted} new feed items in ${Math.ceil(itemsToInsert.length / maxItemsPerInsert)} chunks`)
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

    const existingIds = new Set<string>()
    
    // SQLite inArray has limits, so we need to chunk
    // Each item in the query uses 2 variables (userId, feedItemId)
    const maxIdsPerChunk = Math.floor(BatchDatabaseOperations.SQLITE_MAX_VARIABLES / 2)
    
    // Process user IDs in chunks
    for (let i = 0; i < userIds.length; i += maxIdsPerChunk) {
      const userChunk = userIds.slice(i, i + maxIdsPerChunk)
      
      // Process feed item IDs in chunks for each user chunk
      for (let j = 0; j < feedItemIds.length; j += maxIdsPerChunk) {
        const feedItemChunk = feedItemIds.slice(j, j + maxIdsPerChunk)
        
        const existingUserFeedItems = await this.db
          .select()
          .from(schema.userFeedItems)
          .where(and(
            inArray(schema.userFeedItems.userId, userChunk),
            inArray(schema.userFeedItems.feedItemId, feedItemChunk)
          ))
        
        // Add to set
        for (const item of existingUserFeedItems) {
          existingIds.add(item.id)
        }
      }
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

    // Calculate max items per insert based on variables per item
    const maxItemsPerInsert = Math.floor(
      (BatchDatabaseOperations.SQLITE_MAX_VARIABLES - BatchDatabaseOperations.SAFETY_BUFFER) / 
      BatchDatabaseOperations.VARIABLES_PER_USER_FEED_ITEM
    )

    // Batch insert all new user feed items in chunks
    if (userFeedItemsToInsert.length > 0) {
      try {
        let totalInserted = 0
        
        // Insert in chunks to avoid SQLite variable limit
        for (let i = 0; i < userFeedItemsToInsert.length; i += maxItemsPerInsert) {
          const chunk = userFeedItemsToInsert.slice(i, i + maxItemsPerInsert)
          const chunkNum = Math.floor(i / maxItemsPerInsert) + 1
          const totalChunks = Math.ceil(userFeedItemsToInsert.length / maxItemsPerInsert)
          
          console.log(`[BatchOps:batchCreateUserFeedItems] Inserting chunk ${chunkNum}/${totalChunks} with ${chunk.length} items (max per chunk: ${maxItemsPerInsert})`)
          
          try {
            await this.db.insert(schema.userFeedItems).values(chunk)
            totalInserted += chunk.length
          } catch (error) {
            console.error(`[BatchOps:batchCreateUserFeedItems] Error inserting chunk ${chunkNum}:`, error)
            console.error(`[BatchOps:batchCreateUserFeedItems] Chunk details:`, {
              chunkSize: chunk.length,
              variablesUsed: chunk.length * BatchDatabaseOperations.VARIABLES_PER_USER_FEED_ITEM,
              maxVariables: BatchDatabaseOperations.SQLITE_MAX_VARIABLES
            })
            throw error
          }
        }
        
        console.log(`[BatchOps] Created ${totalInserted} user feed items in ${Math.ceil(userFeedItemsToInsert.length / maxItemsPerInsert)} chunks`)
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

    console.log(`[BatchOps:getRecentFeedItemIds] Starting with ${subscriptionIds.length} subscription IDs`)
    const cutoffTime = new Date(Date.now() - hoursBack * 60 * 60 * 1000)
    const resultMap = new Map<string, Set<string>>()
    
    // Process subscription IDs in chunks to avoid SQLite variable limit
    // Each subscription ID is 1 variable, plus 1 for the cutoff time
    // Leave room for the timestamp parameter and a safety buffer
    const maxIdsPerChunk = BatchDatabaseOperations.SQLITE_MAX_VARIABLES - BatchDatabaseOperations.SAFETY_BUFFER - 1
    
    console.log(`[BatchOps:getRecentFeedItemIds] Max IDs per chunk: ${maxIdsPerChunk}`)
    console.log(`[BatchOps:getRecentFeedItemIds] Total chunks needed: ${Math.ceil(subscriptionIds.length / maxIdsPerChunk)}`)
    
    for (let i = 0; i < subscriptionIds.length; i += maxIdsPerChunk) {
      const chunk = subscriptionIds.slice(i, i + maxIdsPerChunk)
      const chunkNum = Math.floor(i / maxIdsPerChunk) + 1
      const totalChunks = Math.ceil(subscriptionIds.length / maxIdsPerChunk)
      
      console.log(`[BatchOps:getRecentFeedItemIds] Processing chunk ${chunkNum}/${totalChunks} with ${chunk.length} subscription IDs`)
      
      try {
        const recentItems = await this.db
          .select({
            subscriptionId: schema.feedItems.subscriptionId,
            externalId: schema.feedItems.externalId
          })
          .from(schema.feedItems)
          .where(and(
            inArray(schema.feedItems.subscriptionId, chunk),
            gt(schema.feedItems.publishedAt, cutoffTime)
          ))
        
        console.log(`[BatchOps:getRecentFeedItemIds] Chunk ${chunkNum} returned ${recentItems.length} items`)
        
        // Group by subscription ID
        for (const item of recentItems) {
          if (!resultMap.has(item.subscriptionId)) {
            resultMap.set(item.subscriptionId, new Set())
          }
          resultMap.get(item.subscriptionId)!.add(item.externalId)
        }
      } catch (error) {
        console.error(`[BatchOps:getRecentFeedItemIds] Error processing chunk ${chunkNum}:`, error)
        console.error(`[BatchOps:getRecentFeedItemIds] Chunk details:`, {
          chunkSize: chunk.length,
          firstId: chunk[0],
          lastId: chunk[chunk.length - 1],
          errorMessage: error instanceof Error ? error.message : String(error)
        })
        throw error
      }
    }

    console.log(`[BatchOps:getRecentFeedItemIds] Completed. Found items for ${resultMap.size} subscriptions`)
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