# Subscriptions Backend Specification

## Overview

This document covers the backend implementation of the Zine subscriptions feature, including data models, provider integration (YouTube/Spotify), polling architecture, ingestion pipeline, API design, and security considerations.

For the mobile app UX implementation, see `frontend-spec.md`.

### Key Principles

1. **User-controlled subscriptions** - Users explicitly choose which channels/shows to follow
2. **Inbox-first flow** - New content lands in inbox, not directly in library
3. **Initial fetch limitation** - Only pull the latest episode/video when first subscribing
4. **Polling-based updates** - Use cron-based polling to check for new content

---

## 1. Data Model

### 1.0 Current Schema Analysis

Before implementing the subscriptions feature, we must understand the existing database schema in `apps/worker/src/db/schema.ts`.

#### Existing Tables

| Table                 | Purpose                                 | Relevance to Subscriptions                       |
| --------------------- | --------------------------------------- | ------------------------------------------------ |
| `users`               | User accounts (Clerk IDs)               | FK target for all subscription tables            |
| `items`               | Canonical content (shared across users) | Subscription items write here                    |
| `user_items`          | User's relationship to content          | New inbox items created here                     |
| `creators`            | Canonical creator records               | Source of name/image/description metadata        |
| `sources`             | Legacy subscriptions (RSS, etc.)        | **NOT USED** - new `subscriptions` table instead |
| `provider_items_seen` | Ingestion idempotency                   | **REUSED** for subscription deduplication        |

#### Key Insight: provider_items_seen Already Exists

The `provider_items_seen` table is already implemented and compatible with our needs:

```sql
-- Existing schema (apps/worker/src/db/schema.ts)
CREATE TABLE provider_items_seen (
  id TEXT PRIMARY KEY,           -- ULID
  user_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  provider_item_id TEXT NOT NULL,
  source_id TEXT,                -- Legacy FK to sources.id (NULL for subscriptions)
  first_seen_at TEXT NOT NULL,   -- ISO8601 (existing convention)
  UNIQUE(user_id, provider, provider_item_id)
);
```

**Migration Strategy**: No schema changes needed. The `source_id` column remains a legacy reference to `sources.id` and is left NULL for subscriptions.

#### Why Not Use the Existing `sources` Table?

The `sources` table was designed for RSS/feed-based subscriptions with a `feed_url` column. OAuth-based subscriptions (YouTube, Spotify) require:

- OAuth credential storage (separate `provider_connections` table)
- Provider-specific channel/show IDs (not URLs)
- Polling state management (intervals, last polled timestamps)

A new `subscriptions` table better models these requirements.

### 1.1 Entity Relationships

```
users (1) ─────┬──── (N) provider_connections
               │
               ├──── (N) subscriptions ──── (N) subscription_items
               │                 │
               │                 └──── (1) creators
               │
               ├──── (N) user_items ──── (N) items
               │
               └──── (N) provider_items_seen (idempotency)
```

### 1.2 New Tables

#### `provider_connections`

Stores OAuth credentials for connected providers (Spotify, YouTube).

| Column              | Type        | Description                    |
| ------------------- | ----------- | ------------------------------ |
| `id`                | TEXT (ULID) | Primary key                    |
| `user_id`           | TEXT        | FK to users                    |
| `provider`          | TEXT        | `YOUTUBE`, `SPOTIFY`           |
| `provider_user_id`  | TEXT        | Provider's user ID             |
| `access_token`      | TEXT        | Encrypted OAuth access token   |
| `refresh_token`     | TEXT        | Encrypted OAuth refresh token  |
| `token_expires_at`  | INTEGER     | Unix timestamp of token expiry |
| `scopes`            | TEXT        | Comma-separated granted scopes |
| `connected_at`      | INTEGER     | Unix timestamp                 |
| `last_refreshed_at` | INTEGER     | Last token refresh             |
| `status`            | TEXT        | `ACTIVE`, `EXPIRED`, `REVOKED` |

**Unique constraint**: `(user_id, provider)`

#### `creators`

Canonical creator records (channels/shows) normalized across providers. Subscriptions reference this table via `creator_id`.

| Column                | Type        | Description                      |
| --------------------- | ----------- | -------------------------------- |
| `id`                  | TEXT (ULID) | Primary key                      |
| `provider`            | TEXT        | `YOUTUBE`, `SPOTIFY`             |
| `provider_creator_id` | TEXT        | Channel/show ID from provider    |
| `name`                | TEXT        | Display name                     |
| `normalized_name`     | TEXT        | Lowercase + trimmed for deduping |
| `image_url`           | TEXT        | Thumbnail/artwork URL            |
| `description`         | TEXT        | Creator description              |
| `external_url`        | TEXT        | Link to channel/show on provider |
| `handle`              | TEXT        | @handle (when available)         |
| `created_at`          | INTEGER     | Unix ms                          |
| `updated_at`          | INTEGER     | Unix ms                          |

