import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core'
import { createInsertSchema, createSelectSchema } from 'drizzle-zod'

export const users = sqliteTable('users', {
  id: text('id').primaryKey(),                    // Clerk user ID
  email: text('email').notNull(),                 // Primary email from Clerk
  firstName: text('first_name'),                  // First name from Clerk
  lastName: text('last_name'),                    // Last name from Clerk
  imageUrl: text('image_url'),                    // Profile image URL from Clerk
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
  accessToken: text('access_token').notNull(),
  refreshToken: text('refresh_token'),
  expiresAt: integer('expires_at', { mode: 'timestamp' }),
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