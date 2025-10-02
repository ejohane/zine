# YouTube Connect Feature - Implementation Plan

## 🚨 QUICK START - Fix the Connect Button FIRST!

**The mobile app's "Connect YouTube" button doesn't work because it's calling the wrong API endpoint.**

### Immediate Fix (5 minutes):

**File**: `apps/mobile/lib/api.ts` (line ~336)

**Change this**:
```typescript
const response = await apiClient.get<AccountsResponse>('/api/v1/auth/health');
```

**To this**:
```typescript
const response = await apiClient.get<{ accounts: any[] }>('/api/v1/accounts');
return (response?.accounts || []).map(account => ({
  provider: account.provider.id as 'spotify' | 'youtube',
  isConnected: account.connected,
  connectedAt: account.connectedAt || undefined,
  externalAccountId: account.externalAccountId || undefined
}));
```

**Test**: Open Settings → Click "Connect YouTube" → Browser should open with Google OAuth

See **Phase 0** below for detailed step-by-step instructions.

---

## Overview
This document outlines the plan to enable the "Connect YouTube" feature in the Zine mobile app. The feature will allow users to:
1. Connect their YouTube account to the app via OAuth (**REQUIRES MOBILE FIX ABOVE**)
2. When saving a YouTube video bookmark, automatically enrich it with metadata from the YouTube Data API

## Current State Analysis

### ✅ Already Implemented
- **OAuth Infrastructure**: OAuth flow exists for both Spotify and YouTube (`packages/api/src/oauth/`)
- **YouTube API Client**: `YouTubeAPI` class with all necessary methods (`packages/api/src/external/youtube-api.ts`)
- **YouTube Metadata Service**: `YouTubeMetadataService` for extracting video data (`packages/api/src/external/youtube-metadata-service.ts`)
- **Token Management**: Dual-mode token service with Durable Objects storage
- **Database Schema**: `user_accounts` table supports YouTube provider
- **Mobile UI**: Settings screen has "Connect YouTube" button (currently functional for auth flow)
- **Mobile Hooks**: `useAccounts` hook manages OAuth connections

### 🔨 Needs Implementation
1. **🚨 CRITICAL - Mobile OAuth Fix**: Fix API endpoint in mobile app (`/api/v1/accounts` instead of `/api/v1/auth/health`)
2. **Bookmark Save Integration**: Connect YouTube metadata service to bookmark save flow
3. **Creator Management**: Extract and store YouTube channel (creator) data
4. **Content Enrichment**: Populate the `content` table with YouTube-specific metadata
5. **API Route Integration**: Hook YouTube metadata into bookmark save endpoint

## Architecture

### System Components

```
┌─────────────────────────────────────────────────────────────┐
│                    Mobile App (React Native)                │
│                                                             │
│  Settings Screen → OAuth Flow → YouTube Auth               │
│  Save Bookmark → API Call → YouTube Enrichment             │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│                  API (Cloudflare Workers)                   │
│                                                             │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ OAuth Routes (/api/v1/auth/youtube/*)                │  │
│  │  - /connect → Initiate OAuth                         │  │
│  │  - /callback → Exchange code for token               │  │
│  │  - /disconnect → Remove connection                   │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                             │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ Bookmark Save Route (/api/v1/bookmarks/save)         │  │
│  │  1. Detect YouTube URL                               │  │
│  │  2. Check if user has YouTube connected              │  │
│  │  3. Use YouTubeMetadataService if available          │  │
│  │  4. Extract creator/channel data                     │  │
│  │  5. Save to content + creators tables                │  │
│  │  6. Create bookmark                                  │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                             │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ Services                                             │  │
│  │  - OAuthTokenService (token management)              │  │
│  │  - YouTubeMetadataService (metadata extraction)      │  │
│  │  - BookmarkSaveService (bookmark creation)           │  │
│  └──────────────────────────────────────────────────────┘  │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│              Database (Cloudflare D1 - SQLite)              │
│                                                             │
│  - user_accounts (OAuth tokens)                            │
│  - creators (YouTube channels)                             │
│  - content (Video metadata)                                │
│  - bookmarks (User's saved bookmarks)                      │
│                                                             │
│  Durable Objects:                                          │
│  - USER_SUBSCRIPTION_MANAGER (token storage)               │
└─────────────────────────────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│              External Services                              │
│                                                             │
│  - Google OAuth (accounts.google.com)                      │
│  - YouTube Data API v3 (googleapis.com)                    │
└─────────────────────────────────────────────────────────────┘
```

