import { Hono } from 'hono'
import type { Env } from '../types'
import { getAuthContext } from '../middleware/auth'
import { ContentSourceRepository } from '../repositories/content-source-repository'
import { CreatorRepository } from '../repositories/creator-repository'

type Variables = {
  userId?: string
}

export const contentSourceRoutes = new Hono<{ Bindings: Env; Variables: Variables }>()
  // GET /api/v1/content-sources/:id - Get a single content source by ID
  .get('/:id', async (c) => {
    try {
      const id = c.req.param('id')
      const contentSourceRepo = new ContentSourceRepository(c.env.DB)
      
      const contentSource = await contentSourceRepo.getContentSource(id)
      
      if (!contentSource) {
        return c.json({ error: 'Content source not found' }, 404)
      }
      
      // Optionally include creator data if creatorId exists
      let creator = null
      if (contentSource.creatorId) {
        const creatorRepo = new CreatorRepository(c.env.DB)
        creator = await creatorRepo.getCreator(contentSource.creatorId)
      }
      
      return c.json({
        data: {
          ...contentSource,
          creator: creator || undefined
        }
      })
    } catch (error) {
      console.error('[ContentSources] Error fetching content source:', error)
      return c.json({ 
        error: 'Failed to fetch content source',
        details: error instanceof Error ? error.message : String(error)
      }, 500)
    }
  })
  
  // GET /api/v1/content-sources/user/:userId - Get all content sources for a user
  .get('/user/:userId', async (c) => {
    try {
      const auth = getAuthContext(c)
      const requestedUserId = c.req.param('userId')
      
      // Ensure user can only access their own content sources
      if (auth.userId !== requestedUserId) {
        return c.json({ error: 'Unauthorized' }, 403)
      }
      
      const platform = c.req.query('platform')
      const sourceType = c.req.query('sourceType')
      const limit = parseInt(c.req.query('limit') || '50', 10)
      const offset = parseInt(c.req.query('offset') || '0', 10)
      
      // Ensure reasonable limits
      const safeLimit = Math.min(Math.max(limit, 1), 100)
      const safeOffset = Math.max(offset, 0)
      
      // Get content sources through subscriptions
      const query = `
        SELECT DISTINCT 
          cs.id,
          cs.external_id,
          cs.platform,
          cs.source_type,
          cs.title,
          cs.description,
          cs.thumbnail_url,
          cs.url,
          cs.creator_id,
          cs.creator_name,
          cs.subscriber_count,
          cs.total_episodes,
          cs.video_count,
          cs.is_verified,
          cs.last_polled_at,
          cs.etag,
          cs.uploads_playlist_id,
          cs.metadata,
          cs.created_at,
          cs.updated_at,
          COUNT(DISTINCT fi.id) as item_count
        FROM content_sources cs
        INNER JOIN subscriptions s ON cs.id = s.content_source_id
        INNER JOIN user_subscriptions us ON s.id = us.subscription_id
        LEFT JOIN feed_items fi ON s.id = fi.subscription_id AND fi.user_id = ?
        WHERE us.user_id = ?
          AND us.is_active = 1
          ${platform ? 'AND cs.platform = ?' : ''}
          ${sourceType ? 'AND cs.source_type = ?' : ''}
        GROUP BY cs.id
        ORDER BY cs.created_at DESC
        LIMIT ? OFFSET ?
      `
      
      const params: (string | number)[] = [auth.userId, auth.userId]
      if (platform) params.push(platform)
      if (sourceType) params.push(sourceType)
      params.push(safeLimit, safeOffset)
      
      const result = await c.env.DB.prepare(query).bind(...params).all()
      
      // Get total count
      const countQuery = `
        SELECT COUNT(DISTINCT cs.id) as total
        FROM content_sources cs
        INNER JOIN subscriptions s ON cs.id = s.content_source_id
        INNER JOIN user_subscriptions us ON s.id = us.subscription_id
        WHERE us.user_id = ?
          AND us.is_active = 1
          ${platform ? 'AND cs.platform = ?' : ''}
          ${sourceType ? 'AND cs.source_type = ?' : ''}
      `
      
      const countParams = [auth.userId]
      if (platform) countParams.push(platform)
      if (sourceType) countParams.push(sourceType)
      
      const countResult = await c.env.DB.prepare(countQuery).bind(...countParams).first()
      const totalCount = Number(countResult?.total || 0)
      
      const contentSources = result.results?.map((row: any) => ({
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
        isVerified: Boolean(row.is_verified),
        lastPolledAt: row.last_polled_at ? new Date(Number(row.last_polled_at) * 1000).toISOString() : undefined,
        etag: row.etag || undefined,
        uploadsPlaylistId: row.uploads_playlist_id || undefined,
        metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
        createdAt: new Date(Number(row.created_at) * 1000).toISOString(),
        updatedAt: new Date(Number(row.updated_at) * 1000).toISOString(),
        itemCount: Number(row.item_count || 0)
      })) || []
      
      return c.json({
        data: contentSources,
        pagination: {
          limit: safeLimit,
          offset: safeOffset,
          total: totalCount,
          hasMore: safeOffset + safeLimit < totalCount
        },
        filters: {
          platform: platform || undefined,
          sourceType: sourceType || undefined
        }
      })
    } catch (error) {
      console.error('[ContentSources] Error fetching user content sources:', error)
      return c.json({ 
        error: 'Failed to fetch content sources',
        details: error instanceof Error ? error.message : String(error)
      }, 500)
    }
  })
