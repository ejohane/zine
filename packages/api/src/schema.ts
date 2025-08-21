import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core'
import { createInsertSchema, createSelectSchema } from 'drizzle-zod'

export const users = sqliteTable('users', {
  id: text('id').primaryKey(),                    // Clerk user ID
  email: text('email').notNull(),                 // Primary email from Clerk
  firstName: text('first_name'),                  // First name from Clerk
  lastName: text('last_name'),                    // Last name from Clerk
  imageUrl: text('image_url'),                    // Profile image URL from Clerk
  durableObjectId: text('durable_object_id'),     // DO ID for user's subscription manager
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
})

export const creators = sqliteTable('creators', {
  id: text('id').primaryKey(),              // Platform-specific ID (e.g. youtube:UCabc123)
  name: text('name').notNull(),             // Display name
  handle: text('handle'),                   // Platform handle (e.g. @username)
  avatarUrl: text('avatar_url'),            // Profile image
  bio: text('bio'),                         // Description
  url: text('url'),                         // Canonical profile URL
  platforms: text('platforms'),            // JSON array of platforms
  externalLinks: text('external_links'),   // JSON array of {title, url} objects
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
})

export const bookmarks = sqliteTable('bookmarks', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: text('user_id').notNull().references(() => users.id),
  url: text('url').notNull(),                        // Normalized canonical URL
  originalUrl: text('original_url').notNull(),       // Original URL as submitted
  title: text('title').notNull(),
  description: text('description'),
  source: text('source'),                            // Platform enum (youtube, spotify, etc.)
  contentType: text('content_type'),                 // Content type enum (video, article, etc.)
  thumbnailUrl: text('thumbnail_url'),
  faviconUrl: text('favicon_url'),
  publishedAt: integer('published_at', { mode: 'timestamp' }), // Original publish date
  language: text('language'),
  status: text('status').notNull().default('active'), // active, archived, deleted
  creatorId: text('creator_id'),                      // FK to creators table
  
  // Extended metadata (JSON fields)
  videoMetadata: text('video_metadata'),              // {duration, view_count}
  podcastMetadata: text('podcast_metadata'),          // {episode_title, episode_number, series_name, duration}
  articleMetadata: text('article_metadata'),          // {author_name, word_count, reading_time}
  postMetadata: text('post_metadata'),                // {post_text, like_count, repost_count}
  
  // Standard fields
  tags: text('tags'),                                 // JSON array
  notes: text('notes'),                               // User notes
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
})

// Subscription providers (spotify, youtube)
export const subscriptionProviders = sqliteTable('subscription_providers', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  oauthConfig: text('oauth_config').notNull(),  // JSON
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
})

// User's connected accounts
export const userAccounts = sqliteTable('user_accounts', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id),
  providerId: text('provider_id').notNull().references(() => subscriptionProviders.id),
  externalAccountId: text('external_account_id').notNull(),
  // Tokens are now stored in Durable Objects, not in the database
  // accessToken: text('access_token').notNull(), // REMOVED - stored in DO
  // refreshToken: text('refresh_token'), // REMOVED - stored in DO
  // expiresAt: integer('expires_at', { mode: 'timestamp' }), // REMOVED - stored in DO
  isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
})

// Available subscriptions (podcasts, channels)
export const subscriptions = sqliteTable('subscriptions', {
  id: text('id').primaryKey(),
  providerId: text('provider_id').notNull().references(() => subscriptionProviders.id),
  externalId: text('external_id').notNull(),
  title: text('title').notNull(),
  creatorName: text('creator_name').notNull(),
  description: text('description'),
  thumbnailUrl: text('thumbnail_url'),
  subscriptionUrl: text('subscription_url'),
  totalEpisodes: integer('total_episodes'),
  videoCount: integer('video_count'),                     // NEW: For YouTube change detection
  uploadsPlaylistId: text('uploads_playlist_id'),          // NEW: Cache playlist ID
  etag: text('etag'),                                      // NEW: For ETag caching
  lastPolledAt: integer('last_polled_at', { mode: 'timestamp' }),
  
  // Phase 2: Richer channel/show data
  subscriberCount: integer('subscriber_count'),
  isVerified: integer('is_verified', { mode: 'boolean' }).default(false),
  contentCategories: text('content_categories'), // JSON array
  primaryLanguage: text('primary_language'),
  averageDuration: integer('average_duration'), // seconds
  uploadFrequency: text('upload_frequency'), // 'daily', 'weekly', 'monthly'
  lastContentDate: integer('last_content_date', { mode: 'timestamp' }),
  totalContentCount: integer('total_content_count'),
  channelMetadata: text('channel_metadata'), // JSON for platform-specific data
  
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
})

