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

  async getUserFeedItemsBySubscription(userId: string, subscriptionId: string, unreadOnly: boolean = false, limit: number = 50, offset: number = 0): Promise<UserFeedItemWithDetails[]> {
    let query = this.db
      .select({
        userFeedItem: schema.userFeedItems,
        feedItem: schema.feedItems,
        subscription: schema.subscriptions
      })
      .from(schema.userFeedItems)
      .innerJoin(schema.feedItems, eq(schema.userFeedItems.feedItemId, schema.feedItems.id))
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
      .orderBy(desc(schema.feedItems.publishedAt))
      .limit(limit)
      .offset(offset)

    const results = await query

    return results.map(row => ({
      id: row.userFeedItem.id,
      feedItem: {
        ...this.mapFeedItem(row.feedItem),
        subscription: this.mapSubscription(row.subscription)
      },
      isRead: Boolean(row.userFeedItem.isRead),
      readAt: row.userFeedItem.readAt ? new Date(row.userFeedItem.readAt) : undefined,
      bookmarkId: row.userFeedItem.bookmarkId || undefined,
      createdAt: new Date(row.userFeedItem.createdAt)
    }))
  }

  async getSubscriptionsWithUnreadCounts(userId: string): Promise<SubscriptionWithUnreadCount[]> {
    const results = await this.db
      .select({
        subscription: schema.subscriptions,
        unreadCount: schema.userFeedItems.isRead,
        lastUpdated: schema.feedItems.publishedAt
      })
      .from(schema.subscriptions)
      .innerJoin(schema.feedItems, eq(schema.subscriptions.id, schema.feedItems.subscriptionId))
      .leftJoin(schema.userFeedItems, and(
        eq(schema.feedItems.id, schema.userFeedItems.feedItemId),
        eq(schema.userFeedItems.userId, userId)
      ))
      .orderBy(desc(schema.feedItems.publishedAt))

    // Group by subscription and calculate unread counts
    const subscriptionMap = new Map<string, SubscriptionWithUnreadCount>()
    
    for (const row of results) {
      const subId = row.subscription.id
      
      if (!subscriptionMap.has(subId)) {
        subscriptionMap.set(subId, {
          subscription: this.mapSubscription(row.subscription),
          unreadCount: 0,
          lastUpdated: new Date(row.lastUpdated)
        })
      }
      
      const subscription = subscriptionMap.get(subId)!
      
      // Count unread items (userFeedItem.isRead is false or null means unread)
      if (row.unreadCount === false || row.unreadCount === null) {
        subscription.unreadCount++
      }
      
      // Update last updated time if this item is newer
      const itemDate = new Date(row.lastUpdated)
      if (itemDate > subscription.lastUpdated) {
        subscription.lastUpdated = itemDate
      }
    }

    return Array.from(subscriptionMap.values())
      .sort((a, b) => b.lastUpdated.getTime() - a.lastUpdated.getTime())
  }

  async getUserFeedItemsWithDetails(userId: string, unreadOnly: boolean = false, limit: number = 50, offset: number = 0): Promise<UserFeedItemWithDetails[]> {
    let query = this.db
      .select({
        userFeedItem: schema.userFeedItems,
        feedItem: schema.feedItems,
        subscription: schema.subscriptions
      })
      .from(schema.userFeedItems)
      .innerJoin(schema.feedItems, eq(schema.userFeedItems.feedItemId, schema.feedItems.id))
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
      .orderBy(desc(schema.feedItems.publishedAt))
      .limit(limit)
      .offset(offset)

    const results = await query

    return results.map(row => ({
      id: row.userFeedItem.id,
      feedItem: {
        ...this.mapFeedItem(row.feedItem),
        subscription: this.mapSubscription(row.subscription)
      },
      isRead: Boolean(row.userFeedItem.isRead),
      readAt: row.userFeedItem.readAt ? new Date(row.userFeedItem.readAt) : undefined,
      bookmarkId: row.userFeedItem.bookmarkId || undefined,
      createdAt: new Date(row.userFeedItem.createdAt)
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
      createdAt: new Date(row.createdAt)
    }
  }
}

// Additional types for feed UI
export interface UserFeedItemWithDetails {
  id: string
  feedItem: FeedItem & {
    subscription: any
  }
  isRead: boolean
  readAt?: Date
  bookmarkId?: number
  createdAt: Date
}

export interface SubscriptionWithUnreadCount {
  subscription: any
  unreadCount: number
  lastUpdated: Date
}