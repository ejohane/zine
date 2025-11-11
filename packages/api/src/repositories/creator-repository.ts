import { D1Database } from '@cloudflare/workers-types'

export interface Creator {
  id: string
  name: string
  handle?: string
  avatarUrl?: string
  bio?: string
  url?: string
  platforms?: string[]
  externalLinks?: { title: string; url: string }[]
  verified?: boolean
  subscriberCount?: number
  followerCount?: number
  // Two-tier model fields
  alternativeNames?: string[]
  platformHandles?: Record<string, string>
  contentSourceIds?: string[]
  primaryPlatform?: string
  totalSubscribers?: number
  reconciliationConfidence?: number
  manuallyVerified?: boolean
  createdAt: Date
  updatedAt: Date
}

export interface CreateCreatorInput {
  id: string
  name: string
  handle?: string
  avatarUrl?: string
  bio?: string
  url?: string
  platform: string
  verified?: boolean
  subscriberCount?: number
  followerCount?: number
}

export class CreatorRepository {
  constructor(private db: D1Database) {}

  /**
   * Upsert creator data - insert if new, update if exists
   */
  async upsertCreator(creatorData: CreateCreatorInput): Promise<Creator> {
    console.log('[CreatorRepository] ===== UPSERT CREATOR =====')
    console.log('[CreatorRepository] Input data:', {
      id: creatorData.id,
      name: creatorData.name,
      avatarUrl: creatorData.avatarUrl || 'NOT PROVIDED',
      handle: creatorData.handle || 'NOT PROVIDED',
      platform: creatorData.platform,
      subscriberCount: creatorData.subscriberCount
    })
    
    try {
      const now = new Date()
      
      // Check if creator already exists
      const existing = await this.getCreator(creatorData.id)
      console.log('[CreatorRepository] Existing creator found:', !!existing)
      
      if (existing) {
        // Update existing creator
        const result = await this.db.prepare(`
          UPDATE creators
          SET 
            name = ?,
            handle = ?,
            avatar_url = ?,
            bio = ?,
            url = ?,
            platforms = json(CASE 
              WHEN platforms IS NULL THEN json_array(?) 
              WHEN instr(platforms, json_quote(?)) = 0 THEN json_insert(platforms, '$[#]', ?)
              ELSE platforms
            END),
            verified = COALESCE(?, verified),
            subscriber_count = COALESCE(?, subscriber_count),
            follower_count = COALESCE(?, follower_count),
            updated_at = ?
          WHERE id = ?
          RETURNING *
        `).bind(
          creatorData.name,
          creatorData.handle || null,
          creatorData.avatarUrl || null,
          creatorData.bio || null,
          creatorData.url || null,
          creatorData.platform,
          creatorData.platform,
          creatorData.platform,
          creatorData.verified !== undefined ? (creatorData.verified ? 1 : 0) : null,
          creatorData.subscriberCount || null,
          creatorData.followerCount || null,
          now.toISOString(),
          creatorData.id
        ).first()
        
        console.log('[CreatorRepository] UPDATE result:', {
          hasResult: !!result,
          avatarUrl: result?.avatar_url || 'NULL'
        })
        
        return this.mapRowToCreator(result)
      } else {
        // Insert new creator
        const result = await this.db.prepare(`
          INSERT INTO creators (
            id, name, handle, avatar_url, bio, url, 
            platforms, verified, subscriber_count, follower_count,
            created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, json_array(?), ?, ?, ?, ?, ?)
          RETURNING *
        `).bind(
          creatorData.id,
          creatorData.name,
          creatorData.handle || null,
          creatorData.avatarUrl || null,
          creatorData.bio || null,
          creatorData.url || null,
          creatorData.platform,
          creatorData.verified ? 1 : 0,
          creatorData.subscriberCount || null,
          creatorData.followerCount || null,
          now.toISOString(),
          now.toISOString()
        ).first()
        
        console.log('[CreatorRepository] INSERT result:', {
          hasResult: !!result,
          id: result?.id,
          avatarUrl: result?.avatar_url || 'NULL'
        })
        
        return this.mapRowToCreator(result)
      }
    } catch (error) {
      console.error('Error upserting creator:', error)
      throw new Error('Failed to upsert creator in database')
    }
  }

  /**
   * Get creator by ID
   */
  async getCreator(id: string): Promise<Creator | null> {
    try {
      const result = await this.db.prepare(`
        SELECT * FROM creators WHERE id = ?
      `).bind(id).first()
      
      if (!result) {
        return null
      }
      
      return this.mapRowToCreator(result)
    } catch (error) {
      console.error('Error fetching creator:', error)
      throw new Error('Failed to fetch creator from database')
    }
  }

  /**
   * Get count of bookmarks for a specific creator and user
   */
  async getCreatorBookmarksCount(creatorId: string, userId: string): Promise<number> {
    try {
      const result = await this.db.prepare(`
        SELECT COUNT(*) as count
        FROM bookmarks b
        JOIN content c ON b.content_id = c.id
        WHERE c.creator_id = ? AND b.user_id = ?
      `).bind(creatorId, userId).first()
      
      return Number(result?.count) || 0
    } catch (error) {
      console.error('Error counting creator bookmarks:', error)
      throw new Error('Failed to count creator bookmarks')
    }
  }

