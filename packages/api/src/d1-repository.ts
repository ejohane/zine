/**
 * D1 Database Repository Implementation
 */

import type { BookmarkRepository } from '@zine/shared'
import type { Bookmark, CreateBookmark, UpdateBookmark } from '@zine/shared'
import { normalizeUrl, resolveSpotifyResource } from '@zine/shared'
// import { bookmarks, creators } from './schema' // TODO: Use these for type validation

export class D1BookmarkRepository implements BookmarkRepository {
  constructor(private db: D1Database) {}

  private static parseCrossPlatformMatches(raw: unknown): Array<{ platform?: string; id?: string; url?: string; confidence?: number }> {
    if (!raw) return []
    if (Array.isArray(raw)) return raw as Array<{ platform?: string; id?: string; url?: string; confidence?: number }>
    if (typeof raw === 'string') {
      try {
        const parsed = JSON.parse(raw)
        return Array.isArray(parsed) ? parsed : []
      } catch {
        return []
      }
    }
    return []
  }

  private static buildAlternateLinks(row: any): Array<{ provider?: string; url: string; externalId?: string; confidence?: number }> {
    const links: Array<{ provider?: string; url: string; externalId?: string; confidence?: number }> = []
    const seen = new Set<string>()

    const addLink = (provider?: string | null, url?: string | null, externalId?: string | null, confidence?: number) => {
      if (!url) return
      const key = `${provider ?? 'unknown'}::${url}`
      if (seen.has(key)) return
      seen.add(key)
      links.push({
        provider: provider ?? undefined,
        url,
        externalId: externalId ?? undefined,
        confidence
      })
    }

    addLink(row.content_provider, row.content_url, row.content_external_id)

    const matches = D1BookmarkRepository.parseCrossPlatformMatches(row.content_cross_platform_matches)
    for (const match of matches) {
      addLink(match.platform, match.url, match.id, match.confidence)
    }

    return links
  }

  async getAll(): Promise<Bookmark[]> {
    try {
      const result = await this.db.prepare(`
        SELECT
          b.*,
          c.id as content_id,
          c.url as content_url,
          c.external_id as content_external_id,
          c.title as content_title,
          c.description as content_description,
          c.thumbnail_url as content_thumbnail_url,
          c.favicon_url as content_favicon_url,
          c.creator_id,
          c.content_type,
          c.published_at as content_published_at,
          c.provider as content_provider,
          c.cross_platform_matches as content_cross_platform_matches,
          c.extended_metadata as content_extended_metadata,
          c.full_text_content as content_full_text_content,
          c.full_text_extracted_at as content_full_text_extracted_at,
          cr.name as creator_name,
          cr.handle as creator_handle,
          cr.avatar_url as creator_avatar_url,
          cr.verified as creator_verified,
          cr.subscriber_count as creator_subscriber_count,
          cr.follower_count as creator_follower_count,
          cr.bio as creator_bio,
          cr.url as creator_url,
          cr.platforms as creator_platforms
        FROM bookmarks b
        LEFT JOIN content c ON b.content_id = c.id
        LEFT JOIN creators cr ON c.creator_id = cr.id
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
          c.external_id as content_external_id,
          c.title as content_title,
          c.description as content_description,
          c.thumbnail_url as content_thumbnail_url,
          c.favicon_url as content_favicon_url,
          c.creator_id,
          c.content_type,
          c.published_at as content_published_at,
          c.provider as content_provider,
          c.cross_platform_matches as content_cross_platform_matches,
          c.extended_metadata as content_extended_metadata,
          c.full_text_content as content_full_text_content,
          c.full_text_extracted_at as content_full_text_extracted_at,
          cr.name as creator_name,
          cr.handle as creator_handle,
          cr.avatar_url as creator_avatar_url,
          cr.verified as creator_verified,
          cr.subscriber_count as creator_subscriber_count,
          cr.follower_count as creator_follower_count,
          cr.bio as creator_bio,
          cr.url as creator_url,
          cr.platforms as creator_platforms
        FROM bookmarks b
        LEFT JOIN content c ON b.content_id = c.id
        LEFT JOIN creators cr ON c.creator_id = cr.id
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
      const nowTimestamp = Date.now()
      const nowIso = new Date(nowTimestamp).toISOString()
      
      // First, create or get content
      // Use btoa for base64 encoding (available in Cloudflare Workers)
      const urlHash = btoa(bookmark.url || '').replace(/[^a-zA-Z0-9]/g, '').substring(0, 20)
      const contentId = `web-${urlHash}`
      
      // Insert content if not exists (content timestamps use ISO strings)
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
        nowIso,
        nowIso
      ).run()
      
      // Insert the bookmark with generated ID (bookmark timestamps use integers)
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
        nowTimestamp
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

  async archive(id: string): Promise<Bookmark | null> {
    try {
      const now = Date.now()
      const result = await this.db.prepare(`
        UPDATE bookmarks 
        SET status = 'archived', 
            archived_at = ?
        WHERE id = ? AND status = 'active'
        RETURNING id
      `).bind(now, id).first()

      if (!result) {
        return null
      }

      return this.getById(id)
    } catch (error) {
      console.error('Error archiving bookmark:', error)
      throw new Error('Failed to archive bookmark in database')
    }
  }

  async unarchive(id: string): Promise<Bookmark | null> {
    try {
      const result = await this.db.prepare(`
        UPDATE bookmarks 
        SET status = 'active', 
            archived_at = NULL
        WHERE id = ? AND status = 'archived'
        RETURNING id
      `).bind(id).first()

      if (!result) {
        return null
      }

      return this.getById(id)
    } catch (error) {
      console.error('Error unarchiving bookmark:', error)
      throw new Error('Failed to unarchive bookmark in database')
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
          c.external_id as content_external_id,
          c.title as content_title,
          c.description as content_description,
          c.thumbnail_url as content_thumbnail_url,
          c.favicon_url as content_favicon_url,
          c.creator_id,
          c.content_type,
          c.published_at as content_published_at,
          c.provider as content_provider,
          c.cross_platform_matches as content_cross_platform_matches,
          cr.name as creator_name,
          cr.handle as creator_handle,
          cr.avatar_url as creator_avatar_url,
          cr.verified as creator_verified,
          cr.subscriber_count as creator_subscriber_count,
          cr.follower_count as creator_follower_count,
          cr.bio as creator_bio,
          cr.url as creator_url,
          cr.platforms as creator_platforms
        FROM bookmarks b
        LEFT JOIN content c ON b.content_id = c.id
        LEFT JOIN creators cr ON c.creator_id = cr.id
        WHERE b.user_id = ?
        ORDER BY b.bookmarked_at DESC
      `).bind(userId).all()

      return result.results.map(row => this.mapRowToBookmark(row))
    } catch (error) {
      console.error('Error fetching bookmarks for user:', error)
      throw new Error('Failed to fetch user bookmarks from database')
    }
  }