**Unique constraint**: `(provider, provider_creator_id)`

#### `subscriptions`

Represents a user's subscription to a specific channel/show.

| Column                  | Type        | Description                                        |
| ----------------------- | ----------- | -------------------------------------------------- |
| `id`                    | TEXT (ULID) | Primary key                                        |
| `user_id`               | TEXT        | FK to users                                        |
| `provider`              | TEXT        | `YOUTUBE`, `SPOTIFY`                               |
| `provider_channel_id`   | TEXT        | YouTube channel ID or Spotify show ID              |
| `creator_id`            | TEXT        | FK to creators (name/image via JOIN)               |
| `total_items`           | INTEGER     | Total videos/episodes (cached)                     |
| `last_published_at`     | INTEGER     | Timestamp of newest item                           |
| `last_polled_at`        | INTEGER     | Last successful poll                               |
| `poll_interval_seconds` | INTEGER     | Polling frequency (default: 3600)                  |
| `status`                | TEXT        | `ACTIVE`, `PAUSED`, `DISCONNECTED`, `UNSUBSCRIBED` |
| `disconnected_at`       | INTEGER     | When subscription disconnected                     |
| `disconnected_reason`   | TEXT        | Reason for disconnection                           |
| `created_at`            | INTEGER     | When user subscribed                               |
| `updated_at`            | INTEGER     | Last update                                        |

**Unique constraint**: `(user_id, provider, provider_channel_id)`

**Indexes**:

- `idx_subscriptions_poll` on `(status, last_polled_at)` - for polling scheduler
- `idx_subscriptions_user` on `(user_id, status)`

#### `subscription_items` (for tracking what's been fetched per subscription)

| Column             | Type        | Description                            |
| ------------------ | ----------- | -------------------------------------- |
| `id`               | TEXT (ULID) | Primary key                            |
| `subscription_id`  | TEXT        | FK to subscriptions                    |
| `item_id`          | TEXT        | FK to items                            |
| `provider_item_id` | TEXT        | YouTube video ID or Spotify episode ID |
| `published_at`     | INTEGER     | When item was published                |
| `fetched_at`       | INTEGER     | When we fetched it                     |

**Unique constraint**: `(subscription_id, provider_item_id)`

#### `user_notifications`

System notifications for connection health, poll failures, and other alerts.

| Column        | Type        | Description                          |
| ------------- | ----------- | ------------------------------------ |
| `id`          | TEXT (ULID) | Primary key                          |
| `user_id`     | TEXT        | FK to users                          |
| `type`        | TEXT        | Notification type (see enum below)   |
| `provider`    | TEXT        | YOUTUBE, SPOTIFY, or NULL for system |
| `title`       | TEXT        | Short title for display              |
| `message`     | TEXT        | Full notification message            |
| `data`        | TEXT        | JSON with additional context         |
| `read_at`     | INTEGER     | Unix ms when user read notification  |
| `resolved_at` | INTEGER     | Unix ms when auto-resolved           |
| `created_at`  | INTEGER     | Unix ms (default: now)               |

**Unique constraint**: `(user_id, type, provider) WHERE resolved_at IS NULL`

- Prevents duplicate active notifications of the same type

**Indexes**:

- `idx_user_notifications_inbox` on `(user_id, resolved_at, created_at DESC)` - for inbox queries

#### Notification Types

| Type                 | Trigger                    | Auto-resolves           |
| -------------------- | -------------------------- | ----------------------- |
| `connection_expired` | OAuth refresh fails        | On successful reconnect |
| `connection_revoked` | Provider returns 403       | On successful reconnect |
| `poll_failures`      | 3+ consecutive poll errors | On successful poll      |
| `quota_warning`      | YouTube quota > 80%        | Next day (quota reset)  |

### 1.2.1 Timestamp Convention

**CRITICAL**: The codebase uses TWO different timestamp formats. Understanding this is essential for correct implementation.

#### Format Comparison

| Tables                                                                                          | Format            | Example                      | Why                                            |
| ----------------------------------------------------------------------------------------------- | ----------------- | ---------------------------- | ---------------------------------------------- |
| `items`, `user_items`, `sources`, `provider_items_seen`                                         | ISO8601 strings   | `"2024-01-15T10:00:00.000Z"` | Legacy format, human-readable                  |
| `provider_connections`, `subscriptions`, `subscription_items`, `user_notifications`, `creators` | Unix milliseconds | `1705312800000`              | Matches JS `Date.now()`, efficient comparisons |

#### Conversion Guidelines

**New subscription code → Existing tables**:

```typescript
// When writing to items, user_items, provider_items_seen
const isoTimestamp = new Date(unixMs).toISOString();

// Example in ingestion pipeline
await tx.insert(items).values({
  ...itemData,
  publishedAt: new Date(transformedItem.publishedAt).toISOString(),
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
});
```

