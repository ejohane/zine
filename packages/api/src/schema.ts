import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core'
import { createInsertSchema, createSelectSchema } from 'drizzle-zod'

// ============================================================================
// EXISTING TABLES (unchanged)
// ============================================================================

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
  verified: integer('verified', { mode: 'boolean' }).default(false), // Verification status
  subscriberCount: integer('subscriber_count'),    // Number of subscribers/followers
  followerCount: integer('follower_count'),        // Alternative follower count
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
  
  // Two-tier model enhancements (migration 0016)
  alternativeNames: text('alternative_names'),     // JSON array of known aliases
  platformHandles: text('platform_handles'),       // JSON object: {youtube: "@handle", spotify: "name"}
  contentSourceIds: text('content_source_ids'),    // JSON array of content_source IDs
})

// Two-tier model: Content sources (what users subscribe to)
export const contentSources = sqliteTable('content_sources', {
  id: text('id').primaryKey(),                    // Format: {platform}:{external_id}
  externalId: text('external_id').notNull(),      // Platform's ID
  platform: text('platform').notNull(),           // 'youtube', 'spotify', 'rss'
  sourceType: text('source_type').notNull(),      // 'channel', 'show', 'playlist', 'series'
  
  title: text('title').notNull(),
  description: text('description'),
  thumbnailUrl: text('thumbnail_url'),
  url: text('url').notNull(),                     // Canonical URL
  
  creatorId: text('creator_id').references(() => creators.id),  // Links to creators table
  creatorName: text('creator_name'),              // Display name from platform
  
  subscriberCount: integer('subscriber_count'),   // YouTube subscribers
  totalEpisodes: integer('total_episodes'),       // Spotify episode count
  videoCount: integer('video_count'),             // YouTube video count
  isVerified: integer('is_verified', { mode: 'boolean' }).default(false),
  
  lastPolledAt: integer('last_polled_at', { mode: 'timestamp' }),
  etag: text('etag'),                             // For conditional requests
  uploadsPlaylistId: text('uploads_playlist_id'), // YouTube specific
  
  metadata: text('metadata'),                     // JSON for platform-specific data
  
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
  videoCount: integer('video_count'),                     // For YouTube change detection
  uploadsPlaylistId: text('uploads_playlist_id'),          // Cache playlist ID
  etag: text('etag'),                                      // For ETag caching
  lastPolledAt: integer('last_polled_at', { mode: 'timestamp' }),
  
  // Two-tier model: Link to content source (migration 0018)
  contentSourceId: text('content_source_id').references(() => contentSources.id),
  
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
  
  // Phase 3: Calculated channel metrics
  engagementRateAvg: integer('engagement_rate_avg'), // stored as integer (rate * 10000)
  popularityAvg: integer('popularity_avg'), // Average popularity score
  uploadSchedule: text('upload_schedule'), // JSON object with schedule analysis
  
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

// Phase 4: Cross-platform matching tables
export const publishers = sqliteTable('publishers', {
  id: text('id').primaryKey(),
  canonicalName: text('canonical_name').notNull(), // Primary/official name
  alternativeNames: text('alternative_names'), // JSON array of known aliases
  verified: integer('verified', { mode: 'boolean' }).default(false),
  primaryPlatform: text('primary_platform'), // Main platform (youtube/spotify)
  platformIdentities: text('platform_identities').notNull(), // JSON object: {youtube: {id, name}, spotify: {id, name}}
  metadata: text('metadata'), // JSON object for additional data
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
})

export const contentMatches = sqliteTable('content_matches', {
  id: text('id').primaryKey(),
  contentFingerprint: text('content_fingerprint').notNull(),
  platformA: text('platform_a').notNull(),
  contentIdA: text('content_id_a').notNull(),
  platformB: text('platform_b').notNull(),
  contentIdB: text('content_id_b').notNull(),
  matchConfidence: real('match_confidence').notNull(), // 0.0 to 1.0
  matchReasons: text('match_reasons').notNull(), // JSON array of match factors
  verified: integer('verified', { mode: 'boolean' }).default(false), // Human-verified match
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
})

// ============================================================================
// NEW UNIFIED CONTENT MODEL TABLES
// ============================================================================

// Main content table - single source of truth for all content metadata
export const content = sqliteTable('content', {
  // Primary identification
  id: text('id').primaryKey(), // Format: "{provider}-{external_id}"
  externalId: text('external_id').notNull(),
  provider: text('provider').notNull(), // 'youtube', 'spotify', 'twitter', 'web'

  // Core metadata
  url: text('url').notNull(),
  canonicalUrl: text('canonical_url'), // Normalized URL
  title: text('title').notNull(),
  description: text('description'),
  thumbnailUrl: text('thumbnail_url'),
  faviconUrl: text('favicon_url'),
  publishedAt: integer('published_at', { mode: 'timestamp' }),
  durationSeconds: integer('duration_seconds'),

  // Engagement metrics (Phase 1 fields)
  viewCount: integer('view_count'),
  likeCount: integer('like_count'),
  commentCount: integer('comment_count'),
  shareCount: integer('share_count'),
  saveCount: integer('save_count'),
  popularityScore: integer('popularity_score'), // 0-100 normalized
  engagementRate: real('engagement_rate'), // Decimal 0-1
  trendingScore: integer('trending_score'), // 0-100

  // Creator/Publisher information (Phase 2 fields)
  // Foreign key to creators table - this is the single source of truth for creator data
  creatorId: text('creator_id'),

  // Series/Episode context (Phase 2 fields)
  seriesId: text('series_id'),
  seriesName: text('series_name'),
  episodeNumber: integer('episode_number'),
  seasonNumber: integer('season_number'),
  totalEpisodesInSeries: integer('total_episodes_in_series'),
  isLatestEpisode: integer('is_latest_episode', { mode: 'boolean' }).default(false),
  seriesMetadata: text('series_metadata'), // JSON for additional series data

  // Content classification (Phase 1 fields)
  contentType: text('content_type'), // 'video', 'podcast', 'article', 'post', 'short', 'live'
  category: text('category'),
  subcategory: text('subcategory'),
  language: text('language'), // ISO 639-1 code
  isExplicit: integer('is_explicit', { mode: 'boolean' }).default(false),
  ageRestriction: text('age_restriction'),
  tags: text('tags'), // JSON array of content tags
  topics: text('topics'), // JSON array of detected topics

  // Technical metadata (Phase 3 fields)
  hasCaptions: integer('has_captions', { mode: 'boolean' }).default(false),
  hasTranscript: integer('has_transcript', { mode: 'boolean' }).default(false),
  hasHd: integer('has_hd', { mode: 'boolean' }).default(false),
  has4k: integer('has_4k', { mode: 'boolean' }).default(false),
  videoQuality: text('video_quality'), // '480p', '720p', '1080p', '4K'
  audioQuality: text('audio_quality'), // 'low', 'medium', 'high', 'lossless'
  audioLanguages: text('audio_languages'), // JSON array of ISO 639-1 codes
  captionLanguages: text('caption_languages'), // JSON array of ISO 639-1 codes

  // Cross-platform matching (Phase 4 fields)
  contentFingerprint: text('content_fingerprint'), // SHA-256 hash for matching
  publisherCanonicalId: text('publisher_canonical_id'), // Unified publisher ID
  normalizedTitle: text('normalized_title'), // For fuzzy matching
  episodeIdentifier: text('episode_identifier'), // Standardized episode ID
  crossPlatformMatches: text('cross_platform_matches'), // JSON array of matches

  // Aggregated metadata objects for flexibility
  statisticsMetadata: text('statistics_metadata'), // JSON: platform-specific stats
  technicalMetadata: text('technical_metadata'), // JSON: platform-specific technical details
  enrichmentMetadata: text('enrichment_metadata'), // JSON: API response data
  extendedMetadata: text('extended_metadata'), // JSON: future expansion fields

  // Article full-text content (for offline reading)
  fullTextContent: text('full_text_content'), // Cleaned article HTML
  fullTextExtractedAt: integer('full_text_extracted_at', { mode: 'timestamp' }), // When full text was extracted

  // Tracking
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
  lastEnrichedAt: integer('last_enriched_at', { mode: 'timestamp' }),
  enrichmentVersion: integer('enrichment_version').default(1),
  enrichmentSource: text('enrichment_source'), // 'api', 'oembed', 'opengraph', 'manual'
})

// Simplified bookmarks table - references content
export const bookmarks = sqliteTable('bookmarks', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id),
  contentId: text('content_id').notNull().references(() => content.id),

  // User-specific data only
  notes: text('notes'),
  userTags: text('user_tags'), // JSON array of user's personal tags
  collections: text('collections'), // JSON array of collection IDs
  status: text('status').notNull().default('active'), // 'active', 'archived', 'deleted'
  isFavorite: integer('is_favorite', { mode: 'boolean' }).default(false),
  readProgress: integer('read_progress'), // Percentage for articles/videos

  // User timestamps
  bookmarkedAt: integer('bookmarked_at', { mode: 'timestamp' }).notNull(),
  lastAccessedAt: integer('last_accessed_at', { mode: 'timestamp' }),
  archivedAt: integer('archived_at', { mode: 'timestamp' }),
})