  async searchByUserId(
    userId: string,
    params: {
      query: string
      limit?: number
      offset?: number
    }
  ): Promise<{ results: Bookmark[]; totalCount: number }> {
    const safeLimit = Math.min(Math.max(params.limit ?? 20, 1), 500)
    const safeOffset = Math.max(params.offset ?? 0, 0)
    const trimmedQuery = params.query.trim().toLowerCase()

    if (!trimmedQuery) {
      return { results: [], totalCount: 0 }
    }

    const likeQuery = `%${trimmedQuery}%`

    try {
      const countResult = await this.db.prepare(`
        SELECT COUNT(*) as count
        FROM bookmarks b
        LEFT JOIN content c ON b.content_id = c.id
        LEFT JOIN creators cr ON c.creator_id = cr.id
        WHERE b.user_id = ?
          AND b.status IN ('active', 'archived')
          AND (
            LOWER(IFNULL(c.title, '')) LIKE ?
            OR LOWER(IFNULL(cr.name, '')) LIKE ?
          )
      `).bind(userId, likeQuery, likeQuery).first()

      const totalCount = countResult ? Number(countResult.count ?? 0) : 0

      if (totalCount === 0) {
        return { results: [], totalCount: 0 }
      }

      const result = await this.db.prepare(`
        SELECT 
          b.*,
          c.id as content_id,
          c.url as content_url,
          c.external_id as content_external_id,
          c.title as content_title,
          c.description as content_description,
          c.thumbnail_url as content_thumbnail_url,
          c.favicon_url as content_favicon_url,
          c.creator_id,
          c.content_type,
          c.published_at as content_published_at,
          c.provider as content_provider,
          c.cross_platform_matches as content_cross_platform_matches,
          cr.name as creator_name,
          cr.handle as creator_handle,
          cr.avatar_url as creator_avatar_url,
          cr.verified as creator_verified,
          cr.subscriber_count as creator_subscriber_count,
          cr.follower_count as creator_follower_count,
          cr.bio as creator_bio,
          cr.url as creator_url,
          cr.platforms as creator_platforms
        FROM bookmarks b
        LEFT JOIN content c ON b.content_id = c.id
        LEFT JOIN creators cr ON c.creator_id = cr.id
        WHERE b.user_id = ?
          AND b.status IN ('active', 'archived')
          AND (
            LOWER(IFNULL(c.title, '')) LIKE ?
            OR LOWER(IFNULL(cr.name, '')) LIKE ?
          )
        ORDER BY b.bookmarked_at DESC
        LIMIT ? OFFSET ?
      `).bind(userId, likeQuery, likeQuery, safeLimit, safeOffset).all()

      return {
        results: result.results.map(row => this.mapRowToBookmark(row)),
        totalCount
      }
    } catch (error) {
      console.error('Error searching bookmarks for user:', error)
      throw new Error('Failed to search user bookmarks in database')
    }
  }

