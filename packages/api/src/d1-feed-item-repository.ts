import { drizzle } from 'drizzle-orm/d1'
import { eq, and, desc, inArray, or } from 'drizzle-orm'
import * as schema from './schema'
import { 
  FeedItemRepository,
  FeedItem,
  UserFeedItem,
  FeedItemWithReadState
} from '@zine/shared'
import { ContentRepository } from './repositories/content-repository'
import type { Content } from './schema'

// SQLite has a limit of 999 variables per query
const SQLITE_MAX_VARIABLES = 999
const VARIABLES_PER_USER_FEED_ITEM = 10 // Number of columns in user_feed_items insert

export class D1FeedItemRepository implements FeedItemRepository {
  private db: ReturnType<typeof drizzle>
  private contentRepository: ContentRepository

  constructor(d1Database: D1Database) {
    this.db = drizzle(d1Database, { schema })
    this.contentRepository = new ContentRepository(d1Database)
  }

  async getFeedItem(id: string): Promise<FeedItem | null> {
    const results = await this.db
      .select({
        feedItem: schema.feedItems,
        content: schema.content
      })
      .from(schema.feedItems)
      .innerJoin(schema.content, eq(schema.feedItems.contentId, schema.content.id))
      .where(eq(schema.feedItems.id, id))
      .limit(1)
    
    return results.length > 0 ? this.mapFeedItemWithContent(results[0].feedItem, results[0].content) : null
  }

  async getFeedItemsBySubscription(subscriptionId: string): Promise<FeedItem[]> {
    const results = await this.db
      .select({
        feedItem: schema.feedItems,
        content: schema.content
      })
      .from(schema.feedItems)
      .innerJoin(schema.content, eq(schema.feedItems.contentId, schema.content.id))
      .where(eq(schema.feedItems.subscriptionId, subscriptionId))
      .orderBy(desc(schema.content.publishedAt))
    
    return results.map(row => this.mapFeedItemWithContent(row.feedItem, row.content))
  }

  async createFeedItem(feedItem: Omit<FeedItem, 'createdAt'>): Promise<FeedItem> {
    const now = new Date()
    
    // Extract provider from subscription ID (format: provider-externalId)
    const provider = feedItem.subscriptionId.split('-')[0] || 'unknown'
    
    // Create content ID
    const contentId = `${provider}-${feedItem.externalId}`
    
    // First, upsert the content
    const contentData: Partial<Content> = {
      id: contentId,
      externalId: feedItem.externalId,
      provider,
      url: feedItem.externalUrl,
      title: feedItem.title,
      description: feedItem.description || undefined,
      thumbnailUrl: feedItem.thumbnailUrl || undefined,
      publishedAt: feedItem.publishedAt,
      durationSeconds: feedItem.durationSeconds,
      
      // Map Phase 1 fields
      viewCount: feedItem.viewCount,
      likeCount: feedItem.likeCount,
      commentCount: feedItem.commentCount,
      popularityScore: feedItem.popularityScore,
      language: feedItem.language,
      isExplicit: feedItem.isExplicit,
      contentType: feedItem.contentType,
      category: feedItem.category,
      tags: feedItem.tags,
      
      // Map Phase 2 fields
      creatorId: feedItem.creatorId,
      creatorName: feedItem.creatorName,
      creatorThumbnail: feedItem.creatorThumbnail,
      creatorVerified: feedItem.creatorVerified,
      creatorSubscriberCount: feedItem.creatorSubscriberCount,
      creatorFollowerCount: feedItem.creatorFollowerCount,
      seriesMetadata: feedItem.seriesMetadata,
      seriesId: feedItem.seriesId,
      seriesName: feedItem.seriesName,
      episodeNumber: feedItem.episodeNumber,
      seasonNumber: feedItem.seasonNumber,
      totalEpisodesInSeries: feedItem.totalEpisodesInSeries,
      isLatestEpisode: feedItem.isLatestEpisode,
      
      // Map Phase 3 fields
      hasCaptions: feedItem.hasCaptions,
      hasHd: feedItem.hasHd,
      videoQuality: feedItem.videoQuality,
      hasTranscript: feedItem.hasTranscript,
      audioLanguages: feedItem.audioLanguages,
      audioQuality: feedItem.audioQuality,
      statisticsMetadata: feedItem.statisticsMetadata,
      technicalMetadata: feedItem.technicalMetadata,
      engagementRate: feedItem.engagementRate,
      trendingScore: feedItem.trendingScore,
      
      // Map Phase 4 fields
      contentFingerprint: feedItem.contentFingerprint,
      publisherCanonicalId: feedItem.publisherCanonicalId,
      crossPlatformMatches: feedItem.crossPlatformMetadata,
      normalizedTitle: feedItem.normalizedTitle,
      episodeIdentifier: feedItem.episodeIdentifier,
      
      createdAt: now,
      updatedAt: now
    }
    
    await this.contentRepository.upsert(contentData)
    
    // Then create the feed item
    const newFeedItem = {
      id: feedItem.id,
      subscriptionId: feedItem.subscriptionId,
      contentId,
      addedToFeedAt: now,
      positionInFeed: null
    }

    await this.db.insert(schema.feedItems).values(newFeedItem)
    
    return {
      ...feedItem,
      createdAt: now
    }
  }