## Implementation Steps

### Phase 0: 🚨 CRITICAL - Fix Mobile OAuth Connection (Do This FIRST!)

**Problem**: The mobile app cannot properly detect if YouTube is connected because it's calling the wrong API endpoint.

**Files to Change**:
1. `apps/mobile/lib/api.ts` (line 336)
2. `apps/mobile/hooks/useAccounts.ts` (line 94-96)

**Step-by-Step Fix**:

#### Step 1: Fix API Endpoint
**File**: `apps/mobile/lib/api.ts`

**Find** (around line 334-344):
```typescript
fetchAccounts: async (): Promise<ConnectedAccount[]> => {
  try {
    const response = await apiClient.get<AccountsResponse>('/api/v1/auth/health');
    return response?.accounts || [];
  } catch (error) {
    console.error('Failed to fetch accounts from API:', error);
    return [];
  }
}
```

**Replace with**:
```typescript
fetchAccounts: async (): Promise<ConnectedAccount[]> => {
  try {
    // Use the correct accounts endpoint
    const response = await apiClient.get<{ accounts: any[] }>('/api/v1/accounts');
    
    // Map the API response to our interface
    return (response?.accounts || []).map(account => ({
      provider: account.provider.id as 'spotify' | 'youtube',
      isConnected: account.connected,
      connectedAt: account.connectedAt || undefined,
      externalAccountId: account.externalAccountId || undefined
    }));
  } catch (error) {
    console.error('Failed to fetch accounts from API:', error);
    return [];
  }
}
```

#### Step 2: Verify Types Match
**File**: `apps/mobile/lib/api.ts` (around line 316)

Make sure `ConnectedAccount` interface exists:
```typescript
export interface ConnectedAccount {
  provider: 'spotify' | 'youtube';
  isConnected: boolean;
  connectedAt?: string;
  externalAccountId?: string;
  // Optional fields
  email?: string;
  name?: string;
}
```

#### Step 3: Test the Fix
1. Run the mobile app
2. Go to Settings
3. The YouTube/Spotify connection status should now display correctly
4. Click "Connect YouTube" - OAuth flow should open browser
5. Complete OAuth - status should update to "Connected"

**Expected Behavior After Fix**:
- ✅ Connection status displays correctly (Connected/Not Connected)
- ✅ OAuth flow opens browser when clicking "Connect"
- ✅ After OAuth callback, status updates to show "Connected"
- ✅ "Disconnect" option appears for connected accounts

**Testing Checklist**:
- [ ] Mobile app fetches connection status correctly
- [ ] "Connect YouTube" button appears when not connected
- [ ] OAuth browser flow opens successfully
- [ ] OAuth callback returns to app
- [ ] Connection status updates to "Connected"
- [ ] "Disconnect" option works

### Phase 1: Setup & Configuration

#### 1.1 Environment Configuration
**File**: `packages/api/.dev.vars.example`

Add/verify:
```
YOUTUBE_CLIENT_ID=your_youtube_client_id
YOUTUBE_CLIENT_SECRET=your_youtube_client_secret
API_BASE_URL=http://localhost:8787
```

**Action Items**:
- [ ] Ensure YouTube OAuth app is created in Google Cloud Console
- [ ] Configure redirect URIs for all environments:
  - Development: `http://localhost:8787/api/v1/auth/youtube/callback`
  - Production: `https://api.myzine.app/api/v1/auth/youtube/callback`
- [ ] Set required scopes: `https://www.googleapis.com/auth/youtube.readonly`
- [ ] Add environment variables to Cloudflare Workers (production)

### Phase 2: Bookmark Save Integration

#### 2.1 Update BookmarkSaveService
**File**: `packages/shared/src/bookmark-save-service.ts`