  async getByIdAndUserId(id: string, userId: string): Promise<Bookmark | null> {
    try {
      const result = await this.db.prepare(`
        SELECT
          b.*,
          c.id as content_id,
          c.url as content_url,
          c.external_id as content_external_id,
          c.title as content_title,
          c.description as content_description,
          c.thumbnail_url as content_thumbnail_url,
          c.favicon_url as content_favicon_url,
          c.creator_id,
          c.content_type,
          c.published_at as content_published_at,
          c.provider as content_provider,
          c.cross_platform_matches as content_cross_platform_matches,
          c.extended_metadata as content_extended_metadata,
          c.full_text_content as content_full_text_content,
          c.full_text_extracted_at as content_full_text_extracted_at,
          cr.name as creator_name,
          cr.handle as creator_handle,
          cr.avatar_url as creator_avatar_url,
          cr.verified as creator_verified,
          cr.subscriber_count as creator_subscriber_count,
          cr.follower_count as creator_follower_count,
          cr.bio as creator_bio,
          cr.url as creator_url,
          cr.platforms as creator_platforms
        FROM bookmarks b
        LEFT JOIN content c ON b.content_id = c.id
        LEFT JOIN creators cr ON c.creator_id = cr.id
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
    creatorName?: string
    creatorHandle?: string
    creatorThumbnail?: string
    creatorVerified?: boolean
    creatorSubscriberCount?: number
    creatorFollowerCount?: number
    videoMetadata?: any
    podcastMetadata?: any
    articleMetadata?: any
    postMetadata?: any
    fullTextContent?: string
    fullTextExtractedAt?: Date
    tags?: string[]
    notes?: string
  }  ): Promise<Bookmark> {
    try {
      const now = new Date().toISOString()
      
      console.log('Creating bookmark with metadata for userId:', bookmarkData.userId)
      console.log('Bookmark data:', {
        userId: bookmarkData.userId,
        title: bookmarkData.title,
        url: bookmarkData.url,
        creatorId: bookmarkData.creatorId
      })
      
      const normalizedUrlResult = normalizeUrl(bookmarkData.url)
      const canonicalUrl = normalizedUrlResult.normalized
      const urlForMatching = canonicalUrl || bookmarkData.url

      // Generate content ID based on provider or URL
      const provider = bookmarkData.source || 'web'
      let contentId: string
      
      // Extract platform-specific IDs for YouTube and Spotify
      if (provider === 'youtube') {
        // Support various YouTube URL formats
        const patterns = [
          /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/v\/|youtube\.com\/shorts\/)([^&\n?#/]+)/,
          /youtube\.com\/.*[?&]v=([^&\n?#]+)/
        ]
        let videoId: string | null = null
        for (const pattern of patterns) {
          const match = urlForMatching.match(pattern)
          if (match) {
            videoId = match[1]
            break
          }
        }
        if (videoId) {
          contentId = `youtube-${videoId}`
        } else {
          // Fallback for malformed YouTube URLs
          console.warn(`Failed to extract YouTube ID from URL: ${bookmarkData.url}`)
          const urlHash = btoa(urlForMatching).replace(/[^a-zA-Z0-9]/g, '').substring(0, 20)
          contentId = `youtube-malformed-${urlHash}`
        }
      } else if (provider === 'spotify') {
        // Extract Spotify ID for all content types
        const resource = resolveSpotifyResource(urlForMatching) ||
          (bookmarkData.originalUrl ? resolveSpotifyResource(bookmarkData.originalUrl) : null)
        const spotifyId = resource?.id ?? null
        if (spotifyId) {
          contentId = `spotify-${spotifyId}`
        } else {
          // Fallback for malformed Spotify URLs
          console.warn(`Failed to extract Spotify ID from URL: ${bookmarkData.url}`)
          const urlHash = btoa(urlForMatching).replace(/[^a-zA-Z0-9]/g, '').substring(0, 20)
          contentId = `spotify-malformed-${urlHash}`
        }
      } else {
        // Default for web and other providers - use URL hash
        const urlHash = btoa(urlForMatching).replace(/[^a-zA-Z0-9]/g, '').substring(0, 20)
        contentId = `${provider}-${urlHash}`
      }
      
       // Prepare extended metadata for article content
       let extendedMetadata: any = null
       if (bookmarkData.contentType === 'article' && bookmarkData.articleMetadata) {
         extendedMetadata = {
           authorName: bookmarkData.articleMetadata.authorName,
           wordCount: bookmarkData.articleMetadata.wordCount,
           readingTime: bookmarkData.articleMetadata.readingTime,
           isPaywalled: bookmarkData.articleMetadata.isPaywalled,
           secondaryAuthors: bookmarkData.articleMetadata.secondaryAuthors
         }
       }

       // Insert or update content
       await this.db.prepare(`
         INSERT OR REPLACE INTO content (
           id, external_id, provider, url, canonical_url, title, description,
           thumbnail_url, favicon_url, published_at, content_type,
           creator_id, creator_name, creator_handle, creator_thumbnail,
           creator_verified, creator_subscriber_count, creator_follower_count,
           extended_metadata, full_text_content, full_text_extracted_at,
           created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        contentId,
        contentId,
        provider,
        urlForMatching,
        canonicalUrl,
         bookmarkData.title,
         bookmarkData.description || null,
         bookmarkData.thumbnailUrl || null,
         bookmarkData.faviconUrl || null,
         bookmarkData.publishedAt ? bookmarkData.publishedAt.getTime() : null,
         bookmarkData.contentType || null,
         bookmarkData.creatorId || null,
         bookmarkData.creatorName || null,
         bookmarkData.creatorHandle || null,
         bookmarkData.creatorThumbnail || null,
         bookmarkData.creatorVerified ? 1 : 0,
         bookmarkData.creatorSubscriberCount || null,
         bookmarkData.creatorFollowerCount || null,
         extendedMetadata ? JSON.stringify(extendedMetadata) : null,
         bookmarkData.fullTextContent || null,
         bookmarkData.fullTextExtractedAt ? bookmarkData.fullTextExtractedAt.getTime() : null,
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
    // Parse extended metadata for article content
    let articleMetadata = undefined
    if (row.content_type === 'article' && row.content_extended_metadata) {
      try {
        const extended = JSON.parse(row.content_extended_metadata)
        articleMetadata = {
          authorName: extended.authorName,
          wordCount: extended.wordCount,
          readingTime: extended.readingTime,
          isPaywalled: extended.isPaywalled,
          secondaryAuthors: extended.secondaryAuthors
        }
      } catch (error) {
        console.warn('Failed to parse article extended metadata:', error)
      }
    }

    // Map from new schema where content is separate
    const bookmark: Bookmark = {
      id: String(row.id),
      userId: row.user_id,
      url: row.content_url || '',
      originalUrl: row.content_url || '',
      title: row.content_title || '',
      description: row.content_description || undefined,
      source: row.content_provider || undefined,
      contentType: row.content_type || undefined,
      thumbnailUrl: row.content_thumbnail_url || undefined,
      faviconUrl: row.content_favicon_url || undefined,
      // Convert from seconds (database) to milliseconds (API response)
      publishedAt: row.content_published_at ? Number(row.content_published_at) * 1000 : undefined,
      language: undefined, // Not in query result
      status: row.status || 'active',
      creatorId: row.creator_id || undefined,
      videoMetadata: undefined, // Not in new schema
      podcastMetadata: undefined, // Not in new schema
      articleMetadata: articleMetadata, // Parsed from extended_metadata
      postMetadata: undefined, // Not in new schema
      tags: row.user_tags ? JSON.parse(row.user_tags) : undefined,
      notes: row.notes || undefined,
      createdAt: row.bookmarked_at ? Number(row.bookmarked_at) : Date.now(),
      updatedAt: row.bookmarked_at ? Number(row.bookmarked_at) : Date.now(),
      // Always include creator field for consistent API contract
      creator: row.creator_id && row.creator_name ? {
        id: row.creator_id,
        name: row.creator_name,
        handle: row.creator_handle || undefined,
        avatarUrl: row.creator_avatar_url || undefined,
        verified: row.creator_verified === 1 || row.creator_verified === true || undefined,
        subscriberCount: row.creator_subscriber_count ? Number(row.creator_subscriber_count) : undefined,
        followerCount: row.creator_follower_count ? Number(row.creator_follower_count) : undefined,
        platform: row.content_provider || undefined,
        bio: row.creator_bio || undefined,
        url: row.creator_url || undefined,
        platforms: row.creator_platforms ? JSON.parse(String(row.creator_platforms)) : undefined,
        externalLinks: undefined, // Not fetched in queries
        createdAt: undefined,
        updatedAt: undefined
      } : null
      }

    // Include full-text content for articles (for article reader)
    if (row.content_type === 'article' && row.content_full_text_content) {
      ;(bookmark as any).fullTextContent = row.content_full_text_content
      ;(bookmark as any).fullTextExtractedAt = row.content_full_text_extracted_at
        ? Number(row.content_full_text_extracted_at) * 1000
        : undefined
    }

    const alternateLinks = D1BookmarkRepository.buildAlternateLinks(row)
    if (alternateLinks.length > 0) {
      ;(bookmark as any).alternateLinks = alternateLinks
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
