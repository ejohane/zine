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

export const insertUserSchema = createInsertSchema(users)
export const selectUserSchema = createSelectSchema(users)
export const insertCreatorSchema = createInsertSchema(creators)
export const selectCreatorSchema = createSelectSchema(creators)
export const insertBookmarkSchema = createInsertSchema(bookmarks)
export const selectBookmarkSchema = createSelectSchema(bookmarks)

export type User = typeof users.$inferSelect
export type NewUser = typeof users.$inferInsert
export type Creator = typeof creators.$inferSelect
export type NewCreator = typeof creators.$inferInsert
export type Bookmark = typeof bookmarks.$inferSelect
export type NewBookmark = typeof bookmarks.$inferInsert