**Changes Needed**:
1. Add YouTube URL detection logic
2. Integrate `YouTubeMetadataService` for enrichment
3. Extract creator data from YouTube API response
4. Map YouTube metadata to `content` and `creators` tables

**Pseudo-code**:
```typescript
async saveBookmark(data: SaveBookmarkInput, userId: string) {
  // Detect if URL is YouTube
  const isYouTube = YouTubeMetadataService.isYouTubeUrl(data.url)
  
  if (isYouTube) {
    // Check if user has YouTube connected
    const hasYouTubeToken = await this.checkUserHasProvider(userId, 'youtube')
    
    if (hasYouTubeToken) {
      // Use YouTube Data API for enrichment
      const metadata = await this.youtubeMetadataService.getMetadata(data.url, userId)
      
      if (metadata) {
        // 1. Extract/create creator
        const creator = await this.createOrUpdateCreator({
          id: `youtube:${metadata.channelId}`,
          name: metadata.channelName,
          handle: metadata.channelHandle,
          avatarUrl: metadata.channelThumbnail,
          verified: metadata.creatorVerified,
          platforms: ['youtube']
        })
        
        // 2. Create content entry
        const content = await this.createContent({
          externalId: metadata.videoId,
          provider: 'youtube',
          url: data.url,
          title: metadata.title,
          description: metadata.description,
          thumbnailUrl: metadata.thumbnailUrl,
          publishedAt: metadata.publishedAt,
          durationSeconds: metadata.duration,
          viewCount: metadata.viewCount,
          likeCount: metadata.likeCount,
          creatorId: creator.id,
          contentType: 'video'
        })
        
        // 3. Create bookmark
        return this.createBookmark(userId, content.id, data.notes)
      }
    }
  }
  
  // Fallback to regular save (OpenGraph/oEmbed)
  return this.regularSave(data, userId)
}
```

**Action Items**:
- [ ] Add `YouTubeMetadataService` dependency injection
- [ ] Implement creator extraction and storage
- [ ] Map YouTube metadata fields to database schema
- [ ] Handle API errors gracefully (fallback to regular enrichment)
- [ ] Add logging for debugging

#### 2.2 Update API Routes
**File**: `packages/api/src/index.ts` or `packages/api/src/routes/enriched-bookmarks.ts`

**Changes Needed**:
1. Inject `YouTubeMetadataService` into bookmark save endpoint
2. Pass `userId` to metadata service for token retrieval

**Pseudo-code**:
```typescript
app.post('/api/v1/bookmarks/save', async (c) => {
  const auth = getAuthContext(c)
  const { url, notes } = await c.req.json()
  
  // Initialize YouTube metadata service with env
  const youtubeMetadataService = new YouTubeMetadataService(c.env)
  
  // Inject into bookmark save service
  const bookmarkSaveService = new BookmarkSaveService(
    repository,
    youtubeMetadataService,
    spotifyMetadataService // existing
  )
  
  const result = await bookmarkSaveService.saveBookmark({ url, notes }, auth.userId)
  
  return c.json(result)
})
```

**Action Items**:
- [ ] Update route handler to pass `YouTubeMetadataService`
- [ ] Ensure proper error handling and response codes
- [ ] Add request/response logging

### Phase 3: Creator Management

#### 3.1 Creator Repository
**File**: `packages/shared/src/repositories/creator-repository.ts` (new or existing)

**Methods Needed**:
```typescript
interface CreatorRepository {
  findById(id: string): Promise<Creator | null>
  create(data: CreateCreatorInput): Promise<Creator>
  update(id: string, data: UpdateCreatorInput): Promise<Creator>
  upsert(data: CreateCreatorInput): Promise<Creator>
}
```

**Action Items**:
- [ ] Create or update Creator repository
- [ ] Implement `upsert` for YouTube channels (update if exists)
- [ ] Add indexes on `creators.id` for performance

#### 3.2 Database Schema Verification
**File**: `packages/api/src/schema.ts`

Verify `creators` table has all needed fields:
- `id` (format: `youtube:UCxxxxx`)
- `name` (channel name)
- `handle` (e.g., `@channelhandle`)
- `avatarUrl` (channel thumbnail)
- `bio` (channel description)
- `verified` (verified badge)
- `subscriberCount`
- `platforms` (JSON array: `["youtube"]`)

