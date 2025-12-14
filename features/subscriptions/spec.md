# Zine Subscriptions & Source Management Spec

## Executive Summary

This specification defines the architecture for **source management** (YouTube & Spotify subscriptions) and the **onboarding experience** for connecting these sources. It covers OAuth token storage, batch ingestion, data normalization, and future extensibility for bookmark URL enrichment.

### Architecture Context

Zine uses a **per-user Durable Object architecture** where each user has an isolated SQLite database within their Durable Object. This spec builds on that foundation:

- **No D1 database** - All user data lives in DO SQLite storage
- **No `user_id` columns needed** - User isolation is implicit at the DO level
- **Hono routes** - Current codebase uses Hono, not tRPC
- **Replicache sync** - Sources and items sync to mobile via Replicache

---

## Table of Contents

1. [Problem Space](#problem-space)
2. [Provider Overview](#provider-overview)
3. [OAuth & Token Management](#oauth--token-management)
4. [Database Schema](#database-schema)
5. [Onboarding Flow](#onboarding-flow)
6. [Ingestion Pipeline](#ingestion-pipeline)
7. [Data Normalization](#data-normalization)
8. [Client Libraries](#client-libraries)
9. [API Design](#api-design)
10. [Replicache Sync Integration](#replicache-sync-integration)
11. [Bookmark URL Enrichment](#bookmark-url-enrichment)
12. [Security Considerations](#security-considerations)
13. [Implementation Phases](#implementation-phases)

**Appendices**

- [A: OAuth Redirect URIs](#appendix-a-oauth-redirect-uris)
- [B: Error Handling Matrix](#appendix-b-error-handling-matrix)
- [C: YouTube Quota Management](#appendix-c-quota-management-youtube)
- [D: Mobile OAuth with Expo AuthSession](#appendix-d-mobile-oauth-with-expo-authsession)
- [E: Wrangler Configuration](#appendix-e-wrangler-configuration)
- [F: Open Questions](#appendix-f-open-questions)

---

## Problem Space

### Goals

1. **Import User Subscriptions**: Fetch YouTube channel subscriptions and Spotify podcast follows
2. **Batch Ingestion**: Periodically fetch new content from subscribed sources
3. **Token Persistence**: Securely store OAuth tokens for background batch jobs
4. **Normalize Data**: Map provider-specific content to Zine's canonical data model
5. **URL Enrichment**: Optionally use provider APIs to enrich manually-saved bookmarks

### Non-Goals

- In-app media playback
- Real-time streaming/webhooks (hourly polling is sufficient)
- Social features or sharing
- Content transcription or AI summaries (future enhancement)

---

## Provider Overview

### YouTube Data API v3

**Purpose**: Access user's channel subscriptions and fetch new videos from those channels.

#### Authentication

- **OAuth 2.0 Authorization Code Flow** (server-side web apps)
- **Scopes Required**:
  - `https://www.googleapis.com/auth/youtube.readonly` - View subscriptions and channel info
- **Token Lifespan**:
  - Access token: 1 hour (3600 seconds)
  - Refresh token: Long-lived, valid until revoked by user

#### Key Endpoints

| Endpoint             | Purpose                                      | Rate Limit             |
| -------------------- | -------------------------------------------- | ---------------------- |
| `GET /subscriptions` | List user's subscribed channels              | 10,000 units/day quota |
| `GET /playlistItems` | Get videos from channel's "uploads" playlist | 1 unit per request     |
| `GET /videos`        | Get video metadata (duration, thumbnails)    | 1 unit per request     |
| `GET /channels`      | Get channel metadata                         | 1 unit per request     |

#### Data Available

- **Subscription Resource**: `channelId`, `title`, `description`, `thumbnails`, `totalItemCount`, `newItemCount`
- **Video Resource**: `id`, `title`, `description`, `channelId`, `channelTitle`, `publishedAt`, `duration` (ISO 8601), `thumbnails`

#### Quota Considerations

- YouTube API uses a **quota system** (default 10,000 units/day)
- `subscriptions.list` = 1 unit
- `playlistItems.list` = 1 unit
- `videos.list` = 1 unit
- **Strategy**: Batch requests (up to 50 items per call) to minimize quota usage

---

### Spotify Web API

**Purpose**: Access user's followed podcasts (shows) and fetch new episodes.

#### Authentication

- **OAuth 2.0 Authorization Code Flow** (with secret, server-side)
- **Scopes Required**:
  - `user-library-read` - Access saved shows
  - `user-read-playback-position` - Resume position for episodes (optional)
- **Token Lifespan**:
  - Access token: 1 hour (3600 seconds)
  - Refresh token: Long-lived, valid until revoked

#### Key Endpoints

| Endpoint                   | Purpose                    | Rate Limit          |
| -------------------------- | -------------------------- | ------------------- |
| `GET /me/shows`            | List user's saved podcasts | Dynamic (see below) |
| `GET /shows/{id}/episodes` | Get episodes for a show    | Dynamic             |
| `GET /episodes/{id}`       | Get episode metadata       | Dynamic             |

#### Data Available

- **Show Resource**: `id`, `name`, `publisher`, `description`, `images`, `total_episodes`
- **Episode Resource**: `id`, `name`, `description`, `duration_ms`, `release_date`, `images`, `external_urls`

#### Rate Limit Considerations

- Spotify uses **dynamic rate limiting** (HTTP 429 with `Retry-After` header)
- Recommendation: Implement exponential backoff
- Batch requests where possible (up to 50 IDs per call)

---

## OAuth & Token Management

### Token Storage Architecture

Tokens must be stored **server-side** and never exposed to the client. The mobile app initiates OAuth flows but the worker handles token exchange and storage.

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   Mobile App    │────▶│  Cloudflare     │────▶│    Provider     │
│  (React Native) │     │    Worker       │     │  (Google/Spotify)│
└─────────────────┘     └─────────────────┘     └─────────────────┘
        │                       │
        │                       ▼
        │               ┌─────────────────┐
        │               │  User Durable   │
        │               │    Object       │
        │               │   (SQLite +     │
        │               │ Encrypted Tokens)│
        │               └─────────────────┘
        │                       │
        ▼                       ▼
   User sees              Cron/Alarms use
   connected              tokens to fetch
   status only            new content
```

**Note**: Tokens are stored in each user's Durable Object SQLite database, NOT in a global D1 database. This maintains the per-user isolation pattern used throughout Zine.

### Token Encryption

Tokens are encrypted at rest using **AES-256-GCM** with a server-side key stored in Cloudflare secrets.

```typescript
// Encryption approach
interface EncryptedToken {
  ciphertext: string; // Base64-encoded encrypted data
  iv: string; // Base64-encoded initialization vector
  tag: string; // Base64-encoded auth tag
  algorithm: 'aes-256-gcm';
}

// Stored token structure
interface StoredProviderToken {
  accessToken: EncryptedToken;
  refreshToken: EncryptedToken;
  expiresAt: string; // ISO8601 timestamp
  scopes: string[]; // Granted scopes
}
```

### Token Refresh Strategy

```
┌─────────────────────────────────────────────────────────────────┐
│                      Token Refresh Flow                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  1. Check expiresAt before API call                             │
│     └─ If expires in < 5 minutes → Refresh                      │
│                                                                  │
│  2. Refresh Token Request                                        │
│     POST /oauth2/token (Google) or /api/token (Spotify)         │
│     └─ grant_type: refresh_token                                │
│     └─ refresh_token: <decrypted_refresh_token>                 │
│                                                                  │
│  3. Update stored tokens                                        │
│     └─ New access token (encrypted)                             │
│     └─ New expires_at                                           │
│     └─ Optionally new refresh token                             │
│                                                                  │
│  4. Handle refresh failures                                      │
│     └─ 401/invalid_grant → Mark connection as "needs_reauth"   │
│     └─ Notify user on next app open                             │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Database Schema

### Architecture Note

All tables live in **per-user Durable Object SQLite storage**, not a global D1 database. Since each user has their own isolated DO, `user_id` columns are unnecessary - user isolation is implicit.

### New Tables (Added to DO Migration)

```sql
-- ============================================================================
-- Provider Connections (OAuth tokens per provider)
-- Lives in each user's DO SQLite - no user_id column needed
-- ============================================================================
CREATE TABLE provider_connections (
  id TEXT PRIMARY KEY,                    -- ULID
  provider TEXT NOT NULL,                 -- 'YOUTUBE' | 'SPOTIFY'

  -- Encrypted OAuth tokens (JSON-serialized EncryptedToken)
  access_token_encrypted TEXT NOT NULL,
  refresh_token_encrypted TEXT NOT NULL,
  token_expires_at TEXT NOT NULL,         -- ISO8601

  -- Connection metadata
  scopes TEXT NOT NULL,                   -- JSON array of granted scopes
  provider_user_id TEXT,                  -- Provider's user ID (for debugging)
  provider_email TEXT,                    -- Provider's email (for display)

  -- Status
  status TEXT NOT NULL DEFAULT 'active',  -- 'active' | 'needs_reauth' | 'revoked'
  last_sync_at TEXT,                      -- ISO8601 - last successful sync
  last_error TEXT,                        -- Last error message if any

  -- System
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,

  UNIQUE(provider)                        -- One connection per provider per user
);

CREATE INDEX provider_connections_status_idx ON provider_connections(status);
```

### Updated Sources Table

The existing `sources` table needs these additional columns:

```sql
-- ============================================================================
-- Sources (User subscriptions to specific channels/shows)
-- Added columns to existing schema in apps/worker/src/durable-objects/schema.ts
-- ============================================================================

-- New columns to add via migration:
ALTER TABLE sources ADD COLUMN feed_id TEXT;
  -- YouTube: "UU" + channelId (uploads playlist)
  -- Spotify: same as provider_id
  -- RSS: feed URL

ALTER TABLE sources ADD COLUMN thumbnail_url TEXT;
ALTER TABLE sources ADD COLUMN description TEXT;
ALTER TABLE sources ADD COLUMN last_fetched_at TEXT;
ALTER TABLE sources ADD COLUMN last_item_published_at TEXT;
ALTER TABLE sources ADD COLUMN item_count INTEGER DEFAULT 0;
ALTER TABLE sources ADD COLUMN status TEXT NOT NULL DEFAULT 'active';
  -- 'active' | 'paused' | 'error'
ALTER TABLE sources ADD COLUMN error_count INTEGER DEFAULT 0;
ALTER TABLE sources ADD COLUMN last_error TEXT;
ALTER TABLE sources ADD COLUMN deleted_at TEXT;  -- Soft delete

CREATE INDEX sources_status_idx ON sources(status);
CREATE INDEX sources_last_fetched_idx ON sources(last_fetched_at);
```

### Existing Tables Reference

These tables already exist in the DO schema:

| Table                 | Purpose                                                    |
| --------------------- | ---------------------------------------------------------- |
| `sources`             | User subscriptions (needs migration for new columns)       |
| `canonical_items`     | Content entities - videos, podcasts, articles              |
| `user_items`          | User's relationship with items (INBOX/BOOKMARKED/ARCHIVED) |
| `provider_items_seen` | Idempotency tracking for ingestion                         |

### Updated Items Table

The existing `items` table already handles canonical content. We need to ensure proper provider field usage:

```typescript
// Provider-specific ID formats
interface ProviderIdFormats {
  YOUTUBE: string; // Video ID: "dQw4w9WgXcQ"
  SPOTIFY: string; // Episode ID: "5Xt5DXGzch68nYYamXrNxZ"
  RSS: string; // GUID or URL hash
  SUBSTACK: string; // Post slug or URL hash
}

// Canonical URL formats
interface CanonicalUrlFormats {
  YOUTUBE: string; // "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
  SPOTIFY: string; // "https://open.spotify.com/episode/5Xt5DXGzch68nYYamXrNxZ"
  RSS: string; // Article URL
  SUBSTACK: string; // Post URL
}
```

---

## Onboarding Flow

### User Experience

```
┌─────────────────────────────────────────────────────────────────┐
│                     Source Onboarding Flow                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  1. User opens Sources tab                                       │
│     ├─ Empty state: "Connect your sources to get started"       │
│     └─ Shows connected sources with sync status                  │
│                                                                  │
│  2. User taps "Connect YouTube" or "Connect Spotify"            │
│     └─ In-app browser opens OAuth consent screen                │
│                                                                  │
│  3. User grants permissions                                      │
│     └─ Redirect back to app with auth code                      │
│                                                                  │
│  4. App exchanges code for tokens (via worker)                  │
│     └─ Worker stores encrypted tokens in user's DO              │
│                                                                  │
│  5. Worker fetches user's subscriptions                          │
│     └─ YouTube: GET /subscriptions?mine=true                    │
│     └─ Spotify: GET /me/shows                                   │
│                                                                  │
│  6. User sees subscription list                                  │
│     ├─ Pre-selected: All subscriptions                          │
│     └─ Option: Uncheck sources to skip                          │
│                                                                  │
│  7. User confirms selection                                      │
│     └─ Sources created in user's DO                             │
│     └─ Initial content fetch begins                              │
│                                                                  │
│  8. Success state                                                │
│     └─ "Connected! New content will appear in your inbox"       │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### OAuth Deep Link Handling

```typescript
// Mobile deep link configuration
const oauthCallbackUrl = 'zine://oauth/callback';

// Worker endpoints
interface OAuthEndpoints {
  // Step 1: Generate OAuth URL for provider
  initiateOAuth: 'POST /api/oauth/:provider/initiate';
  // Response: { url: string, state: string }

  // Step 2: Exchange code for tokens (called by mobile after redirect)
  exchangeCode: 'POST /api/oauth/:provider/callback';
  // Body: { code: string, state: string }
  // Response: { success: true, subscriptions_count: number }

  // Step 3: Get user's subscriptions for selection
  getSubscriptions: 'GET /api/oauth/:provider/subscriptions';
  // Response: { subscriptions: ProviderSubscription[] }

  // Step 4: Confirm selected sources
  confirmSources: 'POST /api/sources/confirm';
  // Body: { provider: string, selected_ids: string[] }
}
```

### State Management (CSRF Protection)

```typescript
// OAuth state token structure
interface OAuthState {
  random: string; // Cryptographic random nonce
  userId: string; // Authenticated user ID
  provider: string; // 'YOUTUBE' | 'SPOTIFY'
  returnUrl: string; // Where to redirect after completion
  expiresAt: number; // Unix timestamp (15 minutes TTL)
}

// State is signed and stored in KV with TTL
// Verified on callback to prevent CSRF attacks
```

### OAuth State Storage

OAuth state tokens are stored in **Cloudflare KV** (not the user's DO) because:

1. The callback may arrive before the user's DO is accessed
2. KV supports automatic TTL-based expiration
3. State verification doesn't need user data context

```typescript
// Store state in KV with 15-minute TTL
await env.OAUTH_STATE_KV.put(
  `oauth:state:${state}`,
  JSON.stringify(oauthState),
  { expirationTtl: 900 } // 15 minutes
);
```

---

## Ingestion Pipeline

### Scheduled Ingestion Architecture

Ingestion runs **inside each user's Durable Object** using DO Alarms, not global cron triggers. This maintains user isolation and allows per-user scheduling.

```typescript
// wrangler.toml - DO class with alarms enabled
[[durable_objects.bindings]];
name = 'USER_DO';
class_name = 'UserDO';

// Alarm-based scheduling per user
// Each DO schedules its own ingestion alarm after first source is added
```

### Why DO Alarms Instead of Global Cron

| Approach    | Global Cron                      | DO Alarms                       |
| ----------- | -------------------------------- | ------------------------------- |
| Scaling     | Must iterate all users           | Per-user, naturally distributed |
| Isolation   | Risk of one user blocking others | Fully isolated                  |
| Scheduling  | Fixed intervals                  | Per-user customization possible |
| Cold starts | Fan-out to all DOs at once       | Staggered naturally             |

### Alarm-Based Ingestion Flow

```typescript
// apps/worker/src/durable-objects/user-do.ts

export class UserDO implements DurableObject {
  async alarm() {
    // This runs on a schedule set by the DO itself
    await this.runIngestion();

    // Schedule next alarm (hourly)
    const nextRun = Date.now() + 60 * 60 * 1000; // 1 hour
    this.ctx.storage.setAlarm(nextRun);
  }

  async onSourceAdded() {
    // When first source is added, start the alarm cycle
    const existingAlarm = await this.ctx.storage.getAlarm();
    if (!existingAlarm) {
      // First ingestion in 5 minutes, then hourly
      this.ctx.storage.setAlarm(Date.now() + 5 * 60 * 1000);
    }
  }
}
```

### Ingestion Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                    Hourly Ingestion Flow                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  1. Get active sources due for sync                             │
│     WHERE status = 'active'                                      │
│     AND deleted_at IS NULL                                       │
│     AND (last_fetched_at IS NULL                                │
│          OR last_fetched_at < now() - 55 minutes)               │
│                                                                  │
│  2. Group sources by provider                                    │
│     └─ Batch process to minimize API calls                      │
│                                                                  │
│  3. For each provider connection                                │
│     ├─ Check token validity, refresh if needed                  │
│     ├─ If refresh fails → mark connection as needs_reauth       │
│     └─ Skip sources for invalid connections                     │
│                                                                  │
│  4. For each source                                             │
│     ├─ Fetch new items from provider                            │
│     │   └─ YouTube: playlistItems.list (uploads playlist)       │
│     │   └─ Spotify: shows/{id}/episodes                         │
│     ├─ For each item                                            │
│     │   ├─ Check idempotency (provider_items_seen)              │
│     │   ├─ If new → Create/upsert canonical item                │
│     │   ├─ Create user_item (INBOX state)                       │
│     │   └─ Record in provider_items_seen                        │
│     └─ Update source.last_fetched_at                            │
│                                                                  │
│  5. Handle errors gracefully                                    │
│     └─ Individual source failures don't block others            │
│     └─ Increment error_count, log error                         │
│     └─ If error_count > 5 → pause source                        │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### YouTube-Specific Ingestion

```typescript
async function ingestYouTubeSource(
  sql: SqlStorage,
  source: Source,
  youtube: YouTubeClient
): Promise<IngestResult> {
  // 1. Fetch recent uploads (up to 50)
  const playlistItems = await youtube.playlistItems.list({
    playlistId: source.feedId, // "UU" + channelId (uploads playlist)
    part: ['snippet', 'contentDetails'],
    maxResults: 50,
  });

  // 2. Get video details for duration
  const videoIds = playlistItems.items.map((i) => i.contentDetails.videoId);
  const videos = await youtube.videos.list({
    id: videoIds,
    part: ['contentDetails', 'snippet'],
  });

  let newCount = 0;

  // 3. Process each video
  for (const video of videos.items) {
    // Check idempotency using existing provider_items_seen table
    const seen = sql
      .exec(
        `
      SELECT 1 FROM provider_items_seen
      WHERE source_id = ? AND provider_item_id = ?
    `,
        [source.id, video.id]
      )
      .toArray();

    if (seen.length > 0) continue;

    // Map to canonical_items schema (existing table)
    const canonicalItem = {
      id: generateULID(),
      content_type: 'VIDEO',
      provider: 'YOUTUBE',
      provider_id: video.id,
      canonical_url: `https://www.youtube.com/watch?v=${video.id}`,
      title: video.snippet.title,
      summary: video.snippet.description?.slice(0, 500),
      author: video.snippet.channelTitle,
      publisher: null,
      thumbnail_url: video.snippet.thumbnails.high?.url,
      duration: parseISO8601Duration(video.contentDetails.duration),
      published_at: video.snippet.publishedAt,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    // Insert canonical item and user_item (INBOX state)
    await insertCanonicalAndUserItem(sql, canonicalItem);

    // Record as seen
    sql.exec(
      `
      INSERT INTO provider_items_seen (source_id, provider_item_id, seen_at)
      VALUES (?, ?, ?)
    `,
      [source.id, video.id, new Date().toISOString()]
    );

    newCount++;
  }

  return { newCount };
}

// Convert ISO 8601 duration to seconds
function parseISO8601Duration(duration: string): number {
  // PT1H2M3S -> 3723 seconds
  const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return 0;
  const [, hours, minutes, seconds] = match;
  return parseInt(hours || '0') * 3600 + parseInt(minutes || '0') * 60 + parseInt(seconds || '0');
}
```

### Spotify-Specific Ingestion

```typescript
async function ingestSpotifySource(
  sql: SqlStorage,
  source: Source,
  spotify: SpotifyClient
): Promise<IngestResult> {
  // 1. Fetch recent episodes (up to 50)
  const response = await spotify.getShowEpisodes(source.providerId, {
    limit: 50,
    market: 'US',
  });

  let newCount = 0;

  // 2. Process each episode
  for (const episode of response.items) {
    // Check idempotency
    const seen = sql
      .exec(
        `
      SELECT 1 FROM provider_items_seen
      WHERE source_id = ? AND provider_item_id = ?
    `,
        [source.id, episode.id]
      )
      .toArray();

    if (seen.length > 0) continue;

    // Map to canonical_items schema
    const canonicalItem = {
      id: generateULID(),
      content_type: 'PODCAST',
      provider: 'SPOTIFY',
      provider_id: episode.id,
      canonical_url: episode.external_urls.spotify,
      title: episode.name,
      summary: episode.description?.slice(0, 500),
      author: source.name, // Show name
      publisher: null, // Could fetch from show metadata
      thumbnail_url: episode.images[0]?.url,
      duration: Math.floor(episode.duration_ms / 1000),
      published_at: normalizeReleaseDate(episode.release_date, episode.release_date_precision),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    await insertCanonicalAndUserItem(sql, canonicalItem);

    sql.exec(
      `
      INSERT INTO provider_items_seen (source_id, provider_item_id, seen_at)
      VALUES (?, ?, ?)
    `,
      [source.id, episode.id, new Date().toISOString()]
    );

    newCount++;
  }

  return { newCount };
}
```

---

## Data Normalization

### Provider to Canonical Mapping

```typescript
// ============================================================================
// YouTube Video → Canonical Item
// ============================================================================
interface YouTubeVideoMapping {
  // Identity
  providerId: video.id;
  provider: 'YOUTUBE';
  canonicalUrl: `https://www.youtube.com/watch?v=${video.id}`;

  // Classification
  contentType: 'VIDEO';

  // Display
  title: video.snippet.title;
  thumbnailUrl: video.snippet.thumbnails.maxres?.url
             || video.snippet.thumbnails.high?.url;

  // Attribution
  creator: video.snippet.channelTitle;
  publisher: null;  // YouTube doesn't have network concept

  // Metadata
  summary: video.snippet.description?.slice(0, 500);  // Truncate long descriptions
  duration: parseISO8601Duration(video.contentDetails.duration);
  publishedAt: video.snippet.publishedAt;
}

// ============================================================================
// Spotify Episode → Canonical Item
// ============================================================================
interface SpotifyEpisodeMapping {
  // Identity
  providerId: episode.id;
  provider: 'SPOTIFY';
  canonicalUrl: episode.external_urls.spotify;

  // Classification
  contentType: 'PODCAST';

  // Display
  title: episode.name;
  thumbnailUrl: episode.images[0]?.url;

  // Attribution
  creator: show.name;        // Podcast name
  publisher: show.publisher; // Network/publisher

  // Metadata
  summary: episode.description?.slice(0, 500);
  duration: Math.floor(episode.duration_ms / 1000);
  publishedAt: episode.release_date;  // May be just "YYYY" or "YYYY-MM"
}
```

### Content Type Mapping

| Provider | Resource Type     | Zine ContentType |
| -------- | ----------------- | ---------------- |
| YouTube  | Video             | `VIDEO`          |
| YouTube  | Short             | `VIDEO`          |
| YouTube  | Live Stream       | `VIDEO`          |
| Spotify  | Episode           | `PODCAST`        |
| RSS      | Enclosure (audio) | `PODCAST`        |
| RSS      | Article           | `ARTICLE`        |
| Substack | Post              | `ARTICLE`        |

### Date Precision Handling

```typescript
// Spotify release_date can be: "1981", "1981-12", or "1981-12-15"
function normalizeReleaseDate(releaseDate: string, precision: 'year' | 'month' | 'day'): string {
  switch (precision) {
    case 'year':
      return `${releaseDate}-01-01T00:00:00Z`;
    case 'month':
      return `${releaseDate}-01T00:00:00Z`;
    case 'day':
      return `${releaseDate}T00:00:00Z`;
  }
}
```

---

## Client Libraries

### Cloudflare Workers Compatibility

**Important**: Most Node.js OAuth libraries (`googleapis`, `spotify-web-api-node`) are **not compatible** with Cloudflare Workers due to Node.js-specific dependencies. Use direct `fetch()` calls instead.

### Recommended Approach

| Platform                  | YouTube          | Spotify          |
| ------------------------- | ---------------- | ---------------- |
| **Cloudflare Workers**    | Direct `fetch()` | Direct `fetch()` |
| **Mobile (React Native)** | N/A (OAuth only) | N/A (OAuth only) |

### Worker Dependencies

```json
// apps/worker/package.json
{
  "dependencies": {
    // No external OAuth libraries needed - use native fetch
  }
}
```

### Usage Patterns

```typescript
// ============================================================================
// YouTube API Client (Workers-compatible)
// ============================================================================

interface YouTubeClient {
  subscriptions: {
    list: (params: {
      mine: boolean;
      maxResults: number;
      pageToken?: string;
    }) => Promise<YouTubeSubscriptionListResponse>;
  };
  playlistItems: {
    list: (params: {
      playlistId: string;
      maxResults: number;
      part: string[];
    }) => Promise<YouTubePlaylistItemsResponse>;
  };
  videos: {
    list: (params: { id: string[]; part: string[] }) => Promise<YouTubeVideosResponse>;
  };
}

function createYouTubeClient(accessToken: string): YouTubeClient {
  const baseUrl = 'https://www.googleapis.com/youtube/v3';

  async function apiCall<T>(endpoint: string, params: Record<string, any>): Promise<T> {
    const url = new URL(`${baseUrl}/${endpoint}`);
    Object.entries(params).forEach(([key, value]) => {
      if (Array.isArray(value)) {
        url.searchParams.set(key, value.join(','));
      } else if (value !== undefined) {
        url.searchParams.set(key, String(value));
      }
    });

    const response = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!response.ok) {
      const error = await response.json();
      throw new YouTubeAPIError(response.status, error);
    }

    return response.json();
  }

  return {
    subscriptions: {
      list: (params) => apiCall('subscriptions', { ...params, part: 'snippet' }),
    },
    playlistItems: {
      list: (params) => apiCall('playlistItems', params),
    },
    videos: {
      list: (params) => apiCall('videos', params),
    },
  };
}

// ============================================================================
// Spotify API Client (Workers-compatible)
// ============================================================================

interface SpotifyClient {
  getMyShows: (params: { limit: number; offset?: number }) => Promise<SpotifyShowsResponse>;
  getShowEpisodes: (
    showId: string,
    params: { limit: number; market?: string }
  ) => Promise<SpotifyEpisodesResponse>;
}

function createSpotifyClient(accessToken: string): SpotifyClient {
  const baseUrl = 'https://api.spotify.com/v1';

  async function apiCall<T>(endpoint: string, params?: Record<string, any>): Promise<T> {
    const url = new URL(`${baseUrl}/${endpoint}`);
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined) url.searchParams.set(key, String(value));
      });
    }

    const response = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (response.status === 429) {
      const retryAfter = response.headers.get('Retry-After');
      throw new SpotifyRateLimitError(parseInt(retryAfter || '60', 10));
    }

    if (!response.ok) {
      const error = await response.json();
      throw new SpotifyAPIError(response.status, error);
    }

    return response.json();
  }

  return {
    getMyShows: (params) => apiCall('me/shows', params),
    getShowEpisodes: (showId, params) => apiCall(`shows/${showId}/episodes`, params),
  };
}
```

---

## API Design

### Architecture Note

The existing codebase uses **Hono routes** that forward to the **User Durable Object**. OAuth and source management follows this pattern.

### Hono Routes: OAuth

```typescript
// apps/worker/src/routes/oauth.ts
import { Hono } from 'hono';
import { authMiddleware } from '../middleware/auth';
import { OAuthInitiateSchema, OAuthCallbackSchema, ConfirmSourcesSchema } from '@zine/shared';

const oauth = new Hono<{ Bindings: Env; Variables: { userId: string } }>();

// All OAuth routes require authentication
oauth.use('/*', authMiddleware());

// Get connection status for all providers
oauth.get('/status', async (c) => {
  const userId = c.get('userId');
  const doId = c.env.USER_DO.idFromName(userId);
  const stub = c.env.USER_DO.get(doId);

  const response = await stub.fetch(new Request('http://do/oauth/status'));
  return c.json(await response.json());
});

// Initiate OAuth flow - returns URL for mobile to open
oauth.post('/:provider/initiate', async (c) => {
  const provider = c.req.param('provider').toUpperCase();
  const userId = c.get('userId');

  // Generate OAuth state (stored in KV with TTL)
  const state = await createOAuthState(c.env, userId, provider);
  const url = generateOAuthUrl(provider, state, c.env);

  return c.json({ url, state });
});

// Exchange code for tokens (called by mobile after redirect)
oauth.post('/:provider/callback', async (c) => {
  const provider = c.req.param('provider').toUpperCase();
  const body = await c.req.json();
  const { code, state } = OAuthCallbackSchema.parse(body);
  const userId = c.get('userId');

  // Verify state from KV
  await verifyOAuthState(c.env, state, userId, provider);

  // Forward to user's DO for token storage
  const doId = c.env.USER_DO.idFromName(userId);
  const stub = c.env.USER_DO.get(doId);

  const response = await stub.fetch(
    new Request('http://do/oauth/store-tokens', {
      method: 'POST',
      body: JSON.stringify({ provider, code }),
    })
  );

  return c.json(await response.json());
});

// Get user's subscriptions for selection UI
oauth.get('/:provider/subscriptions', async (c) => {
  const provider = c.req.param('provider').toUpperCase();
  const userId = c.get('userId');

  const doId = c.env.USER_DO.idFromName(userId);
  const stub = c.env.USER_DO.get(doId);

  const response = await stub.fetch(
    new Request(`http://do/oauth/subscriptions?provider=${provider}`)
  );
  return c.json(await response.json());
});

// Confirm selected subscriptions as sources
oauth.post('/sources/confirm', async (c) => {
  const body = await c.req.json();
  const { provider, selectedIds } = ConfirmSourcesSchema.parse(body);
  const userId = c.get('userId');

  const doId = c.env.USER_DO.idFromName(userId);
  const stub = c.env.USER_DO.get(doId);

  const response = await stub.fetch(
    new Request('http://do/sources/confirm', {
      method: 'POST',
      body: JSON.stringify({ provider, selectedIds }),
    })
  );

  return c.json(await response.json());
});

// Disconnect provider
oauth.delete('/:provider', async (c) => {
  const provider = c.req.param('provider').toUpperCase();
  const userId = c.get('userId');

  const doId = c.env.USER_DO.idFromName(userId);
  const stub = c.env.USER_DO.get(doId);

  const response = await stub.fetch(
    new Request(`http://do/oauth/disconnect?provider=${provider}`, {
      method: 'DELETE',
    })
  );

  return c.json(await response.json());
});

export default oauth;
```

### Durable Object Handlers: OAuth

```typescript
// apps/worker/src/durable-objects/handlers/oauth.ts

export async function handleOAuthStatus(sql: SqlStorage): Promise<Response> {
  const connections = sql
    .exec(
      `
    SELECT provider, status, last_sync_at, provider_email
    FROM provider_connections
  `
    )
    .toArray();

  return Response.json({
    youtube: connections.find((c) => c.provider === 'YOUTUBE') ?? null,
    spotify: connections.find((c) => c.provider === 'SPOTIFY') ?? null,
  });
}

export async function handleStoreTokens(
  sql: SqlStorage,
  env: Env,
  body: { provider: string; code: string }
): Promise<Response> {
  const { provider, code } = body;

  // Exchange code for tokens with provider
  const tokens = await exchangeCodeForTokens(provider, code, env);

  // Encrypt tokens before storage
  const encryptedAccess = await encryptToken(tokens.accessToken, env.TOKEN_ENCRYPTION_KEY);
  const encryptedRefresh = await encryptToken(tokens.refreshToken, env.TOKEN_ENCRYPTION_KEY);

  // Upsert provider connection
  sql.exec(
    `
    INSERT INTO provider_connections (
      id, provider, access_token_encrypted, refresh_token_encrypted,
      token_expires_at, scopes, provider_user_id, provider_email,
      status, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)
    ON CONFLICT(provider) DO UPDATE SET
      access_token_encrypted = excluded.access_token_encrypted,
      refresh_token_encrypted = excluded.refresh_token_encrypted,
      token_expires_at = excluded.token_expires_at,
      scopes = excluded.scopes,
      status = 'active',
      updated_at = excluded.updated_at
  `,
    [
      generateULID(),
      provider,
      JSON.stringify(encryptedAccess),
      JSON.stringify(encryptedRefresh),
      tokens.expiresAt,
      JSON.stringify(tokens.scopes),
      tokens.userId,
      tokens.email,
      new Date().toISOString(),
      new Date().toISOString(),
    ]
  );

  // Fetch initial subscriptions count
  const subscriptions = await fetchSubscriptions(provider, tokens.accessToken, env);

  return Response.json({
    success: true,
    subscriptionsCount: subscriptions.length,
  });
}
```

### Source Management via Replicache

Sources are synced to the mobile app via Replicache. The existing mutators handle source CRUD:

```typescript
// Already in packages/shared/src/mutators/index.ts
export const mutators = {
  addSource: async (tx: WriteTransaction, { source }: { source: Source }) => {
    await tx.set(sourceKey(source.id), { ...source, createdAt: new Date().toISOString() });
  },

  removeSource: async (tx: WriteTransaction, { sourceId }: { sourceId: string }) => {
    await tx.del(sourceKey(sourceId));
  },

  // New mutators needed for status management
  pauseSource: async (tx: WriteTransaction, { sourceId }: { sourceId: string }) => {
    const source = await tx.get<Source>(sourceKey(sourceId));
    if (source) {
      await tx.set(sourceKey(sourceId), { ...source, status: 'paused' });
    }
  },

  resumeSource: async (tx: WriteTransaction, { sourceId }: { sourceId: string }) => {
    const source = await tx.get<Source>(sourceKey(sourceId));
    if (source) {
      await tx.set(sourceKey(sourceId), { ...source, status: 'active' });
    }
  },
};
```

---

## Replicache Sync Integration

### Source Sync to Mobile

Sources are synced to the mobile app via the existing Replicache pull mechanism. The pull handler needs to include sources:

```typescript
// apps/worker/src/durable-objects/handlers/pull.ts

export async function handlePull(sql: SqlStorage, request: PullRequest): Promise<PullResponse> {
  const version = getVersion(sql);

  // Include sources in the pull response
  const sources = sql
    .exec(
      `
    SELECT * FROM sources WHERE deleted_at IS NULL
  `
    )
    .toArray();

  const patch: PatchOperation[] = [
    { op: 'clear' },
    // ... existing items and user_items ...
    ...sources.map((source) => ({
      op: 'put' as const,
      key: sourceKey(source.id),
      value: mapSourceToClient(source),
    })),
  ];

  return {
    cookie: { version, schemaVersion: SCHEMA_VERSION },
    patch,
    lastMutationIDChanges: {},
  };
}
```

### Provider Connection Status

Provider connection status (YouTube connected, Spotify needs reauth, etc.) is **not synced via Replicache**. Instead, the mobile app fetches this on-demand:

```typescript
// apps/mobile/hooks/use-provider-connections.ts

export function useProviderConnections() {
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['provider-connections'],
    queryFn: async () => {
      const response = await fetch(`${API_URL}/api/oauth/status`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      return response.json();
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  return { connections: data, isLoading, refetch };
}
```

### Why Not Sync Tokens via Replicache?

1. **Security**: Tokens should never reach the client
2. **Size**: Encrypted tokens add unnecessary sync payload
3. **Sensitivity**: Connection status is enough for UI decisions
4. **Staleness**: Token validity can change server-side without user action

---

## Bookmark URL Enrichment

### Use Case

When a user manually saves a YouTube or Spotify URL as a bookmark, we can use their connected provider tokens to fetch rich metadata.

### Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                   URL Enrichment Flow                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  1. User pastes URL: "https://youtube.com/watch?v=abc123"       │
│                                                                  │
│  2. App detects provider from URL pattern                        │
│     └─ YouTube: youtube.com/watch, youtu.be                     │
│     └─ Spotify: open.spotify.com/episode                        │
│                                                                  │
│  3. Check if user has connected provider                        │
│     └─ If not → Fall back to basic metadata (title from URL)   │
│                                                                  │
│  4. If connected → Fetch rich metadata via API                  │
│     └─ YouTube: videos.list with video ID                       │
│     └─ Spotify: episodes.get with episode ID                    │
│                                                                  │
│  5. Create canonical item with full metadata                    │
│     └─ Title, description, duration, thumbnail, etc.            │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### URL Pattern Matching

```typescript
const URL_PATTERNS = {
  YOUTUBE: [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/,
  ],
  SPOTIFY: [
    /open\.spotify\.com\/episode\/([a-zA-Z0-9]{22})/,
    /open\.spotify\.com\/show\/([a-zA-Z0-9]{22})/,
  ],
};

function detectProviderFromUrl(url: string): {
  provider: Provider | null;
  providerId: string | null;
} {
  for (const [provider, patterns] of Object.entries(URL_PATTERNS)) {
    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match) {
        return {
          provider: provider as Provider,
          providerId: match[1],
        };
      }
    }
  }
  return { provider: null, providerId: null };
}
```

---

## Security Considerations

### Token Security

1. **Encryption at Rest**: All OAuth tokens encrypted with AES-256-GCM
2. **Key Management**: Encryption key stored in Cloudflare secrets, never in code
3. **Token Rotation**: Access tokens refreshed proactively before expiry
4. **Minimal Scopes**: Request only `readonly` scopes needed for functionality
5. **Token Revocation**: Clean up tokens when user disconnects provider

### OAuth Security

1. **State Parameter**: Cryptographically random, tied to user session
2. **PKCE**: Use for mobile flows (though we do server-side exchange)
3. **Redirect URI Validation**: Strict matching on configured URIs
4. **HTTPS Only**: All OAuth redirects and API calls over HTTPS

### API Security

1. **Rate Limiting**: Implement per-user rate limits on OAuth endpoints
2. **Input Validation**: Strict Zod schemas for all inputs
3. **Error Handling**: Don't leak internal errors to clients
4. **Audit Logging**: Log OAuth events (connects, disconnects, refresh failures)

### Wrangler Secrets

```toml
# Required secrets (set via `wrangler secret put`)
GOOGLE_CLIENT_ID = "..."
GOOGLE_CLIENT_SECRET = "..."
SPOTIFY_CLIENT_ID = "..."
SPOTIFY_CLIENT_SECRET = "..."
TOKEN_ENCRYPTION_KEY = "..."  # 32-byte hex string for AES-256
OAUTH_STATE_SECRET = "..."     # For signing state tokens
```

---

## Implementation Phases

### Phase 1: OAuth Foundation (Week 1-2)

**Goal**: Establish secure OAuth flows and token storage

- [ ] Add `provider_connections` table to DO migration
- [ ] Implement token encryption/decryption utilities (AES-256-GCM)
- [ ] Add KV namespace for OAuth state storage
- [ ] Build OAuth Hono routes (`/api/oauth/*`)
- [ ] Add OAuth handlers to UserDO
- [ ] Implement token refresh logic
- [ ] Add YouTube OAuth integration
- [ ] Add Spotify OAuth integration
- [ ] Create mobile OAuth deep link handling (Expo AuthSession)

**Deliverable**: Users can connect/disconnect YouTube and Spotify accounts

### Phase 2: Subscription Import (Week 2-3)

**Goal**: Import user subscriptions as sources

- [ ] Add new columns to `sources` table via DO migration
- [ ] Build Workers-compatible YouTube API client
- [ ] Build Workers-compatible Spotify API client
- [ ] Implement YouTube subscription fetching
- [ ] Implement Spotify saved shows fetching
- [ ] Add `/api/oauth/:provider/subscriptions` endpoint
- [ ] Add `sources/confirm` endpoint
- [ ] Handle large subscription lists (pagination)
- [ ] Build subscription selection UI (mobile)
- [ ] Update shared Source type with new fields

**Deliverable**: Users can select which subscriptions to sync

### Phase 3: Alarm-Based Ingestion (Week 3-4)

**Goal**: Automated content fetching

- [ ] Implement DO alarm scheduling
- [ ] Add alarm handler to UserDO
- [ ] Implement YouTube video ingestion
- [ ] Implement Spotify episode ingestion
- [ ] Use existing `provider_items_seen` for idempotency
- [ ] Implement error handling and retry logic
- [ ] Add source status tracking
- [ ] Update Replicache pull to include sources

**Deliverable**: New content automatically appears in inbox

### Phase 4: Monitoring & Polish (Week 4-5)

**Goal**: Production readiness

- [ ] Add ingestion metrics via `console.log` (Workers Analytics later)
- [ ] Implement rate limit handling with backoff
- [ ] Add connection health checks
- [ ] Build source management UI (mobile)
- [ ] Handle reauth flows (show banner when `needs_reauth`)
- [ ] Add manual refresh capability

**Deliverable**: Production-ready source management

### Future: Bookmark Enrichment (Post-MVP)

**Goal**: Rich metadata for manual bookmarks

- [ ] URL pattern detection
- [ ] Provider API enrichment (if connected)
- [ ] Fallback to web scraping (or skip enrichment)

---

## Appendix A: OAuth Redirect URIs

### YouTube (Google Cloud Console)

```
# Production
https://api.zine.app/oauth/google/callback

# Development
http://localhost:8787/oauth/google/callback
zine://oauth/callback  # For mobile deep linking
```

### Spotify (Developer Dashboard)

```
# Production
https://api.zine.app/oauth/spotify/callback

# Development
http://localhost:8787/oauth/spotify/callback
zine://oauth/callback  # For mobile deep linking
```

---

## Appendix B: Error Handling Matrix

| Error                | Provider | Action                  | User Impact            |
| -------------------- | -------- | ----------------------- | ---------------------- |
| `invalid_grant`      | Both     | Mark `needs_reauth`     | Prompt to reconnect    |
| `access_denied`      | Both     | Don't create connection | Show error message     |
| `quota_exceeded`     | YouTube  | Back off, retry later   | Delayed sync           |
| `rate_limited` (429) | Spotify  | Exponential backoff     | Delayed sync           |
| `not_found`          | Both     | Mark source as error    | Source removed by user |
| Network error        | Both     | Retry with backoff      | Delayed sync           |

---

## Appendix C: Quota Management (YouTube)

### Daily Quota Budget (10,000 units)

| Operation          | Units | Budget Allocation                  |
| ------------------ | ----- | ---------------------------------- |
| subscriptions.list | 1     | 100 users × 1 = 100                |
| playlistItems.list | 1     | 100 users × 50 sources × 1 = 5,000 |
| videos.list        | 1     | Batched: 100 × 1 = 100             |
| **Total**          |       | ~5,200 units/hour                  |

### Optimization Strategies

1. **Batch video.list calls**: Request up to 50 video IDs per call
2. **Cache channel metadata**: Don't re-fetch channel info every sync
3. **Smart polling**: Only fetch sources that might have new content
4. **Quota monitoring**: Track usage and alert before limits

---

## Appendix D: Mobile OAuth with Expo AuthSession

### PKCE Flow for Mobile

Mobile OAuth uses **PKCE (Proof Key for Code Exchange)** via Expo AuthSession for security:

```typescript
// apps/mobile/lib/oauth.ts
import * as AuthSession from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';

WebBrowser.maybeCompleteAuthSession();

const redirectUri = AuthSession.makeRedirectUri({
  scheme: 'zine',
  path: 'oauth/callback',
});

export function useOAuthFlow(provider: 'youtube' | 'spotify') {
  const discovery =
    provider === 'youtube'
      ? AuthSession.useAutoDiscovery('https://accounts.google.com')
      : {
          authorizationEndpoint: 'https://accounts.spotify.com/authorize',
          tokenEndpoint: 'https://accounts.spotify.com/api/token',
        };

  const [request, response, promptAsync] = AuthSession.useAuthRequest(
    {
      clientId: provider === 'youtube' ? GOOGLE_CLIENT_ID : SPOTIFY_CLIENT_ID,
      scopes:
        provider === 'youtube'
          ? ['https://www.googleapis.com/auth/youtube.readonly']
          : ['user-library-read'],
      redirectUri,
      usePKCE: true,
    },
    discovery
  );

  // Handle response and send code to backend
  useEffect(() => {
    if (response?.type === 'success') {
      const { code } = response.params;
      // Send code + code_verifier to backend for token exchange
      exchangeCodeOnServer(provider, code, request?.codeVerifier);
    }
  }, [response]);

  return { request, promptAsync };
}
```

### Server-Side Token Exchange with PKCE

```typescript
// apps/worker/src/lib/oauth.ts

async function exchangeCodeForTokens(
  provider: string,
  code: string,
  codeVerifier: string,
  env: Env
): Promise<OAuthTokens> {
  const tokenUrl =
    provider === 'YOUTUBE'
      ? 'https://oauth2.googleapis.com/token'
      : 'https://accounts.spotify.com/api/token';

  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: env.OAUTH_REDIRECT_URI,
    client_id: provider === 'YOUTUBE' ? env.GOOGLE_CLIENT_ID : env.SPOTIFY_CLIENT_ID,
    client_secret: provider === 'YOUTUBE' ? env.GOOGLE_CLIENT_SECRET : env.SPOTIFY_CLIENT_SECRET,
    code_verifier: codeVerifier, // PKCE verification
  });

  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });

  if (!response.ok) {
    const error = await response.json();
    throw new OAuthError(error.error, error.error_description);
  }

  return response.json();
}
```

---

## Appendix E: Wrangler Configuration

### Required Bindings

```toml
# apps/worker/wrangler.toml

[[kv_namespaces]]
binding = "OAUTH_STATE_KV"
id = "xxx"  # Create via: wrangler kv:namespace create OAUTH_STATE_KV

[[durable_objects.bindings]]
name = "USER_DO"
class_name = "UserDO"

[vars]
OAUTH_REDIRECT_URI = "https://api.zine.app/oauth/callback"

# Secrets (set via wrangler secret put):
# - GOOGLE_CLIENT_ID
# - GOOGLE_CLIENT_SECRET
# - SPOTIFY_CLIENT_ID
# - SPOTIFY_CLIENT_SECRET
# - TOKEN_ENCRYPTION_KEY
```

---

## Appendix F: Open Questions

1. **Subscription limits**: Should we limit how many sources a user can add? (quota/cost consideration)
2. **Historical backfill**: Should we offer optional "import last 30 days" on first connect?
3. **Source priority**: How do we determine "priority sources" for more frequent polling?
4. **Token encryption key rotation**: Strategy for rotating TOKEN_ENCRYPTION_KEY without breaking existing tokens?
5. **Cross-device sync**: Provider connection status isn't synced - should we show "connected on another device" state?