  async createFeedItems(feedItems: Omit<FeedItem, 'createdAt'>[]): Promise<FeedItem[]> {
    if (feedItems.length === 0) return []

    const now = new Date()
    const contents: Partial<Content>[] = []
    const newFeedItems: any[] = []
    
    for (const feedItem of feedItems) {
      // Extract provider from subscription ID
      const provider = feedItem.subscriptionId.split('-')[0] || 'unknown'
      const contentId = `${provider}-${feedItem.externalId}`
      
      // Prepare content data
      contents.push({
        id: contentId,
        externalId: feedItem.externalId,
        provider,
        url: feedItem.externalUrl,
        title: feedItem.title,
        description: feedItem.description || undefined,
        thumbnailUrl: feedItem.thumbnailUrl || undefined,
        publishedAt: feedItem.publishedAt,
        durationSeconds: feedItem.durationSeconds,
        
        // Map all phase fields
        viewCount: feedItem.viewCount,
        likeCount: feedItem.likeCount,
        commentCount: feedItem.commentCount,
        popularityScore: feedItem.popularityScore,
        language: feedItem.language,
        isExplicit: feedItem.isExplicit,
        contentType: feedItem.contentType,
        category: feedItem.category,
        tags: feedItem.tags,
        creatorId: feedItem.creatorId,
        creatorName: feedItem.creatorName,
        creatorThumbnail: feedItem.creatorThumbnail,
        creatorVerified: feedItem.creatorVerified,
        creatorSubscriberCount: feedItem.creatorSubscriberCount,
        creatorFollowerCount: feedItem.creatorFollowerCount,
        seriesMetadata: feedItem.seriesMetadata,
        seriesId: feedItem.seriesId,
        seriesName: feedItem.seriesName,
        episodeNumber: feedItem.episodeNumber,
        seasonNumber: feedItem.seasonNumber,
        totalEpisodesInSeries: feedItem.totalEpisodesInSeries,
        isLatestEpisode: feedItem.isLatestEpisode,
        hasCaptions: feedItem.hasCaptions,
        hasHd: feedItem.hasHd,
        videoQuality: feedItem.videoQuality,
        hasTranscript: feedItem.hasTranscript,
        audioLanguages: feedItem.audioLanguages,
        audioQuality: feedItem.audioQuality,
        statisticsMetadata: feedItem.statisticsMetadata,
        technicalMetadata: feedItem.technicalMetadata,
        engagementRate: feedItem.engagementRate,
        trendingScore: feedItem.trendingScore,
        contentFingerprint: feedItem.contentFingerprint,
        publisherCanonicalId: feedItem.publisherCanonicalId,
        crossPlatformMatches: feedItem.crossPlatformMetadata,
        normalizedTitle: feedItem.normalizedTitle,
        episodeIdentifier: feedItem.episodeIdentifier,
        
        createdAt: now,
        updatedAt: now
      })
      
      // Prepare feed item data
      newFeedItems.push({
        id: feedItem.id,
        subscriptionId: feedItem.subscriptionId,
        contentId,
        addedToFeedAt: now,
        positionInFeed: null
      })
    }
    
    // Batch upsert contents
    await this.contentRepository.upsertBatch(contents)
    
    // Batch insert feed items
    await this.db.insert(schema.feedItems).values(newFeedItems)
    
    return feedItems.map(feedItem => ({
      ...feedItem,
      createdAt: now
    }))
  }