**Action Items**:
- [ ] Verify schema matches requirements
- [ ] Create migration if fields are missing
- [ ] Test creator upsert logic

### Phase 4: Content Metadata Population

#### 4.1 Content Repository Updates
**File**: `packages/shared/src/repositories/content-repository.ts`

**Methods Needed**:
```typescript
interface ContentRepository {
  create(data: CreateContentInput): Promise<Content>
  findByUrl(url: string): Promise<Content | null>
  findByExternalId(provider: string, externalId: string): Promise<Content | null>
}
```

**YouTube-specific fields to populate**:
- `externalId`: Video ID (e.g., `dQw4w9WgXcQ`)
- `provider`: `'youtube'`
- `url`: Full video URL
- `title`: Video title
- `description`: Video description
- `thumbnailUrl`: Best quality thumbnail
- `publishedAt`: Upload timestamp
- `durationSeconds`: Video length in seconds
- `viewCount`: View count
- `likeCount`: Like count
- `commentCount`: Comment count
- `creatorId`: Reference to creator
- `creatorName`: Channel name
- `contentType`: `'video'`
- `hasCaptions`: Whether captions are available
- `hasHd`: Whether HD quality is available
- `videoQuality`: `'720p'`, `'1080p'`, `'4K'`, etc.

**Action Items**:
- [ ] Implement content creation/upsert logic
- [ ] Map all YouTube API fields to database columns
- [ ] Handle missing/optional fields gracefully
- [ ] Add deduplication logic (check if content exists by URL)

#### 4.2 YouTube Metadata Mapping
**File**: `packages/api/src/external/youtube-metadata-service.ts`

**Enhancement Needed**:
Update `getVideoMetadata()` to return additional fields:
- `hasHd`: From `contentDetails.definition`
- `hasCaptions`: From `contentDetails.caption`
- `videoQuality`: Derived from `definition` field
- `tags`: From `snippet.tags`
- `categoryId`: From `snippet.categoryId`

**Action Items**:
- [ ] Extend metadata return type
- [ ] Add quality detection logic
- [ ] Test with various video types (shorts, live, premieres)

### Phase 5: Token & Error Handling

#### 5.1 Token Availability Check
**File**: `packages/shared/src/bookmark-save-service.ts`

**Implementation**:
```typescript
private async checkUserHasProvider(userId: string, provider: 'youtube' | 'spotify'): Promise<boolean> {
  const account = await this.userAccountRepository.getUserAccount(userId, provider)
  
  if (!account || !account.accessToken) {
    return false
  }
  
  // Check if token is expired
  if (account.expiresAt && account.expiresAt < new Date()) {
    // Attempt to refresh
    const refreshed = await this.tokenService.refreshToken(userId, provider)
    return refreshed.success
  }
  
  return true
}
```

**Action Items**:
- [ ] Add token validation before API calls
- [ ] Implement automatic token refresh
- [ ] Handle refresh failures gracefully (fallback to basic enrichment)
- [ ] Log token refresh events

#### 5.2 Error Handling & Fallbacks
**Scenarios to Handle**:
1. **No YouTube account connected**: Use OpenGraph/oEmbed fallback
2. **Token expired/invalid**: Attempt refresh, then fallback
3. **YouTube API rate limit**: Log error, use cached/basic data
4. **Video not found/private**: Save with basic metadata
5. **Network errors**: Retry with exponential backoff

