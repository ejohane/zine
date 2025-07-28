import { 
  FeedItemRepository, 
  FeedItem, 
  UserFeedItem, 
  FeedItemWithReadState 
} from './feed-item-repository'

export class MockFeedItemRepository implements FeedItemRepository {
  private feedItems: FeedItem[] = []
  private userFeedItems: UserFeedItem[] = []

  async getFeedItem(id: string): Promise<FeedItem | null> {
    return this.feedItems.find(item => item.id === id) || null
  }

  async getFeedItemsBySubscription(subscriptionId: string): Promise<FeedItem[]> {
    return this.feedItems.filter(item => item.subscriptionId === subscriptionId)
  }

  async createFeedItem(feedItem: Omit<FeedItem, 'createdAt'>): Promise<FeedItem> {
    const newItem: FeedItem = {
      ...feedItem,
      createdAt: new Date()
    }
    this.feedItems.push(newItem)
    return newItem
  }

  async createFeedItems(feedItems: Omit<FeedItem, 'createdAt'>[]): Promise<FeedItem[]> {
    const newItems = feedItems.map(item => ({
      ...item,
      createdAt: new Date()
    }))
    this.feedItems.push(...newItems)
    return newItems
  }

  async findOrCreateFeedItem(feedItem: Omit<FeedItem, 'id' | 'createdAt'>): Promise<FeedItem> {
    const existing = this.feedItems.find(
      item => item.subscriptionId === feedItem.subscriptionId && item.externalId === feedItem.externalId
    )
    
    if (existing) {
      return existing
    }
    
    return this.createFeedItem({
      ...feedItem,
      id: `${feedItem.subscriptionId}-${feedItem.externalId}-${Date.now()}`
    })
  }

  async getUserFeedItem(userId: string, feedItemId: string): Promise<UserFeedItem | null> {
    return this.userFeedItems.find(
      item => item.userId === userId && item.feedItemId === feedItemId
    ) || null
  }

  async getUserFeedItems(userId: string, options?: {
    isRead?: boolean
    subscriptionIds?: string[]
    limit?: number
    offset?: number
  }): Promise<FeedItemWithReadState[]> {
    let userItems = this.userFeedItems.filter(item => item.userId === userId)
    
    if (options?.isRead !== undefined) {
      userItems = userItems.filter(item => item.isRead === options.isRead)
    }
    
    let feedItems = userItems.map(userItem => {
      const feedItem = this.feedItems.find(item => item.id === userItem.feedItemId)!
      return {
        ...feedItem,
        userFeedItem: userItem
      }
    })
    
    if (options?.subscriptionIds) {
      feedItems = feedItems.filter(item => 
        options.subscriptionIds!.includes(item.subscriptionId)
      )
    }
    
    // Sort by publishedAt descending
    feedItems.sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime())
    
    if (options?.offset) {
      feedItems = feedItems.slice(options.offset)
    }
    
    if (options?.limit) {
      feedItems = feedItems.slice(0, options.limit)
    }
    
    return feedItems
  }

  async createUserFeedItem(userFeedItem: Omit<UserFeedItem, 'createdAt'>): Promise<UserFeedItem> {
    const newUserItem: UserFeedItem = {
      ...userFeedItem,
      createdAt: new Date()
    }
    this.userFeedItems.push(newUserItem)
    return newUserItem
  }

  async createUserFeedItems(userFeedItems: Omit<UserFeedItem, 'createdAt'>[]): Promise<UserFeedItem[]> {
    const newItems = userFeedItems.map(item => ({
      ...item,
      createdAt: new Date()
    }))
    this.userFeedItems.push(...newItems)
    return newItems
  }

  async markAsRead(userId: string, feedItemId: string): Promise<UserFeedItem> {
    const userItemIndex = this.userFeedItems.findIndex(
      item => item.userId === userId && item.feedItemId === feedItemId
    )
    
    if (userItemIndex === -1) {
      throw new Error('UserFeedItem not found')
    }
    
    this.userFeedItems[userItemIndex] = {
      ...this.userFeedItems[userItemIndex],
      isRead: true,
      readAt: new Date()
    }
    
    return this.userFeedItems[userItemIndex]
  }

  async markAsUnread(userId: string, feedItemId: string): Promise<UserFeedItem> {
    const userItemIndex = this.userFeedItems.findIndex(
      item => item.userId === userId && item.feedItemId === feedItemId
    )
    
    if (userItemIndex === -1) {
      throw new Error('UserFeedItem not found')
    }
    
    this.userFeedItems[userItemIndex] = {
      ...this.userFeedItems[userItemIndex],
      isRead: false,
      readAt: undefined
    }
    
    return this.userFeedItems[userItemIndex]
  }

  async addBookmarkToFeedItem(userId: string, feedItemId: string, bookmarkId: number): Promise<UserFeedItem> {
    const userItemIndex = this.userFeedItems.findIndex(
      item => item.userId === userId && item.feedItemId === feedItemId
    )
    
    if (userItemIndex === -1) {
      throw new Error('UserFeedItem not found')
    }
    
    this.userFeedItems[userItemIndex] = {
      ...this.userFeedItems[userItemIndex],
      bookmarkId
    }
    
    return this.userFeedItems[userItemIndex]
  }
}