**Reading from existing tables → New code**:

```typescript
// When reading ISO timestamps into subscription logic
const unixMs = new Date(item.publishedAt).getTime();
```

#### Why Two Formats?

1. **Backwards compatibility**: Changing existing tables would require data migration
2. **New tables optimized for polling**: Unix ms enables efficient `lastPolledAt < now - interval` comparisons
3. **JavaScript alignment**: New tables use `Date.now()` directly, avoiding string parsing

#### SQL Defaults

**Existing tables** (ISO8601):

```sql
created_at TEXT NOT NULL DEFAULT (datetime('now'))
```

**New tables** (Unix ms):

```sql
created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
```

### 1.3 Table Purpose Reference

The data model includes two tables that may appear similar but serve distinct, complementary purposes: `subscription_items` and `provider_items_seen`. Understanding their differences is critical for correct implementation.

#### Overview Comparison

| Aspect              | `subscription_items`                             | `provider_items_seen`                              |
| ------------------- | ------------------------------------------------ | -------------------------------------------------- |
| **Primary Purpose** | Track which items came from which subscription   | Prevent duplicate ingestion (idempotency)          |
| **Scope**           | Subscription-specific                            | User-wide across all providers                     |
| **Unique Key**      | `(subscription_id, provider_item_id)`            | `(user_id, provider, provider_item_id)`            |
| **Created During**  | Item processing (after idempotency check passes) | First ingestion encounter                          |
| **Query Pattern**   | "Show me all items from this subscription"       | "Have I already ingested this item for this user?" |

### 1.4 Extended Enums

The subscriptions feature adds two new enums to `packages/shared/src/types/domain.ts`:

```typescript
// NEW: Connection status for OAuth credentials
export enum ProviderConnectionStatus {
  ACTIVE = 'ACTIVE',
  EXPIRED = 'EXPIRED',
  REVOKED = 'REVOKED',
}

// NEW: Subscription status for polling management
export enum SubscriptionStatus {
  ACTIVE = 'ACTIVE',
  PAUSED = 'PAUSED',
  DISCONNECTED = 'DISCONNECTED',
  UNSUBSCRIBED = 'UNSUBSCRIBED',
}

// Notification types for user alerts
export enum NotificationType {
  CONNECTION_EXPIRED = 'connection_expired',
  CONNECTION_REVOKED = 'connection_revoked',
  POLL_FAILURES = 'poll_failures',
  QUOTA_WARNING = 'quota_warning',
}
```

### 1.5 Provider Channel ID Validation Schemas

Provider channel/show IDs have specific formats that should be validated at the API boundary:

```typescript
// packages/shared/src/schemas/index.ts
import { z } from 'zod';

// YouTube channel ID: UC + 22 base64url characters
export const YouTubeChannelIdSchema = z
  .string()
  .regex(/^UC[a-zA-Z0-9_-]{22}$/, 'Invalid YouTube channel ID format. Expected UC + 22 characters');

// Spotify show ID: 22 alphanumeric characters
export const SpotifyShowIdSchema = z
  .string()
  .regex(
    /^[a-zA-Z0-9]{22}$/,
    'Invalid Spotify show ID format. Expected 22 alphanumeric characters'
  );
```

---

## 2. Provider Integration

### 2.1 Client SDKs

#### Spotify SDK

**Package**: `@spotify/web-api-ts-sdk`

```bash
npm install @spotify/web-api-ts-sdk
```

**Important**: Client Credentials flow can ONLY access PUBLIC Spotify data. For user-specific endpoints (saved shows, etc.), you MUST use the user's stored OAuth tokens from `provider_connections`.

```typescript
import { SpotifyApi, AccessToken } from '@spotify/web-api-ts-sdk';

// For user-specific data in background polling
function createUserSpotifyClient(accessToken: string, env: Env): SpotifyApi {
  const token: AccessToken = {
    access_token: accessToken,
    token_type: 'Bearer',
    expires_in: 3600,
    refresh_token: '', // We handle refresh externally
  };
  return SpotifyApi.withAccessToken(env.SPOTIFY_CLIENT_ID, token);
}
```

#### YouTube SDK

**Package**: `googleapis`

```bash
npm install googleapis
```

```typescript
import { google, youtube_v3 } from 'googleapis';

const oauth2Client = new google.auth.OAuth2(
  process.env.YOUTUBE_CLIENT_ID,
  process.env.YOUTUBE_CLIENT_SECRET,
  redirectUrl
);

oauth2Client.setCredentials({
  access_token: connection.accessToken,
  refresh_token: connection.refreshToken,
});

const youtube = google.youtube({ version: 'v3', auth: oauth2Client });
```

### 2.2 OAuth Flow Architecture

