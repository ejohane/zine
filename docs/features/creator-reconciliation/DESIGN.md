# Creator Reconciliation - Technical Design Document

## Overview

This document outlines the technical design for integrating creator reconciliation heuristics into the feed polling flow. Currently, sophisticated creator matching logic exists in `creator-service.ts` but is not applied to content sourced from subscription feeds (Spotify/YouTube), leading to duplicate creator entries and inconsistent data across platforms.

## Problem Statement

### Current State

**Feed Polling Flow** (`single-user-polling-service.ts:410-468`)
- Creates creators with simple format: `${provider}:${subscription.external_id}`
- Uses subscription title as creator name
- Performs basic `INSERT ... ON CONFLICT` upsert
- **No fuzzy matching, no normalization, no cross-platform deduplication**

**Direct URL Bookmarking Flow**
- Uses metadata extraction which may have different creator extraction logic
- Path unclear, needs investigation

### The Gap

The `creator-service.ts` module contains sophisticated matching algorithms:
1. **Name normalization** (remove `@`, common suffixes like "Official", "Channel", etc.)
2. **Similarity calculation** (Levenshtein distance)
3. **Handle matching** across platforms (e.g., `@username`)
4. **Domain + fuzzy name matching** (similarity > 0.85)
5. **Related domain matching** (youtube.com/youtu.be, twitter.com/x.com) with higher threshold (> 0.9)
6. **No-domain fallback** (very high threshold > 0.95)
7. **Data merging** (prefer more complete values, merge platforms/links)

**However, these algorithms are ONLY used for in-memory matching:**
- ❌ No database integration - searches only `Map<string, Creator>` cache
- ❌ Session-scoped - cache cleared on restart
- ❌ Not used in feed polling - feed uses direct `CreatorRepository.upsertCreator()`
- ❌ Limited to direct bookmark flow - only called from `enhanced-metadata-extractor.ts`

**Result**: Feed-sourced content gets NO creator reconciliation at all.

### Impact

- **Duplicate creators**: "Joe Rogan Experience" exists as both `youtube:UCzQUP1qoWDoEbmsQxvdjxgQ` and `spotify:4rOoJ6Egrf8K2IrywzwOMk`
- **Inconsistent data**: Same creator has different metadata depending on source
- **Poor user experience**: Creator filter/grouping shows duplicates
- **Wasted storage**: Redundant creator records

## Goals

1. **Apply creator reconciliation to feed polling**: Use existing `creator-service.ts` heuristics when processing feed items
2. **Maintain backward compatibility**: Don't break existing creator records
3. **Support cross-platform matching**: Recognize same creator across Spotify, YouTube, etc.
4. **Preserve data quality**: Use best-available data when merging creators
5. **Enable future features**: Support creator-based views, filters, and recommendations

## Non-Goals

- **Manual creator merging UI**: Not in scope for this feature (future work)
- **Retroactive reconciliation**: Won't automatically merge existing creators (separate migration task)
- **Individual content creator extraction**: Won't extract different creators for individual episodes/videos (only subscription-level creators)
- **Creator profile pages**: No user-facing UI changes in this feature

## Technical Design

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────┐
│         Feed Polling (Durable Object)                   │
│  single-user-polling-service.ts                         │
└────────────────┬────────────────────────────────────────┘
                 │
                 │ 1. Fetch episodes/videos
                 ▼
┌─────────────────────────────────────────────────────────┐
│         createFeedItems()                                │
│  Extract subscription metadata                           │
└────────────────┬────────────────────────────────────────┘
                 │
                 │ 2. Prepare creator data
                 ▼
┌─────────────────────────────────────────────────────────┐
│    NEW: Creator Reconciliation Service                   │
│    - Normalize creator data                              │
│    - Find existing matches (fuzzy, handle, domain)       │
│    - Merge with existing creator                         │
│    - Return canonical creator ID                         │
└────────────────┬────────────────────────────────────────┘
                 │
                 │ 3. Use canonical creator ID
                 ▼
