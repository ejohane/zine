# Preview Endpoint Optimization Plan

## Implementation Status
- ✅ **Phase 1**: URL Normalization Infrastructure (Complete)
- ✅ **Phase 2**: Database Query Layer (Complete)
- ⏸️ **Phase 3**: Date Format Standardization (Not started)
- ✅ **Phase 4**: Preview Service Refactor (Complete)
- 🔄 **Phase 5-10**: Pending in future PRs

**Current PR**: https://github.com/ejohane/zine/pull/59

## Executive Summary
Transform the preview endpoint into a highly optimized service that checks existing database records before external API calls, uses native platform APIs with user auth tokens for richer metadata, and implements intelligent caching strategies.

## Goals
1. **Database-First**: Check existing bookmarks and feed_items before external calls
2. **Native API Integration**: Use authenticated platform APIs for enhanced metadata
3. **Performance**: Sub-200ms response times for cached content
4. **Consistency**: Unified metadata format across all providers

## Architecture Overview

```
Request Flow:
1. Client → Preview Endpoint
2. URL Normalization & Validation
3. Check D1 Database (bookmarks + feed_items)
4. If found → Return cached metadata
5. If not found → Check OAuth availability
6. Native API (if auth) OR oEmbed fallback
7. Normalize & Store metadata
8. Return response
```

## Phase 1: URL Normalization Infrastructure

### Objective
Create a robust URL normalization system to ensure consistent database lookups.

### Tasks
1. **Create URL normalizer utility** (`packages/shared/src/url-normalizer.ts`)
   - Strip tracking parameters (utm_*, fbclid, etc.)
   - Normalize platform-specific URLs (youtube.com/watch, youtu.be, etc.)
   - Handle mobile vs desktop URL variants
   - Preserve essential query parameters

2. **Add normalization tests**
   - Test YouTube variants (youtube.com, youtu.be, m.youtube.com)
   - Test Spotify variants (open.spotify.com, play.spotify.com)
   - Test parameter stripping
   - Test edge cases (trailing slashes, fragments)

### Verification
- [x] URL normalizer handles all known YouTube URL formats
- [x] URL normalizer handles all known Spotify URL formats
- [x] Tracking parameters are correctly stripped
- [x] Essential parameters are preserved
- [x] All tests pass

## Phase 2: Database Query Layer

### Objective
Implement efficient database lookups for existing metadata.

### Tasks
1. **Create metadata repository** (`packages/api/src/repositories/metadata-repository.ts`)
   ```typescript
   interface MetadataRepository {
     findByUrl(url: string): Promise<ExistingMetadata | null>
     findInBookmarks(url: string): Promise<Bookmark | null>
     findInFeedItems(url: string): Promise<FeedItem | null>
   }
   ```

2. **Implement composite query**
   - Single query checking both tables using UNION
   - Index optimization for URL lookups
   - Return source table information

3. **Add database indexes**
   ```sql
   CREATE INDEX idx_bookmarks_url ON bookmarks(url);
   CREATE INDEX idx_feed_items_url ON feed_items(url);
   ```

### Verification
- [x] Repository methods return correct data
- [x] Queries execute in < 50ms
- [x] Indexes are properly created
- [x] Source table is correctly identified
- [x] Integration tests pass

## Phase 3: Date Format Standardization

### Objective
Ensure all dates are stored and retrieved in a consistent format.

### Tasks
1. **Create date normalizer utility** (`packages/shared/src/date-normalizer.ts`)
   - Convert ISO strings to Unix timestamps
   - Handle millisecond timestamps
   - Validate date ranges
   - Handle null/undefined dates

2. **Migration script for existing data** (`packages/api/migrations/normalize-dates.sql`)
   - Identify records with non-standard dates
   - Convert ISO strings to Unix timestamps
   - Update provider-specific date formats
   - Add validation constraints

3. **Update schema validation**
   - Ensure all date fields expect Unix timestamps
   - Add Zod validation for date formats
   - Update TypeScript types

### Verification
- [ ] All existing dates converted to Unix timestamps
- [ ] New saves use Unix timestamp format
- [ ] Date queries work correctly
- [ ] No date format inconsistencies in database
- [ ] Migration runs without errors

## Phase 4: Preview Service Refactor

### Objective
Refactor the preview service to use the database-first approach.

### Tasks
1. **Update BookmarkSaveService** (`packages/shared/src/bookmark-save-service.ts`)
   - Add database check before external calls
   - Implement provider detection
   - Add response source indicator

2. **Create preview response types**
   ```typescript
   interface PreviewResponse {
     metadata: Metadata
     source: 'database' | 'native_api' | 'oembed'
     cached: boolean
     provider: string
   }
   ```

3. **Implement service orchestration**
   - Check database first
   - Check OAuth availability
   - Call appropriate service
   - Normalize response

### Verification
- [x] Database lookups work correctly
- [x] Source is accurately reported
- [x] Fallback chain works (DB → Native → oEmbed)
- [x] Response times < 200ms for cached
- [ ] Response times < 2s for uncached (pending native API integration)