> **PKCE Security Model**: The PKCE verifier and challenge MUST be generated on the mobile client. See `frontend-spec.md` for the mobile implementation.

#### Server Responsibilities

| Step                     | Component  | Responsibility                                    |
| ------------------------ | ---------- | ------------------------------------------------- |
| State registration       | **Server** | Store `state` → `userId` mapping in KV            |
| State validation         | **Server** | Validate state on callback, lookup userId         |
| Code + verifier exchange | **Server** | Exchange code + verifier for tokens with provider |
| Token storage            | **Server** | Encrypt and persist tokens in database            |

#### Server: Token Exchange Endpoint

```typescript
// apps/worker/src/trpc/routers/connections.ts

callback: protectedProcedure
  .input(z.object({
    provider: ProviderSchema,
    code: z.string(),
    state: z.string(),
    codeVerifier: z.string().min(43).max(128),
  }))
  .mutation(async ({ ctx, input }) => {
    // 1. Validate state (CSRF protection)
    const storedUserId = await ctx.env.KV.get(`oauth:state:${input.state}`);
    if (storedUserId !== ctx.userId) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'Invalid state' });
    }

    // 2. Exchange code + verifier for tokens
    const tokens = await exchangeCodeForTokens(
      input.provider,
      input.code,
      input.codeVerifier,
      ctx.env
    );

    // 3. Store encrypted tokens
    await ctx.db.insert(providerConnections).values({
      id: ulid(),
      userId: ctx.userId,
      provider: input.provider,
      accessToken: encrypt(tokens.access_token, ctx.env.ENCRYPTION_KEY),
      refreshToken: encrypt(tokens.refresh_token, ctx.env.ENCRYPTION_KEY),
      tokenExpiresAt: Date.now() + tokens.expires_in * 1000,
      status: 'ACTIVE',
    }).onConflictDoUpdate({
      target: [providerConnections.userId, providerConnections.provider],
      set: { /* update tokens */ },
    });

    await ctx.env.KV.delete(`oauth:state:${input.state}`);
    return { success: true };
  }),
```

### 2.2.1 OAuth Endpoint Rate Limiting

| Endpoint        | Window   | Max Requests | Key    |
| --------------- | -------- | ------------ | ------ |
| `registerState` | 1 minute | 5            | userId |
| `callback`      | 1 minute | 10           | userId |
| `disconnect`    | 1 minute | 3            | userId |

### 2.3 YouTube Integration

**Required Scopes**: `https://www.googleapis.com/auth/youtube.readonly`

| Operation                    | SDK Method           | Quota Cost |
| ---------------------------- | -------------------- | ---------- |
| List user's subscriptions    | `subscriptions.list` | 1          |
| Get channel details          | `channels.list`      | 1          |
| List playlist items (videos) | `playlistItems.list` | 1          |
| Search channels              | `search.list`        | **100**    |

**Fetching New Videos**: Use the channel's "uploads" playlist:

```typescript
async function fetchYouTubeChannelVideos(youtube, channelId, since?: Date) {
  // 1. Get uploads playlist ID
  const channel = await youtube.channels.list({
    part: ['contentDetails'],
    id: [channelId],
  });
  const uploadsPlaylistId = channel.data.items?.[0]?.contentDetails?.relatedPlaylists?.uploads;

  // 2. Get recent videos
  const videos = await youtube.playlistItems.list({
    part: ['snippet', 'contentDetails'],
    playlistId: uploadsPlaylistId,
    maxResults: 10,
  });

  // 3. Filter by publish date if needed
  return since
    ? videos.data.items.filter((v) => new Date(v.snippet.publishedAt) > since)
    : videos.data.items;
}
```

### 2.4 Spotify Integration

**Required Scopes**: `user-library-read`

| Operation              | SDK Method                       | Notes                |
| ---------------------- | -------------------------------- | -------------------- |
| Get user's saved shows | `currentUser.shows.savedShows()` | Paginated (limit 50) |
| Get show episodes      | `shows.getShowEpisodes()`        | Paginated (limit 50) |

**Rate Limits**: Spotify uses rolling 30-second windows (~100-180 req/30s depending on quota mode).

---

## 3. Polling Architecture

### 3.1 Design: Cron Triggers with Smart Batching

```toml
# wrangler.toml
[triggers]
crons = ["*/15 * * * *"]  # Every 15 minutes
```

### 3.2 Batch Processing Logic