┌─────────────────────────────────────────────────────────┐
│    CreatorRepository.upsertCreator()                     │
│    - Upsert to creators table                            │
│    - Link content to creator                             │
└─────────────────────────────────────────────────────────┘
```

### Key Components

#### 1. Creator Data Extraction from Subscriptions

**Current**: Subscription metadata includes:
- `provider_id` (spotify/youtube)
- `external_id` (channel/show ID)
- `title` (channel/show name)
- `creator_name` (may differ from title)
- `thumbnail_url` (avatar/profile image)
- `subscriber_count` (YouTube) / follower count (Spotify)
- `is_verified` (verification status)

**New**: Extract richer creator data:
- Handle/username from subscription URL
- Bio/description from API responses
- External links (website, social media)
- Platform-specific metadata

#### 2. Creator Service Integration

**Existing**: `packages/shared/src/creator-service.ts`
- ❌ **In-memory only**: Uses `Map<string, Creator>` cache
- ❌ **No database integration**: Only searches cached creators from current session
- ❌ **Sync only**: Cannot be used in async contexts (Durable Objects, API routes)
- ✅ **Valuable algorithms**: Contains normalization, fuzzy matching, Levenshtein distance logic

**Critical Gap**: The existing service CANNOT check database for existing creators!

**New Module**: `packages/api/src/services/creator-reconciliation-service.ts`
- **Database-backed**: Queries `creators` table via `CreatorRepository`
- **Reuses algorithms**: Ports normalization and fuzzy matching logic from `creator-service.ts`
- **Async/await**: Full async support for database operations
- **Performance optimized**: Multi-tier lookup strategy with indexes
- **Production ready**: Error handling, graceful degradation, logging

**What we're porting from `creator-service.ts`**:
- ✅ Name normalization logic (remove @, Official, Channel suffixes)
- ✅ Levenshtein distance calculation
- ✅ Similarity thresholds (0.85, 0.9, 0.95)
- ✅ Domain extraction and related domain detection
- ✅ Data merging strategy (preferComplete, mergePlatforms)

**What we're building NEW**:
- ✅ Database queries for creator lookup (by ID, handle, domain)
- ✅ Multi-tier matching strategy (fast path → fuzzy fallback)
- ✅ CreatorRepository integration
- ✅ Async implementation throughout

#### 3. Direct Bookmark Integration Points

**Location**: `packages/shared/src/enhanced-metadata-extractor.ts:1510-1523`

**Current Flow**:
```typescript
private resolveCreator(creator: Creator | undefined): Creator | undefined {
  if (!creator) return undefined
  
  const resolution = creatorService.resolveCreator(creator) // ← In-memory only!
  return resolution.resolved
}
```

**New Flow**:
```typescript
private async resolveCreator(
  creator: Creator | undefined,
  reconciliationService?: CreatorReconciliationService
): Promise<Creator | undefined> {
  if (!creator) return undefined
  
  // Use database-backed reconciliation if available (API context)
  if (reconciliationService) {
    try {
      const result = await reconciliationService.reconcileCreator({
        id: creator.id,
        name: creator.name,
        handle: creator.handle,
        avatarUrl: creator.avatarUrl,
        bio: creator.bio,
        url: creator.url,
        platform: creator.platforms?.[0] || 'web',
      })
      
      // Fetch the reconciled creator data
      return await reconciliationService.getCreator(result.canonicalId)
    } catch (error) {
      console.warn('[MetadataExtractor] Reconciliation failed, using fallback:', error)
    }
  }
  
  // Fall back to in-memory service (shared package context)
  const resolution = creatorService.resolveCreator(creator)
  return resolution.resolved
}
```

**Integration in API**:
```typescript
// In bookmark creation endpoint
const enrichmentService = new IntegratedEnrichmentService(
  env.YOUTUBE_API_KEY,
  env.SPOTIFY_CLIENT_ID,
  env.SPOTIFY_CLIENT_SECRET
)