// User's subscription choices
export const userSubscriptions = sqliteTable('user_subscriptions', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id),
  subscriptionId: text('subscription_id').notNull().references(() => subscriptions.id),
  isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
})

// Feed items (episodes, videos)
export const feedItems = sqliteTable('feed_items', {
  id: text('id').primaryKey(),
  subscriptionId: text('subscription_id').notNull().references(() => subscriptions.id),
  externalId: text('external_id').notNull(),
  title: text('title').notNull(),
  description: text('description'),
  thumbnailUrl: text('thumbnail_url'),
  publishedAt: integer('published_at', { mode: 'timestamp' }).notNull(),
  durationSeconds: integer('duration_seconds'),
  externalUrl: text('external_url').notNull(),
  
  // Phase 1: Engagement metrics
  viewCount: integer('view_count'),
  likeCount: integer('like_count'),
  commentCount: integer('comment_count'),
  popularityScore: integer('popularity_score'), // 0-100 normalized
  
  // Phase 1: Classification fields
  language: text('language'),
  isExplicit: integer('is_explicit', { mode: 'boolean' }).default(false),
  contentType: text('content_type'), // 'video', 'podcast', 'short', 'live'
  category: text('category'),
  tags: text('tags'), // JSON array
  
  // Phase 2: Creator/Channel Information
  creatorId: text('creator_id'),
  creatorName: text('creator_name'),
  creatorThumbnail: text('creator_thumbnail'),
  creatorVerified: integer('creator_verified', { mode: 'boolean' }).default(false),
  creatorSubscriberCount: integer('creator_subscriber_count'), // YouTube
  creatorFollowerCount: integer('creator_follower_count'), // Spotify
  
  // Phase 2: Series/Show Context
  seriesMetadata: text('series_metadata'), // JSON object
  seriesId: text('series_id'),
  seriesName: text('series_name'),
  episodeNumber: integer('episode_number'),
  seasonNumber: integer('season_number'),
  totalEpisodesInSeries: integer('total_episodes_in_series'),
  isLatestEpisode: integer('is_latest_episode', { mode: 'boolean' }).default(false),
  
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
})

// User's read/unread state
export const userFeedItems = sqliteTable('user_feed_items', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id),
  feedItemId: text('feed_item_id').notNull().references(() => feedItems.id),
  isRead: integer('is_read', { mode: 'boolean' }).notNull().default(false),
  bookmarkId: integer('bookmark_id').references(() => bookmarks.id),
  readAt: integer('read_at', { mode: 'timestamp' }),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
})

// Token migration tracking
export const tokenMigrationStatus = sqliteTable('token_migration_status', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id),
  provider: text('provider').notNull(),
  status: text('status').notNull(), // pending, in_progress, completed, failed
  attemptCount: integer('attempt_count').notNull().default(0),
  error: text('error'),
  startedAt: integer('started_at', { mode: 'timestamp' }),
  completedAt: integer('completed_at', { mode: 'timestamp' }),
  lastAttemptAt: integer('last_attempt_at', { mode: 'timestamp' }),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
})

// Durable Object status tracking
export const durableObjectStatus = sqliteTable('durable_object_status', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id),
  durableObjectId: text('durable_object_id').notNull(),
  status: text('status').notNull(), // healthy, unhealthy, inactive
  lastPollTime: integer('last_poll_time', { mode: 'timestamp' }),
  lastPollSuccess: integer('last_poll_success', { mode: 'boolean' }).notNull().default(true),
  lastPollError: text('last_poll_error'),
  totalPollCount: integer('total_poll_count').notNull().default(0),
  successfulPollCount: integer('successful_poll_count').notNull().default(0),
  failedPollCount: integer('failed_poll_count').notNull().default(0),
  totalNewItems: integer('total_new_items').notNull().default(0),
  lastHealthCheckTime: integer('last_health_check_time', { mode: 'timestamp' }),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
})

