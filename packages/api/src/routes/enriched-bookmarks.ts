/**
 * Enriched bookmarks route handlers
 * Implements Phase 3 of the Bookmark Data Quality Enhancement Plan
 */

import { Hono } from 'hono'
import type { Bindings } from '../index'
import { SaveBookmarkSchema, normalizeUrl, resolveSpotifyResource } from '@zine/shared'
import { getAuthContext } from '../middleware/auth'
import { D1BookmarkRepository } from '../d1-repository'
import { ContentRepository, type ContentDeduplicationMatch } from '../repositories/content-repository'
import { CreatorRepository } from '../repositories/creator-repository'
import { ApiEnrichmentService, type SpotifyResourceType } from '../services/api-enrichment-service'
import type { Content } from '../schema'
import { ContentMatchingService, KNOWN_PUBLISHER_MAPPINGS } from '../services/content-matching-service'

type CrossPlatformMatchEntry = {
  platform: string
  id?: string
  url: string
  confidence?: number
  addedAt: string
}

type AlternateLinkEntry = {
  provider?: string
  url: string
  externalId?: string
  confidence?: number
}

const DUPLICATE_CONFIDENCE_THRESHOLD = 0.8
const CROSS_PLATFORM_CONFIDENCE_THRESHOLD = 0.75

function slugifyCanonicalName(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function parseCrossPlatformMatches(raw: unknown): CrossPlatformMatchEntry[] {
  if (!raw) return []
  if (Array.isArray(raw)) return raw as CrossPlatformMatchEntry[]
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw)
      return Array.isArray(parsed) ? parsed as CrossPlatformMatchEntry[] : []
    } catch {
      return []
    }
  }
  return []
}

function buildAlternateLinksFromContent(content: Content | null | undefined): AlternateLinkEntry[] {
  if (!content) return []

  const links: AlternateLinkEntry[] = []
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

  addLink(content.provider, content.url ?? content.canonicalUrl ?? null, content.externalId ?? null)

  const matches = parseCrossPlatformMatches(content.crossPlatformMatches)
  for (const match of matches) {
    addLink(match.platform, match.url, match.id ?? null, match.confidence)
  }

  return links
}

function toDate(value: unknown): Date | null {
  if (!value) return null
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value
  if (typeof value === 'number') {
    const date = new Date(value)
    return Number.isNaN(date.getTime()) ? null : date
  }
  if (typeof value === 'string') {
    const date = new Date(value)
    return Number.isNaN(date.getTime()) ? null : date
  }
  return null
}

function normalizeConfidence(confidence: number): number {
  return Math.max(0, Math.min(1, Number(confidence.toFixed(3))))
}