// Pass reconciliation service to metadata extractor
const reconciliationService = new CreatorReconciliationService(env.DB)
const metadata = await enrichmentService.enrichContent(
  url, 
  { reconciliationService } // ← New option
)
```

#### 4. Feed Polling Integration Points

**Location**: `single-user-polling-service.ts:createFeedItems()`

**Current Flow**:
```typescript
// Lines 410-439: Simple creator upsert
const creatorId = `${provider}:${subscription.external_id}`
const creatorName = subscription.title
await this.db.prepare(`INSERT INTO creators ... ON CONFLICT ...`)
```

**New Flow**:
```typescript
// Step 1: Prepare creator data from subscription
const candidateCreator = {
  id: `${provider}:${subscription.external_id}`,
  name: subscription.creator_name || subscription.title,
  handle: extractHandleFromUrl(subscription.subscription_url),
  avatarUrl: subscription.thumbnail_url,
  url: subscription.subscription_url,
  platform: provider,
  verified: subscription.is_verified,
  subscriberCount: subscription.subscriber_count
}

// Step 2: Reconcile with existing creators
const reconciliationService = new CreatorReconciliationService(this.db)
const reconciledCreator = await reconciliationService.reconcileCreator(candidateCreator)

// Step 3: Use canonical creator ID
const creatorId = reconciledCreator.id
```

### Data Flow

#### Before (Current)

```
Subscription → Simple ID → Upsert Creator → Link Content
   (Title)      (provider:id)   (No matching)
```

#### After (Proposed)

```
Subscription → Extract Metadata → Reconciliation Service → Find Matches
   (Rich data)    (name, handle,     (Fuzzy, handle,         (Existing
                   URL, verified)     domain matching)        creators)
                                            ↓
                                      Merge & Normalize
                                            ↓
                                   Return Canonical ID
                                            ↓
                                   Upsert Creator → Link Content
```

### Database Integration Architecture

The new `CreatorReconciliationService` must query the database to find existing creators. Here's how:

#### Database Lookup Strategy

**Multi-tier approach** (ordered by performance):

```typescript
class CreatorReconciliationService {
  async findExistingCreator(candidate: NormalizedCreator): Promise<Creator | null> {
    // Tier 1: Exact ID match (fastest - indexed primary key)
    let existing = await this.creatorRepo.getCreator(candidate.id)
    if (existing) {
      return existing
    }
    
    // Tier 2: Handle match (fast - indexed column)
    if (candidate.handle) {
      existing = await this.creatorRepo.findByHandle(candidate.handle)
      if (existing) {
        return existing
      }
    }
    
    // Tier 3: Domain-based candidates (medium - filtered search)
    if (candidate.url) {
      const domain = extractDomain(candidate.url)
      const candidates = await this.creatorRepo.findByDomainPattern(domain)
      
      // Apply fuzzy matching to filtered set (in-memory)
      for (const existingCreator of candidates) {
        const similarity = this.calculateNameSimilarity(
          candidate.name, 
          existingCreator.name
        )
        
        if (similarity.similarity > 0.85) {
          return existingCreator
        }
      }
      
      // Check related domains (youtube.com ↔ youtu.be)
      const relatedDomains = this.getRelatedDomains(domain)
      for (const relatedDomain of relatedDomains) {
        const relatedCandidates = await this.creatorRepo.findByDomainPattern(relatedDomain)
        
        for (const existingCreator of relatedCandidates) {
          const similarity = this.calculateNameSimilarity(
            candidate.name,
            existingCreator.name
          )
          
          // Higher threshold for cross-domain matching
          if (similarity.similarity > 0.9) {
            return existingCreator
          }
        }
      }
    }
    
    // Tier 4: Platform-based fuzzy match (slowest - full table scan with limit)
    if (candidate.platform) {
      const platformCreators = await this.creatorRepo.findByPlatform(
        candidate.platform,
        { limit: 100 } // Limit to avoid performance issues
      )
      
      for (const existingCreator of platformCreators) {
        const similarity = this.calculateNameSimilarity(
          candidate.name,
          existingCreator.name
        )
        
        // Very high threshold when no other signals
        if (similarity.similarity > 0.95) {
          return existingCreator
        }
      }
    }
    
    return null // No match found
  }
}
```

#### New CreatorRepository Methods

**Required additions** to `packages/api/src/repositories/creator-repository.ts`:

```typescript
export class CreatorRepository {
  // ... existing methods ...
  