```typescript
export async function pollSubscriptions(env: Env) {
  const now = Date.now();
  const batchSize = 50;

  const dueSubscriptions = await db.query.subscriptions.findMany({
    where: and(
      eq(subscriptions.status, 'ACTIVE'),
      or(
        isNull(subscriptions.lastPolledAt),
        lt(subscriptions.lastPolledAt, sql`${now} - (${subscriptions.pollIntervalSeconds} * 1000)`)
      )
    ),
    orderBy: [asc(subscriptions.lastPolledAt)],
    limit: batchSize,
  });

  const byProvider = groupBy(dueSubscriptions, 'provider');
  await Promise.all([
    processYouTubeBatch(byProvider.YOUTUBE || [], env),
    processSpotifyBatch(byProvider.SPOTIFY || [], env),
  ]);
}

async function processYouTubeBatch(subscriptions: Subscription[], env: Env) {
  const byUser = groupBy(subscriptions, 'userId');

  for (const [userId, userSubs] of Object.entries(byUser)) {
    // CHECK RATE LIMIT BEFORE PROCESSING
    const rateCheck = await isRateLimited('YOUTUBE', userId, env.KV);
    if (rateCheck.limited) {
      console.log(`Skipping user ${userId}: rate limited for ${rateCheck.retryInMs}ms`);
      continue;
    }

    // ... rest of processing
  }
}
```

> **Rate Limiting**: Before processing any user's subscriptions, check if they're rate limited. See [Section 3.7: Rate Limiting Strategy](#37-rate-limiting-strategy) for the `isRateLimited()` implementation.

### 3.2.1 Cron Job Collision Prevention

Use distributed locks via KV to prevent overlapping executions:

```typescript
const POLL_LOCK_KEY = 'cron:poll-subscriptions:lock';
const POLL_LOCK_TTL = 900; // 15 minutes

export async function pollSubscriptions(env: Env) {
  const existingLock = await env.KV.get(POLL_LOCK_KEY);
  if (existingLock) {
    const elapsedMs = Date.now() - parseInt(existingLock, 10);
    if (elapsedMs < POLL_LOCK_TTL * 1000) {
      return { skipped: true, reason: 'lock_held' };
    }
  }

  await env.KV.put(POLL_LOCK_KEY, Date.now().toString(), { expirationTtl: POLL_LOCK_TTL });
  try {
    // ... polling logic ...
  } finally {
    await env.KV.delete(POLL_LOCK_KEY);
  }
}
```

### 3.3 Adaptive Polling Intervals

| Channel Activity                 | Polling Interval |
| -------------------------------- | ---------------- |
| Very active (daily uploads)      | 1 hour           |
| Active (weekly uploads)          | 4 hours          |
| Moderate (monthly uploads)       | 12 hours         |
| Inactive (no uploads in 30 days) | 24 hours         |

### 3.4 Token Refresh Management

Both providers' tokens expire in ~1 hour. Always refresh proactively (5 min before expiry) and persist rotated refresh tokens:

```typescript
async function getValidToken(connection: ProviderConnection, env: Env): Promise<string> {
  const now = Date.now();
  const bufferMs = 5 * 60 * 1000;

  if (connection.tokenExpiresAt - bufferMs > now) {
    return decrypt(connection.accessToken, env.ENCRYPTION_KEY);
  }

  // Refresh and persist (including any rotated refresh token)
  const refreshed = await refreshToken(connection, env);
  await persistTokens(connection.id, refreshed, env);
  return refreshed.accessToken;
}
```

### 3.4.1 Concurrent Token Refresh Handling

Use distributed locks to prevent race conditions:

```typescript
const REFRESH_LOCK_TTL = 30; // seconds

async function getValidTokenWithLock(connection: ProviderConnection, env: Env) {
  const lockKey = `token:refresh:${connection.id}`;
  const lockAcquired = await tryAcquireLock(env.KV, lockKey, REFRESH_LOCK_TTL);

  if (!lockAcquired) {
    await sleep(2000);
    const updated = await getConnectionById(connection.id, env);
    if (updated && updated.tokenExpiresAt > Date.now()) {
      return decrypt(updated.accessToken, env.ENCRYPTION_KEY);
    }
    throw new Error('Token refresh in progress by another worker');
  }

  try {
    const refreshed = await refreshToken(connection, env);
    await persistTokens(connection.id, refreshed, env);
    return refreshed.accessToken;
  } finally {
    await releaseLock(env.KV, lockKey);
  }
}
```

### 3.6 YouTube API Quota Management

**Daily Quota**: 10,000 units (default), resets at midnight Pacific Time.

| Operation            | Cost | Notes                  |
| -------------------- | ---- | ---------------------- |
| `channels.list`      | 1    | Cache uploads playlist |
| `playlistItems.list` | 1    | Main polling call      |
| `search.list`        | 100  | Avoid when possible    |

**Capacity with Adaptive Polling**: ~60 users with 10 subs each, or ~120 users with 5 subs each.

**Quota Tracking**: Store quota state in KV, track by Pacific Time day, implement graceful degradation when approaching limits.

### 3.7 Rate Limiting Strategy

Implement `RateLimitedFetcher` with:

- Exponential backoff with jitter
- Respect `retry-after` headers
- Distributed state via KV
- Pre-emptive blocking when rate limited

### 3.8 High Subscription Count Handling

For users with 100+ subscriptions:

- Spread requests across polling intervals
- Apply adaptive polling multipliers
- Implement priority queue based on channel activity and user engagement

### 3.9 YouTube Push Notifications (PubSubHubbub)

YouTube supports push notifications via PubSubHubbub, eliminating polling:

```typescript
async function subscribeToYouTubeChannel(channelId: string, env: Env) {
  const callbackUrl = `${CALLBACK_BASE_URL}?channel=${channelId}`;
  const topicUrl = `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`;

  await fetch('https://pubsubhubbub.appspot.com/subscribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      'hub.callback': callbackUrl,
      'hub.topic': topicUrl,
      'hub.mode': 'subscribe',
      'hub.lease_seconds': '432000', // 5 days
    }),
  });
}
```

**Benefits**: Zero quota cost, near real-time notifications, scales infinitely.

**Hybrid Approach**: Use push + fallback polling for reliability.

---

## 4. Ingestion Pipeline

### 4.1 Flow Diagram

```
Cron Trigger → Poll Scheduler → Provider Fetcher → Ingestion Processor
                                    │                    │
                                    │                    ├─ Check idempotency
                                    │                    ├─ Upsert canonical item
                                    │                    ├─ Create user_item (INBOX)
                                    └────────────────────└─ Update subscription
```

### 4.2 Item Transformation

```typescript
function transformYouTubeVideo(playlistItem: YouTubeVideo): NewItem {
  const videoId = playlistItem.contentDetails?.videoId;
  return {
    id: ulid(),
    contentType: 'VIDEO',
    provider: 'YOUTUBE',
    providerId: videoId,
    canonicalUrl: `https://www.youtube.com/watch?v=${videoId}`,
    title: playlistItem.snippet?.title || '',
    creator: playlistItem.snippet?.channelTitle || '',
    publishedAt: new Date(playlistItem.snippet.publishedAt).getTime(),
  };
}