// Simplified feed_items table - references content
export const feedItems = sqliteTable('feed_items', {
  id: text('id').primaryKey(),
  subscriptionId: text('subscription_id').notNull().references(() => subscriptions.id),
  contentId: text('content_id').notNull().references(() => content.id),

  // Feed-specific data only
  addedToFeedAt: integer('added_to_feed_at', { mode: 'timestamp' }).notNull(),
  positionInFeed: integer('position_in_feed'), // For maintaining feed order
})

// User feed interactions table
export const userFeedItems = sqliteTable('user_feed_items', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id),
  feedItemId: text('feed_item_id').notNull().references(() => feedItems.id),

  // Interaction tracking
  isRead: integer('is_read', { mode: 'boolean' }).notNull().default(false),
  isSaved: integer('is_saved', { mode: 'boolean' }).notNull().default(false),
  isHidden: integer('is_hidden', { mode: 'boolean' }).notNull().default(false),
  readAt: integer('read_at', { mode: 'timestamp' }),
  savedAt: integer('saved_at', { mode: 'timestamp' }),
  engagementTime: integer('engagement_time'), // Seconds spent

  // Connection to bookmark if saved
  bookmarkId: text('bookmark_id').references(() => bookmarks.id),

  // Timestamps
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
})

// ============================================================================
// SCHEMAS AND TYPES
// ============================================================================