  async findOrCreateFeedItem(feedItem: Omit<FeedItem, 'id' | 'createdAt'>): Promise<FeedItem> {
    // Extract provider from subscription ID
    const provider = feedItem.subscriptionId.split('-')[0] || 'unknown'
    const contentId = `${provider}-${feedItem.externalId}`
    
    // Check if feed item already exists by checking for the content
    const existingItems = await this.db
      .select({
        feedItem: schema.feedItems,
        content: schema.content
      })
      .from(schema.feedItems)
      .innerJoin(schema.content, eq(schema.feedItems.contentId, schema.content.id))
      .where(and(
        eq(schema.feedItems.subscriptionId, feedItem.subscriptionId),
        eq(schema.feedItems.contentId, contentId)
      ))
      .limit(1)
    
    if (existingItems.length > 0) {
      return this.mapFeedItemWithContent(existingItems[0].feedItem, existingItems[0].content)
    }
    
    // Create new feed item with deterministic ID
    const id = `${feedItem.subscriptionId}-${feedItem.externalId}`
    return this.createFeedItem({ ...feedItem, id })
  }

  async getUserFeedItem(userId: string, feedItemId: string): Promise<UserFeedItem | null> {
    const results = await this.db
      .select()
      .from(schema.userFeedItems)
      .where(and(
        eq(schema.userFeedItems.userId, userId),
        eq(schema.userFeedItems.feedItemId, feedItemId)
      ))
      .limit(1)
    
    return results.length > 0 ? this.mapUserFeedItem(results[0]) : null
  }

  async getUserFeedItems(
    userId: string,
    options?: {
      isRead?: boolean
      subscriptionIds?: string[]
      limit?: number
      offset?: number
    }
  ): Promise<FeedItemWithReadState[]> {
    let query = this.db
      .select({
        feedItem: schema.feedItems,
        content: schema.content,
        userFeedItem: schema.userFeedItems
      })
      .from(schema.feedItems)
      .innerJoin(schema.content, eq(schema.feedItems.contentId, schema.content.id))
      .leftJoin(
        schema.userFeedItems,
        and(
          eq(schema.feedItems.id, schema.userFeedItems.feedItemId),
          eq(schema.userFeedItems.userId, userId)
        )
      )
      .$dynamic()

    const conditions = []
    
    if (options?.isRead !== undefined) {
      if (options.isRead) {
        conditions.push(eq(schema.userFeedItems.isRead, true))
      } else {
        // For unread, we need items that are either explicitly false or don't have a user feed item entry yet
        conditions.push(eq(schema.userFeedItems.isRead, false))
      }
    }

    // Handle subscription IDs with chunking to avoid SQLite variable limit
    if (options?.subscriptionIds && options.subscriptionIds.length > 0) {
      const subscriptionConditions = []
      const maxIdsPerChunk = Math.floor(SQLITE_MAX_VARIABLES / 2) // Conservative estimate
      
      // Process subscription IDs in chunks
      for (let i = 0; i < options.subscriptionIds.length; i += maxIdsPerChunk) {
        const chunk = options.subscriptionIds.slice(i, i + maxIdsPerChunk)
        subscriptionConditions.push(inArray(schema.feedItems.subscriptionId, chunk))
      }
      
      // Combine chunks with OR
      if (subscriptionConditions.length === 1) {
        conditions.push(subscriptionConditions[0])
      } else {
        conditions.push(or(...subscriptionConditions))
      }
    }

    if (conditions.length > 0) {
      query = query.where(and(...conditions))
    }

    query = query.orderBy(desc(schema.content.publishedAt))

    if (options?.limit) {
      query = query.limit(options.limit)
    }

    if (options?.offset) {
      query = query.offset(options.offset)
    }

    const results = await query

    return results.map(row => ({
      ...this.mapFeedItemWithContent(row.feedItem, row.content),
      userFeedItem: row.userFeedItem ? this.mapUserFeedItem(row.userFeedItem) : undefined
    }))
  }