  /**
   * Get creators with bookmark counts for a specific user
   */
  async getCreatorsWithBookmarkCounts(userId: string): Promise<Array<Creator & { bookmarkCount: number }>> {
    try {
      const result = await this.db.prepare(`
        SELECT 
          cr.*,
          COUNT(b.id) as bookmark_count
        FROM creators cr
        JOIN content c ON c.creator_id = cr.id
        JOIN bookmarks b ON b.content_id = c.id
        WHERE b.user_id = ?
        GROUP BY cr.id
        ORDER BY bookmark_count DESC
      `).bind(userId).all()
      
      return result.results.map(row => ({
        ...this.mapRowToCreator(row),
        bookmarkCount: Number(row.bookmark_count) || 0
      }))
    } catch (error) {
      console.error('Error fetching creators with bookmark counts:', error)
      throw new Error('Failed to fetch creators with bookmark counts')
    }
  }

  /**
   * Find creator by handle (case-insensitive)
   * Used for cross-platform matching when handles are consistent
   */
  async findByHandle(handle: string): Promise<Creator | null> {
    try {
      const normalizedHandle = handle.toLowerCase().trim()
      const result = await this.db.prepare(`
        SELECT * FROM creators 
        WHERE LOWER(handle) = ?
        LIMIT 1
      `).bind(normalizedHandle).first()
      
      if (!result) {
        return null
      }
      
      return this.mapRowToCreator(result)
    } catch (error) {
      console.error('Error finding creator by handle:', error)
      throw new Error('Failed to find creator by handle')
    }
  }

  /**
   * Find creators by domain pattern in URL
   * Useful for matching creators across platforms by their website/channel URL
   */
  async findByDomainPattern(domain: string): Promise<Creator[]> {
    try {
      const pattern = `%${domain}%`
      const result = await this.db.prepare(`
        SELECT * FROM creators 
        WHERE url LIKE ?
        ORDER BY updated_at DESC
      `).bind(pattern).all()
      
      return result.results.map(row => this.mapRowToCreator(row))
    } catch (error) {
      console.error('Error finding creators by domain pattern:', error)
      throw new Error('Failed to find creators by domain pattern')
    }
  }

  /**
   * Find creators by platform
   * Returns all creators that have content on the specified platform
   */
  async findByPlatform(platform: string): Promise<Creator[]> {
    try {
      const result = await this.db.prepare(`
        SELECT * FROM creators 
        WHERE platforms LIKE ?
        ORDER BY updated_at DESC
      `).bind(`%"${platform}"%`).all()
      
      return result.results.map(row => this.mapRowToCreator(row))
    } catch (error) {
      console.error('Error finding creators by platform:', error)
      throw new Error('Failed to find creators by platform')
    }
  }

  /**
   * Get recent creators (for cross-platform matching)
   * Returns most recently updated creators, limited by count
   */
  async getRecentCreators(limit: number = 200): Promise<Creator[]> {
    try {
      const result = await this.db.prepare(`
        SELECT * FROM creators 
        ORDER BY updated_at DESC
        LIMIT ?
      `).bind(limit).all()
      
      return result.results.map(row => this.mapRowToCreator(row))
    } catch (error) {
      console.error('Error getting recent creators:', error)
      throw new Error('Failed to get recent creators')
    }
  }

  /**
   * Update creator with two-tier model fields
   * Used for consolidating creators across platforms
   */
  async updateCreatorConsolidation(
    creatorId: string,
    updates: {
      alternativeNames?: string[]
      platformHandles?: Record<string, string>
      contentSourceIds?: string[]
      primaryPlatform?: string
      totalSubscribers?: number
      reconciliationConfidence?: number
      platforms?: string[]
    }
  ): Promise<Creator> {
    console.log('[CreatorRepository] Updating creator consolidation:', {
      creatorId,
      alternativeNames: updates.alternativeNames?.length,
      contentSourceIds: updates.contentSourceIds?.length,
      platforms: updates.platforms
    })

    try {
      const now = new Date()
      const setClauses: string[] = []
      const values: any[] = []

      if (updates.alternativeNames !== undefined) {
        setClauses.push('alternative_names = ?')
        values.push(JSON.stringify(updates.alternativeNames))
      }

      if (updates.platformHandles !== undefined) {
        setClauses.push('platform_handles = ?')
        values.push(JSON.stringify(updates.platformHandles))
      }

      if (updates.contentSourceIds !== undefined) {
        setClauses.push('content_source_ids = ?')
        values.push(JSON.stringify(updates.contentSourceIds))
      }

      if (updates.primaryPlatform !== undefined) {
        setClauses.push('primary_platform = ?')
        values.push(updates.primaryPlatform)
      }

      if (updates.totalSubscribers !== undefined) {
        setClauses.push('total_subscribers = ?')
        values.push(updates.totalSubscribers)
      }

      if (updates.reconciliationConfidence !== undefined) {
        setClauses.push('reconciliation_confidence = ?')
        values.push(updates.reconciliationConfidence)
      }

      if (updates.platforms !== undefined) {
        setClauses.push('platforms = ?')
        values.push(JSON.stringify(updates.platforms))
      }

      // Always update updated_at
      setClauses.push('updated_at = ?')
      values.push(now.toISOString())

      // Add WHERE clause value
      values.push(creatorId)

      const result = await this.db.prepare(`
        UPDATE creators
        SET ${setClauses.join(', ')}
        WHERE id = ?
        RETURNING *
      `).bind(...values).first()

      if (!result) {
        throw new Error('Creator not found')
      }

      console.log('[CreatorRepository] Creator consolidation updated successfully')

      return this.mapRowToCreator(result)
    } catch (error) {
      console.error('Error updating creator consolidation:', error)
      throw new Error('Failed to update creator consolidation')
    }
  }