// User schemas
export const insertUserSchema = createInsertSchema(users)
export const selectUserSchema = createSelectSchema(users)

// Creator schemas
export const insertCreatorSchema = createInsertSchema(creators)
export const selectCreatorSchema = createSelectSchema(creators)

// Content Source schemas (two-tier model)
export const insertContentSourceSchema = createInsertSchema(contentSources)
export const selectContentSourceSchema = createSelectSchema(contentSources)

// Content schemas (new)
export const insertContentSchema = createInsertSchema(content)
export const selectContentSchema = createSelectSchema(content)

// Bookmark schemas (updated)
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

// Feed schemas (updated)
export const insertFeedItemSchema = createInsertSchema(feedItems)
export const selectFeedItemSchema = createSelectSchema(feedItems)
export const insertUserFeedItemSchema = createInsertSchema(userFeedItems)
export const selectUserFeedItemSchema = createSelectSchema(userFeedItems)

// Token migration schemas
export const insertTokenMigrationStatusSchema = createInsertSchema(tokenMigrationStatus)
export const selectTokenMigrationStatusSchema = createSelectSchema(tokenMigrationStatus)

// Durable Object schemas
export const insertDurableObjectStatusSchema = createInsertSchema(durableObjectStatus)
export const selectDurableObjectStatusSchema = createSelectSchema(durableObjectStatus)
export const insertDurableObjectMetricsSchema = createInsertSchema(durableObjectMetrics)
export const selectDurableObjectMetricsSchema = createSelectSchema(durableObjectMetrics)

// Publisher schemas
export const insertPublishersSchema = createInsertSchema(publishers)
export const selectPublishersSchema = createSelectSchema(publishers)
export const insertContentMatchesSchema = createInsertSchema(contentMatches)
export const selectContentMatchesSchema = createSelectSchema(contentMatches)

// Type exports
export type User = typeof users.$inferSelect
export type NewUser = typeof users.$inferInsert
export type Creator = typeof creators.$inferSelect
export type NewCreator = typeof creators.$inferInsert

// Content Source types (two-tier model)
export type ContentSource = typeof contentSources.$inferSelect
export type NewContentSource = typeof contentSources.$inferInsert

// Content types (new)
export type Content = typeof content.$inferSelect
export type NewContent = typeof content.$inferInsert

// Bookmark types (updated)
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

// Feed types (updated)
export type FeedItem = typeof feedItems.$inferSelect
export type NewFeedItem = typeof feedItems.$inferInsert
export type UserFeedItem = typeof userFeedItems.$inferSelect
export type NewUserFeedItem = typeof userFeedItems.$inferInsert

// Token migration types
export type TokenMigrationStatus = typeof tokenMigrationStatus.$inferSelect
export type NewTokenMigrationStatus = typeof tokenMigrationStatus.$inferInsert

// Durable Object types
export type DurableObjectStatus = typeof durableObjectStatus.$inferSelect
export type NewDurableObjectStatus = typeof durableObjectStatus.$inferInsert
export type DurableObjectMetrics = typeof durableObjectMetrics.$inferSelect
export type NewDurableObjectMetrics = typeof durableObjectMetrics.$inferInsert

// Publisher types
export type Publisher = typeof publishers.$inferSelect
export type NewPublisher = typeof publishers.$inferInsert
export type ContentMatch = typeof contentMatches.$inferSelect
export type NewContentMatch = typeof contentMatches.$inferInsert