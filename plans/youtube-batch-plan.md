# YouTube Batch Polling Optimization Plan

## Executive Summary

This plan outlines improvements to YouTube subscription polling to match the efficiency of our Spotify implementation. The key insight from Spotify's approach is minimizing API calls through intelligent batching and selective fetching based on change detection. We'll adapt these principles to YouTube's API constraints.

## Current State Analysis

### Spotify Implementation (Highly Optimized)
1. **Batch metadata fetching**: Gets up to 50 shows in a single API call
2. **Change detection**: Compares `total_episodes` to determine which shows need episode fetching
3. **Selective episode fetching**: Only fetches episodes for shows with changes
4. **Subrequest management**: Tracks API calls to stay within Cloudflare's 50 subrequest limit
5. **Efficient quota usage**: Minimizes API calls through intelligent batching

### Current YouTube Implementation (Needs Optimization)
1. **Batch channel fetching**: Gets up to 50 channels in one call (✅ Good)
2. **No change detection**: Fetches videos for ALL channels every time (❌ Inefficient)
3. **Two API calls per channel**: Search + video details for every channel (❌ Expensive)
4. **Poor concurrency**: `maxConcurrency: 1` due to subrequest limits (❌ Slow)

## YouTube API Constraints & Opportunities

### API Limitations
- No direct equivalent to Spotify's `total_episodes` field for change detection
- Traditional batch endpoint deprecated (404 errors)
- Quota costs: channels.list (1 unit), playlistItems.list (1 unit), videos.list (1 unit)
- Search.list is expensive (100 units) - should be avoided

### API Opportunities
- Comma-delimited IDs support for bulk fetching (channels, videos, playlists)
- ETag support for caching unchanged responses
- Uploads playlist available via `contentDetails.relatedPlaylists.uploads`
- PlaylistItems returns video IDs that can be batch fetched

## Proposed Optimization Strategy

### Phase 1: Change Detection System (Video Count Tracking)

- Store `videoCount` from channel statistics in our database
- Compare current vs. stored count to detect new uploads
- Only fetch videos for channels with increased counts

**Implementation:**
```typescript
// Step 1: Batch fetch channels with statistics
const channelResponse = await fetch(
  `/channels?part=snippet,statistics,contentDetails&id=${channelIds.join(',')}`
)

// Step 2: Compare video counts
const channelsWithNewVideos = channels.filter(channel => {
  const stored = subscriptionsByChannelId.get(channel.id)
  return channel.statistics.videoCount > (stored.videoCount || 0)
})
```

### Phase 2: Optimize Video Fetching

#### Current Inefficient Approach (2 calls per channel):
1. Search API to get video IDs (100 quota units!)
2. Videos API to get details

#### Optimized Approach (Uploads Playlist Method):
1. Get uploads playlist ID from channel contentDetails (already fetched)
2. Use playlistItems.list to get video IDs (1 quota unit)
3. Batch fetch video details for multiple channels at once

```typescript
// Step 1: Get video IDs from uploads playlist
const playlistResponse = await fetch(
  `/playlistItems?part=contentDetails&playlistId=${uploadsPlaylistId}&maxResults=20`
)

// Step 2: Batch fetch video details for ALL channels' videos
const allVideoIds = channelsWithNewVideos.flatMap(ch => ch.videoIds)
const videoChunks = chunk(allVideoIds, 50)
for (const chunk of videoChunks) {
  const videos = await fetch(
    `/videos?part=snippet,contentDetails&id=${chunk.join(',')}`
  )
}
```

### Phase 3: Subrequest Optimization

#### Current: 2+ API calls per channel
- Channel fetch: 1 call per 50 channels
- Per channel: 2 calls (search + details)
- **Total for 100 channels: 2 + (100 × 2) = 202 calls** ❌

#### Optimized: Batch everything possible
- Channel fetch: 2 calls for 100 channels (batches of 50)
- Channels with changes (assume 20%): 20 channels
- PlaylistItems: 20 calls (1 per channel with changes)
- Video details: 1-2 calls (batch all video IDs)
- **Total for 100 channels: 2 + 20 + 2 = 24 calls** ✅

### Additional Optimizations

1. **ETag Caching**
   - Store ETags for channel responses
   - Use If-None-Match header to skip unchanged data
   - Reduces bandwidth and processing time

