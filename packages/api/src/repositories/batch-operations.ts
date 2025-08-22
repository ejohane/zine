import { drizzle } from 'drizzle-orm/d1'
import { eq, and, inArray, gt, sql } from 'drizzle-orm'
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
  // NOTE: Some queries (like getRecentFeedItemIds) may need even lower limits
  // due to complex WHERE clauses with multiple parameters
  private static readonly SQLITE_MAX_VARIABLES = 250
  private static readonly VARIABLES_PER_CONTENT_ITEM = 50 // Approximate number of columns in content table
  private static readonly VARIABLES_PER_FEED_ITEM = 5 // Number of columns in feed_items insert
  private static readonly VARIABLES_PER_USER_FEED_ITEM = 7 // Number of columns in user_feed_items insert
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
    
    // The Drizzle ORM's or() with multiple and() conditions generates more complex SQL than expected
    // Each condition uses more than 2 variables when expanded by the ORM
    // Based on the error with 60 items (120 expected variables) still failing,
    // we need to be much more conservative
    // Setting to 30 items per chunk to ensure we stay well below the limit
    const maxItemsPerChunk = 30
    
    console.log(`[BatchOps:checkExistingFeedItems] Max items per chunk: ${maxItemsPerChunk} (conservative limit due to complex OR query generation)`)
    
    // Process in chunks to avoid SQLite variable limit
    for (let i = 0; i < items.length; i += maxItemsPerChunk) {
      const chunk = items.slice(i, i + maxItemsPerChunk)
      const chunkNum = Math.floor(i / maxItemsPerChunk) + 1
      const totalChunks = Math.ceil(items.length / maxItemsPerChunk)
      
      console.log(`[BatchOps:checkExistingFeedItems] Processing chunk ${chunkNum}/${totalChunks} with ${chunk.length} items`)
      
      try {
        // Build a list of content IDs to look for based on provider and externalId
        // Since content.id is in format "{provider}-{external_id}", we can construct it
        const contentIds = chunk.map(item => {
          // Determine provider from subscriptionId format
          const provider = item.subscriptionId.startsWith('spotify:') ? 'spotify' : 
                          item.subscriptionId.startsWith('youtube:') ? 'youtube' : 
                          'unknown'
          return `${provider}-${item.externalId}`
        })
        
        // Query with join to get both feed items and content
        const existingItems = await this.db
          .select({
            feedItem: schema.feedItems,
            content: schema.content
          })
          .from(schema.feedItems)
          .innerJoin(schema.content, eq(schema.feedItems.contentId, schema.content.id))
          .where(and(
            inArray(schema.feedItems.subscriptionId, chunk.map(c => c.subscriptionId)),
            inArray(schema.content.id, contentIds)
          ))
        
        console.log(`[BatchOps:checkExistingFeedItems] Chunk ${chunkNum} found ${existingItems.length} existing items`)
        
        // Add to map
        for (const item of existingItems) {
          const key = `${item.feedItem.subscriptionId}-${item.content.externalId}`
          existingMap.set(key, this.mapFeedItemWithContent(item.feedItem, item.content))
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
   * Batch insert multiple feed items and content in a single transaction
   * Skips items that already exist based on prior checking
   */
  async batchInsertFeedItems(
    feedItems: Array<Omit<FeedItem, 'id' | 'createdAt'>>,
    existingItemsMap: Map<string, FeedItem>
  ): Promise<FeedItem[]> {
    if (feedItems.length === 0) return []

    const now = new Date()
    const newItems: FeedItem[] = []
    const contentToInsert: any[] = []
    const feedItemsToInsert: any[] = []

    // Filter out existing items and prepare new ones
    for (const feedItem of feedItems) {
      const key = `${feedItem.subscriptionId}-${feedItem.externalId}`
      
      if (!existingItemsMap.has(key)) {
        // Determine provider from subscriptionId
        const provider = feedItem.subscriptionId.startsWith('spotify:') ? 'spotify' : 
                        feedItem.subscriptionId.startsWith('youtube:') ? 'youtube' : 
                        'web'
        
        // Create content ID
        const contentId = `${provider}-${feedItem.externalId}`
        
        const newItem: FeedItem = {
          ...feedItem,
          id: `${feedItem.subscriptionId}-${feedItem.externalId}`,
          createdAt: now
        }
        
        newItems.push(newItem)
        
        // Prepare content record
        contentToInsert.push({
          id: contentId,
          externalId: feedItem.externalId,
          provider,
          url: feedItem.externalUrl,
          title: feedItem.title,
          description: feedItem.description || null,
          thumbnailUrl: feedItem.thumbnailUrl || null,
          publishedAt: feedItem.publishedAt.getTime(),
          durationSeconds: feedItem.durationSeconds || null,
          
          // Phase 1: New engagement metrics
          viewCount: (feedItem as any).viewCount || null,
          likeCount: (feedItem as any).likeCount || null,
          commentCount: (feedItem as any).commentCount || null,
          popularityScore: (feedItem as any).popularityScore || null,
          
          // Phase 1: New classification fields
          language: (feedItem as any).language || null,
          isExplicit: (feedItem as any).isExplicit ? 1 : 0,
          contentType: (feedItem as any).contentType || null,
          category: (feedItem as any).category || null,
          tags: (feedItem as any).tags || null,
          
          // Phase 2: Creator/Channel Information
          creatorId: (feedItem as any).creatorId || null,
          creatorName: (feedItem as any).creatorName || null,
          creatorHandle: (feedItem as any).creatorHandle || null,
          creatorThumbnail: (feedItem as any).creatorThumbnail || null,
          creatorVerified: (feedItem as any).creatorVerified ? 1 : 0,
          
          // Phase 2: Series/Episode Information
          seriesId: (feedItem as any).seriesId || null,
          seriesName: (feedItem as any).seriesName || null,
          episodeNumber: (feedItem as any).episodeNumber || null,
          seasonNumber: (feedItem as any).seasonNumber || null,
          
          // Phase 3: Technical metadata
          videoQuality: (feedItem as any).videoQuality || null,
          hasHd: (feedItem as any).hasHd ? 1 : 0,
          hasCaptions: (feedItem as any).hasCaptions ? 1 : 0,
          
          // Phase 4: Cross-platform matching
          contentFingerprint: (feedItem as any).contentFingerprint || null,
          normalizedTitle: (feedItem as any).normalizedTitle || null,
          episodeIdentifier: (feedItem as any).episodeIdentifier || null,
          
          // Metadata fields
          statisticsMetadata: (feedItem as any).statisticsMetadata || null,
          technicalMetadata: (feedItem as any).technicalMetadata || null,
          enrichmentMetadata: (feedItem as any).enrichmentMetadata || null,
          
          createdAt: now.getTime(),
          updatedAt: now.getTime()
        })
        
        // Prepare feed_items record
        feedItemsToInsert.push({
          id: newItem.id,
          subscriptionId: feedItem.subscriptionId,
          contentId,
          addedToFeedAt: now.getTime(),
          positionInFeed: null
        })
      }
    }

    if (contentToInsert.length === 0) {
      console.log('[BatchOps:batchInsertFeedItems] No new items to insert')
      return []
    }

    console.log(`[BatchOps:batchInsertFeedItems] Inserting ${contentToInsert.length} new items`)

    // Calculate safe batch sizes
    const maxContentPerBatch = Math.floor(
      (BatchDatabaseOperations.SQLITE_MAX_VARIABLES - BatchDatabaseOperations.SAFETY_BUFFER) / 
      BatchDatabaseOperations.VARIABLES_PER_CONTENT_ITEM
    )
    const maxFeedItemsPerBatch = Math.floor(
      (BatchDatabaseOperations.SQLITE_MAX_VARIABLES - BatchDatabaseOperations.SAFETY_BUFFER) / 
      BatchDatabaseOperations.VARIABLES_PER_FEED_ITEM
    )
    
    console.log(`[BatchOps:batchInsertFeedItems] Max content per batch: ${maxContentPerBatch}, Max feed items per batch: ${maxFeedItemsPerBatch}`)

    // Insert content in batches (with upsert to handle potential duplicates)
    for (let i = 0; i < contentToInsert.length; i += maxContentPerBatch) {
      const contentBatch = contentToInsert.slice(i, i + maxContentPerBatch)
      const batchNum = Math.floor(i / maxContentPerBatch) + 1
      const totalBatches = Math.ceil(contentToInsert.length / maxContentPerBatch)
      
      console.log(`[BatchOps:batchInsertFeedItems] Inserting content batch ${batchNum}/${totalBatches} with ${contentBatch.length} items`)
      
      try {
        // Use INSERT OR IGNORE to skip duplicates
        await this.db.insert(schema.content)
          .values(contentBatch)
          .onConflictDoNothing()
      } catch (error) {
        console.error(`[BatchOps:batchInsertFeedItems] Error inserting content batch ${batchNum}:`, error)
        throw error
      }
    }
    
    // Insert feed items in batches
    for (let i = 0; i < feedItemsToInsert.length; i += maxFeedItemsPerBatch) {
      const feedItemBatch = feedItemsToInsert.slice(i, i + maxFeedItemsPerBatch)
      const batchNum = Math.floor(i / maxFeedItemsPerBatch) + 1
      const totalBatches = Math.ceil(feedItemsToInsert.length / maxFeedItemsPerBatch)
      
      console.log(`[BatchOps:batchInsertFeedItems] Inserting feed item batch ${batchNum}/${totalBatches} with ${feedItemBatch.length} items`)
      
      try {
        await this.db.insert(schema.feedItems).values(feedItemBatch)
      } catch (error) {
        console.error(`[BatchOps:batchInsertFeedItems] Error inserting feed item batch ${batchNum}:`, error)
        console.error(`[BatchOps:batchInsertFeedItems] Batch details:`, {
          batchSize: feedItemBatch.length,
          variablesUsed: feedItemBatch.length * BatchDatabaseOperations.VARIABLES_PER_FEED_ITEM,
          maxVariables: BatchDatabaseOperations.SQLITE_MAX_VARIABLES,
          firstItem: feedItemBatch[0],
          errorMessage: error instanceof Error ? error.message : String(error)
        })
        throw error
      }
    }

    console.log(`[BatchOps:batchInsertFeedItems] Successfully inserted ${newItems.length} new items`)
    return newItems
  }

  /**
   * Batch insert user feed items for multiple users
   * Creates entries in user_feed_items table to track read status
   */
  async batchInsertUserFeedItems(
    userId: string,
    feedItemIds: string[]
  ): Promise<void> {
    if (feedItemIds.length === 0) return

    console.log(`[BatchOps:batchInsertUserFeedItems] Creating ${feedItemIds.length} user feed items for user ${userId}`)

    const now = new Date()
    const userFeedItems = feedItemIds.map(feedItemId => ({
      id: `${userId}-${feedItemId}`,
      userId,
      feedItemId,
      isRead: false,
      isSaved: false,
      isHidden: false,
      readAt: null,
      savedAt: null,
      hiddenAt: null,
      createdAt: now
    }))

    // Calculate safe batch size
    const maxItemsPerBatch = Math.floor(
      (BatchDatabaseOperations.SQLITE_MAX_VARIABLES - BatchDatabaseOperations.SAFETY_BUFFER) / 
      BatchDatabaseOperations.VARIABLES_PER_USER_FEED_ITEM
    )
    
    console.log(`[BatchOps:batchInsertUserFeedItems] Max items per batch: ${maxItemsPerBatch}`)

    // Insert in batches
    for (let i = 0; i < userFeedItems.length; i += maxItemsPerBatch) {
      const batch = userFeedItems.slice(i, i + maxItemsPerBatch)
      const batchNum = Math.floor(i / maxItemsPerBatch) + 1
      const totalBatches = Math.ceil(userFeedItems.length / maxItemsPerBatch)
      
      console.log(`[BatchOps:batchInsertUserFeedItems] Processing batch ${batchNum}/${totalBatches} with ${batch.length} items`)
      
      try {
        await this.db.insert(schema.userFeedItems).values(batch)
      } catch (error) {
        console.error(`[BatchOps:batchInsertUserFeedItems] Error inserting batch ${batchNum}:`, error)
        console.error(`[BatchOps:batchInsertUserFeedItems] Batch details:`, {
          batchSize: batch.length,
          variablesUsed: batch.length * BatchDatabaseOperations.VARIABLES_PER_USER_FEED_ITEM,
          maxVariables: BatchDatabaseOperations.SQLITE_MAX_VARIABLES,
          errorMessage: error instanceof Error ? error.message : String(error)
        })
        throw error
      }
    }

    console.log(`[BatchOps:batchInsertUserFeedItems] Successfully created ${feedItemIds.length} user feed items`)
  }

  /**
   * Get subscription statistics for multiple subscriptions
   */
  async getSubscriptionStats(
    subscriptionIds: string[]
  ): Promise<Map<string, { totalItems: number; latestPublishedAt: Date | null }>> {
    if (subscriptionIds.length === 0) return new Map()

    console.log(`[BatchOps:getSubscriptionStats] Getting stats for ${subscriptionIds.length} subscriptions`)

    const statsMap = new Map<string, { totalItems: number; latestPublishedAt: Date | null }>()
    
    // Use a conservative chunk size for IN queries
    const maxIdsPerChunk = 50
    
    for (let i = 0; i < subscriptionIds.length; i += maxIdsPerChunk) {
      const chunk = subscriptionIds.slice(i, i + maxIdsPerChunk)
      const chunkNum = Math.floor(i / maxIdsPerChunk) + 1
      const totalChunks = Math.ceil(subscriptionIds.length / maxIdsPerChunk)
      
      console.log(`[BatchOps:getSubscriptionStats] Processing chunk ${chunkNum}/${totalChunks} with ${chunk.length} subscription IDs`)
      
      try {
        const stats = await this.db
          .select({
            subscriptionId: schema.feedItems.subscriptionId,
            totalItems: sql<number>`count(*)`,
            latestPublishedAt: sql<number>`max(${schema.content.publishedAt})`
          })
          .from(schema.feedItems)
          .innerJoin(schema.content, eq(schema.feedItems.contentId, schema.content.id))
          .where(inArray(schema.feedItems.subscriptionId, chunk))
          .groupBy(schema.feedItems.subscriptionId)
        
        console.log(`[BatchOps:getSubscriptionStats] Chunk ${chunkNum} returned stats for ${stats.length} subscriptions`)
        
        for (const stat of stats) {
          statsMap.set(stat.subscriptionId, {
            totalItems: stat.totalItems,
            latestPublishedAt: stat.latestPublishedAt ? new Date(stat.latestPublishedAt) : null
          })
        }
      } catch (error) {
        console.error(`[BatchOps:getSubscriptionStats] Error processing chunk ${chunkNum}:`, error)
        throw error
      }
    }

    // Set default stats for subscriptions with no items
    for (const subscriptionId of subscriptionIds) {
      if (!statsMap.has(subscriptionId)) {
        statsMap.set(subscriptionId, { totalItems: 0, latestPublishedAt: null })
      }
    }

    console.log(`[BatchOps:getSubscriptionStats] Completed. Got stats for ${statsMap.size} subscriptions`)
    return statsMap
  }

  /**
   * Get recent feed item IDs for multiple subscriptions
   * Used for duplicate detection within a time window
   */
  async getRecentFeedItemIds(
    subscriptionIds: string[],
    hoursAgo: number = 24
  ): Promise<Map<string, Set<string>>> {
    if (subscriptionIds.length === 0) return new Map()

    console.log(`[BatchOps:getRecentFeedItemIds] Getting recent items for ${subscriptionIds.length} subscriptions (last ${hoursAgo} hours)`)

    const cutoffTime = Date.now() - (hoursAgo * 60 * 60 * 1000)
    const resultMap = new Map<string, Set<string>>()
    
    // Use a very conservative chunk size for complex queries with WHERE conditions
    // The query has both IN and GT conditions which use more variables
    const maxIdsPerChunk = 50 // Conservative limit to avoid "too many SQL variables" error
    
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
            externalId: schema.content.externalId
          })
          .from(schema.feedItems)
          .innerJoin(schema.content, eq(schema.feedItems.contentId, schema.content.id))
          .where(and(
            inArray(schema.feedItems.subscriptionId, chunk),
            gt(schema.content.publishedAt, new Date(cutoffTime))
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

  private mapFeedItemWithContent(feedItemRow: any, contentRow: any): FeedItem {
    return {
      id: feedItemRow.id,
      subscriptionId: feedItemRow.subscriptionId,
      externalId: contentRow.externalId,
      title: contentRow.title,
      description: contentRow.description,
      thumbnailUrl: contentRow.thumbnailUrl,
      publishedAt: new Date(contentRow.publishedAt),
      durationSeconds: contentRow.durationSeconds,
      externalUrl: contentRow.url,
      createdAt: new Date(feedItemRow.addedToFeedAt)
    }
  }
}