async function ensureCrossPlatformLinkage(
  contentRepo: ContentRepository,
  primary: Content
): Promise<{ primary: Content; counterpart: Content; confidence: number } | null> {
  if (!primary.provider || (primary.provider !== 'youtube' && primary.provider !== 'spotify')) {
    return null
  }

  const targetProvider = primary.provider === 'youtube' ? 'spotify' : 'youtube'

  const candidates = await contentRepo.findCrossPlatformCandidates(primary, targetProvider, { limit: 10 })
  if (candidates.length === 0) {
    return null
  }

  const primaryMatches = parseCrossPlatformMatches(primary.crossPlatformMatches)

  const nowIso = new Date().toISOString()
  let bestMatch: { candidate: Content; confidence: number; reasons: string[] } | null = null

  for (const candidate of candidates) {
    if (!candidate.provider) {
      continue
    }

    // Skip if already linked
    const alreadyLinked = primaryMatches.some(entry => {
      const sameProvider = entry.platform === candidate.provider
      const sameId = entry.id && candidate.externalId ? entry.id === candidate.externalId : false
      const sameUrl = !entry.id && candidate.url ? entry.url === candidate.url : false
      return sameProvider && (sameId || sameUrl)
    })

    if (alreadyLinked) {
      continue
    }

    const primaryPublishedAt = toDate(primary.publishedAt) ?? new Date(0)
    const candidatePublishedAt = toDate(candidate.publishedAt) ?? new Date(0)

    const match = ContentMatchingService.calculateMatchConfidence(
      {
        normalizedTitle: primary.normalizedTitle ?? undefined,
        publisherCanonicalId: primary.publisherCanonicalId ?? undefined,
        durationSeconds: primary.durationSeconds ?? undefined,
        publishedAt: primaryPublishedAt,
        episodeNumber: primary.episodeNumber ?? undefined
      },
      {
        normalizedTitle: candidate.normalizedTitle ?? undefined,
        publisherCanonicalId: candidate.publisherCanonicalId ?? undefined,
        durationSeconds: candidate.durationSeconds ?? undefined,
        publishedAt: candidatePublishedAt,
        episodeNumber: candidate.episodeNumber ?? undefined
      }
    )

    let confidence = match.confidence

    if (primary.episodeIdentifier && candidate.episodeIdentifier && primary.episodeIdentifier === candidate.episodeIdentifier) {
      confidence = Math.min(1, confidence + 0.15)
    }

    if (confidence < CROSS_PLATFORM_CONFIDENCE_THRESHOLD) {
      continue
    }

    if (!bestMatch || confidence > bestMatch.confidence) {
      bestMatch = {
        candidate,
        confidence,
        reasons: match.reasons
      }
    }
  }

  if (!bestMatch) {
    return null
  }

  const { candidate, confidence } = bestMatch

  const candidateUrl = candidate.url ?? candidate.canonicalUrl ?? null
  const primaryUrl = primary.url ?? primary.canonicalUrl ?? null

  if (!candidateUrl || !primaryUrl) {
    return null
  }

  const normalizedConfidence = normalizeConfidence(confidence)

  // Update primary content with cross-platform entry
  const primaryEntry = {
    platform: candidate.provider,
    id: candidate.externalId ?? undefined,
    url: candidateUrl,
    confidence: normalizedConfidence,
    addedAt: nowIso
  }

  const nextPrimaryMatches = upsertCrossPlatformEntry(primaryMatches, primaryEntry)
  let updatedPrimary = primary
  if (nextPrimaryMatches !== primaryMatches) {
    updatedPrimary = await contentRepo.upsert({
      id: primary.id,
      crossPlatformMatches: nextPrimaryMatches as any
    })
  }

  // Update counterpart content with reciprocal entry
  const counterpartMatches = parseCrossPlatformMatches(candidate.crossPlatformMatches)
  const counterpartEntry = {
    platform: primary.provider,
    id: primary.externalId ?? undefined,
    url: primaryUrl,
    confidence: normalizedConfidence,
    addedAt: nowIso
  }

  const nextCounterpartMatches = upsertCrossPlatformEntry(counterpartMatches, counterpartEntry)
  let updatedCounterpart = candidate
  if (nextCounterpartMatches !== counterpartMatches) {
    updatedCounterpart = await contentRepo.upsert({
      id: candidate.id,
      crossPlatformMatches: nextCounterpartMatches as any
    })
  }

  // Ensure we return the latest versions from the repository
  const refreshedPrimary = await contentRepo.findById(updatedPrimary.id) ?? updatedPrimary
  const refreshedCounterpart = await contentRepo.findById(updatedCounterpart.id) ?? updatedCounterpart

  return {
    primary: refreshedPrimary,
    counterpart: refreshedCounterpart,
    confidence: normalizedConfidence
  }
}

function upsertCrossPlatformEntry(
  existing: CrossPlatformMatchEntry[],
  entry: CrossPlatformMatchEntry
): CrossPlatformMatchEntry[] {
  const alreadyPresent = existing.some((item) =>
    item.platform === entry.platform &&
    (entry.id ? item.id === entry.id : item.url === entry.url)
  )

  if (alreadyPresent) {
    return existing
  }

  return [...existing, entry]
}