2. **Parallel Processing with Batching**
   ```typescript
   // Process in batches to stay under subrequest limit
   const BATCH_SIZE = 10 // Process 10 channels at a time
   const batches = chunk(channelsWithNewVideos, BATCH_SIZE)
   
   for (const batch of batches) {
     // Parallel fetch within batch
     await Promise.all(batch.map(channel => 
       fetchUploadsPlaylist(channel.uploadsPlaylistId)
     ))
   }
   ```

3. **Smart Polling Intervals**
   - Track channel upload frequency
   - Poll active channels more frequently
   - Reduce polling for dormant channels

## Implementation Steps

### Step 1: Database Schema Updates ✅ COMPLETED

The subscriptions table currently has:
- `totalEpisodes` for Spotify (already exists)
- No equivalent for YouTube video tracking

We need to add YouTube-specific columns via Drizzle migrations:

#### Migration File: `0007_add_youtube_optimization_columns.sql`
```sql
-- Add YouTube optimization columns to subscriptions table
ALTER TABLE subscriptions ADD COLUMN video_count INTEGER DEFAULT 0;
ALTER TABLE subscriptions ADD COLUMN uploads_playlist_id TEXT;
ALTER TABLE subscriptions ADD COLUMN etag TEXT;

-- Create indexes for efficient queries
CREATE INDEX idx_subscriptions_video_count ON subscriptions(provider_id, video_count);
CREATE INDEX idx_subscriptions_uploads_playlist ON subscriptions(uploads_playlist_id);
```

#### Update Schema Definition: `packages/api/src/schema.ts`
```typescript
export const subscriptions = sqliteTable('subscriptions', {
  // ... existing columns ...
  totalEpisodes: integer('total_episodes'), // Already exists for Spotify
  videoCount: integer('video_count'),       // NEW: For YouTube change detection
  uploadsPlaylistId: text('uploads_playlist_id'), // NEW: Cache playlist ID
  etag: text('etag'),                      // NEW: For ETag caching
  // ... rest of columns ...
})
```

#### Generate and Apply Migration
```bash
# Generate migration from schema changes
cd packages/api
bun run db:generate

# Apply migration locally
bun run db:migrate

# Deploy to production (through CI/CD)
```

### Step 2: Update YouTubeBatchProcessor ✅ COMPLETED

```typescript
class YouTubeBatchProcessor {
  async processBatch(subscriptions, accessToken, options) {
    // 1. Batch fetch channels with statistics & contentDetails
    const channels = await this.batchFetchChannels(channelIds)
    
    // 2. Filter channels with new videos
    const channelsWithChanges = this.detectChanges(channels, subscriptions)
    
    // 3. Batch fetch video IDs from uploads playlists
    const videoIdsByChannel = await this.batchFetchVideoIds(channelsWithChanges)
    
    // 4. Batch fetch all video details
    const allVideoIds = Object.values(videoIdsByChannel).flat()
    const videos = await this.batchFetchVideoDetails(allVideoIds)
    
    // 5. Update stored metadata
    await this.updateChannelMetadata(channels)
    
    return this.convertToResults(videos, subscriptions)
  }
}
```

### Step 3: Monitoring & Metrics ✅ COMPLETED

Track key metrics:
- API calls per polling cycle
- Quota usage per user
- Cache hit rates (ETags)
- Channels with new content percentage
- Average processing time

## Expected Improvements

### Before Optimization
- **API Calls**: ~200 for 100 channels
- **Quota Usage**: ~10,200 units (using search.list)
- **Processing Time**: ~60 seconds
- **Subrequest Limit Issues**: Frequent

### After Optimization
- **API Calls**: ~25 for 100 channels (88% reduction)
- **Quota Usage**: ~25 units (99.7% reduction)
- **Processing Time**: ~10 seconds (83% reduction)
- **Subrequest Limit Issues**: None

## Conclusion

By adopting Spotify's intelligent batching approach and adapting it to YouTube's API capabilities, we can achieve:
- **88% reduction in API calls**
- **99.7% reduction in quota usage**
- **Better scalability** for more users and subscriptions
- **Faster polling cycles** with improved user experience

The key innovation is using change detection (video count comparison) to avoid unnecessary API calls, combined with efficient batching of all remaining operations.