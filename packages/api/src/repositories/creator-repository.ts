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
    try {
      const now = new Date()
      
      // Check if creator already exists
      const existing = await this.getCreator(creatorData.id)
      
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
              WHEN NOT json_array_contains(platforms, ?) THEN json_insert(platforms, '$[#]', ?)
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
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at)
    }
  }
}