/**
 * D1 Database Repository Implementation
 */

import type { BookmarkRepository } from '@zine/shared'
import type { Bookmark, CreateBookmark, UpdateBookmark } from '@zine/shared'
// import { bookmarks, creators } from './schema' // TODO: Use these for type validation

export class D1BookmarkRepository implements BookmarkRepository {
  constructor(private db: D1Database) {}

  async getAll(): Promise<Bookmark[]> {
    try {
      const result = await this.db.prepare(`
        SELECT 
          b.*,
          c.id as creator_id,
          c.name as creator_name,
          c.handle as creator_handle,
          c.avatar_url as creator_avatar_url,
          c.bio as creator_bio,
          c.url as creator_url,
          c.platforms as creator_platforms,
          c.external_links as creator_external_links,
          c.created_at as creator_created_at,
          c.updated_at as creator_updated_at
        FROM bookmarks b
        LEFT JOIN creators c ON b.creator_id = c.id
        ORDER BY b.created_at DESC
      `).all()

      return result.results.map(row => this.mapRowToBookmark(row))
    } catch (error) {
      console.error('Error fetching all bookmarks:', error)
      throw new Error('Failed to fetch bookmarks from database')
    }
  }

  async getById(id: string): Promise<Bookmark | null> {
    try {
      const result = await this.db.prepare(`
        SELECT 
          b.*,
          c.id as creator_id,
          c.name as creator_name,
          c.handle as creator_handle,
          c.avatar_url as creator_avatar_url,
          c.bio as creator_bio,
          c.url as creator_url,
          c.platforms as creator_platforms,
          c.external_links as creator_external_links,
          c.created_at as creator_created_at,
          c.updated_at as creator_updated_at
        FROM bookmarks b
        LEFT JOIN creators c ON b.creator_id = c.id
        WHERE b.id = ?
      `).bind(id).first()

      if (!result) {
        return null
      }

      return this.mapRowToBookmark(result)
    } catch (error) {
      console.error('Error fetching bookmark by id:', error)
      throw new Error('Failed to fetch bookmark from database')
    }
  }

  async create(bookmark: CreateBookmark & { userId: string }): Promise<Bookmark> {
    try {
      const now = Date.now()
      
      // Insert the bookmark
      const result = await this.db.prepare(`
        INSERT INTO bookmarks (
          user_id, url, original_url, title, description, source, content_type,
          thumbnail_url, favicon_url, published_at, language, status, creator_id,
          video_metadata, podcast_metadata, article_metadata, post_metadata,
          tags, notes, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        RETURNING *
      `).bind(
        bookmark.userId,
        bookmark.url || '',
        bookmark.url || '', // original_url same as url for basic create
        bookmark.title,
        bookmark.description || null,
        null, // source
        null, // content_type
        null, // thumbnail_url
        null, // favicon_url
        null, // published_at
        null, // language
        'active', // status
        null, // creator_id
        null, // video_metadata
        null, // podcast_metadata
        null, // article_metadata
        null, // post_metadata
        bookmark.tags ? JSON.stringify(bookmark.tags) : null,
        null, // notes
        now,
        now
      ).first()

      if (!result) {
        throw new Error('Failed to create bookmark - no result returned')
      }

      return this.mapRowToBookmark(result)
    } catch (error) {
      console.error('Error creating bookmark:', error)
      throw new Error('Failed to create bookmark in database')
    }
  }

  async update(id: string, bookmark: UpdateBookmark): Promise<Bookmark | null> {
    try {
      const now = Date.now()
      
      // Build dynamic update query based on provided fields
      const updates: string[] = []
      const values: any[] = []
      
      if (bookmark.title !== undefined) {
        updates.push('title = ?')
        values.push(bookmark.title)
      }
      if (bookmark.description !== undefined) {
        updates.push('description = ?')
        values.push(bookmark.description)
      }
      if (bookmark.url !== undefined) {
        updates.push('url = ?')
        values.push(bookmark.url)
      }
      if (bookmark.tags !== undefined) {
        updates.push('tags = ?')
        values.push(JSON.stringify(bookmark.tags))
      }
      
      updates.push('updated_at = ?')
      values.push(now)
      values.push(id) // for WHERE clause
      
      if (updates.length === 1) {
        // Only updated_at, nothing to update
        return this.getById(id)
      }
      
      const result = await this.db.prepare(`
        UPDATE bookmarks 
        SET ${updates.join(', ')}
        WHERE id = ?
        RETURNING *
      `).bind(...values).first()

      if (!result) {
        return null
      }

      return this.mapRowToBookmark(result)
    } catch (error) {
      console.error('Error updating bookmark:', error)
      throw new Error('Failed to update bookmark in database')
    }
  }

  async delete(id: string): Promise<boolean> {
    try {
      const result = await this.db.prepare(`
        DELETE FROM bookmarks WHERE id = ?
      `).bind(id).run()

      return result.meta.changes > 0
    } catch (error) {
      console.error('Error deleting bookmark:', error)
      throw new Error('Failed to delete bookmark from database')
    }
  }