  async getUserFeedItemsBySubscription(userId: string, subscriptionId: string, unreadOnly: boolean = false, limit: number = 50, offset: number = 0): Promise<UserFeedItemWithDetails[]> {
    let query = this.db
      .select()
      .from(schema.userFeedItems)
      .innerJoin(schema.feedItems, eq(schema.userFeedItems.feedItemId, schema.feedItems.id))
      .innerJoin(schema.content, eq(schema.feedItems.contentId, schema.content.id))
      .innerJoin(schema.subscriptions, eq(schema.feedItems.subscriptionId, schema.subscriptions.id))
      .where(and(
        eq(schema.userFeedItems.userId, userId),
        eq(schema.feedItems.subscriptionId, subscriptionId)
      ))
      .$dynamic()

    if (unreadOnly) {
      query = query.where(and(
        eq(schema.userFeedItems.userId, userId),
        eq(schema.feedItems.subscriptionId, subscriptionId),
        eq(schema.userFeedItems.isRead, false)
      ))
    }

    query = query
      .orderBy(desc(schema.content.publishedAt))
      .limit(limit)
      .offset(offset)

    const results = await query

    return results.map(row => ({
      id: row.user_feed_items.id,
      feedItem: {
        id: row.feed_items.id,
        subscriptionId: row.feed_items.subscriptionId,
        externalId: row.content.externalId,
        title: row.content.title,
        description: row.content.description || undefined,
        thumbnailUrl: row.content.thumbnailUrl || undefined,
        publishedAt: row.content.publishedAt ? new Date(row.content.publishedAt) : new Date(),
        durationSeconds: row.content.durationSeconds || undefined,
        externalUrl: row.content.url,
        
        // Phase 1 fields
        viewCount: row.content.viewCount || undefined,
        likeCount: row.content.likeCount || undefined,
        commentCount: row.content.commentCount || undefined,
        popularityScore: row.content.popularityScore || undefined,
        language: row.content.language || undefined,
        isExplicit: row.content.isExplicit || undefined,
        contentType: row.content.contentType || undefined,
        category: row.content.category || undefined,
        tags: row.content.tags || undefined,
        
        // Phase 2 fields
        creatorId: row.content.creatorId || undefined,
        creatorName: row.content.creatorName || undefined,
        creatorThumbnail: row.content.creatorThumbnail || undefined,
        creatorVerified: row.content.creatorVerified || undefined,
        creatorSubscriberCount: row.content.creatorSubscriberCount || undefined,
        creatorFollowerCount: row.content.creatorFollowerCount || undefined,
        seriesMetadata: row.content.seriesMetadata || undefined,
        
        subscription: {
          id: row.subscriptions.id,
          providerId: row.subscriptions.providerId,
          externalId: row.subscriptions.externalId,
          title: row.subscriptions.title,
          creatorName: row.subscriptions.creatorName,
          description: row.subscriptions.description || undefined,
          thumbnailUrl: row.subscriptions.thumbnailUrl || undefined,
          subscriptionUrl: row.subscriptions.subscriptionUrl || undefined,
          totalEpisodes: row.subscriptions.totalEpisodes || undefined
        },
        
        createdAt: new Date(row.feed_items.addedToFeedAt || row.content.createdAt)
      },
      isRead: Boolean(row.user_feed_items.isRead),
      readAt: row.user_feed_items.readAt ? new Date(row.user_feed_items.readAt) : undefined,
      bookmarkId: row.user_feed_items.bookmarkId || undefined,
      createdAt: new Date(row.user_feed_items.createdAt)
    }))
  }

  async getSubscriptionsWithUnreadCounts(userId: string): Promise<SubscriptionWithUnreadCount[]> {
    const results = await this.db
      .select({
        subscription: schema.subscriptions,
        unreadCount: schema.userFeedItems.isRead,
        lastUpdated: schema.content.publishedAt
      })
      .from(schema.subscriptions)
      .innerJoin(schema.feedItems, eq(schema.subscriptions.id, schema.feedItems.subscriptionId))
      .innerJoin(schema.content, eq(schema.feedItems.contentId, schema.content.id))
      .leftJoin(schema.userFeedItems, and(
        eq(schema.feedItems.id, schema.userFeedItems.feedItemId),
        eq(schema.userFeedItems.userId, userId)
      ))
      .orderBy(desc(schema.content.publishedAt))

    // Group by subscription and calculate unread counts
    const subscriptionMap = new Map<string, SubscriptionWithUnreadCount>()
    
    for (const row of results) {
      const subId = row.subscription.id
      
      if (!subscriptionMap.has(subId)) {
        subscriptionMap.set(subId, {
          subscription: this.mapSubscription(row.subscription),
          unreadCount: 0,
          lastUpdated: row.lastUpdated ? new Date(row.lastUpdated) : new Date()
        })
      }
      
      const subscription = subscriptionMap.get(subId)!
      
      // Count unread items (userFeedItem.isRead is false or null means unread)
      if (row.unreadCount === false || row.unreadCount === null) {
        subscription.unreadCount++
      }
      
      // Update last updated time if this item is newer
      if (row.lastUpdated) {
        const itemDate = new Date(row.lastUpdated)
        if (itemDate > subscription.lastUpdated) {
          subscription.lastUpdated = itemDate
        }
      }
    }

    return Array.from(subscriptionMap.values())
      .sort((a, b) => b.lastUpdated.getTime() - a.lastUpdated.getTime())
  }