## Phase 5: OAuth Token Management

### Objective
Create a robust system for managing and using OAuth tokens.

### Tasks
1. **Create token service** (`packages/api/src/services/oauth-token-service.ts`)
   - Check token existence
   - Validate token expiry
   - Refresh expired tokens
   - Handle refresh failures

2. **Update Durable Object integration**
   - Store tokens securely
   - Implement token refresh logic
   - Handle concurrent refresh attempts

3. **Add token availability checks**
   - Check user has connected account
   - Verify token is valid
   - Return availability status

### Verification
- [ ] Tokens are correctly retrieved from DO
- [ ] Expired tokens are refreshed
- [ ] Refresh failures handled gracefully
- [ ] Concurrent refreshes don't cause issues
- [ ] Token availability check is accurate

## Phase 6: Spotify Native API Integration

### Objective
Implement Spotify Web API integration using user tokens.

### Tasks
1. **Create Spotify service** (`packages/api/src/external/spotify-metadata-service.ts`)
   - Parse Spotify URLs (track, episode, show, playlist)
   - Implement API calls for each type
   - Map responses to standard metadata

2. **Add Spotify-specific metadata fields**
   - Duration
   - Explicit content flag
   - Preview URL
   - Artist/show information

3. **Implement error handling**
   - Handle 401 (unauthorized)
   - Handle 404 (not found)
   - Handle rate limits
   - Fallback to oEmbed

### Verification
- [ ] All Spotify content types supported
- [ ] Metadata correctly extracted
- [ ] Error handling works
- [ ] Rate limits respected
- [ ] Fallback to oEmbed functional

## Phase 7: YouTube Native API Integration

### Objective
Implement YouTube Data API v3 integration using user tokens.

### Tasks
1. **Create YouTube service** (`packages/api/src/external/youtube-metadata-service.ts`)
   - Parse YouTube URLs (videos, playlists, channels)
   - Implement API calls with minimal parts
   - Map responses to standard metadata

2. **Optimize quota usage**
   - Use only required parts (snippet, contentDetails)
   - Batch requests where possible
   - Cache aggressively

3. **Add YouTube-specific metadata**
   - Duration
   - View count
   - Channel information
   - Published date

### Verification
- [ ] Video metadata extraction works
- [ ] Playlist detection works
- [ ] Channel URLs handled
- [ ] Quota usage optimized
- [ ] Fallback to oEmbed functional

## Phase 8: Fallback Chain Implementation

### Objective
Create a robust fallback system for metadata extraction.

### Tasks
1. **Implement fallback orchestrator**
   ```typescript
   class MetadataExtractor {
     async extract(url: string, userId: string) {
       // 1. Try database
       // 2. Try native API with auth
       // 3. Try oEmbed
       // 4. Try basic HTML scraping
       // 5. Return minimal metadata
     }
   }
   ```

2. **Add retry logic**
   - Retry transient failures
   - Exponential backoff
   - Circuit breaker pattern

3. **Implement minimal metadata**
   - Extract from URL structure
   - Use platform defaults
   - Return basic information

### Verification
- [ ] Each fallback level works independently
- [ ] Graceful degradation occurs
- [ ] Retry logic functions correctly
- [ ] Circuit breaker prevents cascading failures
- [ ] Always returns some metadata

## Phase 9: Response Caching Layer

### Objective
Implement intelligent caching to reduce external API calls.

### Tasks
1. **Add cache headers**
   - Set appropriate Cache-Control headers
   - Implement ETag support
   - Add Last-Modified headers

2. **Implement stale-while-revalidate**
   - Return stale data immediately
   - Refresh in background
   - Update cache asynchronously

3. **Add cache statistics**
   - Track cache hit/miss rates
   - Monitor response times
   - Log external API usage

### Verification
- [ ] Cache headers properly set
- [ ] ETags work correctly
- [ ] Stale-while-revalidate functions
- [ ] Cache statistics accurate
- [ ] Response times improved

## Phase 10: Monitoring and Observability

### Objective
Add comprehensive monitoring to track performance and issues.

### Tasks
1. **Add performance metrics**
   - Response time tracking
   - Cache hit rates
   - API call counts
   - Error rates by provider

2. **Implement structured logging**
   - Log all external API calls
   - Track fallback usage
   - Record error details
   - Monitor token refresh events

3. **Create dashboard**
   - Real-time metrics
   - Provider-specific stats
   - Error tracking
   - Performance trends

### Verification
- [ ] All metrics correctly tracked
- [ ] Logs contain necessary information
- [ ] Dashboard shows real-time data
- [ ] Alerts configured for failures
- [ ] Performance baseline established

## Success Metrics

### Performance
- Database lookups: < 50ms
- Cached responses: < 200ms
- External API calls: < 2s
- Fallback chain: < 3s

### Reliability
- Cache hit rate: > 60%
- API success rate: > 95%
- Fallback success: 100%
- Zero data loss

### User Experience
- Always return metadata
- Consistent format across providers
- Rich metadata when authenticated
- Transparent fallback behavior