  /**
   * Link a content source to a creator
   * Adds content source ID to the creator's contentSourceIds array
   */
  async linkContentSource(creatorId: string, contentSourceId: string): Promise<Creator> {
    console.log('[CreatorRepository] Linking content source to creator:', {
      creatorId,
      contentSourceId
    })

    try {
      const creator = await this.getCreator(creatorId)
      if (!creator) {
        throw new Error('Creator not found')
      }

      const currentIds = creator.contentSourceIds || []
      if (currentIds.includes(contentSourceId)) {
        console.log('[CreatorRepository] Content source already linked')
        return creator
      }

      const updatedIds = [...currentIds, contentSourceId]
      return this.updateCreatorConsolidation(creatorId, {
        contentSourceIds: updatedIds
      })
    } catch (error) {
      console.error('Error linking content source:', error)
      throw new Error('Failed to link content source to creator')
    }
  }

  /**
   * Add alternative name to creator
   * Used during reconciliation when discovering new names for the same creator
   */
  async addAlternativeName(creatorId: string, alternativeName: string): Promise<Creator> {
    console.log('[CreatorRepository] Adding alternative name:', {
      creatorId,
      alternativeName
    })

    try {
      const creator = await this.getCreator(creatorId)
      if (!creator) {
        throw new Error('Creator not found')
      }

      const currentNames = creator.alternativeNames || []
      // Normalize names for comparison
      const normalizedNew = alternativeName.toLowerCase().trim()
      const normalizedExisting = currentNames.map(n => n.toLowerCase().trim())
      
      if (normalizedExisting.includes(normalizedNew)) {
        console.log('[CreatorRepository] Alternative name already exists')
        return creator
      }

      const updatedNames = [...currentNames, alternativeName]
      return this.updateCreatorConsolidation(creatorId, {
        alternativeNames: updatedNames
      })
    } catch (error) {
      console.error('Error adding alternative name:', error)
      throw new Error('Failed to add alternative name to creator')
    }
  }

  /**
   * Set platform handle for creator
   * Updates the platform_handles JSON object with a new or updated handle
   */
  async setPlatformHandle(creatorId: string, platform: string, handle: string): Promise<Creator> {
    console.log('[CreatorRepository] Setting platform handle:', {
      creatorId,
      platform,
      handle
    })

    try {
      const creator = await this.getCreator(creatorId)
      if (!creator) {
        throw new Error('Creator not found')
      }

      const currentHandles = creator.platformHandles || {}
      const updatedHandles = {
        ...currentHandles,
        [platform]: handle
      }

      return this.updateCreatorConsolidation(creatorId, {
        platformHandles: updatedHandles
      })
    } catch (error) {
      console.error('Error setting platform handle:', error)
      throw new Error('Failed to set platform handle')
    }
  }

  private mapRowToCreator(row: any): Creator {
    return {
      id: row.id,
      name: row.name,
      handle: row.handle || undefined,
      avatarUrl: row.avatar_url || undefined,
      bio: row.bio || undefined,
      url: row.url || undefined,
      platforms: row.platforms ? JSON.parse(row.platforms) : undefined,
      externalLinks: row.external_links ? JSON.parse(row.external_links) : undefined,
      verified: row.verified === 1 || row.verified === true || undefined,
      subscriberCount: row.subscriber_count ? Number(row.subscriber_count) : undefined,
      followerCount: row.follower_count ? Number(row.follower_count) : undefined,
      // Two-tier model fields
      alternativeNames: row.alternative_names ? JSON.parse(row.alternative_names) : undefined,
      platformHandles: row.platform_handles ? JSON.parse(row.platform_handles) : undefined,
      contentSourceIds: row.content_source_ids ? JSON.parse(row.content_source_ids) : undefined,
      primaryPlatform: row.primary_platform || undefined,
      totalSubscribers: row.total_subscribers ? Number(row.total_subscribers) : undefined,
      reconciliationConfidence: row.reconciliation_confidence ? Number(row.reconciliation_confidence) : undefined,
      manuallyVerified: row.manually_verified === 1 || row.manually_verified === true || undefined,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at)
    }
  }
}