  async getUserFeedItemsWithDetails(userId: string, unreadOnly: boolean = false, limit: number = 50, offset: number = 0): Promise<UserFeedItemWithDetails[]> {
    let query = this.db
      .select()
      .from(schema.userFeedItems)
      .innerJoin(schema.feedItems, eq(schema.userFeedItems.feedItemId, schema.feedItems.id))
      .innerJoin(schema.content, eq(schema.feedItems.contentId, schema.content.id))
      .innerJoin(schema.subscriptions, eq(schema.feedItems.subscriptionId, schema.subscriptions.id))
      .where(eq(schema.userFeedItems.userId, userId))
      .$dynamic()

    if (unreadOnly) {
      query = query.where(and(
        eq(schema.userFeedItems.userId, userId),
        eq(schema.userFeedItems.isRead, false)
      ))
    }

    query = query
      .orderBy(desc(schema.content.publishedAt))
      .limit(limit)
      .offset(offset)

    const results = await query

    return results.map(row => ({
      id: row.user_feed_items.id,
      feedItem: {
        id: row.feed_items.id,
        subscriptionId: row.feed_items.subscriptionId,
        externalId: row.content.externalId,
        title: row.content.title,
        description: row.content.description || undefined,
        thumbnailUrl: row.content.thumbnailUrl || undefined,
        publishedAt: row.content.publishedAt ? new Date(row.content.publishedAt) : new Date(),
        durationSeconds: row.content.durationSeconds || undefined,
        externalUrl: row.content.url,
        
        // Phase 1 fields
        viewCount: row.content.viewCount || undefined,
        likeCount: row.content.likeCount || undefined,
        commentCount: row.content.commentCount || undefined,
        popularityScore: row.content.popularityScore || undefined,
        language: row.content.language || undefined,
        isExplicit: row.content.isExplicit || undefined,
        contentType: row.content.contentType || undefined,
        category: row.content.category || undefined,
        tags: row.content.tags || undefined,
        
        // Phase 2 fields
        creatorId: row.content.creatorId || undefined,
        creatorName: row.content.creatorName || undefined,
        creatorThumbnail: row.content.creatorThumbnail || undefined,
        creatorVerified: row.content.creatorVerified || undefined,
        creatorSubscriberCount: row.content.creatorSubscriberCount || undefined,
        creatorFollowerCount: row.content.creatorFollowerCount || undefined,
        seriesMetadata: row.content.seriesMetadata || undefined,
        
        subscription: {
          id: row.subscriptions.id,
          providerId: row.subscriptions.providerId,
          externalId: row.subscriptions.externalId,
          title: row.subscriptions.title,
          creatorName: row.subscriptions.creatorName,
          description: row.subscriptions.description || undefined,
          thumbnailUrl: row.subscriptions.thumbnailUrl || undefined,
          subscriptionUrl: row.subscriptions.subscriptionUrl || undefined,
          totalEpisodes: row.subscriptions.totalEpisodes || undefined
        },
        
        createdAt: new Date(row.feed_items.addedToFeedAt || row.content.createdAt)
      },
      isRead: Boolean(row.user_feed_items.isRead),
      readAt: row.user_feed_items.readAt ? new Date(row.user_feed_items.readAt) : undefined,
      bookmarkId: row.user_feed_items.bookmarkId || undefined,
      createdAt: new Date(row.user_feed_items.createdAt)
    }))
  }

  async createUserFeedItem(userFeedItem: Omit<UserFeedItem, 'createdAt'>): Promise<UserFeedItem> {
    const now = new Date()
    const newUserFeedItem = {
      id: userFeedItem.id,
      userId: userFeedItem.userId,
      feedItemId: userFeedItem.feedItemId,
      isRead: userFeedItem.isRead,
      bookmarkId: userFeedItem.bookmarkId?.toString() || null,
      readAt: userFeedItem.readAt || null,
      createdAt: now
    }

    await this.db.insert(schema.userFeedItems).values(newUserFeedItem)
    
    return {
      ...userFeedItem,
      createdAt: now
    }
  }

