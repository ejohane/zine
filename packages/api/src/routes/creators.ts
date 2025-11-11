import { Hono } from 'hono'
import type { Env } from '../types'
import { getAuthContext } from '../middleware/auth'
import { CreatorRepository } from '../repositories/creator-repository'
import { ContentSourceRepository } from '../repositories/content-source-repository'

type Variables = {
  userId?: string
}

export const creatorRoutes = new Hono<{ Bindings: Env; Variables: Variables }>()
  // GET /api/v1/creators/:id - Get a single creator by ID with all content sources
  .get('/:id', async (c) => {
    try {
      const id = c.req.param('id')
      const creatorRepo = new CreatorRepository(c.env.DB)
      const contentSourceRepo = new ContentSourceRepository(c.env.DB)
      
      const creator = await creatorRepo.getCreator(id)
      
      if (!creator) {
        return c.json({ error: 'Creator not found' }, 404)
      }
      
      // Get all content sources for this creator
      const contentSources = await contentSourceRepo.getContentSourcesByCreator(id)
      
      // Map content sources to response format
      const formattedContentSources = contentSources.map(cs => ({
        id: cs.id,
        externalId: cs.externalId,
        platform: cs.platform,
        sourceType: cs.sourceType,
        title: cs.title,
        description: cs.description,
        thumbnailUrl: cs.thumbnailUrl,
        url: cs.url,
        subscriberCount: cs.subscriberCount,
        totalEpisodes: cs.totalEpisodes,
        videoCount: cs.videoCount,
        isVerified: cs.isVerified,
        lastPolledAt: cs.lastPolledAt?.toISOString(),
        createdAt: cs.createdAt.toISOString(),
        updatedAt: cs.updatedAt.toISOString()
      }))
      
      // Group content sources by platform
      const contentSourcesByPlatform = formattedContentSources.reduce((acc, cs) => {
        if (!acc[cs.platform]) {
          acc[cs.platform] = []
        }
        acc[cs.platform].push(cs)
        return acc
      }, {} as Record<string, typeof formattedContentSources>)
      
      return c.json({
        data: {
          id: creator.id,
          name: creator.name,
          handle: creator.handle,
          avatarUrl: creator.avatarUrl,
          bio: creator.bio,
          url: creator.url,
          platforms: creator.platforms,
          externalLinks: creator.externalLinks,
          verified: creator.verified,
          subscriberCount: creator.subscriberCount,
          followerCount: creator.followerCount,
          // Two-tier model fields
          alternativeNames: creator.alternativeNames,
          platformHandles: creator.platformHandles,
          primaryPlatform: creator.primaryPlatform,
          totalSubscribers: creator.totalSubscribers,
          reconciliationConfidence: creator.reconciliationConfidence,
          manuallyVerified: creator.manuallyVerified,
          createdAt: creator.createdAt.toISOString(),
          updatedAt: creator.updatedAt.toISOString(),
          // Content sources
          contentSources: formattedContentSources,
          contentSourcesByPlatform,
          contentSourceCount: formattedContentSources.length
        }
      })
    } catch (error) {
      console.error('[Creators] Error fetching creator:', error)
      return c.json({ 
        error: 'Failed to fetch creator',
        details: error instanceof Error ? error.message : String(error)
      }, 500)
    }
  })
  
  // GET /api/v1/creators - Get all creators for the authenticated user
  .get('/', async (c) => {
    try {
      const auth = getAuthContext(c)
      const limit = parseInt(c.req.query('limit') || '50', 10)
      const offset = parseInt(c.req.query('offset') || '0', 10)
      const platform = c.req.query('platform')
      
      // Ensure reasonable limits
      const safeLimit = Math.min(Math.max(limit, 1), 100)
      const safeOffset = Math.max(offset, 0)
      
      // Get creators through user's subscriptions
      const query = `
        SELECT DISTINCT 
          cr.id,
          cr.name,
          cr.handle,
          cr.avatar_url,
          cr.bio,
          cr.url,
          cr.platforms,
          cr.external_links,
          cr.verified,
          cr.subscriber_count,
          cr.follower_count,
          cr.alternative_names,
          cr.platform_handles,
          cr.content_source_ids,
          cr.primary_platform,
          cr.total_subscribers,
          cr.reconciliation_confidence,
          cr.manually_verified,
          cr.created_at,
          cr.updated_at,
          COUNT(DISTINCT cs.id) as content_source_count,
          COUNT(DISTINCT fi.id) as item_count
        FROM creators cr
        INNER JOIN content_sources cs ON cr.id = cs.creator_id
        INNER JOIN subscriptions s ON cs.id = s.content_source_id
        INNER JOIN user_subscriptions us ON s.id = us.subscription_id
        LEFT JOIN feed_items fi ON s.id = fi.subscription_id AND fi.user_id = ?
        WHERE us.user_id = ?
          AND us.is_active = 1
          ${platform ? 'AND json_extract(cr.platforms, \'$\') LIKE ?' : ''}
        GROUP BY cr.id
        ORDER BY cr.name ASC
        LIMIT ? OFFSET ?
      `
      
      const params: (string | number)[] = [auth.userId, auth.userId]
      if (platform) params.push(`%"${platform}"%`)
      params.push(safeLimit, safeOffset)
      
      const result = await c.env.DB.prepare(query).bind(...params).all()
      
      // Get total count
      const countQuery = `
        SELECT COUNT(DISTINCT cr.id) as total
        FROM creators cr
        INNER JOIN content_sources cs ON cr.id = cs.creator_id
        INNER JOIN subscriptions s ON cs.id = s.content_source_id
        INNER JOIN user_subscriptions us ON s.id = us.subscription_id
        WHERE us.user_id = ?
          AND us.is_active = 1
          ${platform ? 'AND json_extract(cr.platforms, \'$\') LIKE ?' : ''}
      `
      
      const countParams: (string | number)[] = [auth.userId]
      if (platform) countParams.push(`%"${platform}"%`)
      
      const countResult = await c.env.DB.prepare(countQuery).bind(...countParams).first()
      const totalCount = Number(countResult?.total || 0)
      
      const creators = result.results?.map((row: any) => ({
        id: row.id,
        name: row.name,
        handle: row.handle || undefined,
        avatarUrl: row.avatar_url || undefined,
        bio: row.bio || undefined,
        url: row.url || undefined,
        platforms: row.platforms ? JSON.parse(row.platforms) : undefined,
        externalLinks: row.external_links ? JSON.parse(row.external_links) : undefined,
        verified: Boolean(row.verified),
        subscriberCount: row.subscriber_count ? Number(row.subscriber_count) : undefined,
        followerCount: row.follower_count ? Number(row.follower_count) : undefined,
        // Two-tier model fields
        alternativeNames: row.alternative_names ? JSON.parse(row.alternative_names) : undefined,
        platformHandles: row.platform_handles ? JSON.parse(row.platform_handles) : undefined,
        primaryPlatform: row.primary_platform || undefined,
        totalSubscribers: row.total_subscribers ? Number(row.total_subscribers) : undefined,
        reconciliationConfidence: row.reconciliation_confidence ? Number(row.reconciliation_confidence) : undefined,
        manuallyVerified: Boolean(row.manually_verified),
        createdAt: new Date(row.created_at).toISOString(),
        updatedAt: new Date(row.updated_at).toISOString(),
        // Stats
        contentSourceCount: Number(row.content_source_count || 0),
        itemCount: Number(row.item_count || 0)
      })) || []
      
      return c.json({
        data: creators,
        pagination: {
          limit: safeLimit,
          offset: safeOffset,
          total: totalCount,
          hasMore: safeOffset + safeLimit < totalCount
        },
        filters: {
          platform: platform || undefined
        }
      })
    } catch (error) {
      console.error('[Creators] Error fetching creators:', error)
      return c.json({ 
        error: 'Failed to fetch creators',
        details: error instanceof Error ? error.message : String(error)
      }, 500)
    }
  })
