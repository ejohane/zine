import { drizzle } from 'drizzle-orm/d1'
import { eq, and, desc, inArray } from 'drizzle-orm'
import * as schema from './schema'
import { 
  FeedItemRepository,
  FeedItem,
  UserFeedItem,
  FeedItemWithReadState
} from '@zine/shared'

export class D1FeedItemRepository implements FeedItemRepository {
  private db: ReturnType<typeof drizzle>

  constructor(d1Database: D1Database) {
    this.db = drizzle(d1Database, { schema })
  }

  async getFeedItem(id: string): Promise<FeedItem | null> {
    const feedItems = await this.db
      .select()
      .from(schema.feedItems)
      .where(eq(schema.feedItems.id, id))
      .limit(1)
    
    return feedItems.length > 0 ? this.mapFeedItem(feedItems[0]) : null
  }

  async getFeedItemsBySubscription(subscriptionId: string): Promise<FeedItem[]> {
    const feedItems = await this.db
      .select()
      .from(schema.feedItems)
      .where(eq(schema.feedItems.subscriptionId, subscriptionId))
      .orderBy(desc(schema.feedItems.publishedAt))
    
    return feedItems.map(this.mapFeedItem)
  }

  async createFeedItem(feedItem: Omit<FeedItem, 'createdAt'>): Promise<FeedItem> {
    const now = new Date()
    const newFeedItem = {
      id: feedItem.id,
      subscriptionId: feedItem.subscriptionId,
      externalId: feedItem.externalId,
      title: feedItem.title,
      description: feedItem.description || null,
      thumbnailUrl: feedItem.thumbnailUrl || null,
      publishedAt: feedItem.publishedAt,
      durationSeconds: feedItem.durationSeconds || null,
      externalUrl: feedItem.externalUrl,
      createdAt: now
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
    const newFeedItems = feedItems.map(feedItem => ({
      id: feedItem.id,
      subscriptionId: feedItem.subscriptionId,
      externalId: feedItem.externalId,
      title: feedItem.title,
      description: feedItem.description || null,
      thumbnailUrl: feedItem.thumbnailUrl || null,
      publishedAt: feedItem.publishedAt,
      durationSeconds: feedItem.durationSeconds || null,
      externalUrl: feedItem.externalUrl,
      createdAt: now
    }))

    await this.db.insert(schema.feedItems).values(newFeedItems)
    
    return feedItems.map(feedItem => ({
      ...feedItem,
      createdAt: now
    }))
  }

  async findOrCreateFeedItem(feedItem: Omit<FeedItem, 'id' | 'createdAt'>): Promise<FeedItem> {
    // Try to find existing feed item
    const existing = await this.db
      .select()
      .from(schema.feedItems)
      .where(and(
        eq(schema.feedItems.subscriptionId, feedItem.subscriptionId),
        eq(schema.feedItems.externalId, feedItem.externalId)
      ))
      .limit(1)

    if (existing.length > 0) {
      return this.mapFeedItem(existing[0])
    }

    // Create new feed item
    const id = `${feedItem.subscriptionId}-${feedItem.externalId}-${Date.now()}`
    return this.createFeedItem({ ...feedItem, id })
  }

  async getUserFeedItem(userId: string, feedItemId: string): Promise<UserFeedItem | null> {
    const userFeedItems = await this.db
      .select()
      .from(schema.userFeedItems)
      .where(and(
        eq(schema.userFeedItems.userId, userId),
        eq(schema.userFeedItems.feedItemId, feedItemId)
      ))
      .limit(1)
    
    return userFeedItems.length > 0 ? this.mapUserFeedItem(userFeedItems[0]) : null
  }

  async getUserFeedItems(userId: string, options?: {
    isRead?: boolean
    subscriptionIds?: string[]
    limit?: number
    offset?: number
  }): Promise<FeedItemWithReadState[]> {
    let query = this.db
      .select({
        feedItem: schema.feedItems,
        userFeedItem: schema.userFeedItems
      })
      .from(schema.feedItems)
      .leftJoin(
        schema.userFeedItems,
        and(
          eq(schema.userFeedItems.feedItemId, schema.feedItems.id),
          eq(schema.userFeedItems.userId, userId)
        )
      )
      .$dynamic()

    const conditions = []
    
    if (options?.isRead !== undefined) {
      if (options.isRead) {
        conditions.push(eq(schema.userFeedItems.isRead, true))
      } else {
        conditions.push(eq(schema.userFeedItems.isRead, false))
      }
    }

    if (options?.subscriptionIds && options.subscriptionIds.length > 0) {
      conditions.push(inArray(schema.feedItems.subscriptionId, options.subscriptionIds))
    }

    if (conditions.length > 0) {
      query = query.where(and(...conditions))
    }

    query = query.orderBy(desc(schema.feedItems.publishedAt))

    if (options?.limit) {
      query = query.limit(options.limit)
    }

    if (options?.offset) {
      query = query.offset(options.offset)
    }

    const results = await query

    return results.map(row => ({
      ...this.mapFeedItem(row.feedItem),
      userFeedItem: row.userFeedItem ? this.mapUserFeedItem(row.userFeedItem) : undefined
    }))
  }

  async createUserFeedItem(userFeedItem: Omit<UserFeedItem, 'createdAt'>): Promise<UserFeedItem> {
    const now = new Date()
    const newUserFeedItem = {
      id: userFeedItem.id,
      userId: userFeedItem.userId,
      feedItemId: userFeedItem.feedItemId,
      isRead: userFeedItem.isRead,
      bookmarkId: userFeedItem.bookmarkId || null,
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
      bookmarkId: userFeedItem.bookmarkId || null,
      readAt: userFeedItem.readAt || null,
      createdAt: now
    }))

    await this.db.insert(schema.userFeedItems).values(newUserFeedItems)
    
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
    const existing = await this.getUserFeedItem(userId, feedItemId)
    
    if (existing) {
      await this.db
        .update(schema.userFeedItems)
        .set({
          bookmarkId
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

  private mapUserFeedItem(row: any): UserFeedItem {
    return {
      id: row.id,
      userId: row.userId,
      feedItemId: row.feedItemId,
      isRead: Boolean(row.isRead),
      bookmarkId: row.bookmarkId || undefined,
      readAt: row.readAt ? new Date(row.readAt) : undefined,
      createdAt: new Date(row.createdAt)
    }
  }
}