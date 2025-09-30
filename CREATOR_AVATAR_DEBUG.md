# YouTube Creator Avatar Debug Guide

## The Problem
YouTube creator avatars (channel thumbnails) are not being saved to the database when bookmarking YouTube videos.

## Root Cause for Local Development
The issue occurs when running locally because:

1. **Durable Objects don't work properly in local development** (`wrangler dev --local`)
   - They're emulated but often fail to persist data or connect properly
2. **OAuth tokens are stored ONLY in Durable Objects** (removed from D1 database)
3. **Without OAuth tokens, the API falls back to oEmbed** which doesn't provide channel avatars
4. **YouTube Data API requires either OAuth tokens OR an API key**

## What the Logs Will Show

With the enhanced logging, you'll see:

```
[DualModeTokenService] ===== TOKEN RETRIEVAL START =====
[DualModeTokenService] Running locally: YES
[DualModeTokenService] Attempting to get tokens from Durable Object...
[DualModeTokenService] ❌ DO connection error: [error details]
[DualModeTokenService] Falling back to D1...
[DualModeTokenService] D1 returned 0 tokens
[DualModeTokenService] ⚠️ NO TOKENS AVAILABLE

[ApiEnrichment] No valid token - returning with error

[EnrichedBookmark] ===== FALLBACK TO STANDARD ENRICHMENT =====
[EnrichedBookmark] Note: Standard enrichment uses oEmbed - NO CREATOR AVATARS
```

## Solution for Local Development

### Option 1: Use YouTube API Key (Recommended for Local)

1. **Get a YouTube API Key:**
   - Go to https://console.developers.google.com
   - Create a project or select existing
   - Enable "YouTube Data API v3"
   - Create credentials > API key

2. **Add to `.dev.vars`:**
   ```
   YOUTUBE_API_KEY=your_api_key_here
   ```

3. **The code now supports API key fallback** for local development:
   - Located in `/packages/api/src/services/local-dev-enrichment.ts`
   - Automatically used when `YOUTUBE_API_KEY` is present

### Option 2: Complete OAuth Flow (Works in Production)

1. Deploy to Cloudflare Workers (where Durable Objects work)
2. Complete YouTube OAuth flow
3. Tokens stored in Durable Objects
4. Creator avatars will be fetched and saved

## How It Should Work

When saving a YouTube bookmark with proper authentication:

1. **API Enrichment** (`ApiEnrichmentService`)
   - Fetches video data from YouTube Data API
   - Makes second call to fetch channel data (includes avatar)
   - Channel thumbnails in `snippet.thumbnails` object

2. **Transform** (`transformYouTubeApiResponse`)
   - Extracts `channelThumbnail` from channel data
   - Maps to `creatorThumbnail` field

3. **Save Creator** (`CreatorRepository`)
   - Upserts creator with `avatarUrl` field
   - Stores in `creators` table

4. **Response**
   - Returns bookmark with full creator object
   - Includes `avatarUrl` from creators table

## Testing

### With API Key (Local)
```bash
# Add to .dev.vars
YOUTUBE_API_KEY=your_key

# Restart API
cd packages/api && bun run dev

# Test save
AUTH_TOKEN="your_clerk_token" node test-api-enrichment.js
```

### Check Logs
The code now includes comprehensive logging:
- `[ApiEnrichment]` - OAuth/API key detection
- `[LocalDevEnrichment]` - API key enrichment
- `[CreatorRepository]` - Database saves
- `[DualModeTokenService]` - Token retrieval

### Check Database
```bash
# See all creators
bun wrangler d1 execute zine-db2 --local --command="SELECT id, name, avatar_url FROM creators"

# Check specific creator
bun wrangler d1 execute zine-db2 --local --command="SELECT * FROM creators WHERE id = 'youtube:CHANNEL_ID'"
```

## Current Status

✅ **Code is correct** - Properly extracts and saves creator avatars
✅ **Database schema correct** - Has `avatar_url` column
✅ **Joins working** - Queries properly join creators table
❌ **Local development issue** - Need API key for local testing
✅ **Production should work** - With proper OAuth tokens

## Files Modified

1. `/packages/api/src/services/api-enrichment-service.ts` - Added logging, API key support
2. `/packages/api/src/services/local-dev-enrichment.ts` - New file for API key enrichment
3. `/packages/api/src/services/dual-mode-token-service.ts` - Added logging
4. `/packages/api/src/routes/enriched-bookmarks.ts` - Added detailed logging
5. `/packages/api/src/repositories/creator-repository.ts` - Added logging
6. `/packages/api/migrations/0010_migrate_creators_data.sql` - Creator data migration