  // User-scoped methods for better security and performance
  async getByUserId(userId: string): Promise<Bookmark[]> {
    try {
      const result = await this.db.prepare(`
        SELECT 
          b.*,
          c.id as creator_id,
          c.name as creator_name,
          c.handle as creator_handle,
          c.avatar_url as creator_avatar_url,
          c.bio as creator_bio,
          c.url as creator_url,
          c.platforms as creator_platforms,
          c.external_links as creator_external_links,
          c.created_at as creator_created_at,
          c.updated_at as creator_updated_at
        FROM bookmarks b
        LEFT JOIN creators c ON b.creator_id = c.id
        WHERE b.user_id = ?
        ORDER BY b.created_at DESC
      `).bind(userId).all()

      return result.results.map(row => this.mapRowToBookmark(row))
    } catch (error) {
      console.error('Error fetching bookmarks for user:', error)
      throw new Error('Failed to fetch user bookmarks from database')
    }
  }

  async getByIdAndUserId(id: string, userId: string): Promise<Bookmark | null> {
    try {
      const result = await this.db.prepare(`
        SELECT 
          b.*,
          c.id as creator_id,
          c.name as creator_name,
          c.handle as creator_handle,
          c.avatar_url as creator_avatar_url,
          c.bio as creator_bio,
          c.url as creator_url,
          c.platforms as creator_platforms,
          c.external_links as creator_external_links,
          c.created_at as creator_created_at,
          c.updated_at as creator_updated_at
        FROM bookmarks b
        LEFT JOIN creators c ON b.creator_id = c.id
        WHERE b.id = ? AND b.user_id = ?
      `).bind(id, userId).first()

      if (!result) {
        return null
      }

      return this.mapRowToBookmark(result)
    } catch (error) {
      console.error('Error fetching bookmark by id and user:', error)
      throw new Error('Failed to fetch user bookmark from database')
    }
  }

  async updateByIdAndUserId(id: string, bookmark: UpdateBookmark, userId: string): Promise<Bookmark | null> {
    try {
      const now = Date.now()
      
      // Build dynamic update query based on provided fields
      const updates: string[] = []
      const values: any[] = []
      
      if (bookmark.title !== undefined) {
        updates.push('title = ?')
        values.push(bookmark.title)
      }
      if (bookmark.description !== undefined) {
        updates.push('description = ?')
        values.push(bookmark.description)
      }
      if (bookmark.url !== undefined) {
        updates.push('url = ?')
        values.push(bookmark.url)
      }
      if (bookmark.tags !== undefined) {
        updates.push('tags = ?')
        values.push(JSON.stringify(bookmark.tags))
      }
      
      updates.push('updated_at = ?')
      values.push(now)
      values.push(id) // for WHERE clause
      values.push(userId) // for WHERE clause
      
      if (updates.length === 1) {
        // Only updated_at, nothing to update
        return this.getByIdAndUserId(id, userId)
      }
      
      const result = await this.db.prepare(`
        UPDATE bookmarks 
        SET ${updates.join(', ')}
        WHERE id = ? AND user_id = ?
        RETURNING *
      `).bind(...values).first()

      if (!result) {
        return null
      }

      return this.mapRowToBookmark(result)
    } catch (error) {
      console.error('Error updating user bookmark:', error)
      throw new Error('Failed to update user bookmark in database')
    }
  }

  async deleteByIdAndUserId(id: string, userId: string): Promise<boolean> {
    try {
      const result = await this.db.prepare(`
        DELETE FROM bookmarks WHERE id = ? AND user_id = ?
      `).bind(id, userId).run()

      return result.meta.changes > 0
    } catch (error) {
      console.error('Error deleting user bookmark:', error)
      throw new Error('Failed to delete user bookmark from database')
    }
  }

  /**
   * Enhanced method for saving bookmarks with full metadata
   */
  async createWithMetadata(bookmarkData: {
    userId: string
    url: string
    originalUrl: string
    title: string
    description?: string
    source?: string
    contentType?: string
    thumbnailUrl?: string
    faviconUrl?: string
    publishedAt?: Date
    language?: string
    status?: string
    creatorId?: string
    videoMetadata?: any
    podcastMetadata?: any
    articleMetadata?: any
    postMetadata?: any
    tags?: string[]
    notes?: string
  }): Promise<Bookmark> {
    try {
      const now = Date.now()
      
      console.log('Creating bookmark with metadata for userId:', bookmarkData.userId)
      console.log('Bookmark data:', {
        userId: bookmarkData.userId,
        title: bookmarkData.title,
        url: bookmarkData.url,
        creatorId: bookmarkData.creatorId
      })
      
      const result = await this.db.prepare(`
        INSERT INTO bookmarks (
          user_id, url, original_url, title, description, source, content_type,
          thumbnail_url, favicon_url, published_at, language, status, creator_id,
          video_metadata, podcast_metadata, article_metadata, post_metadata,
          tags, notes, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        RETURNING *
      `).bind(
        bookmarkData.userId,
        bookmarkData.url,
        bookmarkData.originalUrl,
        bookmarkData.title,
        bookmarkData.description || null,
        bookmarkData.source || null,
        bookmarkData.contentType || null,
        bookmarkData.thumbnailUrl || null,
        bookmarkData.faviconUrl || null,
        bookmarkData.publishedAt ? bookmarkData.publishedAt.getTime() : null,
        bookmarkData.language || null,
        bookmarkData.status || 'active',
        bookmarkData.creatorId || null,
        bookmarkData.videoMetadata ? JSON.stringify(bookmarkData.videoMetadata) : null,
        bookmarkData.podcastMetadata ? JSON.stringify(bookmarkData.podcastMetadata) : null,
        bookmarkData.articleMetadata ? JSON.stringify(bookmarkData.articleMetadata) : null,
        bookmarkData.postMetadata ? JSON.stringify(bookmarkData.postMetadata) : null,
        bookmarkData.tags ? JSON.stringify(bookmarkData.tags) : null,
        bookmarkData.notes || null,
        now,
        now
      ).first()

      if (!result) {
        throw new Error('Failed to create bookmark - no result returned')
      }

      return this.mapRowToBookmark(result)
    } catch (error) {
      console.error('Error creating bookmark with metadata:', error)
      throw new Error('Failed to create bookmark with metadata in database')
    }
  }