function transformSpotifyEpisode(episode: SpotifyEpisode, showName: string): NewItem {
  return {
    id: ulid(),
    contentType: 'PODCAST',
    provider: 'SPOTIFY',
    providerId: episode.id,
    canonicalUrl: episode.external_urls.spotify,
    title: episode.name,
    creator: showName,
    durationSeconds: Math.floor(episode.duration_ms / 1000),
    publishedAt: new Date(episode.release_date).getTime(),
  };
}
```

### 4.3 Idempotent Ingestion

Use transactions to ensure atomicity:

```typescript
async function ingestItem(userId, subscriptionId, rawItem, provider, db) {
  // 1. Check idempotency (outside transaction is fine for reads)
  const seen = await db.query.providerItemsSeen.findFirst({
    where: and(
      eq(providerItemsSeen.userId, userId),
      eq(providerItemsSeen.provider, provider),
      eq(providerItemsSeen.providerItemId, rawItem.id)
    ),
  });

  if (seen) return { created: false };

  // 2-5. Atomic writes
  return await db.transaction(async (tx) => {
    const item = await findOrCreateCanonicalItem(
      provider,
      rawItem.id,
      () => transform(rawItem),
      tx
    );

    await tx.insert(userItems).values({ id: ulid(), userId, itemId: item.id, state: 'INBOX' });
    await tx
      .insert(subscriptionItems)
      .values({ subscriptionId, itemId: item.id, providerItemId: rawItem.id });
    await tx
      .insert(providerItemsSeen)
      .values({ userId, provider, providerItemId: rawItem.id, sourceId: null });

    return { created: true, userItemId };
  });
}
```

### 4.4 Initial Fetch Semantics

**Definition of "Latest"**:

- **YouTube**: First public, already-published video in uploads playlist (by upload order)
- **Spotify**: First episode with `release_date <= today`

**Edge Cases**:

- Skip scheduled/upcoming content
- Handle empty/new channels gracefully
- Use playlist order (not `publishedAt` sort) for YouTube

---

## 5. API Design

### 5.1 tRPC Router Structure

```typescript
export const subscriptionsRouter = router({
  // Provider Connections
  connections: router({
    list: protectedProcedure.query(/* returns user's connected providers */),
    registerState: protectedProcedure.input(z.object({ provider, state })).mutation(/* stores state */),
    callback: protectedProcedure.input(z.object({ provider, code, state, codeVerifier })).mutation(/* exchanges tokens */),
    disconnect: protectedProcedure.input(z.object({ provider })).mutation(/* revoke connection */),
  }),

  // Discovery
  discover: router({
    available: protectedProcedure.input(z.object({ provider })).query(/* user's subscriptions */),
    search: protectedProcedure.input(z.object({ provider, query })).query(/* search channels */),
  }),

  // Management
  list: protectedProcedure.input(z.object({ provider?, status?, limit, cursor })).query(/* paginated list */),
  add: protectedProcedure.input(z.object({ provider, providerChannelId, name?, imageUrl? })).mutation(/* subscribe */),
  remove: protectedProcedure.input(z.object({ subscriptionId })).mutation(/* unsubscribe */),
  pause: protectedProcedure.input(z.object({ subscriptionId })).mutation(/* pause polling */),
  resume: protectedProcedure.input(z.object({ subscriptionId })).mutation(/* resume polling */),
  syncNow: protectedProcedure.input(z.object({ subscriptionId })).mutation(/* manual sync */),
});
```

### 5.2 tRPC Contract (Input/Output Schemas)

These Zod schemas define the API contract. They should be exported from `packages/shared/src/schemas/index.ts` for use by both frontend and backend.

#### Connection Endpoints

```typescript
// connections.registerState
export const RegisterOAuthStateInput = z.object({
  provider: z.enum(['YOUTUBE', 'SPOTIFY']),
  state: z.string().uuid(),
});
// Returns: { success: boolean }