  async createUserFeedItems(userFeedItems: Omit<UserFeedItem, 'createdAt'>[]): Promise<UserFeedItem[]> {
    if (userFeedItems.length === 0) return []

    const now = new Date()
    const newUserFeedItems = userFeedItems.map(userFeedItem => ({
      id: userFeedItem.id,
      userId: userFeedItem.userId,
      feedItemId: userFeedItem.feedItemId,
      isRead: userFeedItem.isRead,
      bookmarkId: userFeedItem.bookmarkId?.toString() || null,
      readAt: userFeedItem.readAt || null,
      createdAt: now
    }))

    // Calculate max items per insert based on variables per item
    const maxItemsPerInsert = Math.floor(SQLITE_MAX_VARIABLES / VARIABLES_PER_USER_FEED_ITEM)
    
    // Insert in chunks to avoid SQLite variable limit
    for (let i = 0; i < newUserFeedItems.length; i += maxItemsPerInsert) {
      const chunk = newUserFeedItems.slice(i, i + maxItemsPerInsert)
      await this.db.insert(schema.userFeedItems).values(chunk)
    }
    
    return userFeedItems.map(userFeedItem => ({
      ...userFeedItem,
      createdAt: now
    }))
  }

  async markAsRead(userId: string, feedItemId: string): Promise<UserFeedItem> {
    const now = new Date()
    
    // First try to update existing user feed item
    const existing = await this.getUserFeedItem(userId, feedItemId)
    
    if (existing) {
      await this.db
        .update(schema.userFeedItems)
        .set({
          isRead: true,
          readAt: now
        })
        .where(and(
          eq(schema.userFeedItems.userId, userId),
          eq(schema.userFeedItems.feedItemId, feedItemId)
        ))
      
      return {
        ...existing,
        isRead: true,
        readAt: now
      }
    } else {
      // Verify that the feed item exists before creating user feed item
      const feedItem = await this.getFeedItem(feedItemId)
      if (!feedItem) {
        throw new Error(`Feed item ${feedItemId} not found`)
      }
      
      // Create new user feed item as read
      const userFeedItemId = `${userId}-${feedItemId}-${Date.now()}`
      return this.createUserFeedItem({
        id: userFeedItemId,
        userId,
        feedItemId,
        isRead: true,
        readAt: now
      })
    }
  }

  async markAsUnread(userId: string, feedItemId: string): Promise<UserFeedItem> {
    // First check if user feed item exists
    const existing = await this.getUserFeedItem(userId, feedItemId)
    
    if (existing) {
      await this.db
        .update(schema.userFeedItems)
        .set({
          isRead: false,
          readAt: null
        })
        .where(and(
          eq(schema.userFeedItems.userId, userId),
          eq(schema.userFeedItems.feedItemId, feedItemId)
        ))
      
      return {
        ...existing,
        isRead: false,
        readAt: undefined
      }
    } else {
      // Verify that the feed item exists before creating user feed item
      const feedItem = await this.getFeedItem(feedItemId)
      if (!feedItem) {
        throw new Error(`Feed item ${feedItemId} not found`)
      }
      
      // Create new user feed item as unread
      const userFeedItemId = `${userId}-${feedItemId}-${Date.now()}`
      return this.createUserFeedItem({
        id: userFeedItemId,
        userId,
        feedItemId,
        isRead: false
      })
    }
  }

  async addBookmarkToFeedItem(userId: string, feedItemId: string, bookmarkId: number): Promise<UserFeedItem> {
    // First check if user feed item exists
    const existing = await this.getUserFeedItem(userId, feedItemId)
    
    if (existing) {
      await this.db
        .update(schema.userFeedItems)
        .set({
          bookmarkId: bookmarkId.toString()
        })
        .where(and(
          eq(schema.userFeedItems.userId, userId),
          eq(schema.userFeedItems.feedItemId, feedItemId)
        ))
      
      return {
        ...existing,
        bookmarkId
      }
    } else {
      // Verify that the feed item exists before creating user feed item
      const feedItem = await this.getFeedItem(feedItemId)
      if (!feedItem) {
        throw new Error(`Feed item ${feedItemId} not found`)
      }
      
      // Create new user feed item with bookmark
      const userFeedItemId = `${userId}-${feedItemId}-${Date.now()}`
      return this.createUserFeedItem({
        id: userFeedItemId,
        userId,
        feedItemId,
        isRead: false,
        bookmarkId
      })
    }
  }