  /**
   * Map database row to Bookmark object
   */
  private mapRowToBookmark(row: any): Bookmark {
    const bookmark: Bookmark = {
      id: String(row.id),
      userId: row.user_id,
      url: row.url,
      originalUrl: row.original_url,
      title: row.title,
      description: row.description || undefined,
      source: row.source || undefined,
      contentType: row.content_type || undefined,
      thumbnailUrl: row.thumbnail_url || undefined,
      faviconUrl: row.favicon_url || undefined,
      publishedAt: row.published_at ? new Date(row.published_at) : undefined,
      language: row.language || undefined,
      status: row.status || 'active',
      creatorId: row.creator_id || undefined,
      videoMetadata: row.video_metadata ? JSON.parse(row.video_metadata) : undefined,
      podcastMetadata: row.podcast_metadata ? JSON.parse(row.podcast_metadata) : undefined,
      articleMetadata: row.article_metadata ? JSON.parse(row.article_metadata) : undefined,
      postMetadata: row.post_metadata ? JSON.parse(row.post_metadata) : undefined,
      tags: row.tags ? JSON.parse(row.tags) : undefined,
      notes: row.notes || undefined,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at)
    }

    // Add creator if present
    if (row.creator_id && row.creator_name) {
      bookmark.creator = {
        id: row.creator_id,
        name: row.creator_name,
        handle: row.creator_handle || undefined,
        avatarUrl: row.creator_avatar_url || undefined,
        bio: row.creator_bio || undefined,
        url: row.creator_url || undefined,
        platforms: row.creator_platforms ? JSON.parse(row.creator_platforms) : undefined,
        externalLinks: row.creator_external_links ? JSON.parse(row.creator_external_links) : undefined,
        createdAt: row.creator_created_at ? new Date(row.creator_created_at) : undefined,
        updatedAt: row.creator_updated_at ? new Date(row.creator_updated_at) : undefined
      }
    }

    return bookmark
  }

  /**
   * Ensure creator exists in the database - creates creator if not exists
   */
  async ensureCreator(creatorData: {
    id: string
    name: string
    handle?: string
    avatarUrl?: string
    bio?: string
    url?: string
    platforms?: string[]
    externalLinks?: Array<{title: string, url: string}>
  }): Promise<void> {
    try {
      const now = Date.now()
      
      console.log('Running ensureCreator for:', creatorData.id)
      const result = await this.db.prepare(`
        INSERT OR IGNORE INTO creators (
          id, name, handle, avatar_url, bio, url, platforms, external_links, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        creatorData.id,
        creatorData.name,
        creatorData.handle || null,
        creatorData.avatarUrl || null,
        creatorData.bio || null,
        creatorData.url || null,
        creatorData.platforms ? JSON.stringify(creatorData.platforms) : null,
        creatorData.externalLinks ? JSON.stringify(creatorData.externalLinks) : null,
        now,
        now
      ).run()
      
      console.log('ensureCreator result:', result.meta)
    } catch (error) {
      console.error('Error ensuring creator exists:', error)
      throw new Error('Failed to ensure creator exists in database')
    }
  }

  /**
   * Ensure user exists in the database - creates user if not exists
   */
  async ensureUser(userData: {
    id: string
    email?: string
    firstName?: string
    lastName?: string
    imageUrl?: string
  }): Promise<void> {
    try {
      const now = Date.now()
      
      console.log('Running ensureUser for:', userData.id)
      const result = await this.db.prepare(`
        INSERT OR IGNORE INTO users (
          id, email, first_name, last_name, image_url, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `).bind(
        userData.id,
        userData.email || '',
        userData.firstName || null,
        userData.lastName || null,
        userData.imageUrl || null,
        now,
        now
      ).run()
      
      console.log('ensureUser result:', result.meta)
    } catch (error) {
      console.error('Error ensuring user exists:', error)
      throw new Error('Failed to ensure user exists in database')
    }
  }
}