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
          c.id as content_id,
          c.url as content_url,
          c.title as content_title,
          c.description as content_description,
          c.thumbnail_url as content_thumbnail_url,
          c.favicon_url as content_favicon_url,
          c.creator_id,
          c.creator_name,
          c.creator_handle,
          c.creator_thumbnail as creator_avatar_url,
          c.content_type,
          c.published_at as content_published_at
        FROM bookmarks b
        LEFT JOIN content c ON b.content_id = c.id
        ORDER BY b.bookmarked_at DESC
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
          c.id as content_id,
          c.url as content_url,
          c.title as content_title,
          c.description as content_description,
          c.thumbnail_url as content_thumbnail_url,
          c.favicon_url as content_favicon_url,
          c.creator_id,
          c.creator_name,
          c.creator_handle,
          c.creator_thumbnail as creator_avatar_url,
          c.content_type,
          c.published_at as content_published_at
        FROM bookmarks b
        LEFT JOIN content c ON b.content_id = c.id
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
      
      // First, create or get content
      // Use btoa for base64 encoding (available in Cloudflare Workers)
      const urlHash = btoa(bookmark.url || '').replace(/[^a-zA-Z0-9]/g, '').substring(0, 20)
      const contentId = `web-${urlHash}`
      
      // Insert content if not exists
      await this.db.prepare(`
        INSERT OR IGNORE INTO content (
          id, external_id, provider, url, canonical_url, title, description,
          content_type, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        contentId,
        contentId,
        'web',
        bookmark.url || '',
        bookmark.url || '',
        bookmark.title,
        bookmark.description || null,
        'article', // default content type
        now,
        now
      ).run()
      
      // Insert the bookmark with generated ID
      const bookmarkId = crypto.randomUUID()
      const result = await this.db.prepare(`
        INSERT INTO bookmarks (
          id, user_id, content_id, user_tags, status, bookmarked_at
        ) VALUES (?, ?, ?, ?, ?, ?)
        RETURNING *
      `).bind(
        bookmarkId,
        bookmark.userId,
        contentId,
        bookmark.tags ? JSON.stringify(bookmark.tags) : null,
        'active',
        now
      ).first()

      if (!result) {
        throw new Error('Failed to create bookmark - no result returned')
      }

      // Get full bookmark with content
      const fullBookmark = await this.getByIdAndUserId(String(result.id), bookmark.userId)
      if (!fullBookmark) {
        throw new Error('Failed to retrieve created bookmark')
      }
      return fullBookmark
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
          c.id as content_id,
          c.url as content_url,
          c.title as content_title,
          c.description as content_description,
          c.thumbnail_url as content_thumbnail_url,
          c.favicon_url as content_favicon_url,
          c.creator_id,
          c.creator_name,
          c.creator_handle,
          c.creator_thumbnail as creator_avatar_url,
          c.content_type,
          c.published_at as content_published_at
        FROM bookmarks b
        LEFT JOIN content c ON b.content_id = c.id
        WHERE b.user_id = ?
        ORDER BY b.bookmarked_at DESC
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
          c.id as content_id,
          c.url as content_url,
          c.title as content_title,
          c.description as content_description,
          c.thumbnail_url as content_thumbnail_url,
          c.favicon_url as content_favicon_url,
          c.creator_id,
          c.creator_name,
          c.creator_handle,
          c.creator_thumbnail as creator_avatar_url,
          c.content_type,
          c.published_at as content_published_at
        FROM bookmarks b
        LEFT JOIN content c ON b.content_id = c.id
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
      
      // Generate content ID based on provider or URL
      const provider = bookmarkData.source || 'web'
      // Use btoa for base64 encoding (available in Cloudflare Workers)
      const urlHash = btoa(bookmarkData.url).replace(/[^a-zA-Z0-9]/g, '').substring(0, 20)
      const contentId = `${provider}-${urlHash}`
      
      // Insert or update content
      await this.db.prepare(`
        INSERT OR REPLACE INTO content (
          id, external_id, provider, url, canonical_url, title, description,
          thumbnail_url, favicon_url, published_at, content_type,
          creator_id, creator_name, creator_handle,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        contentId,
        contentId,
        provider,
        bookmarkData.url,
        bookmarkData.originalUrl,
        bookmarkData.title,
        bookmarkData.description || null,
        bookmarkData.thumbnailUrl || null,
        bookmarkData.faviconUrl || null,
        bookmarkData.publishedAt ? bookmarkData.publishedAt.getTime() : null,
        bookmarkData.contentType || null,
        bookmarkData.creatorId || null,
        null, // creator_name - would need to be passed separately
        null, // creator_handle - would need to be passed separately
        now,
        now
      ).run()
      
      // Insert bookmark with generated ID
      const bookmarkId = crypto.randomUUID()
      const result = await this.db.prepare(`
        INSERT INTO bookmarks (
          id, user_id, content_id, user_tags, notes, status, bookmarked_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
        RETURNING *
      `).bind(
        bookmarkId,
        bookmarkData.userId,
        contentId,
        bookmarkData.tags ? JSON.stringify(bookmarkData.tags) : null,
        bookmarkData.notes || null,
        bookmarkData.status || 'active',
        now
      ).first()

      if (!result) {
        throw new Error('Failed to create bookmark - no result returned')
      }

      // Get full bookmark with content
      const fullBookmark = await this.getByIdAndUserId(String(result.id), bookmarkData.userId)
      if (!fullBookmark) {
        throw new Error('Failed to retrieve created bookmark')
      }
      return fullBookmark
    } catch (error) {
      console.error('Error creating bookmark with metadata:', error)
      throw new Error('Failed to create bookmark with metadata in database')
    }
  }

  /**
   * Map database row to Bookmark object
   */
  private mapRowToBookmark(row: any): Bookmark {
    // Map from new schema where content is separate
    const bookmark: Bookmark = {
      id: String(row.id),
      userId: row.user_id,
      url: row.content_url || '',
      originalUrl: row.content_url || '',
      title: row.content_title || '',
      description: row.content_description || undefined,
      source: undefined, // Not in new schema
      contentType: row.content_type || undefined,
      thumbnailUrl: row.content_thumbnail_url || undefined,
      faviconUrl: row.content_favicon_url || undefined,
      publishedAt: row.content_published_at ? Number(row.content_published_at) : undefined,
      language: undefined, // Not in query result
      status: row.status || 'active',
      creatorId: row.creator_id || undefined,
      videoMetadata: undefined, // Not in new schema
      podcastMetadata: undefined, // Not in new schema
      articleMetadata: undefined, // Not in new schema
      postMetadata: undefined, // Not in new schema
      tags: row.user_tags ? JSON.parse(row.user_tags) : undefined,
      notes: row.notes || undefined,
      createdAt: row.bookmarked_at ? Number(row.bookmarked_at) : Date.now(),
      updatedAt: row.bookmarked_at ? Number(row.bookmarked_at) : Date.now()
    }

    // Add creator if present
    if (row.creator_id && row.creator_name) {
      bookmark.creator = {
        id: row.creator_id,
        name: row.creator_name,
        handle: row.creator_handle || undefined,
        avatarUrl: row.creator_avatar_url || undefined,
        bio: undefined, // Not in content table
        url: undefined, // Not in content table
        platforms: undefined, // Not in content table
        externalLinks: undefined, // Not in content table
        createdAt: undefined,
        updatedAt: undefined
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