  /**
   * Find creator by handle (case-insensitive)
   */
  async findByHandle(handle: string): Promise<Creator | null> {
    const result = await this.db.prepare(`
      SELECT * FROM creators 
      WHERE LOWER(handle) = LOWER(?)
      LIMIT 1
    `).bind(handle).first()
    
    return result ? this.mapRowToCreator(result) : null
  }
  
  /**
   * Find creators with URLs matching a domain pattern
   * Example: 'youtube.com' matches 'https://youtube.com/channel/123'
   */
  async findByDomainPattern(domain: string): Promise<Creator[]> {
    const result = await this.db.prepare(`
      SELECT * FROM creators 
      WHERE url LIKE ?
      ORDER BY updated_at DESC
      LIMIT 50
    `).bind(`%${domain}%`).all()
    
    return result.results.map(row => this.mapRowToCreator(row))
  }
  
  /**
   * Find creators by platform (from platforms JSON array)
   * Limited to avoid performance issues
   */
  async findByPlatform(platform: string, options?: { limit?: number }): Promise<Creator[]> {
    const limit = options?.limit || 100
    
    const result = await this.db.prepare(`
      SELECT * FROM creators 
      WHERE platforms LIKE ?
      ORDER BY updated_at DESC
      LIMIT ?
    `).bind(`%"${platform}"%`, limit).all()
    
    return result.results.map(row => this.mapRowToCreator(row))
  }
}
```

#### Required Database Indexes

```sql
-- Index on handle for fast exact lookups
CREATE INDEX IF NOT EXISTS idx_creators_handle 
ON creators(handle) 
WHERE handle IS NOT NULL;

-- Index on url for domain pattern matching
CREATE INDEX IF NOT EXISTS idx_creators_url 
ON creators(url) 
WHERE url IS NOT NULL;

