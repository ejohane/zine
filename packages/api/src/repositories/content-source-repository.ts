import { D1Database } from '@cloudflare/workers-types'

export interface ContentSource {
  id: string
  externalId: string
  platform: string
  sourceType: string
  title: string
  description?: string
  thumbnailUrl?: string
  url: string
  creatorId?: string
  creatorName?: string
  subscriberCount?: number
  totalEpisodes?: number
  videoCount?: number
  isVerified?: boolean
  lastPolledAt?: Date
  etag?: string
  uploadsPlaylistId?: string
  metadata?: Record<string, any>
  createdAt: Date
  updatedAt: Date
}

export interface CreateContentSourceInput {
  id: string
  externalId: string
  platform: string
  sourceType: string
  title: string
  description?: string
  thumbnailUrl?: string
  url: string
  creatorId?: string
  creatorName?: string
  subscriberCount?: number
  totalEpisodes?: number
  videoCount?: number
  isVerified?: boolean
  etag?: string
  uploadsPlaylistId?: string
  metadata?: Record<string, any>
}

export interface UpdateContentSourceInput {
  title?: string
  description?: string
  thumbnailUrl?: string
  url?: string
  creatorId?: string
  creatorName?: string
  subscriberCount?: number
  totalEpisodes?: number
  videoCount?: number
  isVerified?: boolean
  lastPolledAt?: Date
  etag?: string
  uploadsPlaylistId?: string
  metadata?: Record<string, any>
}

export class ContentSourceRepository {
  constructor(private db: D1Database) {}

  /**
   * Create a new content source
   */
  async createContentSource(input: CreateContentSourceInput): Promise<ContentSource> {
    console.log('[ContentSourceRepository] Creating content source:', {
      id: input.id,
      platform: input.platform,
      sourceType: input.sourceType,
      title: input.title
    })

    try {
      const now = new Date()

      const result = await this.db.prepare(`
        INSERT INTO content_sources (
          id, external_id, platform, source_type, title, description,
          thumbnail_url, url, creator_id, creator_name, subscriber_count,
          total_episodes, video_count, is_verified, etag, uploads_playlist_id,
          metadata, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        RETURNING *
      `).bind(
        input.id,
        input.externalId,
        input.platform,
        input.sourceType,
        input.title,
        input.description || null,
        input.thumbnailUrl || null,
        input.url,
        input.creatorId || null,
        input.creatorName || null,
        input.subscriberCount || null,
        input.totalEpisodes || null,
        input.videoCount || null,
        input.isVerified ? 1 : 0,
        input.etag || null,
        input.uploadsPlaylistId || null,
        input.metadata ? JSON.stringify(input.metadata) : null,
        now.toISOString(),
        now.toISOString()
      ).first()

      console.log('[ContentSourceRepository] Content source created:', {
        id: result?.id,
        hasCreatorId: !!result?.creator_id
      })

      return this.mapRowToContentSource(result)
    } catch (error) {
      console.error('Error creating content source:', error)
      throw new Error('Failed to create content source in database')
    }
  }

  /**
   * Get content source by ID
   */
  async getContentSource(id: string): Promise<ContentSource | null> {
    try {
      const result = await this.db.prepare(`
        SELECT * FROM content_sources WHERE id = ?
      `).bind(id).first()

      if (!result) {
        return null
      }

      return this.mapRowToContentSource(result)
    } catch (error) {
      console.error('Error fetching content source:', error)
      throw new Error('Failed to fetch content source from database')
    }
  }

  /**
   * Get content source by platform and external ID
   */
  async getContentSourceByPlatformId(platform: string, externalId: string): Promise<ContentSource | null> {
    try {
      const result = await this.db.prepare(`
        SELECT * FROM content_sources 
        WHERE platform = ? AND external_id = ?
      `).bind(platform, externalId).first()

      if (!result) {
        return null
      }

      return this.mapRowToContentSource(result)
    } catch (error) {
      console.error('Error fetching content source by platform ID:', error)
      throw new Error('Failed to fetch content source by platform ID')
    }
  }