/**
 * Extract creator data from enriched content and upsert to creators table
 * Returns the creator name for use in other functions
 */
async function extractAndUpsertCreator(
  enrichedData: any,
  creatorRepo: CreatorRepository
): Promise<string | undefined> {
  const creatorId = enrichedData.creatorId
  const creatorName = enrichedData.creatorName
  
  if (!creatorId || !creatorName) {
    return undefined
  }
  
  console.log('[extractAndUpsertCreator] Upserting creator:', creatorId, creatorName)
  
  await creatorRepo.upsertCreator({
    id: creatorId,
    name: creatorName,
    handle: enrichedData.creatorHandle || undefined,
    avatarUrl: enrichedData.creatorThumbnail || undefined,
    platform: enrichedData.provider,
    verified: enrichedData.creatorVerified === true || undefined,
    subscriberCount: enrichedData.creatorSubscriberCount ? Number(enrichedData.creatorSubscriberCount) : undefined,
    followerCount: enrichedData.creatorFollowerCount ? Number(enrichedData.creatorFollowerCount) : undefined,
    url: enrichedData.provider === 'youtube' 
      ? `https://youtube.com/channel/${creatorId.replace('youtube:', '')}`
      : enrichedData.provider === 'spotify'
      ? `https://open.spotify.com/show/${creatorId.replace('spotify:', '')}`
      : undefined
  })
  
  return creatorName
}

/**
 * Strip creator detail fields from enriched data, keeping only creatorId
 * This prepares the data for Content table which only stores creatorId foreign key
 */
function stripCreatorDetails(enrichedData: any): any {
  const { 
    creatorName, 
    creatorHandle, 
    creatorThumbnail, 
    creatorVerified, 
    creatorSubscriberCount, 
    creatorFollowerCount,
    ...contentData 
  } = enrichedData
  
  return contentData
}

function resolvePublisherCanonicalId(provider: string, content: Content, creatorName?: string): string | undefined {
  const candidateNames = [creatorName, content.seriesName]
    .filter((name): name is string => Boolean(name))
    .map((name) => name.trim().toLowerCase())

  const creatorId = content.creatorId?.toLowerCase() ?? null
  const seriesId = content.seriesId?.toLowerCase() ?? null

  for (const [canonicalName, mapping] of Object.entries(KNOWN_PUBLISHER_MAPPINGS)) {
    const canonicalId = `publisher:${slugifyCanonicalName(canonicalName)}`
    const mappingForProvider = (mapping as any)[provider]

    if (!mappingForProvider) continue

    const expectedName = String(mappingForProvider.name || '').toLowerCase()
    const expectedId = String(mappingForProvider.id || '').toLowerCase()

    const providerMatchesName = expectedName && candidateNames.includes(expectedName)
    const providerMatchesId = expectedId && (
      creatorId?.endsWith(expectedId) ||
      seriesId === expectedId ||
      creatorId === `${provider}:${expectedId}`
    )

    if (providerMatchesName || providerMatchesId) {
      return canonicalId
    }
  }

  return undefined
}

async function populateMatchingMetadata(content: Content): Promise<void> {
  if (content.title) {
    content.normalizedTitle = ContentMatchingService.normalizeTitle(content.title)
  }

  const episodeIdentifier = ContentMatchingService.generateEpisodeIdentifier(
    content.episodeNumber ?? undefined,
    content.seasonNumber ?? undefined
  )

  if (episodeIdentifier) {
    content.episodeIdentifier = episodeIdentifier
  }

  if (!content.publisherCanonicalId) {
    const resolved = resolvePublisherCanonicalId(content.provider, content)
    if (resolved) {
      content.publisherCanonicalId = resolved
    }
  }

  const publishedAt = content.publishedAt instanceof Date
    ? content.publishedAt
    : typeof content.publishedAt === 'number'
    ? new Date(content.publishedAt)
    : typeof content.publishedAt === 'string'
    ? new Date(content.publishedAt)
    : undefined

  if (content.title && publishedAt && !Number.isNaN(publishedAt.getTime())) {
    try {
      content.contentFingerprint = await ContentMatchingService.generateContentFingerprint({
        title: content.title,
        episodeNumber: content.episodeNumber ?? undefined,
        seasonNumber: content.seasonNumber ?? undefined,
        durationSeconds: content.durationSeconds ?? undefined,
        publishedAt
      })
    } catch (error) {
      console.warn('[EnrichedBookmark] Failed to generate content fingerprint', error)
    }
  }
}