// connections.callback
export const OAuthCallbackInput = z.object({
  provider: z.enum(['YOUTUBE', 'SPOTIFY']),
  code: z.string().min(1),
  state: z.string().uuid(),
  codeVerifier: z.string().min(43).max(128),
});
// Returns: { success: boolean }

// connections.list
// Input: none (uses ctx.userId)
// Returns: { YOUTUBE: ConnectionInfo | null, SPOTIFY: ConnectionInfo | null }

export const ConnectionInfo = z.object({
  provider: z.enum(['YOUTUBE', 'SPOTIFY']),
  status: z.enum(['ACTIVE', 'EXPIRED', 'REVOKED']),
  connectedAt: z.number(),
  lastRefreshedAt: z.number().nullable(),
});

// connections.disconnect
export const DisconnectInput = z.object({
  provider: z.enum(['YOUTUBE', 'SPOTIFY']),
});
// Returns: { success: boolean }
```

#### Subscription Endpoints

```typescript
// subscriptions.list
export const ListSubscriptionsInput = z.object({
  provider: z.enum(['YOUTUBE', 'SPOTIFY']).optional(),
  status: z.enum(['ACTIVE', 'PAUSED', 'DISCONNECTED', 'UNSUBSCRIBED']).optional(),
  limit: z.number().min(1).max(100).default(50),
  cursor: z.string().optional(),
});

export const ListSubscriptionsResponse = z.object({
  items: z.array(SubscriptionSchema),
  nextCursor: z.string().nullable(),
  hasMore: z.boolean(),
});

export const SubscriptionSchema = z.object({
  id: z.string(),
  userId: z.string(),
  provider: z.enum(['YOUTUBE', 'SPOTIFY']),
  providerChannelId: z.string(),
  creatorId: z.string().nullable(),
  name: z.string(),
  description: z.string().nullable(),
  imageUrl: z.string().nullable(),
  externalUrl: z.string().nullable(),
  totalItems: z.number().nullable(),
  lastPublishedAt: z.number().nullable(),
  lastPolledAt: z.number().nullable(),
  pollIntervalSeconds: z.number(),
  status: z.enum(['ACTIVE', 'PAUSED', 'DISCONNECTED', 'UNSUBSCRIBED']),
  disconnectedAt: z.number().nullable(),
  disconnectedReason: z.string().nullable(),
  createdAt: z.number(),
  updatedAt: z.number(),
});

// subscriptions.add
export const AddSubscriptionInput = z.object({
  provider: z.enum(['YOUTUBE', 'SPOTIFY']),
  providerChannelId: z.string().min(1),
  name: z.string().optional(),
  imageUrl: z.string().url().optional(),
});
// Returns: { subscriptionId: string, name: string, imageUrl: string | null }

// subscriptions.remove
export const RemoveSubscriptionInput = z.object({
  subscriptionId: z.string(),
});
// Returns: { success: boolean }

// subscriptions.pause / subscriptions.resume
export const PauseResumeInput = z.object({
  subscriptionId: z.string(),
});
// Returns: { success: boolean }

// subscriptions.syncNow
export const SyncNowInput = z.object({
  subscriptionId: z.string(),
});
// Returns: { success: boolean, itemsFound: number }
```

#### Discovery Endpoints

```typescript
// discover.available
export const DiscoverAvailableInput = z.object({
  provider: z.enum(['YOUTUBE', 'SPOTIFY']),
});

export const DiscoverAvailableResponse = z.array(
  z.object({
    providerChannelId: z.string(),
    name: z.string(),
    description: z.string().nullable(),
    imageUrl: z.string().nullable(),
    subscriberCount: z.number().nullable(),
    isSubscribed: z.boolean(),
  })
);

