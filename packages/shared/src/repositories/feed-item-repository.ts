export interface FeedItem {
  id: string
  subscriptionId: string
  externalId: string
  title: string
  description?: string
  thumbnailUrl?: string
  publishedAt: Date
  durationSeconds?: number
  externalUrl: string
  
  // Phase 1: Engagement metrics
  viewCount?: number
  likeCount?: number
  commentCount?: number
  popularityScore?: number // 0-100 normalized
  
  // Phase 1: Classification fields
  language?: string
  isExplicit?: boolean
  contentType?: string // 'video', 'podcast', 'short', 'live'
  category?: string
  tags?: string // JSON array
  
  // Phase 2: Creator/Channel Information
  creatorId?: string
  creatorName?: string
  creatorThumbnail?: string
  creatorVerified?: boolean
  creatorSubscriberCount?: number // YouTube
  creatorFollowerCount?: number // Spotify
  
  // Phase 2: Series/Show Context
  seriesMetadata?: string // JSON object
  seriesId?: string
  seriesName?: string
  episodeNumber?: number
  seasonNumber?: number
  totalEpisodesInSeries?: number
  isLatestEpisode?: boolean
  
  // Phase 3: Technical metadata
  hasCaptions?: boolean
  hasHd?: boolean
  videoQuality?: string // '1080p', '4K', etc.
  hasTranscript?: boolean
  audioLanguages?: string // JSON array of ISO 639-1 codes
  audioQuality?: string // 'high', 'medium', 'low'
  
  // Phase 3: Aggregated metadata
  statisticsMetadata?: string // JSON object for engagement metrics
  technicalMetadata?: string // JSON object for technical details
  
  // Phase 3: Calculated metrics
  engagementRate?: number // Engagement rate (0-1 as decimal)
  trendingScore?: number // 0-100 score
  
  createdAt: Date
}

export interface UserFeedItem {
  id: string
  userId: string
  feedItemId: string
  isRead: boolean
  bookmarkId?: number
  readAt?: Date
  createdAt: Date
}

export interface FeedItemWithReadState extends FeedItem {
  userFeedItem?: UserFeedItem
}

export interface FeedItemRepository {
  // Feed item operations
  getFeedItem(id: string): Promise<FeedItem | null>
  getFeedItemsBySubscription(subscriptionId: string): Promise<FeedItem[]>
  createFeedItem(feedItem: Omit<FeedItem, 'createdAt'>): Promise<FeedItem>
  createFeedItems(feedItems: Omit<FeedItem, 'createdAt'>[]): Promise<FeedItem[]>
  findOrCreateFeedItem(feedItem: Omit<FeedItem, 'id' | 'createdAt'>): Promise<FeedItem>

  // User feed item operations
  getUserFeedItem(userId: string, feedItemId: string): Promise<UserFeedItem | null>
  getUserFeedItems(userId: string, options?: {
    isRead?: boolean
    subscriptionIds?: string[]
    limit?: number
    offset?: number
  }): Promise<FeedItemWithReadState[]>
  createUserFeedItem(userFeedItem: Omit<UserFeedItem, 'createdAt'>): Promise<UserFeedItem>
  createUserFeedItems(userFeedItems: Omit<UserFeedItem, 'createdAt'>[]): Promise<UserFeedItem[]>
  markAsRead(userId: string, feedItemId: string): Promise<UserFeedItem>
  markAsUnread(userId: string, feedItemId: string): Promise<UserFeedItem>
  addBookmarkToFeedItem(userId: string, feedItemId: string, bookmarkId: number): Promise<UserFeedItem>
}