-- Composite index for platform + updated_at queries
CREATE INDEX IF NOT EXISTS idx_creators_platforms_updated 
ON creators(platforms, updated_at) 
WHERE platforms IS NOT NULL;
```

### Reconciliation Logic

#### Phase 1: Normalization

```typescript
function normalizeCreator(creator: CreatorCandidate): NormalizedCreator {
  // 1. Clean name
  let normalizedName = creator.name.trim()
  normalizedName = normalizedName.replace(/^@/, '')
  normalizedName = normalizedName.replace(/\s+(?:Official|Channel|Music|Podcast)$/i, '')
  
  // 2. Extract/normalize handle
  let normalizedHandle = creator.handle?.trim()
  if (!normalizedHandle && creator.url) {
    normalizedHandle = extractHandleFromUrl(creator.url)
  }
  if (normalizedHandle && !normalizedHandle.startsWith('@')) {
    normalizedHandle = `@${normalizedHandle}`
  }
  
  // 3. Normalize URL (remove tracking params)
  let normalizedUrl = removeTrackingParams(creator.url)
  
  // 4. Generate normalized ID
  const normalizedId = generateNormalizedId(creator.platform, normalizedName, normalizedHandle)
  
  return { ...creator, normalizedName, normalizedHandle, normalizedUrl, normalizedId }
}
```

#### Phase 2: Matching Strategy

**Priority order** (first match wins):

1. **Exact ID match** (fast path)
   ```sql
   SELECT * FROM creators WHERE id = ?
   ```

2. **Handle match across platforms**
   ```sql
   SELECT * FROM creators WHERE handle = ? AND handle IS NOT NULL
   ```
   - Example: `@joerogan` on both YouTube and Spotify

3. **Same domain + fuzzy name** (similarity > 0.85)
   ```sql
   SELECT * FROM creators WHERE url LIKE '%domain%'
   ```
   - Then calculate similarity for each

4. **Related domains + high similarity** (> 0.9)
   - youtube.com ↔ youtu.be
   - twitter.com ↔ x.com
   - open.spotify.com ↔ spotify.com

5. **No domain + very high similarity** (> 0.95)
   - Fallback when no URL available

#### Phase 3: Merging

When match found:
```typescript
function mergeCreators(existing: Creator, new: Creator): Creator {
  return {
    id: existing.id, // Keep existing ID
    name: preferMoreComplete(existing.name, new.name),
    handle: preferMoreComplete(existing.handle, new.handle),
    avatarUrl: preferMoreComplete(existing.avatarUrl, new.avatarUrl),
    bio: preferMoreComplete(existing.bio, new.bio),
    url: preferMoreComplete(existing.url, new.url),
    platforms: mergePlatformArrays(existing.platforms, new.platforms),
    externalLinks: mergeLinks(existing.externalLinks, new.externalLinks),
    verified: existing.verified || new.verified,
    subscriberCount: Math.max(existing.subscriberCount || 0, new.subscriberCount || 0),
    updatedAt: now()
  }
}
```

### Performance Considerations

#### Database Queries

**Problem**: Fuzzy matching requires loading many creators for comparison

**Solution**: Multi-tiered lookup strategy
1. **Indexed exact lookups** (id, handle) - O(1)
2. **Domain-based filtering** - O(log n) with index
3. **In-memory fuzzy matching** - Only on filtered subset

**Indexes needed**:
```sql
CREATE INDEX idx_creators_handle ON creators(handle) WHERE handle IS NOT NULL;
CREATE INDEX idx_creators_url ON creators(url) WHERE url IS NOT NULL;
```

#### Caching Strategy

**In-Memory Cache** (per Durable Object instance)
- Cache reconciliation results for subscription
- TTL: 1 hour (balances freshness vs. performance)
- Key: `${provider}:${external_id}`
- Value: Canonical creator ID

**Cache invalidation**:
- On manual creator updates (future feature)
- On new platform added to creator

#### Batch Processing

For Spotify batch fetching (up to 50 shows):
- Reconcile creators in parallel
- Use `Promise.all()` with concurrency limit (10)
- Fail gracefully (skip reconciliation on error, use simple ID)

### Error Handling

#### Reconciliation Failures

**Strategy**: Graceful degradation
```typescript
try {
  const reconciledCreator = await reconciliationService.reconcileCreator(candidate)
  creatorId = reconciledCreator.id
} catch (error) {
  console.error('[Reconciliation] Failed, using fallback ID:', error)
  // Fallback to current behavior
  creatorId = `${provider}:${subscription.external_id}`
}
```

**Always create content** even if creator reconciliation fails.

#### Database Transaction Handling

**Approach**: Separate transactions
1. Reconcile + upsert creator (transaction 1)
2. Create content (transaction 2)
3. Create feed item (transaction 3)

**Rationale**: If creator reconciliation is slow/fails, don't block content creation.

### API Changes

#### New Service: CreatorReconciliationService

```typescript
// packages/api/src/services/creator-reconciliation-service.ts

export interface CreatorCandidate {
  id: string              // Original ID (e.g., spotify:show123)
  name: string
  handle?: string
  avatarUrl?: string
  bio?: string
  url?: string
  platform: string        // spotify, youtube, etc.
  verified?: boolean
  subscriberCount?: number
  followerCount?: number
}