  private mapFeedItemWithContent(feedItemRow: any, contentRow: any): FeedItem {
    return {
      id: feedItemRow.id,
      subscriptionId: feedItemRow.subscriptionId,
      externalId: contentRow.externalId,
      title: contentRow.title,
      description: contentRow.description || undefined,
      thumbnailUrl: contentRow.thumbnailUrl || undefined,
      publishedAt: contentRow.publishedAt ? new Date(contentRow.publishedAt) : new Date(),
      durationSeconds: contentRow.durationSeconds || undefined,
      externalUrl: contentRow.url,
      
      // Phase 1 fields
      viewCount: contentRow.viewCount || undefined,
      likeCount: contentRow.likeCount || undefined,
      commentCount: contentRow.commentCount || undefined,
      popularityScore: contentRow.popularityScore || undefined,
      language: contentRow.language || undefined,
      isExplicit: contentRow.isExplicit || undefined,
      contentType: contentRow.contentType || undefined,
      category: contentRow.category || undefined,
      tags: contentRow.tags || undefined,
      
      // Phase 2 fields
      creatorId: contentRow.creatorId || undefined,
      creatorName: contentRow.creatorName || undefined,
      creatorThumbnail: contentRow.creatorThumbnail || undefined,
      creatorVerified: contentRow.creatorVerified || undefined,
      creatorSubscriberCount: contentRow.creatorSubscriberCount || undefined,
      creatorFollowerCount: contentRow.creatorFollowerCount || undefined,
      seriesMetadata: contentRow.seriesMetadata || undefined,
      seriesId: contentRow.seriesId || undefined,
      seriesName: contentRow.seriesName || undefined,
      episodeNumber: contentRow.episodeNumber || undefined,
      seasonNumber: contentRow.seasonNumber || undefined,
      totalEpisodesInSeries: contentRow.totalEpisodesInSeries || undefined,
      isLatestEpisode: contentRow.isLatestEpisode || undefined,
      
      // Phase 3 fields
      hasCaptions: contentRow.hasCaptions || undefined,
      hasHd: contentRow.hasHd || undefined,
      videoQuality: contentRow.videoQuality || undefined,
      hasTranscript: contentRow.hasTranscript || undefined,
      audioLanguages: contentRow.audioLanguages || undefined,
      audioQuality: contentRow.audioQuality || undefined,
      statisticsMetadata: contentRow.statisticsMetadata || undefined,
      technicalMetadata: contentRow.technicalMetadata || undefined,
      engagementRate: contentRow.engagementRate || undefined,
      trendingScore: contentRow.trendingScore || undefined,
      
      // Phase 4 fields
      contentFingerprint: contentRow.contentFingerprint || undefined,
      publisherCanonicalId: contentRow.publisherCanonicalId || undefined,
      crossPlatformMetadata: contentRow.crossPlatformMatches || undefined,
      normalizedTitle: contentRow.normalizedTitle || undefined,
      episodeIdentifier: contentRow.episodeIdentifier || undefined,
      
      createdAt: new Date(feedItemRow.addedToFeedAt)
    }
  }

  private mapUserFeedItem(row: any): UserFeedItem {
    return {
      id: row.id,
      userId: row.userId,
      feedItemId: row.feedItemId,
      isRead: Boolean(row.isRead),
      bookmarkId: row.bookmarkId ? parseInt(row.bookmarkId) : undefined,
      readAt: row.readAt ? new Date(row.readAt) : undefined,
      createdAt: new Date(row.createdAt)
    }
  }

  private mapSubscription(row: any): any {
    return {
      id: row.id,
      providerId: row.providerId,
      externalId: row.externalId,
      title: row.title,
      creatorName: row.creatorName,
      description: row.description || undefined,
      thumbnailUrl: row.thumbnailUrl || undefined,
      subscriptionUrl: row.subscriptionUrl || undefined,
      totalEpisodes: row.totalEpisodes || undefined
    }
  }
}

// Type definitions for internal use
interface UserFeedItemWithDetails {
  id: string
  feedItem: FeedItem & { subscription: any }
  isRead: boolean
  readAt?: Date
  bookmarkId?: string
  createdAt: Date
}

interface SubscriptionWithUnreadCount {
  subscription: any
  unreadCount: number
  lastUpdated: Date
}