  /**
   * Update an existing content source
   */
  async updateContentSource(id: string, updates: UpdateContentSourceInput): Promise<ContentSource> {
    console.log('[ContentSourceRepository] Updating content source:', {
      id,
      updateFields: Object.keys(updates)
    })

    try {
      const now = new Date()

      // Build dynamic SET clause based on provided updates
      const setClauses: string[] = []
      const values: any[] = []

      if (updates.title !== undefined) {
        setClauses.push('title = ?')
        values.push(updates.title)
      }
      if (updates.description !== undefined) {
        setClauses.push('description = ?')
        values.push(updates.description || null)
      }
      if (updates.thumbnailUrl !== undefined) {
        setClauses.push('thumbnail_url = ?')
        values.push(updates.thumbnailUrl || null)
      }
      if (updates.url !== undefined) {
        setClauses.push('url = ?')
        values.push(updates.url)
      }
      if (updates.creatorId !== undefined) {
        setClauses.push('creator_id = ?')
        values.push(updates.creatorId || null)
      }
      if (updates.creatorName !== undefined) {
        setClauses.push('creator_name = ?')
        values.push(updates.creatorName || null)
      }
      if (updates.subscriberCount !== undefined) {
        setClauses.push('subscriber_count = ?')
        values.push(updates.subscriberCount || null)
      }
      if (updates.totalEpisodes !== undefined) {
        setClauses.push('total_episodes = ?')
        values.push(updates.totalEpisodes || null)
      }
      if (updates.videoCount !== undefined) {
        setClauses.push('video_count = ?')
        values.push(updates.videoCount || null)
      }
      if (updates.isVerified !== undefined) {
        setClauses.push('is_verified = ?')
        values.push(updates.isVerified ? 1 : 0)
      }
      if (updates.lastPolledAt !== undefined) {
        setClauses.push('last_polled_at = ?')
        values.push(updates.lastPolledAt ? updates.lastPolledAt.toISOString() : null)
      }
      if (updates.etag !== undefined) {
        setClauses.push('etag = ?')
        values.push(updates.etag || null)
      }
      if (updates.uploadsPlaylistId !== undefined) {
        setClauses.push('uploads_playlist_id = ?')
        values.push(updates.uploadsPlaylistId || null)
      }
      if (updates.metadata !== undefined) {
        setClauses.push('metadata = ?')
        values.push(updates.metadata ? JSON.stringify(updates.metadata) : null)
      }

      // Always update updated_at
      setClauses.push('updated_at = ?')
      values.push(now.toISOString())

      // Add ID to WHERE clause
      values.push(id)

      const result = await this.db.prepare(`
        UPDATE content_sources
        SET ${setClauses.join(', ')}
        WHERE id = ?
        RETURNING *
      `).bind(...values).first()

      if (!result) {
        throw new Error('Content source not found')
      }

      console.log('[ContentSourceRepository] Content source updated')

      return this.mapRowToContentSource(result)
    } catch (error) {
      console.error('Error updating content source:', error)
      throw new Error('Failed to update content source in database')
    }
  }

  /**
   * Upsert content source - create if new, update if exists
   */
  async upsertContentSource(input: CreateContentSourceInput): Promise<ContentSource> {
    const existing = await this.getContentSource(input.id)

    if (existing) {
      return this.updateContentSource(input.id, {
        title: input.title,
        description: input.description,
        thumbnailUrl: input.thumbnailUrl,
        url: input.url,
        creatorId: input.creatorId,
        creatorName: input.creatorName,
        subscriberCount: input.subscriberCount,
        totalEpisodes: input.totalEpisodes,
        videoCount: input.videoCount,
        isVerified: input.isVerified,
        etag: input.etag,
        uploadsPlaylistId: input.uploadsPlaylistId,
        metadata: input.metadata
      })
    }

    return this.createContentSource(input)
  }

  /**
   * Get all content sources for a specific creator
   */
  async getContentSourcesByCreator(creatorId: string): Promise<ContentSource[]> {
    try {
      const result = await this.db.prepare(`
        SELECT * FROM content_sources 
        WHERE creator_id = ?
        ORDER BY platform, created_at DESC
      `).bind(creatorId).all()

      return result.results.map(row => this.mapRowToContentSource(row))
    } catch (error) {
      console.error('Error fetching content sources by creator:', error)
      throw new Error('Failed to fetch content sources by creator')
    }
  }