export interface ReconciliationResult {
  canonicalId: string     // ID to use (may be different if matched)
  wasMatched: boolean     // True if matched with existing creator
  matchedWith?: string    // Original ID of matched creator (if different)
  matchMethod?: 'exact' | 'handle' | 'domain-fuzzy' | 'related-domain' | 'high-similarity'
  similarityScore?: number
}

export class CreatorReconciliationService {
  private creatorRepository: CreatorRepository
  
  constructor(private db: D1Database) {
    this.creatorRepository = new CreatorRepository(db)
  }
  
  /**
   * Reconcile a creator candidate with existing creators.
   * Returns the canonical creator ID to use and match metadata.
   * Timeout: 200ms (falls back to candidate.id on timeout)
   */
  async reconcileCreator(candidate: CreatorCandidate): Promise<ReconciliationResult>
  
  /**
   * Get creator by ID (for fetching reconciled creator data)
   */
  async getCreator(id: string): Promise<Creator | null> {
    return this.creatorRepository.getCreator(id)
  }
  
  /**
   * Find existing creators that might match the candidate.
   * Returns best match or null.
   * Implements multi-tier lookup strategy.
   */
  private async findExistingCreator(candidate: NormalizedCreator): Promise<Creator | null>
  
  /**
   * Normalize creator data (clean names, handles, URLs)
   */
  private normalizeCreator(candidate: CreatorCandidate): NormalizedCreator
  
  /**
   * Calculate name similarity using Levenshtein distance
   */
  private calculateNameSimilarity(name1: string, name2: string): NameMatchResult
  
  /**
   * Merge creator data, preferring more complete information.
   */
  private mergeCreatorData(existing: Creator, candidate: CreatorCandidate): Creator
  
  /**
   * Extract handle from subscription URL (platform-aware)
   */
  private async extractHandleFromUrl(url: string, platform: string): Promise<string | undefined>
}
```

#### Updated: single-user-polling-service.ts

```typescript
// In createFeedItems() method

// NEW: Import reconciliation service
import { CreatorReconciliationService } from '../services/creator-reconciliation-service'

// CHANGE: Replace simple creator upsert with reconciliation
const reconciliationService = new CreatorReconciliationService(this.db)

const candidateCreator: CreatorCandidate = {
  id: `${provider}:${subscription.external_id}`,
  name: subscription.creator_name || subscription.title,
  handle: extractHandleFromSubscriptionUrl(subscription.subscription_url, provider),
  avatarUrl: subscription.thumbnail_url,
  url: subscription.subscription_url,
  platform: provider,
  verified: subscription.is_verified === 1,
  subscriberCount: subscription.subscriber_count
}

const reconciliationResult = await reconciliationService.reconcileCreator(candidateCreator)
const creatorId = reconciliationResult.canonicalId

// Log reconciliation for debugging
if (reconciliationResult.wasMatched) {
  console.log(`[Reconciliation] Matched ${candidateCreator.id} → ${creatorId} via ${reconciliationResult.matchMethod}`)
}

