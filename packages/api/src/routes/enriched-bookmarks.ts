/**
 * Enriched bookmarks route handlers
 * Implements Phase 3 of the Bookmark Data Quality Enhancement Plan
 */

import { Hono } from 'hono'
import type { Bindings } from '../index'
import { SaveBookmarkSchema } from '@zine/shared'
import { getAuthContext } from '../middleware/auth'
import { D1BookmarkRepository } from '../d1-repository'
import { ContentRepository } from '../repositories/content-repository'
import { ApiEnrichmentService } from '../services/api-enrichment-service'
import { detectPlatform } from '@zine/shared'
import type { Content } from '../schema'

const app = new Hono<{ Bindings: Bindings }>()

/**
 * Save bookmark with enhanced API enrichment
 */
app.post('/save-enriched', async (c) => {
  const auth = getAuthContext(c)
  
  try {
    const body = await c.req.json()
    const validatedData = SaveBookmarkSchema.parse(body)
    
    // Ensure user exists
    const d1Repository = new D1BookmarkRepository(c.env.DB)
    await d1Repository.ensureUser({
      id: auth.userId
    })
    
    const platform = detectPlatform(validatedData.url)
    let enrichedContent: Content | null = null
    let enrichmentSource = 'none'
    let apiUsed = false
    
    // Try API enrichment first for supported platforms
    if (platform === 'youtube' || platform === 'spotify') {
      console.log(`[EnrichedBookmark] Attempting API enrichment for ${platform}`)
      
      const apiEnrichmentService = new ApiEnrichmentService(c.env)
      
      // Extract content ID
      let contentId: string | null = null
      if (platform === 'youtube') {
        const match = validatedData.url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\n?#]+)/)
        contentId = match ? match[1] : null
      } else if (platform === 'spotify') {
        const match = validatedData.url.match(/spotify\.com\/(?:track|album|artist|playlist|episode|show)\/([^?/]+)/)
        contentId = match ? match[1] : null
      }
      
      if (contentId) {
        const apiResult = await apiEnrichmentService.enrichWithApi({
          provider: platform as 'youtube' | 'spotify',
          contentId,
          userId: auth.userId,
          forceRefresh: false
        })
        
        if (apiResult.success && apiResult.data) {
          console.log(`[EnrichedBookmark] API enrichment successful for ${platform}`)
          
          // Transform API data to Content format
          const now = new Date()
          enrichedContent = {
            id: `${platform}-${contentId}`,
            externalId: contentId,
            provider: platform,
            url: validatedData.url,
            canonicalUrl: validatedData.url,
            title: '',
            description: null,
            thumbnailUrl: null,
            contentType: null,
            faviconUrl: null,
            publishedAt: null,
            durationSeconds: null,
            viewCount: null,
            likeCount: null,
            commentCount: null,
            shareCount: null,
            saveCount: null,
            popularityScore: null,
            engagementRate: null,
            trendingScore: null,
            creatorId: null,
            creatorName: null,
            creatorHandle: null,
            creatorThumbnail: null,
            creatorVerified: null,
            creatorSubscriberCount: null,
            creatorFollowerCount: null,
            seriesId: null,
            seriesName: null,
            episodeNumber: null,
            seasonNumber: null,
            totalEpisodesInSeries: null,
            isLatestEpisode: null,
            seriesMetadata: null,
            category: null,
            subcategory: null,
            language: null,
            isExplicit: null,
            ageRestriction: null,
            tags: null,
            topics: null,
            hasCaptions: null,
            hasTranscript: null,
            hasHd: null,
            has4k: null,
            videoQuality: null,
            audioQuality: null,
            audioLanguages: null,
            captionLanguages: null,
            contentFingerprint: null,
            publisherCanonicalId: null,
            normalizedTitle: null,
            episodeIdentifier: null,
            crossPlatformMatches: null,
            statisticsMetadata: null,
            technicalMetadata: null,
            enrichmentMetadata: null,
            extendedMetadata: null,
            createdAt: now,
            updatedAt: now,
            lastEnrichedAt: now,
            enrichmentVersion: 2,
            enrichmentSource: apiResult.source
          } as Content
          
          // Transform based on platform
          if (platform === 'youtube') {
            const transformedData = apiEnrichmentService.transformYouTubeApiResponse(apiResult.data)
            enrichedContent = { ...enrichedContent!, ...transformedData }
            enrichedContent!.title = apiResult.data.snippet?.title || 'Untitled Video'
            enrichedContent!.description = apiResult.data.snippet?.description
            enrichedContent!.thumbnailUrl = apiResult.data.snippet?.thumbnails?.maxres?.url || 
                                          apiResult.data.snippet?.thumbnails?.high?.url
            enrichedContent!.contentType = 'video'
          } else if (platform === 'spotify') {
            const transformedData = apiEnrichmentService.transformSpotifyApiResponse(apiResult.data)
            enrichedContent = { ...enrichedContent!, ...transformedData }
            enrichedContent!.title = apiResult.data.name || 'Untitled Episode'
            enrichedContent!.contentType = 'podcast'
          }
          
          enrichmentSource = apiResult.source
          apiUsed = true
        }
      }
    }
    
    // Fall back to standard enrichment if API enrichment failed or not available
    if (!enrichedContent) {
      console.log('[EnrichedBookmark] Falling back to standard enrichment')
      const sharedModule = await import('@zine/shared')
      const ContentEnrichmentService = (sharedModule as any).ContentEnrichmentService
      const contentEnrichmentService = new ContentEnrichmentService()
      const enrichResult = await contentEnrichmentService.enrichContent(validatedData.url, {
        forceRefresh: false,
        includeEngagement: true,
        includeCreator: true
      })
      
      if (enrichResult.success && enrichResult.content) {
        enrichedContent = enrichResult.content
        enrichmentSource = enrichResult.source || 'metadata_extractor'
      } else {
        // Create minimal content if all enrichment fails
        const now = new Date()
        enrichedContent = {
          id: `web-${Date.now()}`,
          externalId: Date.now().toString(),
          provider: 'web',
          url: validatedData.url,
          canonicalUrl: validatedData.url,
          title: validatedData.url,
          description: null,
          thumbnailUrl: null,
          contentType: null,
          faviconUrl: null,
          publishedAt: null,
          durationSeconds: null,
          viewCount: null,
          likeCount: null,
          commentCount: null,
          shareCount: null,
          saveCount: null,
          popularityScore: null,
          engagementRate: null,
          trendingScore: null,
          creatorId: null,
          creatorName: null,
          creatorHandle: null,
          creatorThumbnail: null,
          creatorVerified: null,
          creatorSubscriberCount: null,
          creatorFollowerCount: null,
          seriesId: null,
          seriesName: null,
          episodeNumber: null,
          seasonNumber: null,
          totalEpisodesInSeries: null,
          isLatestEpisode: null,
          seriesMetadata: null,
          category: null,
          subcategory: null,
          language: null,
          isExplicit: null,
          ageRestriction: null,
          tags: null,
          topics: null,
          hasCaptions: null,
          hasTranscript: null,
          hasHd: null,
          has4k: null,
          videoQuality: null,
          audioQuality: null,
          audioLanguages: null,
          captionLanguages: null,
          contentFingerprint: null,
          publisherCanonicalId: null,
          normalizedTitle: null,
          episodeIdentifier: null,
          crossPlatformMatches: null,
          statisticsMetadata: null,
          technicalMetadata: null,
          enrichmentMetadata: null,
          extendedMetadata: null,
          createdAt: now,
          updatedAt: now,
          lastEnrichedAt: now,
          enrichmentVersion: 1,
          enrichmentSource: 'manual'
        } as Content
      }
    }
    
    // Save enriched content to database (enrichedContent is guaranteed to be non-null here)
    if (!enrichedContent) {
      throw new Error('Content enrichment failed')
    }
    const contentRepo = new ContentRepository(c.env.DB)
    const savedContent = await contentRepo.upsert(enrichedContent)
    
    // Create bookmark linking to the content
    const bookmarkId = `bookmark-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`
    await c.env.DB.prepare(
      `INSERT INTO bookmarks (id, user_id, content_id, notes, bookmarked_at, status)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).bind(
      bookmarkId,
      auth.userId,
      savedContent.id,
      validatedData.notes || null,
      new Date().toISOString(),
      'active'
    ).run()
    
    // Get the full bookmark with content (removed unused variable)
    await c.env.DB.prepare(
      `SELECT 
        b.id,
        b.user_id,
        b.notes,
        b.bookmarked_at,
        c.url,
        c.title,
        c.description,
        c.thumbnail_url,
        c.content_type,
        c.creator_name,
        c.view_count,
        c.like_count,
        c.duration_seconds
      FROM bookmarks b
      JOIN content c ON b.content_id = c.id
      WHERE b.id = ?`
    ).bind(bookmarkId).first()
    
    return c.json({
      data: {
        id: bookmarkId,
        userId: auth.userId,
        url: savedContent.url,
        title: savedContent.title,
        description: savedContent.description,
        thumbnailUrl: savedContent.thumbnailUrl,
        notes: validatedData.notes,
        contentType: savedContent.contentType,
        creatorName: savedContent.creatorName,
        metrics: {
          viewCount: savedContent.viewCount,
          likeCount: savedContent.likeCount,
          durationSeconds: savedContent.durationSeconds
        },
        enrichment: {
          source: enrichmentSource,
          apiUsed,
          version: savedContent.enrichmentVersion
        },
        createdAt: new Date()
      },
      message: `Bookmark saved successfully${apiUsed ? ' with API enrichment' : ''}`
    }, 201)
    
  } catch (error) {
    console.error('[EnrichedBookmark] Error:', error)
    return c.json({ 
      error: error instanceof Error ? error.message : 'Failed to save bookmark'
    }, 500)
  }
})

/**
 * Refresh bookmark metadata using APIs when available
 */
app.put('/:id/refresh-enriched', async (c) => {
  const auth = getAuthContext(c)
  const bookmarkId = c.req.param('id')
  
  try {
    // Get existing bookmark
    const bookmarkResult = await c.env.DB.prepare(
      `SELECT b.*, c.url, c.provider, c.external_id
       FROM bookmarks b
       JOIN content c ON b.content_id = c.id
       WHERE b.id = ? AND b.user_id = ?`
    ).bind(bookmarkId, auth.userId).first()
    
    if (!bookmarkResult) {
      return c.json({ error: 'Bookmark not found' }, 404)
    }
    
    const bookmark = bookmarkResult as any
    let refreshed = false
    let enrichmentSource = 'none'
    
    // Try API refresh for supported platforms
    if ((bookmark.provider === 'youtube' || bookmark.provider === 'spotify') && bookmark.external_id) {
      const apiEnrichmentService = new ApiEnrichmentService(c.env)
      
      const apiResult = await apiEnrichmentService.enrichWithApi({
        provider: bookmark.provider,
        contentId: bookmark.external_id,
        userId: auth.userId,
        forceRefresh: true
      })
      
      if (apiResult.success && apiResult.data) {
        // Update content with fresh data
        const contentRepo = new ContentRepository(c.env.DB)
        const now = new Date()
        
        let updates: Partial<Content> = {
          updatedAt: now,
          lastEnrichedAt: now,
          enrichmentVersion: (bookmark.enrichment_version || 1) + 1
        }
        
        if (bookmark.provider === 'youtube') {
          const transformedData = apiEnrichmentService.transformYouTubeApiResponse(apiResult.data)
          updates = { ...updates, ...transformedData }
        } else if (bookmark.provider === 'spotify') {
          const transformedData = apiEnrichmentService.transformSpotifyApiResponse(apiResult.data)
          updates = { ...updates, ...transformedData }
        }
        
        await contentRepo.upsert({
          id: bookmark.content_id,
          ...updates
        } as any)
        
        refreshed = true
        enrichmentSource = apiResult.source
      }
    }
    
    // Fall back to standard refresh if API not available
    if (!refreshed) {
      const sharedModule = await import('@zine/shared')
      const ContentEnrichmentService = (sharedModule as any).ContentEnrichmentService
      const contentEnrichmentService = new ContentEnrichmentService()
      const enrichResult = await contentEnrichmentService.refreshContent(
        bookmark.content_id,
        bookmark.url,
        true
      )
      
      if (enrichResult.success && enrichResult.content) {
        const contentRepo = new ContentRepository(c.env.DB)
        await contentRepo.upsert(enrichResult.content)
        refreshed = true
        enrichmentSource = enrichResult.source || 'metadata_extractor'
      }
    }
    
    if (!refreshed) {
      return c.json({ error: 'Failed to refresh metadata' }, 500)
    }
    
    // Return updated bookmark
    const updatedBookmark = await c.env.DB.prepare(
      `SELECT 
        b.id,
        b.user_id,
        b.notes,
        b.bookmarked_at,
        c.url,
        c.title,
        c.description,
        c.thumbnail_url,
        c.content_type,
        c.creator_name,
        c.view_count,
        c.like_count,
        c.duration_seconds,
        c.last_enriched_at,
        c.enrichment_version
      FROM bookmarks b
      JOIN content c ON b.content_id = c.id
      WHERE b.id = ?`
    ).bind(bookmarkId).first()
    
    return c.json({
      data: updatedBookmark,
      message: 'Metadata refreshed successfully',
      enrichmentSource
    })
    
  } catch (error) {
    console.error('[RefreshEnriched] Error:', error)
    return c.json({ 
      error: error instanceof Error ? error.message : 'Failed to refresh metadata'
    }, 500)
  }
})

/**
 * Get API quota/rate limit status
 */
app.get('/api-status', async (c) => {
  const auth = getAuthContext(c)
  
  try {
    const apiEnrichmentService = new ApiEnrichmentService(c.env)
    
    const youtubeStatus = apiEnrichmentService.getQuotaStatus('youtube')
    const spotifyStatus = apiEnrichmentService.getQuotaStatus('spotify')
    
    // Check if user has OAuth tokens
    const { DualModeTokenService } = await import('../services/dual-mode-token-service')
    const tokenService = new DualModeTokenService(c.env as any)
    const tokens = await tokenService.getTokens(auth.userId)
    
    return c.json({
      youtube: {
        hasToken: tokens.has('youtube'),
        quota: youtubeStatus,
        available: youtubeStatus.remaining > 0 && tokens.has('youtube')
      },
      spotify: {
        hasToken: tokens.has('spotify'),
        rateLimit: spotifyStatus,
        available: spotifyStatus.remaining > 0 && tokens.has('spotify')
      }
    })
  } catch (error) {
    console.error('[ApiStatus] Error:', error)
    return c.json({ 
      error: error instanceof Error ? error.message : 'Failed to get API status'
    }, 500)
  }
})

export { app as enrichedBookmarksRoutes }