  /**
   * Get all content sources for a specific platform
   */
  async getContentSourcesByPlatform(platform: string, limit: number = 100): Promise<ContentSource[]> {
    try {
      const result = await this.db.prepare(`
        SELECT * FROM content_sources 
        WHERE platform = ?
        ORDER BY updated_at DESC
        LIMIT ?
      `).bind(platform, limit).all()

      return result.results.map(row => this.mapRowToContentSource(row))
    } catch (error) {
      console.error('Error fetching content sources by platform:', error)
      throw new Error('Failed to fetch content sources by platform')
    }
  }

  /**
   * Get content sources that need polling (stale data)
   */
  async getContentSourcesNeedingPoll(staleDurationMs: number = 3600000, limit: number = 50): Promise<ContentSource[]> {
    try {
      const staleThreshold = new Date(Date.now() - staleDurationMs).toISOString()

      const result = await this.db.prepare(`
        SELECT * FROM content_sources 
        WHERE last_polled_at IS NULL OR last_polled_at < ?
        ORDER BY last_polled_at ASC NULLS FIRST
        LIMIT ?
      `).bind(staleThreshold, limit).all()

      return result.results.map(row => this.mapRowToContentSource(row))
    } catch (error) {
      console.error('Error fetching stale content sources:', error)
      throw new Error('Failed to fetch stale content sources')
    }
  }

  /**
   * Delete a content source
   */
  async deleteContentSource(id: string): Promise<void> {
    try {
      await this.db.prepare(`
        DELETE FROM content_sources WHERE id = ?
      `).bind(id).run()

      console.log('[ContentSourceRepository] Content source deleted:', id)
    } catch (error) {
      console.error('Error deleting content source:', error)
      throw new Error('Failed to delete content source from database')
    }
  }

  /**
   * Find content sources without an assigned creator
   */
  async getContentSourcesWithoutCreator(limit: number = 100): Promise<ContentSource[]> {
    try {
      const result = await this.db.prepare(`
        SELECT * FROM content_sources 
        WHERE creator_id IS NULL
        ORDER BY created_at DESC
        LIMIT ?
      `).bind(limit).all()

      return result.results.map(row => this.mapRowToContentSource(row))
    } catch (error) {
      console.error('Error fetching content sources without creator:', error)
      throw new Error('Failed to fetch content sources without creator')
    }
  }

  /**
   * Get content sources by type (channel, show, playlist, etc.)
   */
  async getContentSourcesByType(sourceType: string, limit: number = 100): Promise<ContentSource[]> {
    try {
      const result = await this.db.prepare(`
        SELECT * FROM content_sources 
        WHERE source_type = ?
        ORDER BY updated_at DESC
        LIMIT ?
      `).bind(sourceType, limit).all()

      return result.results.map(row => this.mapRowToContentSource(row))
    } catch (error) {
      console.error('Error fetching content sources by type:', error)
      throw new Error('Failed to fetch content sources by type')
    }
  }

  private mapRowToContentSource(row: any): ContentSource {
    return {
      id: row.id,
      externalId: row.external_id,
      platform: row.platform,
      sourceType: row.source_type,
      title: row.title,
      description: row.description || undefined,
      thumbnailUrl: row.thumbnail_url || undefined,
      url: row.url,
      creatorId: row.creator_id || undefined,
      creatorName: row.creator_name || undefined,
      subscriberCount: row.subscriber_count ? Number(row.subscriber_count) : undefined,
      totalEpisodes: row.total_episodes ? Number(row.total_episodes) : undefined,
      videoCount: row.video_count ? Number(row.video_count) : undefined,
      isVerified: row.is_verified === 1 || row.is_verified === true || undefined,
      lastPolledAt: row.last_polled_at ? new Date(row.last_polled_at) : undefined,
      etag: row.etag || undefined,
      uploadsPlaylistId: row.uploads_playlist_id || undefined,
      metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at)
    }
  }
}