// Rest of createFeedItems logic uses creatorId
```

### Database Schema Changes

**No schema changes required** - existing schema supports all needed fields.

**Recommended indexes** (if not already present):
```sql
CREATE INDEX IF NOT EXISTS idx_creators_handle ON creators(handle);
CREATE INDEX IF NOT EXISTS idx_creators_platforms ON creators(platforms);
```

### Testing Strategy

#### Unit Tests

**Test `creator-reconciliation-service.ts`**:
1. Exact ID match
2. Handle match (same handle, different platform)
3. Fuzzy name match (same domain)
4. Related domain match (youtube.com vs youtu.be)
5. High similarity match (no domain)
6. No match (create new)
7. Name normalization (remove @, Official, etc.)
8. Similarity calculation (Levenshtein)
9. Data merging (prefer complete, merge platforms)

#### Integration Tests

**Test feed polling flow**:
1. Poll Spotify show → creates creator
2. Poll YouTube channel (same creator) → reconciles to existing
3. Poll with missing metadata → falls back safely
4. Poll with reconciliation error → content still created

#### Manual Testing

**Test scenarios**:
1. Subscribe to Joe Rogan on Spotify
2. Subscribe to Joe Rogan on YouTube
3. Verify single creator entry in database
4. Verify both subscriptions link to same creator
5. Verify creator has both platforms in `platforms` array

### Rollout Plan

#### Phase 1: Implementation (This Work)
- Build `CreatorReconciliationService`
- Integrate into feed polling
- Add logging/observability

#### Phase 2: Testing & Validation
- Unit tests
- Integration tests
- Manual testing with real subscriptions

#### Phase 3: Deployment
- Deploy to preview environment
- Monitor reconciliation metrics
- Watch for performance impact

#### Phase 4: Migration (Future Work)
- Retroactively reconcile existing creators
- Merge duplicate creator records
- Update content references

## Design Decisions

### 1. Handle Extraction Strategy

**YouTube:**
- Parse handle from `@username` format URLs: `https://youtube.com/@mkbhd`
- For channel ID URLs (`/channel/UCxxx`), fetch handle from YouTube API using existing OAuth token
- For custom URLs (`/c/name`), fetch handle from YouTube API