**Action Items**:
- [ ] Implement fallback chain: YouTube API → oEmbed → OpenGraph
- [ ] Add retry logic for transient errors
- [ ] Log all enrichment paths for debugging
- [ ] Return partial data when possible (don't fail entire save)

### Phase 6: Mobile App Updates

#### 6.1 OAuth Flow - Fix API Endpoint ⚠️ **CRITICAL FIX NEEDED**
**Files**: 
- `apps/mobile/lib/api.ts` (line 334-344)
- `apps/mobile/hooks/useAccounts.ts`
- `apps/mobile/app/(app)/(tabs)/settings.tsx`

**Current Issue**: The mobile app is calling the WRONG API endpoint to fetch account status!

**Problem**:
```typescript
// Current (WRONG) - in apps/mobile/lib/api.ts line 336
const response = await apiClient.get<AccountsResponse>('/api/v1/auth/health');
```

The `/api/v1/auth/health` endpoint returns:
```json
{
  "providers": [
    { "provider": "youtube", "connected": true, ... }
  ],
  "summary": { ... }
}
```

But the mobile app expects:
```json
{
  "accounts": [
    { "provider": "youtube", "connected": true, ... }
  ]
}
```

**Solution**:
Change line 336 in `apps/mobile/lib/api.ts`:
```typescript
// OLD:
const response = await apiClient.get<AccountsResponse>('/api/v1/auth/health');
return response?.accounts || [];

// NEW:
const response = await apiClient.get<AccountsResponse>('/api/v1/accounts');
return response?.accounts || [];
```

**Why This Matters**:
- Without this fix, the mobile app CANNOT detect if YouTube is connected
- The "Connect YouTube" button won't show the correct state
- Users won't see "Connected" status even after successfully connecting

**Action Items**:
- [ ] **CRITICAL**: Update `apps/mobile/lib/api.ts` line 336 to use `/api/v1/accounts`
- [ ] Update `ConnectedAccount` type to match API response structure
- [ ] Test connection status display in Settings screen
- [ ] Verify OAuth flow completes successfully and updates UI

#### 6.1.1 Type Mismatch Fix
**File**: `apps/mobile/lib/api.ts`

**Current Type** (line 316-322):
```typescript
export interface ConnectedAccount {
  provider: 'spotify' | 'youtube';
  isConnected: boolean;
  connectedAt?: string;
  email?: string;
  name?: string;
}
```

**API Response Structure** (from `/api/v1/accounts`):
```typescript
{
  provider: {
    id: string;    // 'spotify' | 'youtube'
    name: string;  // 'Spotify' | 'YouTube'
  },
  connected: boolean;      // NOT isConnected!
  connectedAt: Date | null;
  externalAccountId: string | null;
}
```

**Fix Needed**:
```typescript
// Update the ConnectedAccount interface
export interface ConnectedAccount {
  provider: {
    id: 'spotify' | 'youtube';
    name: string;
  };
  connected: boolean;  // Change from isConnected
  connectedAt?: string | null;
  externalAccountId?: string | null;
}

// Update the mapping in accountsApi.fetchAccounts()
fetchAccounts: async (): Promise<ConnectedAccount[]> => {
  try {
    const response = await apiClient.get<{ accounts: any[] }>('/api/v1/accounts');
    // Map the response to match our interface
    return (response?.accounts || []).map(account => ({
      provider: account.provider.id,
      isConnected: account.connected,  // Map connected -> isConnected for backward compatibility
      connectedAt: account.connectedAt,
      externalAccountId: account.externalAccountId
    }));
  } catch (error) {
    console.error('Failed to fetch accounts from API:', error);
    return [];
  }
}
```

**OR** - Update `useAccounts.ts` to use the new structure:
```typescript
// In apps/mobile/hooks/useAccounts.ts line 94
const isProviderConnected = (provider: 'spotify' | 'youtube'): boolean => {
  // OLD:
  // return accounts.some(account => account.provider === provider && account.isConnected);
  
  // NEW:
  return accounts.some(account => 
    account.provider.id === provider && account.connected
  );
};
```

**Action Items**:
- [ ] Choose approach: Map API response OR update mobile app to use new structure
- [ ] Update type definitions
- [ ] Update `isProviderConnected` helper function
- [ ] Test that connection status displays correctly

#### 6.2 Bookmark Save Flow
**File**: `apps/mobile/lib/api.ts`

**Current State**: ✅ Already uses enriched endpoint
```typescript
save: async (url: string): Promise<Bookmark> => {
  const response = await apiClient.post<SaveBookmarkResponse>(
    '/api/v1/enriched-bookmarks/save-enriched', 
    { url }
  );
  // ...
}
```

**Potential Enhancement**: Add UI feedback for YouTube enrichment
- Show "Fetching from YouTube..." indicator
- Display channel/creator info in save confirmation

**Action Items**:
- [ ] (Optional) Add enrichment source to API response
- [ ] (Optional) Show enrichment status in UI
- [ ] Test save flow with YouTube URLs

### Phase 7: Testing Strategy

#### 7.1 Unit Tests
**Files to Test**:
- `packages/api/src/external/youtube-metadata-service.test.ts`
- `packages/shared/src/bookmark-save-service.test.ts`

**Test Cases**:
1. YouTube URL detection (various formats)
2. Metadata extraction (video, playlist, channel)
3. Creator creation/update
4. Content deduplication
5. Token validation and refresh
6. Error handling and fallbacks

**Action Items**:
- [ ] Write unit tests for new logic
- [ ] Mock YouTube API responses
- [ ] Test all fallback scenarios
- [ ] Verify database interactions

## Data Flow Example

### Scenario 1: User connects YouTube account (PREREQUISITE)

```
1. User (Mobile App):
   - Opens Settings screen
   - Sees "Connect YouTube" button (not connected)
   - Taps "Connect YouTube"

2. Mobile App Processing:
   a. useAccounts hook triggers connectMutation
   b. Generates redirect URI: "zine://oauth-callback"
   c. API Request:
      POST /api/v1/auth/youtube/connect
      { "redirectUrl": "zine://oauth-callback" }
   
3. Backend (API):
   a. Creates OAuth state with userId, provider, timestamp
   b. Encodes state to base64url
   c. Generates Google OAuth URL:
      https://accounts.google.com/o/oauth2/v2/auth?
        client_id=...
        &redirect_uri=https://api.myzine.app/api/v1/auth/youtube/callback
        &scope=https://www.googleapis.com/auth/youtube.readonly
        &state=eyJ1c2VySWQi...
        &response_type=code
        &access_type=offline
        &prompt=consent
   d. Returns: { "authUrl": "https://accounts.google.com/..." }

4. Mobile App:
   - Opens authUrl in system browser (WebBrowser.openAuthSessionAsync)
   - User sees Google OAuth consent screen
   - User grants YouTube permissions
   - Google redirects to: https://api.myzine.app/api/v1/auth/youtube/callback?code=...&state=...

5. Backend Callback Processing:
   a. Receives callback at /api/v1/auth/youtube/callback
   b. Validates state parameter
   c. Exchanges auth code for tokens:
      POST https://oauth2.googleapis.com/token
      → Response: { access_token, refresh_token, expires_in }
   d. Fetches user's YouTube channel info
   e. Creates/updates user_accounts record:
      INSERT INTO user_accounts (userId, providerId, accessToken, refreshToken, expiresAt)
   f. Stores tokens in Durable Object (USER_SUBSCRIPTION_MANAGER)
   g. Redirects browser to: zine://oauth-callback?provider=youtube&status=success

6. Mobile App:
   - Browser closes and returns to app
   - OAuth callback triggers accounts refetch
   - Settings screen updates to show "YouTube Connected ✓"

7. Verification:
   GET /api/v1/accounts
   → Response: {
       "accounts": [
         {
           "provider": { "id": "youtube", "name": "YouTube" },
           "connected": true,
           "connectedAt": "2025-10-01T12:00:00Z",
           "externalAccountId": "UCxxxxx"
         }
       ]
     }
```

### Scenario 2: User saves a YouTube video

```
1. User (Mobile App):
   - Pastes: https://www.youtube.com/watch?v=dQw4w9WgXcQ
   - Taps "Save Bookmark"

2. API Request:
   POST /api/v1/bookmarks/save
   { "url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ" }

3. Backend Processing:
   a. Detect YouTube URL ✓
   b. Check user has YouTube connected (userId=user_123)
      → Query: SELECT * FROM user_accounts WHERE userId='user_123' AND providerId='youtube'
      → Result: Found, token valid
   
   c. Fetch YouTube metadata:
      → API Call: GET youtube.com/v3/videos?id=dQw4w9WgXcQ&part=snippet,statistics,contentDetails
      → Response: {
          title: "Rick Astley - Never Gonna Give You Up",
          channelId: "UCuAXFkgsw1L7xaCfnd5JJOw",
          channelTitle: "Rick Astley",
          duration: "PT3M33S" (213 seconds),
          viewCount: "1400000000",
          ...
        }
   
   d. Extract/Create Creator:
      → Upsert: creators table
        - id: "youtube:UCuAXFkgsw1L7xaCfnd5JJOw"
        - name: "Rick Astley"
        - avatarUrl: "https://yt3.ggpht.com/..."
        - verified: true
        - platforms: ["youtube"]
   
   e. Create Content:
      → Insert: content table
        - id: "youtube-dQw4w9WgXcQ"
        - externalId: "dQw4w9WgXcQ"
        - provider: "youtube"
        - title: "Rick Astley - Never Gonna Give You Up"
        - creatorId: "youtube:UCuAXFkgsw1L7xaCfnd5JJOw"
        - durationSeconds: 213
        - viewCount: 1400000000
        - publishedAt: 2009-10-25T06:57:33Z
        - contentType: "video"
   
   f. Create Bookmark:
      → Insert: bookmarks table
        - id: "bm_xyz123"
        - userId: "user_123"
        - contentId: "youtube-dQw4w9WgXcQ"
        - bookmarkedAt: 2025-10-01T12:00:00Z

4. API Response:
   {
     "data": {
       "id": "bm_xyz123",
       "url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
       "title": "Rick Astley - Never Gonna Give You Up",
       "thumbnailUrl": "https://i.ytimg.com/...",
       "creator": {
         "id": "youtube:UCuAXFkgsw1L7xaCfnd5JJOw",
         "name": "Rick Astley",
         "verified": true
       },
       "durationSeconds": 213,
       "viewCount": 1400000000,
       "contentType": "video",
       "enrichmentSource": "youtube_api"
     }
   }

5. Mobile App:
   - Displays success message
   - Shows enriched bookmark with channel info
   - Bookmark appears in library with full metadata
```


## Success Criteria

### Definition of Done

#### Phase 0: Mobile OAuth Fix ✅
- [ ] `/api/v1/accounts` endpoint is being called (not `/api/v1/auth/health`)
- [ ] Connection status displays correctly in Settings
- [ ] "Connect YouTube" button opens OAuth browser
- [ ] OAuth callback returns to app successfully  
- [ ] Status updates to "Connected" after OAuth
- [ ] "Disconnect" button appears for connected accounts
- [ ] Disconnect removes connection correctly

#### Backend Integration ✅
- [ ] Users can connect YouTube account via mobile app
- [ ] YouTube video bookmarks are enriched with API data when account is connected
- [ ] Creator/channel information is extracted and stored
- [ ] Fallback to basic enrichment works when no account connected
- [ ] Token refresh works automatically
- [ ] Unit tests passing
- [ ] Documentation updated


## Troubleshooting Guide

### Issue: "Connect YouTube" Button Does Nothing

**Symptoms**:
- Button shows "Connect YouTube" but clicking does nothing
- No browser opens
- No error messages

**Root Cause**:
Mobile app is calling wrong API endpoint (`/api/v1/auth/health` instead of `/api/v1/accounts`)

**Fix**: Apply Phase 0 changes above

---

### Issue: OAuth Browser Opens But Doesn't Return to App

**Symptoms**:
- Browser opens with Google OAuth
- User grants permissions
- Browser doesn't close or return to app

**Possible Causes**:
1. **Redirect URI mismatch**: Check that `zine://oauth-callback` is registered in app.json
2. **Deep link not configured**: Verify Expo app scheme is set up

**Fix**:
```json
// apps/mobile/app.json
{
  "expo": {
    "scheme": "zine",
    "ios": {
      "bundleIdentifier": "com.yourcompany.zine"
    },
    "android": {
      "package": "com.yourcompany.zine"
    }
  }
}
```

---

### Issue: OAuth Completes But Status Still Shows "Not Connected"

**Symptoms**:
- OAuth flow completes successfully
- Browser closes
- Settings still shows "Connect YouTube" instead of "Connected"

**Possible Causes**:
1. **API endpoint returning wrong data structure**
2. **Type mismatch in response parsing**
3. **Query not refetching after OAuth**

**Fix**:
1. Ensure using `/api/v1/accounts` endpoint
2. Check browser dev tools / React Native debugger for API response
3. Verify `queryClient.invalidateQueries({ queryKey: ['accounts'] })` is called

---

### Issue: Token Expired / Invalid

**Symptoms**:
- YouTube was connected but stopped working
- API returns 401 errors
- Bookmarks not enriched with YouTube data

**Diagnosis**:
```bash
# Check token status
curl -H "Authorization: Bearer $TOKEN" \
  https://api.myzine.app/api/v1/auth/health
```

**Fix**:
1. Disconnect and reconnect YouTube in Settings
2. Backend should auto-refresh tokens, check logs for refresh errors
3. Verify `YOUTUBE_CLIENT_SECRET` is correct in environment

---

### Issue: YouTube API Quota Exceeded

**Symptoms**:
- Error: "quotaExceeded"
- Bookmarks fall back to basic enrichment

**Diagnosis**:
- Check Google Cloud Console for quota usage
- Default: 10,000 units/day

**Fix**:
1. Request quota increase from Google
2. Implement better caching to reduce API calls
3. Rate limit bookmark saves per user

---


## References

### Documentation
- [YouTube Data API v3](https://developers.google.com/youtube/v3)
- [Google OAuth 2.0](https://developers.google.com/identity/protocols/oauth2)
- [Cloudflare Workers](https://developers.cloudflare.com/workers/)
- [Clerk Authentication](https://clerk.com/docs)

### Existing Code
- OAuth Config: `packages/api/src/oauth/oauth-config.ts`
- YouTube API Client: `packages/api/src/external/youtube-api.ts`
- Metadata Service: `packages/api/src/external/youtube-metadata-service.ts`
- Token Service: `packages/api/src/services/oauth-token-service.ts`
- Mobile Settings: `apps/mobile/app/(app)/(tabs)/settings.tsx`

---

## Implementation Summary

### What's Already Working ✅
- OAuth backend infrastructure (routes, token exchange, storage)
- YouTube API client with all necessary methods
- YouTube metadata service for video enrichment
- Database schema supports all needed fields
- Durable Objects for token storage
- Mobile UI has Connect/Disconnect buttons

### What's Broken Right Now 🔴
- **Mobile app calls wrong API endpoint** → Connect button doesn't detect connection status correctly
- YouTube enrichment not integrated into bookmark save flow
- Creator/channel data not being extracted from videos

### What Needs to be Done 🔧

**Priority 1 - CRITICAL (Do First)**:
1. Fix mobile API endpoint: `/api/v1/accounts` instead of `/api/v1/auth/health`
2. Test OAuth connection flow on mobile
3. Verify connection status displays correctly

**Priority 2 - Backend Integration**:
1. Integrate YouTubeMetadataService into bookmark save
2. Add creator extraction and storage logic
3. Map YouTube metadata to content table
4. Implement token validation and refresh
5. Write unit tests

**Priority 3 - Polish**:
1. Add comprehensive error handling
2. Add logging and monitoring
3. Optimize API quota usage

### Time Estimates

- **Phase 0 (Mobile Fix)**: 1-2 hours
- **Phase 1-2 (Backend Integration)**: 2-3 days
- **Phase 3-5 (Repository & Error Handling)**: 2-3 days
- **Phase 7 (Unit Tests)**: 1 day
- **Total**: ~1 week for MVP

### Success Metrics

After implementation, users should be able to:
1. ✅ Connect their YouTube account in < 30 seconds
2. ✅ See "Connected" status in Settings
3. ✅ Save YouTube videos with rich metadata (title, channel, views, duration)
4. ✅ See creator/channel attribution on bookmarks
5. ✅ Experience graceful fallback if not connected

---

**Document Version**: 2.0  
**Last Updated**: 2025-10-01  
**Status**: Ready for Implementation (Mobile Fix Required First!)  
**Critical Issue Identified**: Mobile OAuth endpoint mismatch