// Durable Object polling metrics
export const durableObjectMetrics = sqliteTable('durable_object_metrics', {
  id: text('id').primaryKey(),
  durableObjectId: text('durable_object_id').notNull(),
  pollTimestamp: integer('poll_timestamp', { mode: 'timestamp' }).notNull(),
  provider: text('provider').notNull(), // spotify, youtube
  subscriptionCount: integer('subscription_count').notNull(),
  newItemsFound: integer('new_items_found').notNull(),
  pollDurationMs: integer('poll_duration_ms').notNull(),
  errors: text('errors'), // JSON array of errors
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
})

export const insertUserSchema = createInsertSchema(users)
export const selectUserSchema = createSelectSchema(users)
export const insertCreatorSchema = createInsertSchema(creators)
export const selectCreatorSchema = createSelectSchema(creators)
export const insertBookmarkSchema = createInsertSchema(bookmarks)
export const selectBookmarkSchema = createSelectSchema(bookmarks)

// Subscription schemas
export const insertSubscriptionProviderSchema = createInsertSchema(subscriptionProviders)
export const selectSubscriptionProviderSchema = createSelectSchema(subscriptionProviders)
export const insertUserAccountSchema = createInsertSchema(userAccounts)
export const selectUserAccountSchema = createSelectSchema(userAccounts)
export const insertSubscriptionSchema = createInsertSchema(subscriptions)
export const selectSubscriptionSchema = createSelectSchema(subscriptions)
export const insertUserSubscriptionSchema = createInsertSchema(userSubscriptions)
export const selectUserSubscriptionSchema = createSelectSchema(userSubscriptions)
export const insertFeedItemSchema = createInsertSchema(feedItems)
export const selectFeedItemSchema = createSelectSchema(feedItems)
export const insertUserFeedItemSchema = createInsertSchema(userFeedItems)
export const selectUserFeedItemSchema = createSelectSchema(userFeedItems)
export const insertTokenMigrationStatusSchema = createInsertSchema(tokenMigrationStatus)
export const selectTokenMigrationStatusSchema = createSelectSchema(tokenMigrationStatus)
export const insertDurableObjectStatusSchema = createInsertSchema(durableObjectStatus)
export const selectDurableObjectStatusSchema = createSelectSchema(durableObjectStatus)
export const insertDurableObjectMetricsSchema = createInsertSchema(durableObjectMetrics)
export const selectDurableObjectMetricsSchema = createSelectSchema(durableObjectMetrics)

export type User = typeof users.$inferSelect
export type NewUser = typeof users.$inferInsert
export type Creator = typeof creators.$inferSelect
export type NewCreator = typeof creators.$inferInsert
export type Bookmark = typeof bookmarks.$inferSelect
export type NewBookmark = typeof bookmarks.$inferInsert

// Subscription types
export type SubscriptionProvider = typeof subscriptionProviders.$inferSelect
export type NewSubscriptionProvider = typeof subscriptionProviders.$inferInsert
export type UserAccount = typeof userAccounts.$inferSelect
export type NewUserAccount = typeof userAccounts.$inferInsert
export type Subscription = typeof subscriptions.$inferSelect
export type NewSubscription = typeof subscriptions.$inferInsert
export type UserSubscription = typeof userSubscriptions.$inferSelect
export type NewUserSubscription = typeof userSubscriptions.$inferInsert
export type FeedItem = typeof feedItems.$inferSelect
export type NewFeedItem = typeof feedItems.$inferInsert
export type UserFeedItem = typeof userFeedItems.$inferSelect
export type NewUserFeedItem = typeof userFeedItems.$inferInsert
export type TokenMigrationStatus = typeof tokenMigrationStatus.$inferSelect
export type NewTokenMigrationStatus = typeof tokenMigrationStatus.$inferInsert
export type DurableObjectStatus = typeof durableObjectStatus.$inferSelect
export type NewDurableObjectStatus = typeof durableObjectStatus.$inferInsert
export type DurableObjectMetrics = typeof durableObjectMetrics.$inferSelect
export type NewDurableObjectMetrics = typeof durableObjectMetrics.$inferInsert