**Spotify:**
- No handle extraction (Spotify shows don't have handles)
- Skip handle-based matching for Spotify creators
- Rely on name similarity and domain matching only

**Implementation:**
```typescript
async function extractHandleFromSubscriptionUrl(
  url: string, 
  provider: string,
  apiToken?: string
): Promise<string | undefined> {
  if (provider === 'youtube') {
    // Try to parse from URL first
    const handleMatch = url.match(/@([a-zA-Z0-9_]+)/)
    if (handleMatch) return `@${handleMatch[1]}`
    
    // Fall back to API if we have channel ID
    const channelMatch = url.match(/channel\/([^/?]+)/)
    if (channelMatch && apiToken) {
      const youtubeAPI = new YouTubeAPI(apiToken)
      const channel = await youtubeAPI.getChannelDetails(channelMatch[1])
      return channel.snippet.customUrl || undefined
    }
  }
  
  return undefined // Spotify or no handle found
}
```

### 2. Canonical Creator ID Strategy

**Decision:** Keep first-seen creator ID as canonical

**Example:**
- User subscribes to Joe Rogan on Spotify first → creates `spotify:4rOoJ6Egrf8K2IrywzwOMk`
- User subscribes to Joe Rogan on YouTube later → reconciliation matches existing creator
- Both subscriptions link to `spotify:4rOoJ6Egrf8K2IrywzwOMk` (first-seen ID)
- YouTube platform added to `platforms` array: `["spotify", "youtube"]`

**Rationale:**
- Simple and deterministic
- No need to migrate content references
- Preserves data history (first platform user discovered creator on)

### 3. Reconciliation Scope

**Subscription-level creators only:**
- Reconcile the channel/show owner (subscription creator)
- All content items from that subscription use the same creator
- Individual episode/video creators (guests, collaborators) are out of scope

**Example:**
- Subscribe to "The Joe Rogan Experience" podcast on Spotify
- All episodes get `creatorId = spotify:4rOoJ6Egrf8K2IrywzwOMk`
- Even if episodes have different guests, all link to show creator

### 4. Direct Bookmark Flow Integration

**In Scope:** Apply reconciliation to direct URL bookmarks

**Current Flow:**
```
URL → EnhancedMetadataExtractor → creator-service.ts (in-memory) → CreatorRepository.upsertCreator()
```

**New Flow:**
```
URL → EnhancedMetadataExtractor → CreatorReconciliationService (database-backed) → CreatorRepository.upsertCreator()
```

**Changes Required:**
1. Update `enhanced-metadata-extractor.ts` to accept optional `CreatorReconciliationService`
2. Pass database instance when used in API context (bookmarking flow)
3. Fall back to in-memory `creator-service.ts` when used without database (shared package)

### 5. Performance Targets

**Reconciliation Timeout:** 200ms
- If reconciliation takes longer, fall back to simple creator ID
- Log timeout events for monitoring

**Batch Processing:**
- Process up to 10 creators in parallel (Spotify batch: 50 shows → 5 batches of 10)
- Each reconciliation can take up to 200ms
- Total max overhead: ~1 second for 50-show batch (acceptable)

**Database Query Limits:**
- Domain pattern matches: max 50 results
- Platform fuzzy search: max 100 results
- Prevents runaway queries on large creator tables

### 6. Logging Strategy

**Log all reconciliation matches:**
```typescript
console.log('[Reconciliation]', {
  candidateId: 'youtube:UCxxx',
  matchedId: 'spotify:4rOoJ6xxx',
  method: 'fuzzy-domain',
  similarity: 0.92,
  candidateName: 'Joe Rogan Experience',
  matchedName: 'The Joe Rogan Experience',
  duration: 45 // ms
})
```

**Log fallbacks:**
```typescript
console.warn('[Reconciliation] Timeout, using fallback ID:', {
  candidateId: 'youtube:UCxxx',
  duration: 215 // ms exceeded 200ms limit
})
```

**No metrics tracking** - logs only for future debugging

## Success Metrics

- **Duplicate reduction**: % decrease in duplicate creator entries
- **Match accuracy**: Manual review of reconciled creators
- **Performance**: No increase in feed polling latency
- **Data quality**: More complete creator profiles (bio, links, etc.)

## Implementation Summary

### What We're Building

**1. New Service: `CreatorReconciliationService`**
- Location: `packages/api/src/services/creator-reconciliation-service.ts`
- Database-backed creator matching with multi-tier lookup
- Ports algorithms from `creator-service.ts` (Levenshtein, normalization)
- 200ms timeout with graceful fallback
- Async/await throughout

**2. New Repository Methods**
- `CreatorRepository.findByHandle(handle)`
- `CreatorRepository.findByDomainPattern(domain)`
- `CreatorRepository.findByPlatform(platform, options)`

**3. Database Indexes**
- `idx_creators_handle` on `handle` column
- `idx_creators_url` on `url` column
- `idx_creators_platforms_updated` on `platforms` + `updated_at`

**4. Integration Points**
- **Feed polling**: `single-user-polling-service.ts:createFeedItems()`
- **Direct bookmarks**: `enhanced-metadata-extractor.ts:resolveCreator()`

**5. Handle Extraction**
- YouTube: Parse from URL or fetch via API
- Spotify: Skip (no handles)
- Platform-aware extraction logic

### Key Behaviors

- ✅ First-seen creator ID becomes canonical
- ✅ Subscription-level creators only (no per-episode/video creators)
- ✅ Graceful degradation on errors (always create content)
- ✅ Comprehensive logging for debugging
- ✅ Both feed polling AND direct bookmarks covered

### Testing Checklist

- [ ] Unit tests for reconciliation service
- [ ] Unit tests for new repository methods
- [ ] Integration test: Spotify subscription → YouTube subscription (same creator)
- [ ] Integration test: Direct bookmark → Feed item (same creator)
- [ ] Integration test: Reconciliation timeout fallback
- [ ] Manual test: Real subscriptions (Joe Rogan, MKBHD, etc.)

## Future Work

- **Manual creator merging UI**: Allow users to merge/split creators
- **Creator profiles**: Dedicated view for all content by creator
- **Cross-platform discovery**: "Also available on YouTube/Spotify"
- **Creator preferences**: Subscribe to creator across platforms
- **Retroactive reconciliation**: Batch job to merge existing duplicates
- **Per-content creator extraction**: Handle guests, collaborations