// discover.search
export const SearchChannelsInput = z.object({
  provider: z.enum(['YOUTUBE', 'SPOTIFY']),
  query: z.string().min(1).max(100),
  limit: z.number().min(1).max(50).default(20),
});
// Returns: same shape as DiscoverAvailableResponse
```

### 5.1.1 Paginated Subscriptions List

Cursor-based pagination for mobile infinite scroll:

```typescript
list: protectedProcedure
  .input(z.object({ limit: z.number().default(50), cursor: z.string().optional() }))
  .query(async ({ ctx, input }) => {
    const results = await ctx.db.query.subscriptions.findMany({
      where: cursor ? gt(subscriptions.id, cursor) : undefined,
      orderBy: [asc(subscriptions.id)],
      limit: input.limit + 1,
    });

    const hasMore = results.length > input.limit;
    const items = hasMore ? results.slice(0, -1) : results;

    return { items, nextCursor: hasMore ? items[items.length - 1].id : null, hasMore };
  }),
```

### 5.1.2 Manual Sync (Sync Now)

Rate-limited endpoint for user-triggered polls:

```typescript
syncNow: protectedProcedure
  .input(z.object({ subscriptionId: z.string() }))
  .mutation(async ({ ctx, input }) => {
    // Rate limit: 1 per 5 minutes per subscription
    const rateLimitKey = `manual-sync:${input.subscriptionId}`;
    const lastSync = await env.KV.get(rateLimitKey);
    if (lastSync && Date.now() - parseInt(lastSync) < 5 * 60 * 1000) {
      throw new TRPCError({ code: 'TOO_MANY_REQUESTS' });
    }

    const result = await pollSubscriptionWithRetry(subscription, connection, env);
    await env.KV.put(rateLimitKey, Date.now().toString(), { expirationTtl: 300 });

    return { success: result.success, itemsFound: result.itemsFound };
  }),
```

### 5.3 Unsubscribe Behavior

| Table                 | Action      | Rationale                           |
| --------------------- | ----------- | ----------------------------------- |
| `subscriptions`       | Soft delete | Preserves metadata for re-subscribe |
| `subscription_items`  | Hard delete | Tracking records have no value      |
| `user_items` (INBOX)  | Hard delete | User hasn't committed to these      |
| `user_items` (other)  | Preserved   | User's bookmarked/archived content  |
| `provider_items_seen` | Preserved   | Prevents duplicates on re-subscribe |

---

## 6. Security Considerations

### 6.1 Token Storage

Encrypt OAuth tokens using AES-256-GCM:

```typescript
async function encrypt(text: string, keyHex: string): Promise<string> {
  const key = await importKey(keyHex);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    new TextEncoder().encode(text)
  );
  return `${bytesToHex(iv)}:${bytesToHex(new Uint8Array(ciphertext))}`;
}
```

### 6.1.1 Decryption Error Handling

| Error Code              | Cause                    | Strategy                    |
| ----------------------- | ------------------------ | --------------------------- |
| `KEY_VERSION_NOT_FOUND` | Key rotation in progress | Log + skip, retry next poll |
| `INVALID_FORMAT`        | Data corruption          | Mark EXPIRED immediately    |
| `DECRYPTION_FAILED`     | Wrong key or corruption  | Retry 3x, then EXPIRED      |

### 6.2 OAuth State Validation

```typescript
async function generateOAuthState(userId: string, env: Env): Promise<string> {
  const state = crypto.randomUUID();
  await env.KV.put(`oauth:state:${state}`, userId, { expirationTtl: 1800 });
  return state;
}
```

### 6.4 Connection Health & Recovery

```
ACTIVE → EXPIRED (refresh fails) → REVOKED (user revoked access)
                    ↓
           User reconnects → ACTIVE
```

### 6.5 PKCE Summary

**Server MUST NOT**:

- Generate PKCE verifier/challenge (defeats security)
- Return pre-built auth URL (client needs its own challenge)
- Store PKCE verifier (only client should have it)

### 6.6 Encryption Key Rotation

Support versioned ciphertext format: `v{version}:{iv}:{authTag}:{ciphertext}`

**Zero-downtime rotation**:

1. Deploy new key alongside old
2. Run migration job to re-encrypt tokens
3. Verify migration complete
4. Remove old key after grace period

### 6.7 User Notifications

Notification triggers:

- Connection expired/revoked
- 3+ consecutive poll failures
- Rate limit/quota warnings

Store in `user_notifications` table with deduplication and auto-resolution.

---

## Wrangler Configuration

```toml
[triggers]
crons = [
  "*/15 * * * *",    # Poll subscriptions every 15 min
  "0 4 * * *",       # Renew PubSubHubbub leases daily
  "0 */6 * * *",     # YouTube fallback polling every 6 hours
  "0 3 * * 0"        # Cleanup job Sundays at 3 AM
]

[[queues.consumers]]
queue = "youtube-notifications"
max_batch_size = 10
max_retries = 3
```
