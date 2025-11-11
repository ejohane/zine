import { sqliteTable, AnySQLiteColumn, integer, text, numeric, foreignKey } from "drizzle-orm/sqlite-core"
  import { sql } from "drizzle-orm"

export const d1Migrations = sqliteTable("d1_migrations", {
	id: integer().primaryKey({ autoIncrement: true }),
	name: text(),
	appliedAt: numeric("applied_at").default(sql`(CURRENT_TIMESTAMP)`).notNull(),
});

export const creators = sqliteTable("creators", {
	id: text().primaryKey().notNull(),
	name: text().notNull(),
	handle: text(),
	avatarUrl: text("avatar_url"),
	bio: text(),
	url: text(),
	platforms: text(),
	externalLinks: text("external_links"),
	createdAt: integer("created_at").notNull(),
	updatedAt: integer("updated_at").notNull(),
});

export const contentSources = sqliteTable("content_sources", {
	id: text().primaryKey().notNull(),
	externalId: text("external_id").notNull(),
	platform: text().notNull(),
	sourceType: text("source_type").notNull(),
	title: text().notNull(),
	description: text(),
	thumbnailUrl: text("thumbnail_url"),
	url: text().notNull(),
	creatorId: text("creator_id").references(() => creators.id),
	creatorName: text("creator_name"),
	subscriberCount: integer("subscriber_count"),
	totalEpisodes: integer("total_episodes"),
	videoCount: integer("video_count"),
	isVerified: integer("is_verified").default(0),
	lastPolledAt: integer("last_polled_at"),
	etag: text(),
	uploadsPlaylistId: text("uploads_playlist_id"),
	metadata: text(),
	createdAt: integer("created_at").notNull(),
	updatedAt: integer("updated_at").notNull(),
});

export const users = sqliteTable("users", {
	id: text().primaryKey().notNull(),
	email: text().notNull(),
	firstName: text("first_name"),
	lastName: text("last_name"),
	imageUrl: text("image_url"),
	createdAt: integer("created_at").notNull(),
	updatedAt: integer("updated_at").notNull(),
	durableObjectId: text("durable_object_id"),
});

export const bookmarks = sqliteTable("bookmarks", {
	id: integer().primaryKey({ autoIncrement: true }).notNull(),
	userId: text("user_id").notNull().references(() => users.id),
	url: text().notNull(),
	originalUrl: text("original_url").notNull(),
	title: text().notNull(),
	description: text(),
	source: text(),
	contentType: text("content_type"),
	thumbnailUrl: text("thumbnail_url"),
	faviconUrl: text("favicon_url"),
	publishedAt: integer("published_at"),
	language: text(),
	status: text().default("active").notNull(),
	creatorId: text("creator_id"),
	videoMetadata: text("video_metadata"),
	podcastMetadata: text("podcast_metadata"),
	articleMetadata: text("article_metadata"),
	postMetadata: text("post_metadata"),
	tags: text(),
	notes: text(),
	createdAt: integer("created_at").notNull(),
	updatedAt: integer("updated_at").notNull(),
});

export const subscriptionProviders = sqliteTable("subscription_providers", {
	id: text().primaryKey().notNull(),
	name: text().notNull(),
	oauthConfig: text("oauth_config").notNull(),
	createdAt: integer("created_at").notNull(),
});

export const userAccounts = sqliteTable("user_accounts", {
	id: text().primaryKey().notNull(),
	userId: text("user_id").notNull().references(() => users.id),
	providerId: text("provider_id").notNull().references(() => subscriptionProviders.id),
	externalAccountId: text("external_account_id").notNull(),
	accessToken: text("access_token").notNull(),
	refreshToken: text("refresh_token"),
	expiresAt: integer("expires_at"),
	createdAt: integer("created_at").notNull(),
	updatedAt: integer("updated_at").notNull(),
});

export const subscriptions = sqliteTable("subscriptions", {
	id: text().primaryKey().notNull(),
	providerId: text("provider_id").notNull().references(() => subscriptionProviders.id),
	externalId: text("external_id").notNull(),
	title: text().notNull(),
	creatorName: text("creator_name").notNull(),
	description: text(),
	thumbnailUrl: text("thumbnail_url"),
	subscriptionUrl: text("subscription_url"),
	createdAt: integer("created_at").notNull(),
	totalEpisodes: integer("total_episodes"),
});

export const userSubscriptions = sqliteTable("user_subscriptions", {
	id: text().primaryKey().notNull(),
	userId: text("user_id").notNull().references(() => users.id),
	subscriptionId: text("subscription_id").notNull().references(() => subscriptions.id),
	isActive: integer("is_active").default(true).notNull(),
	createdAt: integer("created_at").notNull(),
	updatedAt: integer("updated_at").notNull(),
});

export const feedItems = sqliteTable("feed_items", {
	id: text().primaryKey().notNull(),
	subscriptionId: text("subscription_id").notNull().references(() => subscriptions.id),
	externalId: text("external_id").notNull(),
	title: text().notNull(),
	description: text(),
	thumbnailUrl: text("thumbnail_url"),
	publishedAt: integer("published_at").notNull(),
	durationSeconds: integer("duration_seconds"),
	externalUrl: text("external_url").notNull(),
	createdAt: integer("created_at").notNull(),
});

export const userFeedItems = sqliteTable("user_feed_items", {
	id: text().primaryKey().notNull(),
	userId: text("user_id").notNull().references(() => users.id),
	feedItemId: text("feed_item_id").notNull().references(() => feedItems.id),
	isRead: integer("is_read").default(false).notNull(),
	bookmarkId: integer("bookmark_id").references(() => bookmarks.id),
	readAt: integer("read_at"),
	createdAt: integer("created_at").notNull(),
});

export const tokenMigrationStatus = sqliteTable("token_migration_status", {
	id: text().primaryKey().notNull(),
	userId: text("user_id").notNull().references(() => users.id),
	provider: text().notNull(),
	status: text().notNull(),
	attemptCount: integer("attempt_count").default(0).notNull(),
	error: text(),
	startedAt: integer("started_at"),
	completedAt: integer("completed_at"),
	lastAttemptAt: integer("last_attempt_at"),
	createdAt: integer("created_at").notNull(),
	updatedAt: integer("updated_at").notNull(),
});