const app = new Hono<{ Bindings: Bindings }>()

/**
 * Save bookmark with enhanced API enrichment
 */
app.post('/save-enriched', async (c) => {
  const auth = getAuthContext(c)
  
  try {
    const body = await c.req.json()
    const validatedData = SaveBookmarkSchema.parse(body)
    
    const normalizedUrlResult = normalizeUrl(validatedData.url)
    const canonicalUrl = normalizedUrlResult.normalized
    const platform = normalizedUrlResult.platform || 'web'

    // Ensure user exists
    const d1Repository = new D1BookmarkRepository(c.env.DB)
    await d1Repository.ensureUser({
      id: auth.userId
    })

    let enrichedContent: Content | null = null
    let enrichmentSource = 'none'
    let apiUsed = false
    
    // Try API enrichment first for supported platforms
    if (platform === 'youtube' || platform === 'spotify') {
      console.log(`[EnrichedBookmark] ===== API ENRICHMENT ATTEMPT =====`)
      console.log(`[EnrichedBookmark] Platform: ${platform}`)
      console.log(`[EnrichedBookmark] User ID for OAuth: ${auth.userId}`)
      
      const apiEnrichmentService = new ApiEnrichmentService(c.env)
      
      // Extract content ID
      let contentId: string | null = null
      let spotifyResourceType: SpotifyResourceType | undefined
      if (platform === 'youtube') {
        const match = validatedData.url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\n?#]+)/)
        contentId = match ? match[1] : null
      } else if (platform === 'spotify') {
        const resource = resolveSpotifyResource(validatedData.url)
        if (resource) {
          spotifyResourceType = resource.type as SpotifyResourceType
          contentId = resource.id
        }
      }
      
      if (contentId) {
        console.log(`[EnrichedBookmark] Extracted content ID: ${contentId}`)
        console.log(`[EnrichedBookmark] Calling enrichWithApi...`)
        
        const apiResult = await apiEnrichmentService.enrichWithApi({
          provider: platform as 'youtube' | 'spotify',
          contentId,
          userId: auth.userId,
          forceRefresh: false,
          resourceType: spotifyResourceType
        })
        
        console.log(`[EnrichedBookmark] API result:`, {
          success: apiResult.success,
          source: apiResult.source,
          hasData: !!apiResult.data,
          error: apiResult.error
        })
        
        if (apiResult.success && apiResult.data) {
          console.log(`[EnrichedBookmark] ✅ API enrichment successful for ${platform}`)
          
          // Transform API data to Content format
          const now = new Date()
          enrichedContent = {
            id: `${platform}-${contentId}`,
            externalId: contentId,
            provider: platform,
            url: canonicalUrl,
            canonicalUrl,
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
            fullTextContent: null,
            fullTextExtractedAt: null,
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
            const dataWithType = apiResult.data as { __resourceType?: SpotifyResourceType; name?: string; description?: string }
            const resolvedSpotifyType = spotifyResourceType || dataWithType.__resourceType
            const effectiveSpotifyType: SpotifyResourceType = resolvedSpotifyType ?? 'episode'
            const transformedData = apiEnrichmentService.transformSpotifyApiResponse(apiResult.data, effectiveSpotifyType)
            enrichedContent = { ...enrichedContent!, ...transformedData }
            const fallbackTitle = dataWithType?.name || 'Untitled Spotify Item'
            if (!enrichedContent!.title) {
              enrichedContent!.title = fallbackTitle
            }
            if ('title' in transformedData && transformedData.title) {
              enrichedContent!.title = transformedData.title
            }
            if ('description' in transformedData) {
              enrichedContent!.description = transformedData.description ?? null
            } else if (typeof dataWithType?.description === 'string') {
              enrichedContent!.description = dataWithType.description
            }

            if (effectiveSpotifyType === 'episode' || effectiveSpotifyType === 'show') {
              enrichedContent!.contentType = 'podcast'
            } else {
              enrichedContent!.contentType = 'video'
            }
          }
          
          enrichmentSource = apiResult.source
          apiUsed = true
        }
      }
    }
    
    // Fall back to standard enrichment if API enrichment failed or not available
    if (!enrichedContent) {
      console.log('[EnrichedBookmark] ===== FALLBACK TO STANDARD ENRICHMENT =====')
      console.log('[EnrichedBookmark] Reason: API enrichment failed or no OAuth/API key')
      console.log('[EnrichedBookmark] Note: Standard enrichment uses oEmbed - NO CREATOR AVATARS')
      
      const sharedModule = await import('@zine/shared')
      const ContentEnrichmentService = (sharedModule as any).ContentEnrichmentService
      const contentEnrichmentService = new ContentEnrichmentService()
      const enrichResult = await contentEnrichmentService.enrichContent(validatedData.url, {
        forceRefresh: false,
        includeEngagement: true,
        includeCreator: true
      })
      
      console.log('[EnrichedBookmark] Standard enrichment result:', {
        success: enrichResult.success,
        source: enrichResult.source,
        hasContent: !!enrichResult.content,
        hasCreator: !!enrichResult.content?.creatorId
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
          provider: platform,
          url: canonicalUrl,
          canonicalUrl,
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
          fullTextContent: null,
          fullTextExtractedAt: null,
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

    if (canonicalUrl) {
      enrichedContent.url = canonicalUrl
      enrichedContent.canonicalUrl = canonicalUrl
    }

    if (platform === 'spotify') {
      enrichedContent.provider = 'spotify'
    }

    await populateMatchingMetadata(enrichedContent)

    const contentRepo = new ContentRepository(c.env.DB)
    const duplicateMatches = await contentRepo.findDuplicates(enrichedContent)
    const bestDuplicate = duplicateMatches.find((match) => match.score >= DUPLICATE_CONFIDENCE_THRESHOLD) || null

    let duplicateResolvedWith: Content | null = null
    let duplicateContext: ContentDeduplicationMatch | null = null
    let savedContent: Content
    let contentIdForBookmark: string

    if (bestDuplicate) {
      const primary = await contentRepo.findById(bestDuplicate.id)
      if (primary) {
        duplicateResolvedWith = primary
        duplicateContext = bestDuplicate

        const now = new Date()
        const existingCrossPlatformMatches = parseCrossPlatformMatches(primary.crossPlatformMatches)
        const shouldAddCrossPlatformEntry =
          primary.provider !== enrichedContent.provider ||
          primary.externalId !== enrichedContent.externalId

        const crossPlatformMatches = shouldAddCrossPlatformEntry
          ? upsertCrossPlatformEntry(existingCrossPlatformMatches, {
              platform: enrichedContent.provider,
              id: enrichedContent.externalId,
              url: enrichedContent.url,
              confidence: bestDuplicate.score,
              addedAt: now.toISOString()
            })
          : existingCrossPlatformMatches

        const updatePayload: Partial<Content> = {
          id: primary.id,
          crossPlatformMatches: crossPlatformMatches as any
        }

        if (enrichedContent.thumbnailUrl && !primary.thumbnailUrl) {
          updatePayload.thumbnailUrl = enrichedContent.thumbnailUrl
        }
        if (enrichedContent.description && !primary.description) {
          updatePayload.description = enrichedContent.description
        }
        if (enrichedContent.durationSeconds && !primary.durationSeconds) {
          updatePayload.durationSeconds = enrichedContent.durationSeconds
        }
        if (enrichedContent.contentType && !primary.contentType) {
          updatePayload.contentType = enrichedContent.contentType
        }
        if (enrichedContent.language && !primary.language) {
          updatePayload.language = enrichedContent.language
        }
        if (enrichedContent.seriesId && !primary.seriesId) {
          updatePayload.seriesId = enrichedContent.seriesId
        }
        if (enrichedContent.seriesName && !primary.seriesName) {
          updatePayload.seriesName = enrichedContent.seriesName
        }
        if (enrichedContent.seriesMetadata && !primary.seriesMetadata) {
          updatePayload.seriesMetadata = enrichedContent.seriesMetadata
        }
        if (enrichedContent.normalizedTitle && enrichedContent.normalizedTitle !== primary.normalizedTitle) {
          updatePayload.normalizedTitle = enrichedContent.normalizedTitle
        }
        if (enrichedContent.contentFingerprint && !primary.contentFingerprint) {
          updatePayload.contentFingerprint = enrichedContent.contentFingerprint
        }
        if (enrichedContent.publisherCanonicalId && !primary.publisherCanonicalId) {
          updatePayload.publisherCanonicalId = enrichedContent.publisherCanonicalId
        }
        if (enrichedContent.episodeIdentifier && !primary.episodeIdentifier) {
          updatePayload.episodeIdentifier = enrichedContent.episodeIdentifier
        }
        if (enrichedContent.enrichmentMetadata && !primary.enrichmentMetadata) {
          updatePayload.enrichmentMetadata = enrichedContent.enrichmentMetadata
        }
        if (enrichedContent.statisticsMetadata && !primary.statisticsMetadata) {
          updatePayload.statisticsMetadata = enrichedContent.statisticsMetadata
        }
        if (enrichedContent.publishedAt && !primary.publishedAt) {
          updatePayload.publishedAt = enrichedContent.publishedAt
        }
        if (enrichedContent.viewCount && (!primary.viewCount || enrichedContent.viewCount > primary.viewCount)) {
          updatePayload.viewCount = enrichedContent.viewCount
        }
        if (enrichedContent.likeCount && (!primary.likeCount || enrichedContent.likeCount > primary.likeCount)) {
          updatePayload.likeCount = enrichedContent.likeCount
        }
        if (enrichedContent.commentCount && (!primary.commentCount || enrichedContent.commentCount > primary.commentCount)) {
          updatePayload.commentCount = enrichedContent.commentCount
        }

        updatePayload.lastEnrichedAt = new Date()
        updatePayload.enrichmentSource = enrichmentSource

        savedContent = await contentRepo.upsert(updatePayload)
        contentIdForBookmark = primary.id
      } else {
        // Fallback to inserting as new content if primary reference could not be found
        // Extract and upsert creator data first
        const creatorRepo = new CreatorRepository(c.env.DB)
        await extractAndUpsertCreator(enrichedContent, creatorRepo)
        
        // Strip creator details before upserting content
        const contentData = stripCreatorDetails(enrichedContent)
        savedContent = await contentRepo.upsert(contentData)
        contentIdForBookmark = savedContent.id
      }
    } else {
      // Extract and upsert creator data first
      const creatorRepo = new CreatorRepository(c.env.DB)
      await extractAndUpsertCreator(enrichedContent, creatorRepo)
      
      // Strip creator details before upserting content
      const contentData = stripCreatorDetails(enrichedContent)
      savedContent = await contentRepo.upsert(contentData)
      contentIdForBookmark = savedContent.id
    }

    if (savedContent.provider === 'youtube' || savedContent.provider === 'spotify') {
      try {
        const linkageResult = await ensureCrossPlatformLinkage(contentRepo, savedContent)
        if (linkageResult?.primary) {
          savedContent = linkageResult.primary
        }
      } catch (linkError) {
        console.error('[EnrichedBookmark] Failed to link cross-platform content:', linkError)
      }
    }

    const contentForLinks = await contentRepo.findById(contentIdForBookmark)
    const alternateLinks = buildAlternateLinksFromContent(contentForLinks ?? savedContent)

    const existingBookmark = await c.env.DB.prepare(
      `SELECT 
        b.id,
        b.user_id,
        b.notes,
        b.bookmarked_at,
        b.status,
        c.url,
        c.title,
        c.description,
        c.thumbnail_url,
        c.content_type,
        c.published_at,
        c.creator_id,
        cr.name as creator_name,
        cr.handle as creator_handle,
        cr.avatar_url as creator_thumbnail,
        cr.verified as creator_verified,
        cr.subscriber_count as creator_subscriber_count,
        cr.follower_count as creator_follower_count,
        c.view_count,
        c.like_count,
        c.duration_seconds,
        cr.platform as creator_platform,
        c.extended_metadata as content_extended_metadata
      FROM bookmarks b
      JOIN content c ON b.content_id = c.id
      LEFT JOIN creators cr ON c.creator_id = cr.id
      WHERE b.user_id = ? AND b.content_id = ?
      LIMIT 1`
    ).bind(auth.userId, contentIdForBookmark).first()

    if (existingBookmark) {
      const duplicateReasons = duplicateContext?.reasons ?? []

      // Parse article metadata from extended metadata
      let existingArticleMetadata = undefined
      if (existingBookmark.content_type === 'article' && existingBookmark.content_extended_metadata) {
        try {
          const extended = typeof existingBookmark.content_extended_metadata === 'string'
            ? JSON.parse(existingBookmark.content_extended_metadata)
            : existingBookmark.content_extended_metadata
          existingArticleMetadata = {
            authorName: extended.authorName,
            wordCount: extended.wordCount,
            readingTime: extended.readingTime,
            isPaywalled: extended.isPaywalled,
            secondaryAuthors: extended.secondaryAuthors
          }
        } catch (error) {
          console.warn('[EnrichedBookmark] Failed to parse article extended metadata for existing bookmark:', error)
        }
      }

      let creator = undefined
      if (existingBookmark.creator_id && existingBookmark.creator_name) {
        creator = {
          id: existingBookmark.creator_id,
          name: existingBookmark.creator_name,
          handle: existingBookmark.creator_handle || undefined,
          avatarUrl: existingBookmark.creator_thumbnail || undefined,
          verified: existingBookmark.creator_verified === 1 || existingBookmark.creator_verified === true || undefined,
          subscriberCount: existingBookmark.creator_subscriber_count ? Number(existingBookmark.creator_subscriber_count) : undefined,
          followerCount: existingBookmark.creator_follower_count ? Number(existingBookmark.creator_follower_count) : undefined,
          platform: existingBookmark.creator_platform || undefined,
        }
      }

      return c.json({
        data: {
          id: existingBookmark.id,
          userId: auth.userId,
          url: existingBookmark.url,
          title: existingBookmark.title,
          description: existingBookmark.description,
          thumbnailUrl: existingBookmark.thumbnail_url,
          notes: existingBookmark.notes,
          contentType: existingBookmark.content_type,
          bookmarkedAt: existingBookmark.bookmarked_at,
          creator,
          articleMetadata: existingArticleMetadata,
          viewCount: existingBookmark.view_count,
          likeCount: existingBookmark.like_count,
          durationSeconds: existingBookmark.duration_seconds,
          status: existingBookmark.status,
          source: contentForLinks?.provider,
          alternateLinks,
        },
        message: duplicateResolvedWith ? 'Bookmark already exists for this content' : 'Bookmark already exists',
        duplicate: true,
        duplicateContentId: duplicateResolvedWith?.id,
        duplicateReasons,
        enrichmentSource
      })
    }

    // Creator data was already upserted before saving content
    // Create bookmark linking to the content
    const bookmarkId = `bookmark-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`
    await c.env.DB.prepare(
      `INSERT INTO bookmarks (id, user_id, content_id, notes, bookmarked_at, status)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).bind(
      bookmarkId,
      auth.userId,
      contentIdForBookmark,
      validatedData.notes || null,
      Date.now(),
      'active'
    ).run()
    
    // Get the full bookmark with content including creator data
    const fullBookmark = await c.env.DB.prepare(
      `SELECT 
        b.id,
        b.user_id,
        b.notes,
        b.bookmarked_at,
        b.status,
        c.url,
        c.title,
        c.description,
        c.thumbnail_url,
        c.content_type,
        c.published_at,
        c.creator_id,
        cr.name as creator_name,
        cr.handle as creator_handle,
        cr.avatar_url as creator_thumbnail,
        cr.verified as creator_verified,
        cr.subscriber_count as creator_subscriber_count,
        cr.follower_count as creator_follower_count,
        c.view_count,
        c.like_count,
        c.duration_seconds,
        cr.platform as creator_platform,
        c.extended_metadata as content_extended_metadata
      FROM bookmarks b
      JOIN content c ON b.content_id = c.id
      LEFT JOIN creators cr ON c.creator_id = cr.id
      WHERE b.id = ?`
    ).bind(bookmarkId).first()
    
    if (!fullBookmark) {
      throw new Error('Failed to retrieve created bookmark')
    }
    
    // Parse article metadata from extended metadata
    let articleMetadata = undefined
    if (fullBookmark.content_type === 'article' && fullBookmark.content_extended_metadata) {
      try {
        const extended = typeof fullBookmark.content_extended_metadata === 'string'
          ? JSON.parse(fullBookmark.content_extended_metadata)
          : fullBookmark.content_extended_metadata
        articleMetadata = {
          authorName: extended.authorName,
          wordCount: extended.wordCount,
          readingTime: extended.readingTime,
          isPaywalled: extended.isPaywalled,
          secondaryAuthors: extended.secondaryAuthors
        }
      } catch (error) {
        console.warn('[EnrichedBookmark] Failed to parse article extended metadata:', error)
      }
    }
    
    // Build creator object if creator data exists
    let creator = undefined
    if (fullBookmark.creator_id && fullBookmark.creator_name) {
      creator = {
        id: fullBookmark.creator_id,
        name: fullBookmark.creator_name,
        handle: fullBookmark.creator_handle || undefined,
        avatarUrl: fullBookmark.creator_thumbnail || undefined,
        verified: fullBookmark.creator_verified === 1 || fullBookmark.creator_verified === true || undefined,
        subscriberCount: fullBookmark.creator_subscriber_count ? Number(fullBookmark.creator_subscriber_count) : undefined,
        followerCount: fullBookmark.creator_follower_count ? Number(fullBookmark.creator_follower_count) : undefined,
        platform: fullBookmark.creator_platform || undefined,
      }
    }
    
    const duplicateReasons = duplicateContext?.reasons ?? []

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
      // Convert from seconds (database) to milliseconds, then to ISO string
      publishedAt: fullBookmark.published_at ? new Date((fullBookmark.published_at as number) * 1000).toISOString() : undefined,
      creator,
      creatorId: fullBookmark.creator_id || undefined,
      creatorName: creator?.name, // Keep for backward compatibility
      articleMetadata,
      status: fullBookmark.status || 'active',
      source: contentForLinks?.provider,
      alternateLinks,
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
        createdAt: fullBookmark.bookmarked_at ? new Date(fullBookmark.bookmarked_at as number) : new Date()
      },
      message: `Bookmark saved successfully${apiUsed ? ' with API enrichment' : ''}`,
      duplicate: Boolean(duplicateResolvedWith),
      duplicateContentId: duplicateResolvedWith?.id,
      duplicateReasons,
      enrichmentSource
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
        cr.name as creator_name,
        c.view_count,
        c.like_count,
        c.duration_seconds,
        c.last_enriched_at,
        c.enrichment_version
      FROM bookmarks b
      JOIN content c ON b.content_id = c.id
      LEFT JOIN creators cr ON c.creator_id = cr.id
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
