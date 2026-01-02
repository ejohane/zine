# Zine Provider Connections: YouTube & Spotify Integration

This document provides comprehensive documentation on how Zine connects to YouTube and Spotify, manages OAuth tokens, fetches subscriptions, and syncs content into users' inboxes.

## Table of Contents

1. [Overview](#overview)
2. [OAuth Flow](#oauth-flow)
3. [Token Storage and Encryption](#token-storage-and-encryption)
4. [Provider Implementations](#provider-implementations)
5. [Subscription Management](#subscription-management)
6. [Polling and Sync Mechanisms](#polling-and-sync-mechanisms)
7. [Data Ingestion Pipeline](#data-ingestion-pipeline)
8. [Frontend Integration](#frontend-integration)
9. [Complete End-to-End Flow](#complete-end-to-end-flow)
10. [Database Schema Reference](#database-schema-reference)
11. [Error Handling](#error-handling)
12. [Key Files Reference](#key-files-reference)

---

## Overview

Zine enables users to connect their YouTube and Spotify accounts to aggregate content from their subscribed channels and podcasts into a unified inbox. The system implements:

- **OAuth 2.0 with PKCE** for secure authorization
- **AES-256-GCM encryption** for token storage
- **Distributed locking** for safe token refresh
- **Adaptive polling** based on content frequency
- **Idempotent ingestion** to prevent duplicate items

### Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              Mobile App                                      │
├─────────────────────────────────────────────────────────────────────────────┤
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐    │
│  │  OAuth Flow  │  │ Connections  │  │Subscriptions │  │    Inbox     │    │
│  │  (lib/oauth) │  │   Screen     │  │   Screens    │  │   Screen     │    │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘    │
│         │                 │                 │                 │             │
│         └─────────────────┴─────────────────┴─────────────────┘             │
│                                    │                                         │
│                              tRPC Client                                     │
└────────────────────────────────────┼─────────────────────────────────────────┘
                                     │
                                     ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           Cloudflare Worker                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │                          tRPC Router                                  │   │
│  │  ┌────────────┐  ┌────────────────┐  ┌─────────────┐  ┌───────────┐ │   │
│  │  │connections │  │ subscriptions  │  │   items     │  │   inbox   │ │   │
│  │  │   router   │  │    router      │  │   router    │  │   router  │ │   │
│  │  └─────┬──────┘  └───────┬────────┘  └──────┬──────┘  └─────┬─────┘ │   │
│  └────────┼─────────────────┼──────────────────┼───────────────┼───────┘   │
│           │                 │                  │               │            │
│  ┌────────▼─────────────────▼──────────────────▼───────────────▼───────┐   │
│  │                         Services Layer                               │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌──────────────┐                 │   │
│  │  │Token Refresh│  │Initial Fetch│  │  Ingestion   │                 │   │
│  │  │   Service   │  │   Service   │  │  Processor   │                 │   │
│  │  └──────┬──────┘  └──────┬──────┘  └──────┬───────┘                 │   │
│  │         │                │                │                          │   │
│  │  ┌──────▼────────────────▼────────────────▼──────────────────────┐  │   │
│  │  │                    Provider Clients                            │  │   │
│  │  │  ┌─────────────────────┐  ┌─────────────────────┐             │  │   │
│  │  │  │   YouTube Client    │  │   Spotify Client    │             │  │   │
│  │  │  │ (googleapis SDK)    │  │ (web-api-ts-sdk)    │             │  │   │
│  │  │  └─────────────────────┘  └─────────────────────┘             │  │   │
│  │  └────────────────────────────────────────────────────────────────┘  │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│                                     │                                        │
│  ┌──────────────────────────────────▼───────────────────────────────────┐   │
│  │                         Data Layer                                    │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  │   │
│  │  │    D1       │  │     KV      │  │   Crypto    │  │   Locks     │  │   │
│  │  │  (SQLite)   │  │ (OAuth State)│  │ (AES-256)  │  │(Distributed)│  │   │
│  │  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘  │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
                                     │
         ┌───────────────────────────┼───────────────────────────┐
         │                           │                           │
         ▼                           ▼                           ▼
┌─────────────────┐        ┌─────────────────┐        ┌─────────────────┐
│  YouTube API    │        │  Spotify API    │        │ Google OAuth    │
│  (Data v3)      │        │  (Web API)      │        │ Spotify OAuth   │
└─────────────────┘        └─────────────────┘        └─────────────────┘
```

---

## OAuth Flow

Zine uses OAuth 2.0 with PKCE (Proof Key for Code Exchange) to securely connect user accounts without exposing client secrets on the mobile device.

### PKCE Overview

PKCE adds an additional layer of security to the OAuth flow by generating a `code_verifier` and `code_challenge`:

```
┌────────────────┐                                    ┌────────────────┐
│   Mobile App   │                                    │    Backend     │
└───────┬────────┘                                    └───────┬────────┘
        │                                                     │
        │  1. Generate code_verifier (random 32 bytes)        │
        │  2. Compute code_challenge = SHA256(verifier)       │
        │                                                     │
        │  3. Store verifier in SecureStore                   │
        │                                                     │
        │  4. Generate state = "PROVIDER:uuid"                │
        │                                                     │
        │───────── 5. Register state with server ────────────►│
        │                                                     │
        │◄──────────── 6. State registered ──────────────────│
        │                                                     │
        │  7. Open browser with:                              │
        │     - client_id                                     │
        │     - redirect_uri                                  │
        │     - code_challenge                                │
        │     - code_challenge_method=S256                    │
        │     - state                                         │
        │     - scope                                         │
        │                                                     │
```

### OAuth Configuration

**File:** `apps/mobile/lib/oauth.ts:84-99`

```typescript
const OAUTH_CONFIG = {
  YOUTUBE: {
    clientId: process.env.EXPO_PUBLIC_YOUTUBE_CLIENT_ID,
    authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    scopes: [
      'https://www.googleapis.com/auth/youtube.readonly',
      'https://www.googleapis.com/auth/userinfo.email',
      'https://www.googleapis.com/auth/userinfo.profile',
    ],
  },
  SPOTIFY: {
    clientId: process.env.EXPO_PUBLIC_SPOTIFY_CLIENT_ID,
    authUrl: 'https://accounts.spotify.com/authorize',
    scopes: ['user-library-read'],
  },
};
```

### State Generation and Validation

The state parameter serves dual purposes:

1. **CSRF Protection**: Ensures the callback originated from our auth request
2. **Provider Identification**: The prefix helps the callback handler locate the correct SecureStore keys

**State Format:** `{PROVIDER}:{uuid}`

Example: `YOUTUBE:550e8400-e29b-41d4-a716-446655440000`

**Backend State Registration (`apps/worker/src/trpc/routers/connections.ts:61-75`):**

```typescript
registerState: protectedProcedure
  .input(z.object({
    state: z.string().min(1),
    provider: z.enum(['YOUTUBE', 'SPOTIFY'])
  }))
  .mutation(async ({ ctx, input }) => {
    const key = `oauth:state:${input.state}`;

    // Check for replay attacks
    const existing = await ctx.env.KV.get(key);
    if (existing) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'State already registered' });
    }

    // Store state → userId mapping with 30-minute TTL
    await ctx.env.KV.put(key, ctx.auth.userId, { expirationTtl: 1800 });

    return { registered: true };
  }),
```

### Mobile OAuth Flow

**File:** `apps/mobile/lib/oauth.ts:284-421`

The `connectProvider()` function orchestrates the complete flow:

```typescript
export async function connectProvider(
  provider: Provider,
  trpcClient: TRPCClient
): Promise<OAuthResult> {
  // Step 1: Generate PKCE
  const { verifier, challenge } = await generatePKCE();

  // Step 2: Store verifier securely
  await SecureStore.setItemAsync(`oauth_verifier_${provider}`, verifier);

  // Step 3: Generate state with provider prefix
  const state = `${provider}:${crypto.randomUUID()}`;

  // Step 4: Register state with backend
  await trpcClient.connections.registerState.mutate({ state, provider });
  await SecureStore.setItemAsync(`oauth_state_${provider}`, state);

  // Step 5: Build authorization URL
  const config = OAUTH_CONFIG[provider];
  const authUrl = buildAuthUrl({
    baseUrl: config.authUrl,
    clientId: config.clientId,
    redirectUri: `${APP_SCHEME}://oauth/callback`,
    scope: config.scopes.join(' '),
    state,
    codeChallenge: challenge,
    codeChallengeMethod: 'S256',
    responseType: 'code',
    accessType: 'offline', // For refresh tokens
    prompt: 'consent', // Always show consent to get refresh token
  });

  // Step 6: Open browser and wait for redirect
  const result = await WebBrowser.openAuthSessionAsync(authUrl, redirectUri);

  if (result.type !== 'success') {
    throw new OAuthError('User cancelled or browser error');
  }

  // Step 7: Extract code and validate state
  const { code, state: returnedState } = parseRedirectUrl(result.url);
  const storedState = await SecureStore.getItemAsync(`oauth_state_${provider}`);

  if (returnedState !== storedState) {
    throw new OAuthError('State mismatch - possible CSRF attack');
  }

  // Step 8: Exchange code for tokens
  const storedVerifier = await SecureStore.getItemAsync(`oauth_verifier_${provider}`);
  await trpcClient.connections.callback.mutate({
    provider,
    code,
    codeVerifier: storedVerifier,
  });

  // Step 9: Cleanup
  await SecureStore.deleteItemAsync(`oauth_verifier_${provider}`);
  await SecureStore.deleteItemAsync(`oauth_state_${provider}`);

  return { success: true, provider };
}
```

### Backend Token Exchange

**File:** `apps/worker/src/trpc/routers/connections.ts:97-180`

```typescript
callback: protectedProcedure
  .input(z.object({
    provider: z.enum(['YOUTUBE', 'SPOTIFY']),
    code: z.string(),
    codeVerifier: z.string(),
  }))
  .mutation(async ({ ctx, input }) => {
    // Step 1: Validate state
    const stateKey = `oauth:state:${input.state}`;
    const storedUserId = await ctx.env.KV.get(stateKey);

    if (storedUserId !== ctx.auth.userId) {
      throw new TRPCError({ code: 'FORBIDDEN', message: 'Invalid state' });
    }

    // Delete state (one-time use)
    await ctx.env.KV.delete(stateKey);

    // Step 2: Exchange code for tokens
    const tokenUrl = input.provider === 'YOUTUBE'
      ? 'https://oauth2.googleapis.com/token'
      : 'https://accounts.spotify.com/api/token';

    const tokenResponse = await fetch(tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code: input.code,
        redirect_uri: REDIRECT_URI,
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        code_verifier: input.codeVerifier,
      }),
    });

    const tokens = await tokenResponse.json();

    // Step 3: Get provider user ID for deduplication
    const providerUserId = await getProviderUserId(input.provider, tokens.access_token);

    // Step 4: Encrypt tokens
    const encryptedAccessToken = await encrypt(tokens.access_token, ctx.env.ENCRYPTION_KEY);
    const encryptedRefreshToken = await encrypt(tokens.refresh_token, ctx.env.ENCRYPTION_KEY);

    // Step 5: Upsert connection (insert or update on conflict)
    await ctx.db
      .insert(providerConnections)
      .values({
        id: ulid(),
        userId: ctx.auth.userId,
        provider: input.provider,
        providerUserId,
        accessToken: encryptedAccessToken,
        refreshToken: encryptedRefreshToken,
        tokenExpiresAt: Date.now() + tokens.expires_in * 1000,
        scopes: input.provider === 'YOUTUBE'
          ? 'youtube.readonly,userinfo.email,userinfo.profile'
          : 'user-library-read',
        status: 'ACTIVE',
        connectedAt: Date.now(),
        lastRefreshedAt: Date.now(),
      })
      .onConflictDoUpdate({
        target: [providerConnections.userId, providerConnections.provider],
        set: {
          accessToken: encryptedAccessToken,
          refreshToken: encryptedRefreshToken,
          tokenExpiresAt: Date.now() + tokens.expires_in * 1000,
          status: 'ACTIVE',
          lastRefreshedAt: Date.now(),
        },
      });

    return { success: true };
  }),
```

---

## Token Storage and Encryption

### Encryption Algorithm

Zine uses **AES-256-GCM** for encrypting OAuth tokens before storage:

- **Key Size**: 256 bits (64 hex characters)
- **IV Size**: 96 bits (12 bytes), randomly generated per encryption
- **Mode**: GCM (Galois/Counter Mode) - provides authenticated encryption

**File:** `apps/worker/src/lib/crypto.ts:1-150`

```typescript
// Storage format: {iv}:{ciphertext} (hex-encoded)
// Versioned format: v{version}:{iv}:{ciphertext}

export async function encrypt(plaintext: string, keyHex: string): Promise<string> {
  // Generate random 12-byte IV
  const iv = crypto.getRandomValues(new Uint8Array(12));

  // Import key
  const key = await crypto.subtle.importKey(
    'raw',
    hexToBytes(keyHex),
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt']
  );

  // Encrypt
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    new TextEncoder().encode(plaintext)
  );

  // Format: iv:ciphertext (hex)
  return `${bytesToHex(iv)}:${bytesToHex(new Uint8Array(ciphertext))}`;
}

export async function decrypt(encrypted: string, keyHex: string): Promise<string> {
  const [ivHex, ciphertextHex] = encrypted.split(':');

  const key = await crypto.subtle.importKey(
    'raw',
    hexToBytes(keyHex),
    { name: 'AES-GCM', length: 256 },
    false,
    ['decrypt']
  );

  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: hexToBytes(ivHex) },
    key,
    hexToBytes(ciphertextHex)
  );

  return new TextDecoder().decode(plaintext);
}
```

### Key Rotation Support

**File:** `apps/worker/src/lib/crypto.ts:247-511`

The system supports key rotation with versioned ciphertext:

```typescript
// Versioned format: v{version}:{iv}:{ciphertext}

export function getEncryptionKeys(env: Env): EncryptionKeys {
  return {
    current: {
      version: parseInt(env.ENCRYPTION_KEY_VERSION || '1'),
      key: env.ENCRYPTION_KEY,
    },
    previous: env.ENCRYPTION_KEY_PREVIOUS
      ? {
          version: parseInt(env.ENCRYPTION_KEY_VERSION || '1') - 1,
          key: env.ENCRYPTION_KEY_PREVIOUS,
        }
      : undefined,
  };
}

export async function encryptWithVersion(plaintext: string, keys: EncryptionKeys): Promise<string> {
  const encrypted = await encrypt(plaintext, keys.current.key);
  return `v${keys.current.version}:${encrypted}`;
}

export async function decryptWithVersion(encrypted: string, keys: EncryptionKeys): Promise<string> {
  // Parse version from ciphertext
  const match = encrypted.match(/^v(\d+):(.+)$/);

  if (!match) {
    // Legacy format (no version prefix) - use current key
    return decrypt(encrypted, keys.current.key);
  }

  const [, version, payload] = match;
  const keyVersion = parseInt(version);

  // Select appropriate key based on version
  if (keyVersion === keys.current.version) {
    return decrypt(payload, keys.current.key);
  } else if (keys.previous && keyVersion === keys.previous.version) {
    return decrypt(payload, keys.previous.key);
  }

  throw new Error(`Unknown encryption key version: ${keyVersion}`);
}

// Re-encrypt old ciphertexts with current key
export async function reEncryptWithCurrentVersion(
  encrypted: string,
  keys: EncryptionKeys
): Promise<string> {
  const plaintext = await decryptWithVersion(encrypted, keys);
  return encryptWithVersion(plaintext, keys);
}
```

### Token Refresh with Distributed Locking

**File:** `apps/worker/src/lib/token-refresh.ts:1-340`

To prevent race conditions when multiple requests try to refresh the same token:

```typescript
const REFRESH_BUFFER_MS = 5 * 60 * 1000; // 5 minutes before expiry
const LOCK_TTL_MS = 30_000; // 30-second lock

export async function getValidAccessToken(
  connection: ProviderConnection,
  env: Env,
  db: DrizzleD1Database
): Promise<string> {
  // Check if token is still valid (with buffer)
  if (connection.tokenExpiresAt && connection.tokenExpiresAt > Date.now() + REFRESH_BUFFER_MS) {
    return decrypt(connection.accessToken, env.ENCRYPTION_KEY);
  }

  // Token needs refresh - acquire distributed lock
  const lockKey = `token_refresh:${connection.id}`;
  const lockAcquired = await tryAcquireLock(env.KV, lockKey, LOCK_TTL_MS);

  if (!lockAcquired) {
    // Another process is refreshing - wait and read updated token
    await sleep(2000);
    const updated = await db.query.providerConnections.findFirst({
      where: eq(providerConnections.id, connection.id),
    });

    if (updated && updated.tokenExpiresAt > Date.now()) {
      return decrypt(updated.accessToken, env.ENCRYPTION_KEY);
    }

    throw new Error('Token refresh in progress but not completed');
  }

  try {
    // Perform the actual refresh
    return await refreshToken(connection, env, db);
  } finally {
    await releaseLock(env.KV, lockKey);
  }
}

async function refreshToken(
  connection: ProviderConnection,
  env: Env,
  db: DrizzleD1Database
): Promise<string> {
  const tokenUrl =
    connection.provider === 'YOUTUBE'
      ? 'https://oauth2.googleapis.com/token'
      : 'https://accounts.spotify.com/api/token';

  const refreshToken = await decrypt(connection.refreshToken, env.ENCRYPTION_KEY);

  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: env[`${connection.provider}_CLIENT_ID`],
      client_secret: env[`${connection.provider}_CLIENT_SECRET`],
    }),
  });

  if (!response.ok) {
    // Mark connection as expired
    await db
      .update(providerConnections)
      .set({ status: 'EXPIRED' })
      .where(eq(providerConnections.id, connection.id));

    throw new Error(`Token refresh failed: ${response.status}`);
  }

  const tokens = await response.json();

  // Encrypt new tokens
  const encryptedAccessToken = await encrypt(tokens.access_token, env.ENCRYPTION_KEY);

  // Handle rotated refresh token (Spotify may rotate)
  const encryptedRefreshToken = tokens.refresh_token
    ? await encrypt(tokens.refresh_token, env.ENCRYPTION_KEY)
    : connection.refreshToken;

  // Update database
  await db
    .update(providerConnections)
    .set({
      accessToken: encryptedAccessToken,
      refreshToken: encryptedRefreshToken,
      tokenExpiresAt: Date.now() + tokens.expires_in * 1000,
      lastRefreshedAt: Date.now(),
    })
    .where(eq(providerConnections.id, connection.id));

  return tokens.access_token;
}
```

---

## Provider Implementations

### YouTube Provider

**File:** `apps/worker/src/providers/youtube.ts:1-340`

The YouTube provider uses the `googleapis` package to interact with the YouTube Data API v3.

#### Client Factory

```typescript
export function createYouTubeClient(accessToken: string): YouTubeClient {
  const oauth2Client = new google.auth.OAuth2();
  oauth2Client.setCredentials({ access_token: accessToken });

  const api = google.youtube({ version: 'v3', auth: oauth2Client });

  return { api, oauth2Client };
}
```

#### Key Functions

| Function                        | Purpose                                   | Quota Cost    |
| ------------------------------- | ----------------------------------------- | ------------- |
| `getChannelUploadsPlaylistId()` | Get the uploads playlist ID for a channel | 1 unit        |
| `fetchRecentVideos()`           | Fetch videos from a playlist              | 1 unit        |
| `getUserSubscriptions()`        | Get user's YouTube subscriptions          | 1 unit        |
| `searchChannels()`              | Search for channels by keyword            | **100 units** |
| `getChannelDetails()`           | Get channel metadata                      | 1 unit        |

#### Implementation Details

```typescript
// Get uploads playlist for a channel
export async function getChannelUploadsPlaylistId(
  client: YouTubeClient,
  channelId: string
): Promise<string | null> {
  const response = await client.api.channels.list({
    part: ['contentDetails'],
    id: [channelId],
  });

  return response.data.items?.[0]?.contentDetails?.relatedPlaylists?.uploads ?? null;
}

// Fetch recent videos from a playlist
export async function fetchRecentVideos(
  client: YouTubeClient,
  playlistId: string,
  maxResults: number = 10
): Promise<youtube_v3.Schema$PlaylistItem[]> {
  const response = await client.api.playlistItems.list({
    part: ['snippet', 'contentDetails', 'status'],
    playlistId,
    maxResults,
  });

  // Filter out private/deleted videos
  return (response.data.items ?? []).filter((item) => item.status?.privacyStatus === 'public');
}

/**
 * Get the authenticated user's YouTube subscriptions (single page).
 * For fetching ALL subscriptions, use getAllUserSubscriptions().
 *
 * YouTube API Cost: 1 quota unit
 *
 * @param client - Authenticated YouTube client
 * @param maxResults - Maximum subscriptions to fetch (default: 50, max: 50)
 * @returns Array of subscription objects with channel details
 */
export async function getUserSubscriptions(
  client: YouTubeClient,
  maxResults: number = 50
): Promise<youtube_v3.Schema$Subscription[]>;

/**
 * Get ALL user subscriptions with automatic pagination.
 *
 * Fetches all pages of subscriptions for users with many subscriptions.
 * Use this when you need complete subscription data (e.g., discovery UI).
 *
 * YouTube API Cost: 1 quota unit per page (50 items per page)
 *
 * @param client - Authenticated YouTube client
 * @param maxSubscriptions - Maximum subscriptions to fetch (default: 500)
 * @returns Array of all subscriptions up to maxSubscriptions
 *
 * @example
 * // Fetch all subscriptions (up to 500)
 * const allSubs = await getAllUserSubscriptions(client);
 *
 * // Fetch up to 100 subscriptions
 * const subs = await getAllUserSubscriptions(client, 100);
 */
export async function getAllUserSubscriptions(
  client: YouTubeClient,
  maxSubscriptions: number = 500
): Promise<youtube_v3.Schema$Subscription[]>;
```

### When to Use Which Function

| Function                  | Use Case                        | Quota Cost |
| ------------------------- | ------------------------------- | ---------- |
| `getUserSubscriptions`    | Quick check, single page needed | 1 unit     |
| `getAllUserSubscriptions` | Discovery UI, complete list     | 1-10 units |

For the discovery UI (`discover.available` endpoint), always use
`getAllUserSubscriptions` to ensure users see all their subscriptions.

### YouTube Quota Management

**File:** `apps/worker/src/providers/youtube-quota.ts:1-515`

YouTube Data API has a daily quota of **10,000 units** (resets at midnight Pacific).

#### Quota Thresholds

```typescript
const DAILY_QUOTA = 10_000;
const WARNING_THRESHOLD = 0.8; // 8,000 units
const CRITICAL_THRESHOLD = 0.95; // 9,500 units
```

#### Tracking Implementation

```typescript
export async function trackQuotaUsage(
  kv: KVNamespace,
  operation: string,
  units: number
): Promise<QuotaStatus> {
  const today = getQuotaDateKey(); // Pacific timezone
  const key = `youtube:quota:${today}`;

  // Atomic increment using KV
  const current = parseInt((await kv.get(key)) ?? '0');
  const newTotal = current + units;

  await kv.put(key, newTotal.toString(), {
    // Auto-expire after 48 hours
    expirationTtl: 48 * 60 * 60,
  });

  return {
    used: newTotal,
    remaining: DAILY_QUOTA - newTotal,
    percentUsed: newTotal / DAILY_QUOTA,
    isWarning: newTotal >= DAILY_QUOTA * WARNING_THRESHOLD,
    isCritical: newTotal >= DAILY_QUOTA * CRITICAL_THRESHOLD,
  };
}

export async function canUseQuota(
  kv: KVNamespace,
  requiredUnits: number
): Promise<{ allowed: boolean; status: QuotaStatus }> {
  const status = await getQuotaStatus(kv);

  // At critical threshold, only allow essential operations (≤2 units)
  if (status.isCritical && requiredUnits > 2) {
    return { allowed: false, status };
  }

  // Don't exceed daily quota
  if (status.used + requiredUnits > DAILY_QUOTA) {
    return { allowed: false, status };
  }

  return { allowed: true, status };
}

// Wrapper for automatic tracking
export async function withQuotaTracking<T>(
  kv: KVNamespace,
  operation: string,
  units: number,
  fn: () => Promise<T>
): Promise<T> {
  const result = await fn();
  await trackQuotaUsage(kv, operation, units);
  return result;
}
```

#### Graceful Degradation

```typescript
export function calculateSafeBatchSize(
  status: QuotaStatus,
  idealBatchSize: number,
  unitsPerItem: number
): number {
  if (status.isCritical) {
    // Minimum viable batch
    return 1;
  }

  if (status.isWarning) {
    // Reduce to 10% of remaining quota
    const maxItems = Math.floor((status.remaining * 0.1) / unitsPerItem);
    return Math.min(idealBatchSize, maxItems, 10);
  }

  return idealBatchSize;
}
```

### Spotify Provider

**File:** `apps/worker/src/providers/spotify.ts:1-338`

The Spotify provider uses the `@spotify/web-api-ts-sdk` package.

#### Client Factory

```typescript
export function createSpotifyClient(accessToken: string): SpotifyApi {
  return SpotifyApi.withAccessToken(process.env.SPOTIFY_CLIENT_ID!, {
    access_token: accessToken,
    token_type: 'Bearer',
    expires_in: 3600, // Managed externally
    refresh_token: '', // Managed externally
  });
}
```

#### Key Functions

| Function                 | Purpose                               |
| ------------------------ | ------------------------------------- |
| `getUserSavedShows()`    | Get user's saved podcasts (paginated) |
| `getAllUserSavedShows()` | Fetch all saved shows (max 500)       |
| `getShowEpisodes()`      | Get episodes for a specific show      |
| `getLatestEpisode()`     | Get the single most recent episode    |
| `searchShows()`          | Search for podcasts by keyword        |

#### Implementation Details

```typescript
// Get user's saved shows (podcasts)
export async function getUserSavedShows(
  client: SpotifyApi,
  limit: number = 50,
  offset: number = 0
): Promise<{ items: SpotifyShow[]; total: number; next: boolean }> {
  const response = await client.currentUser.shows.savedShows(limit, offset);

  return {
    items: response.items.map((item) => transformShow(item.show)),
    total: response.total,
    next: response.next !== null,
  };
}

// Fetch all saved shows with pagination
export async function getAllUserSavedShows(
  client: SpotifyApi,
  maxShows: number = 500
): Promise<SpotifyShow[]> {
  const shows: SpotifyShow[] = [];
  let offset = 0;
  const limit = 50;

  while (shows.length < maxShows) {
    const { items, next } = await getUserSavedShows(client, limit, offset);
    shows.push(...items);

    if (!next || items.length === 0) break;
    offset += limit;
  }

  return shows.slice(0, maxShows);
}

// Get episodes for a show
export async function getShowEpisodes(
  client: SpotifyApi,
  showId: string,
  limit: number = 10
): Promise<SpotifyEpisode[]> {
  const response = await client.shows.episodes(showId, undefined, limit);

  return response.items
    .filter((ep) => new Date(ep.release_date) <= new Date()) // Filter future episodes
    .map(transformEpisode);
}

// Get latest episode only
export async function getLatestEpisode(
  client: SpotifyApi,
  showId: string
): Promise<SpotifyEpisode | null> {
  const episodes = await getShowEpisodes(client, showId, 1);
  return episodes[0] ?? null;
}
```

#### Type Transformers

```typescript
function transformShow(show: SimplifiedShow): SpotifyShow {
  return {
    id: show.id,
    name: show.name,
    description: show.description,
    publisher: show.publisher,
    imageUrl: show.images[0]?.url,
    externalUrl: show.external_urls.spotify,
    totalEpisodes: show.total_episodes,
  };
}

function transformEpisode(episode: SimplifiedEpisode): SpotifyEpisode {
  return {
    id: episode.id,
    name: episode.name,
    description: episode.description,
    releaseDate: episode.release_date,
    durationMs: episode.duration_ms,
    imageUrl: episode.images[0]?.url,
    externalUrl: episode.external_urls.spotify,
    showId: episode.show?.id,
    showName: episode.show?.name,
  };
}
```

---

## Subscription Management

### Database Schema

**File:** `apps/worker/src/db/schema.ts:156-226`

#### Subscriptions Table

```typescript
export const subscriptions = sqliteTable(
  'subscriptions',
  {
    id: text('id').primaryKey(), // ULID
    userId: text('user_id')
      .notNull()
      .references(() => users.id),
    provider: text('provider').notNull(), // 'YOUTUBE' | 'SPOTIFY'
    providerChannelId: text('provider_channel_id') // Channel/Show ID
      .notNull(),
    name: text('name').notNull(), // Display name
    description: text('description'),
    imageUrl: text('image_url'),
    externalUrl: text('external_url'),
    totalItems: integer('total_items').default(0),
    lastPublishedAt: integer('last_published_at'), // Unix ms
    lastPolledAt: integer('last_polled_at'), // Unix ms
    pollIntervalSeconds: integer('poll_interval_seconds').default(3600), // Default 1 hour
    status: text('status').default('ACTIVE'), // See status enum
    createdAt: integer('created_at')
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
    updatedAt: integer('updated_at')
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
  },
  (table) => ({
    // One subscription per channel per user
    uniqueUserProviderChannel: unique().on(table.userId, table.provider, table.providerChannelId),
    // Index for polling queries
    statusPolledAt: index('idx_status_polled_at').on(table.status, table.lastPolledAt),
  })
);
```

#### Subscription Status

```typescript
enum SubscriptionStatus {
  ACTIVE = 'ACTIVE', // Actively polling for new content
  PAUSED = 'PAUSED', // User manually paused
  DISCONNECTED = 'DISCONNECTED', // Connection expired/revoked
  UNSUBSCRIBED = 'UNSUBSCRIBED', // Soft delete
}
```

### Subscriptions tRPC Router

**File:** `apps/worker/src/trpc/routers/subscriptions.ts:1-649`

#### Adding a Subscription

```typescript
add: protectedProcedure
  .input(z.object({
    provider: z.enum(['YOUTUBE', 'SPOTIFY']),
    providerChannelId: z.string(),
    name: z.string(),
    description: z.string().optional(),
    imageUrl: z.string().optional(),
    externalUrl: z.string().optional(),
  }))
  .mutation(async ({ ctx, input }) => {
    // Step 1: Verify user has active connection
    const connection = await ctx.db.query.providerConnections.findFirst({
      where: and(
        eq(providerConnections.userId, ctx.auth.userId),
        eq(providerConnections.provider, input.provider),
        eq(providerConnections.status, 'ACTIVE'),
      ),
    });

    if (!connection) {
      throw new TRPCError({
        code: 'PRECONDITION_FAILED',
        message: `No active ${input.provider} connection`,
      });
    }

    // Step 2: Upsert subscription
    const subscriptionId = ulid();
    const now = Date.now();

    await ctx.db
      .insert(subscriptions)
      .values({
        id: subscriptionId,
        userId: ctx.auth.userId,
        provider: input.provider,
        providerChannelId: input.providerChannelId,
        name: input.name,
        description: input.description,
        imageUrl: input.imageUrl,
        externalUrl: input.externalUrl,
        status: 'ACTIVE',
        pollIntervalSeconds: 3600, // Default 1 hour
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [
          subscriptions.userId,
          subscriptions.provider,
          subscriptions.providerChannelId,
        ],
        set: {
          status: 'ACTIVE',
          name: input.name,
          description: input.description,
          imageUrl: input.imageUrl,
          externalUrl: input.externalUrl,
          updatedAt: now,
        },
      });

    // Step 3: Trigger initial fetch (async, non-blocking)
    ctx.waitUntil(
      triggerInitialFetch({
        subscriptionId,
        provider: input.provider,
        providerChannelId: input.providerChannelId,
        connectionId: connection.id,
        userId: ctx.auth.userId,
        env: ctx.env,
        db: ctx.db,
      }).catch(err => {
        console.error('Initial fetch failed:', err);
        // Don't fail the subscription creation
      })
    );

    return { id: subscriptionId };
  }),
```

#### Removing a Subscription

```typescript
remove: protectedProcedure
  .input(z.object({ subscriptionId: z.string() }))
  .mutation(async ({ ctx, input }) => {
    // Step 1: Get subscription
    const subscription = await ctx.db.query.subscriptions.findFirst({
      where: and(
        eq(subscriptions.id, input.subscriptionId),
        eq(subscriptions.userId, ctx.auth.userId),
      ),
    });

    if (!subscription) {
      throw new TRPCError({ code: 'NOT_FOUND' });
    }

    // Step 2: Soft delete subscription
    await ctx.db
      .update(subscriptions)
      .set({ status: 'UNSUBSCRIBED', updatedAt: Date.now() })
      .where(eq(subscriptions.id, input.subscriptionId));

    // Step 3: Remove INBOX items (preserve SAVED items)
    await ctx.db
      .delete(userItems)
      .where(and(
        eq(userItems.userId, ctx.auth.userId),
        eq(userItems.state, 'INBOX'),
        inArray(
          userItems.itemId,
          ctx.db
            .select({ itemId: subscriptionItems.itemId })
            .from(subscriptionItems)
            .where(eq(subscriptionItems.subscriptionId, input.subscriptionId))
        ),
      ));

    return { success: true };
  }),
```

#### Discovery Endpoints

```typescript
// Browse available subscriptions from provider
discover: router({
  available: protectedProcedure
    .input(z.object({
      provider: z.enum(['YOUTUBE', 'SPOTIFY']),
      cursor: z.string().optional(),
    }))
    .query(async ({ ctx, input }) => {
      // Get user's existing subscriptions
      const existing = await ctx.db.query.subscriptions.findMany({
        where: and(
          eq(subscriptions.userId, ctx.auth.userId),
          eq(subscriptions.provider, input.provider),
          ne(subscriptions.status, 'UNSUBSCRIBED'),
        ),
        columns: { providerChannelId: true },
      });

      const existingIds = new Set(existing.map(s => s.providerChannelId));

      // Fetch from provider
      const connection = await getActiveConnection(ctx, input.provider);
      const client = await createClient(connection, ctx.env);

      const providerItems = input.provider === 'YOUTUBE'
        ? await getUserSubscriptions(client, input.cursor)
        : await getUserSavedShows(client);

      // Filter out already subscribed
      return {
        items: providerItems.items
          .filter(item => !existingIds.has(item.id))
          .map(item => ({
            ...item,
            isSubscribed: false,
          })),
        nextCursor: providerItems.nextPageToken,
      };
    }),

  // Search provider for new content
  search: protectedProcedure
    .input(z.object({
      provider: z.enum(['YOUTUBE', 'SPOTIFY']),
      query: z.string().min(2),
    }))
    .query(async ({ ctx, input }) => {
      // Check quota for YouTube search (100 units!)
      if (input.provider === 'YOUTUBE') {
        const { allowed } = await canUseQuota(ctx.env.KV, 100);
        if (!allowed) {
          throw new TRPCError({
            code: 'TOO_MANY_REQUESTS',
            message: 'YouTube quota limit reached',
          });
        }
      }

      const connection = await getActiveConnection(ctx, input.provider);
      const client = await createClient(connection, ctx.env);

      const results = input.provider === 'YOUTUBE'
        ? await searchChannels(client, input.query)
        : await searchShows(client, input.query);

      // Mark subscribed status
      const existing = await ctx.db.query.subscriptions.findMany({
        where: and(
          eq(subscriptions.userId, ctx.auth.userId),
          eq(subscriptions.provider, input.provider),
        ),
        columns: { providerChannelId: true, status: true },
      });

      const existingMap = new Map(
        existing.map(s => [s.providerChannelId, s.status])
      );

      return results.map(item => ({
        ...item,
        isSubscribed: existingMap.get(item.id) === 'ACTIVE',
      }));
    }),
}),
```

### Initial Fetch

**File:** `apps/worker/src/subscriptions/initial-fetch.ts:1-385`

When a user subscribes, we fetch **only the latest item** to avoid flooding their inbox with historical content.

```typescript
export async function triggerInitialFetch(params: InitialFetchParams): Promise<void> {
  const { provider, providerChannelId, connectionId, subscriptionId, userId, env, db } = params;

  // Get connection and create client
  const connection = await db.query.providerConnections.findFirst({
    where: eq(providerConnections.id, connectionId),
  });

  if (!connection || connection.status !== 'ACTIVE') {
    throw new Error('Connection not active');
  }

  const accessToken = await getValidAccessToken(connection, env, db);

  if (provider === 'YOUTUBE') {
    await fetchInitialYouTubeItem(accessToken, providerChannelId, subscriptionId, userId, db);
  } else {
    await fetchInitialSpotifyItem(accessToken, providerChannelId, subscriptionId, userId, db);
  }

  // Update subscription's lastPolledAt
  await db
    .update(subscriptions)
    .set({ lastPolledAt: Date.now() })
    .where(eq(subscriptions.id, subscriptionId));
}

async function fetchInitialYouTubeItem(
  accessToken: string,
  channelId: string,
  subscriptionId: string,
  userId: string,
  db: DrizzleD1Database
): Promise<void> {
  const client = createYouTubeClient(accessToken);

  // Get uploads playlist
  const playlistId = await getChannelUploadsPlaylistId(client, channelId);
  if (!playlistId) {
    console.log(`No uploads playlist for channel ${channelId}`);
    return;
  }

  // Fetch recent videos
  const videos = await fetchRecentVideos(client, playlistId, 5);

  // Filter to public, already-published videos
  const eligibleVideos = videos.filter((video) => {
    const publishedAt = video.contentDetails?.videoPublishedAt;
    return publishedAt && new Date(publishedAt) <= new Date();
  });

  if (eligibleVideos.length === 0) {
    console.log(`No eligible videos for channel ${channelId}`);
    return;
  }

  // Ingest only the first (most recent) video
  const video = eligibleVideos[0];
  await ingestItem({
    provider: 'YOUTUBE',
    rawItem: video,
    subscriptionId,
    userId,
    db,
  });
}

async function fetchInitialSpotifyItem(
  accessToken: string,
  showId: string,
  subscriptionId: string,
  userId: string,
  db: DrizzleD1Database
): Promise<void> {
  const client = createSpotifyClient(accessToken);

  // Get latest episode
  const episode = await getLatestEpisode(client, showId);

  if (!episode) {
    console.log(`No episodes for show ${showId}`);
    return;
  }

  // Verify episode is already released
  const releaseDate = parseSpotifyDate(episode.releaseDate);
  if (releaseDate > new Date()) {
    console.log(`Latest episode is scheduled for future: ${episode.releaseDate}`);
    return;
  }

  // Ingest the episode
  await ingestItem({
    provider: 'SPOTIFY',
    rawItem: episode,
    subscriptionId,
    userId,
    db,
  });
}
```

---

## Polling and Sync Mechanisms

### Polling Scheduler

**File:** `apps/worker/src/polling/scheduler.ts:1-622`

The polling scheduler runs on a cron schedule (typically hourly) to fetch new content from subscribed channels.

#### Entry Point

```typescript
// Cron handler in index.ts
export default {
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    if (event.cron === '0 * * * *') {
      // Every hour
      ctx.waitUntil(pollSubscriptions(env));
    }
  },
};
```

#### Main Polling Function

```typescript
export async function pollSubscriptions(env: Env): Promise<PollResult> {
  const db = drizzle(env.DB);

  // Step 1: Acquire distributed lock
  const lockKey = 'poll:subscriptions:lock';
  const lockAcquired = await tryAcquireLock(env.KV, lockKey, 15 * 60 * 1000);

  if (!lockAcquired) {
    console.log('Another poll is in progress');
    return { skipped: true, reason: 'lock_held' };
  }

  try {
    // Step 2: Find due subscriptions
    const dueSubscriptions = await findDueSubscriptions(db);

    if (dueSubscriptions.length === 0) {
      return { processed: 0 };
    }

    // Step 3: Group by provider
    const byProvider = groupBy(dueSubscriptions, 'provider');

    // Step 4: Process each provider in parallel
    const [youtubeResults, spotifyResults] = await Promise.all([
      processYouTubeBatch(byProvider.YOUTUBE ?? [], env, db),
      processSpotifyBatch(byProvider.SPOTIFY ?? [], env, db),
    ]);

    return {
      processed: dueSubscriptions.length,
      youtube: youtubeResults,
      spotify: spotifyResults,
    };
  } finally {
    await releaseLock(env.KV, lockKey);
  }
}

async function findDueSubscriptions(db: DrizzleD1Database): Promise<Subscription[]> {
  const now = Date.now();

  // Find ACTIVE subscriptions where lastPolledAt + pollIntervalSeconds < now
  return db.query.subscriptions.findMany({
    where: and(
      eq(subscriptions.status, 'ACTIVE'),
      or(
        isNull(subscriptions.lastPolledAt),
        sql`${subscriptions.lastPolledAt} + (${subscriptions.pollIntervalSeconds} * 1000) < ${now}`
      )
    ),
    limit: 100, // Process in batches
    orderBy: [asc(subscriptions.lastPolledAt)], // Oldest first
  });
}
```

#### YouTube Batch Processing

```typescript
async function processYouTubeBatch(
  subs: Subscription[],
  env: Env,
  db: DrizzleD1Database
): Promise<BatchResult> {
  if (subs.length === 0) return { processed: 0 };

  // Group by user to share connections
  const byUser = groupBy(subs, 'userId');
  const results: SubscriptionResult[] = [];

  for (const [userId, userSubs] of Object.entries(byUser)) {
    // Get connection for this user
    const connection = await db.query.providerConnections.findFirst({
      where: and(
        eq(providerConnections.userId, userId),
        eq(providerConnections.provider, 'YOUTUBE'),
        eq(providerConnections.status, 'ACTIVE')
      ),
    });

    if (!connection) {
      // Mark subscriptions as disconnected
      await markDisconnected(
        db,
        userSubs.map((s) => s.id)
      );
      continue;
    }

    // Check rate limits
    const { allowed, status } = await canUseQuota(env.KV, userSubs.length);
    if (!allowed) {
      console.log('YouTube quota exhausted, skipping batch');
      continue;
    }

    try {
      const accessToken = await getValidAccessToken(connection, env, db);
      const client = createYouTubeClient(accessToken);

      for (const sub of userSubs) {
        const result = await pollYouTubeSubscription(client, sub, userId, db);
        results.push(result);

        // Track quota
        await trackQuotaUsage(env.KV, 'playlistItems.list', 1);
      }
    } catch (error) {
      if (isAuthError(error)) {
        await markConnectionExpired(db, connection.id);
        await markDisconnected(
          db,
          userSubs.map((s) => s.id)
        );
      }
      throw error;
    }
  }

  return {
    processed: results.length,
    newItems: results.reduce((sum, r) => sum + r.newItems, 0),
    errors: results.filter((r) => r.error).length,
  };
}

async function pollYouTubeSubscription(
  client: YouTubeClient,
  subscription: Subscription,
  userId: string,
  db: DrizzleD1Database
): Promise<SubscriptionResult> {
  const { providerChannelId, lastPolledAt, id: subscriptionId } = subscription;

  try {
    // Get uploads playlist
    const playlistId = await getChannelUploadsPlaylistId(client, providerChannelId);
    if (!playlistId) {
      return { subscriptionId, newItems: 0, error: 'no_playlist' };
    }

    // Fetch recent videos
    const videos = await fetchRecentVideos(client, playlistId, 10);

    // Filter to videos newer than lastPolledAt
    const newVideos = videos.filter((video) => {
      const publishedAt = new Date(video.contentDetails?.videoPublishedAt ?? 0).getTime();
      return !lastPolledAt || publishedAt > lastPolledAt;
    });

    // Ingest new items
    let ingested = 0;
    for (const video of newVideos) {
      const result = await ingestItem({
        provider: 'YOUTUBE',
        rawItem: video,
        subscriptionId,
        userId,
        db,
      });

      if (result.created) ingested++;
    }

    // Update subscription
    const latestPublishedAt = Math.max(
      ...videos.map((v) => new Date(v.contentDetails?.videoPublishedAt ?? 0).getTime())
    );

    await db
      .update(subscriptions)
      .set({
        lastPolledAt: Date.now(),
        lastPublishedAt: latestPublishedAt || subscription.lastPublishedAt,
        totalItems: sql`${subscriptions.totalItems} + ${ingested}`,
        updatedAt: Date.now(),
      })
      .where(eq(subscriptions.id, subscriptionId));

    return { subscriptionId, newItems: ingested };
  } catch (error) {
    console.error(`Failed to poll subscription ${subscriptionId}:`, error);
    return { subscriptionId, newItems: 0, error: String(error) };
  }
}
```

### Adaptive Polling Intervals

**File:** `apps/worker/src/polling/adaptive.ts:1-266`

Zine adjusts polling frequency based on how often a channel publishes new content.

#### Interval Tiers

| Activity Level | Criteria                  | Poll Interval |
| -------------- | ------------------------- | ------------- |
| Very Active    | 7+ items in last 7 days   | 1 hour        |
| Active         | 1-6 items in last 7 days  | 4 hours       |
| Moderate       | 1-4 items in last 30 days | 12 hours      |
| Inactive       | No items in last 30 days  | 24 hours      |

#### Implementation

```typescript
interface ActivityMetrics {
  itemsLast7Days: number;
  itemsLast30Days: number;
  averageDaysBetweenItems: number | null;
}

export function calculateOptimalInterval(metrics: ActivityMetrics): number {
  const { itemsLast7Days, itemsLast30Days, averageDaysBetweenItems } = metrics;

  // Very active: multiple items per week
  if (itemsLast7Days >= 7) {
    return 60 * 60; // 1 hour
  }

  // Active: at least one item per week
  if (itemsLast7Days >= 1) {
    return 4 * 60 * 60; // 4 hours
  }

  // Moderate: some activity in last month
  if (itemsLast30Days >= 1) {
    return 12 * 60 * 60; // 12 hours
  }

  // Inactive: no recent content
  return 24 * 60 * 60; // 24 hours
}

export async function getActivityMetrics(
  db: DrizzleD1Database,
  subscriptionId: string
): Promise<ActivityMetrics> {
  const now = Date.now();
  const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;
  const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000;

  // Count recent items
  const [last7, last30] = await Promise.all([
    db
      .select({ count: sql<number>`count(*)` })
      .from(subscriptionItems)
      .where(
        and(
          eq(subscriptionItems.subscriptionId, subscriptionId),
          gte(subscriptionItems.fetchedAt, sevenDaysAgo)
        )
      )
      .then((r) => r[0]?.count ?? 0),
    db
      .select({ count: sql<number>`count(*)` })
      .from(subscriptionItems)
      .where(
        and(
          eq(subscriptionItems.subscriptionId, subscriptionId),
          gte(subscriptionItems.fetchedAt, thirtyDaysAgo)
        )
      )
      .then((r) => r[0]?.count ?? 0),
  ]);

  return {
    itemsLast7Days: last7,
    itemsLast30Days: last30,
    averageDaysBetweenItems: last30 > 1 ? 30 / last30 : null,
  };
}

// Update interval if change is significant (≥50%)
export async function maybeUpdatePollInterval(
  db: DrizzleD1Database,
  subscriptionId: string,
  currentInterval: number
): Promise<void> {
  const metrics = await getActivityMetrics(db, subscriptionId);
  const optimalInterval = calculateOptimalInterval(metrics);

  // Only update if change is significant
  const changeRatio = Math.abs(optimalInterval - currentInterval) / currentInterval;

  if (changeRatio >= 0.5) {
    await db
      .update(subscriptions)
      .set({ pollIntervalSeconds: optimalInterval })
      .where(eq(subscriptions.id, subscriptionId));
  }
}

// Check every ~24 polls (roughly daily for hourly polls)
export function shouldAdjustInterval(pollCount: number): boolean {
  return pollCount % 24 === 0;
}
```

---

## Data Ingestion Pipeline

### Ingestion Processor

**File:** `apps/worker/src/ingestion/processor.ts:1-340`

The ingestion processor transforms provider-specific data into canonical items and stores them atomically.

#### Core Ingestion Function

```typescript
export interface IngestParams {
  provider: 'YOUTUBE' | 'SPOTIFY';
  rawItem: any; // Provider-specific item
  subscriptionId: string;
  userId: string;
  db: DrizzleD1Database;
}

export interface IngestResult {
  created: boolean;
  itemId?: string;
  userItemId?: string;
  skipped?: 'already_seen' | 'invalid_data';
}

export async function ingestItem(params: IngestParams): Promise<IngestResult> {
  const { provider, rawItem, subscriptionId, userId, db } = params;

  // Step 1: Transform to canonical format
  const transformed =
    provider === 'YOUTUBE' ? transformYouTubeVideo(rawItem) : transformSpotifyEpisode(rawItem);

  if (!transformed) {
    return { created: false, skipped: 'invalid_data' };
  }

  // Step 2: Check idempotency
  const seenKey = `${userId}:${provider}:${transformed.providerId}`;
  const alreadySeen = await db.query.providerItemsSeen.findFirst({
    where: and(
      eq(providerItemsSeen.userId, userId),
      eq(providerItemsSeen.provider, provider),
      eq(providerItemsSeen.providerItemId, transformed.providerId)
    ),
  });

  if (alreadySeen) {
    return { created: false, skipped: 'already_seen' };
  }

  // Step 3: Atomic transaction
  const itemId = ulid();
  const userItemId = ulid();
  const now = Date.now();

  await db.transaction(async (tx) => {
    // 3a: Find or create canonical item
    const existingItem = await tx.query.items.findFirst({
      where: and(eq(items.provider, provider), eq(items.providerId, transformed.providerId)),
    });

    const canonicalItemId = existingItem?.id ?? itemId;

    if (!existingItem) {
      await tx.insert(items).values({
        id: itemId,
        ...transformed,
        createdAt: now,
        updatedAt: now,
      });
    }

    // 3b: Create user_item in INBOX state
    await tx.insert(userItems).values({
      id: userItemId,
      userId,
      itemId: canonicalItemId,
      state: 'INBOX',
      addedAt: now,
      createdAt: now,
      updatedAt: now,
    });

    // 3c: Create subscription_item tracking record
    await tx.insert(subscriptionItems).values({
      id: ulid(),
      subscriptionId,
      itemId: canonicalItemId,
      fetchedAt: now,
      publishedAt: transformed.publishedAt,
    });

    // 3d: Mark as seen (idempotency)
    await tx.insert(providerItemsSeen).values({
      id: ulid(),
      userId,
      provider,
      providerItemId: transformed.providerId,
      sourceId: subscriptionId,
      firstSeenAt: new Date().toISOString(),
    });
  });

  return { created: true, itemId, userItemId };
}
```

### Content Transformers

**File:** `apps/worker/src/ingestion/transformers.ts:1-205`

#### YouTube Video Transformer

```typescript
export interface NewItem {
  id: string;
  contentType: ContentType;
  provider: Provider;
  providerId: string;
  canonicalUrl: string;
  title: string;
  description?: string;
  creator?: string;
  imageUrl?: string;
  durationSeconds?: number;
  publishedAt?: number;
}

export function transformYouTubeVideo(
  playlistItem: youtube_v3.Schema$PlaylistItem
): NewItem | null {
  const snippet = playlistItem.snippet;
  const contentDetails = playlistItem.contentDetails;

  if (!snippet || !contentDetails?.videoId) {
    return null;
  }

  const videoId = contentDetails.videoId;

  return {
    id: ulid(),
    contentType: ContentType.VIDEO,
    provider: Provider.YOUTUBE,
    providerId: videoId,
    canonicalUrl: `https://www.youtube.com/watch?v=${videoId}`,
    title: snippet.title ?? 'Untitled',
    description: snippet.description ?? undefined,
    creator: snippet.channelTitle ?? undefined,
    imageUrl: getBestThumbnail(snippet.thumbnails),
    publishedAt: snippet.publishedAt ? new Date(snippet.publishedAt).getTime() : undefined,
  };
}

function getBestThumbnail(
  thumbnails: youtube_v3.Schema$ThumbnailDetails | undefined
): string | undefined {
  // Prefer high > medium > default
  return thumbnails?.high?.url ?? thumbnails?.medium?.url ?? thumbnails?.default?.url ?? undefined;
}
```

#### Spotify Episode Transformer

```typescript
export function transformSpotifyEpisode(
  episode: SpotifyEpisode,
  showName?: string
): NewItem | null {
  if (!episode.id) {
    return null;
  }

  return {
    id: ulid(),
    contentType: ContentType.PODCAST,
    provider: Provider.SPOTIFY,
    providerId: episode.id,
    canonicalUrl: episode.externalUrl,
    title: episode.name,
    description: episode.description ?? undefined,
    creator: episode.showName ?? showName ?? undefined,
    imageUrl: episode.imageUrl,
    durationSeconds: episode.durationMs ? Math.round(episode.durationMs / 1000) : undefined,
    publishedAt: parseSpotifyDate(episode.releaseDate),
  };
}

// Spotify dates can be: "YYYY", "YYYY-MM", or "YYYY-MM-DD"
function parseSpotifyDate(dateString: string): number | undefined {
  if (!dateString) return undefined;

  // Normalize to full date
  let normalized = dateString;
  if (/^\d{4}$/.test(dateString)) {
    normalized = `${dateString}-01-01`;
  } else if (/^\d{4}-\d{2}$/.test(dateString)) {
    normalized = `${dateString}-01`;
  }

  const timestamp = new Date(normalized).getTime();
  return isNaN(timestamp) ? undefined : timestamp;
}
```

### Batch Ingestion

```typescript
export async function ingestBatch(items: IngestParams[]): Promise<BatchIngestResult> {
  const results: IngestResult[] = [];
  const errors: Array<{ index: number; error: string }> = [];

  for (let i = 0; i < items.length; i++) {
    try {
      const result = await ingestItem(items[i]);
      results.push(result);
    } catch (error) {
      errors.push({ index: i, error: String(error) });
      results.push({ created: false, skipped: 'invalid_data' });
    }
  }

  return {
    total: items.length,
    created: results.filter((r) => r.created).length,
    skipped: results.filter((r) => !r.created && !r.skipped).length,
    errors: errors.length,
    errorDetails: errors,
  };
}
```

---

## Frontend Integration

### Authentication with Clerk

**File:** `apps/mobile/lib/auth.ts:1-88`

```typescript
import * as SecureStore from 'expo-secure-store';
import { ClerkProvider } from '@clerk/clerk-expo';

// Secure token cache for native platforms
export const tokenCache = {
  async getToken(key: string): Promise<string | null> {
    try {
      return await SecureStore.getItemAsync(key);
    } catch {
      return null;
    }
  },

  async saveToken(key: string, value: string): Promise<void> {
    try {
      await SecureStore.setItemAsync(key, value);
    } catch {
      console.error('Failed to save token');
    }
  },

  async clearToken(key: string): Promise<void> {
    try {
      await SecureStore.deleteItemAsync(key);
    } catch {
      console.error('Failed to clear token');
    }
  },
};

// Usage in App.tsx
export function AuthProvider({ children }: { children: React.ReactNode }) {
  return (
    <ClerkProvider
      publishableKey={process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY!}
      tokenCache={tokenCache}
    >
      {children}
    </ClerkProvider>
  );
}
```

### Connections Hook

**File:** `apps/mobile/hooks/use-connections.ts:1-196`

```typescript
import { trpc } from '@/lib/trpc';

export interface Connection {
  provider: 'YOUTUBE' | 'SPOTIFY';
  status: 'ACTIVE' | 'EXPIRED' | 'REVOKED';
  connectedAt: Date;
  providerUserId?: string;
}

export function useConnections() {
  const query = trpc.subscriptions.connections.list.useQuery(undefined, {
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 24 * 60 * 60 * 1000, // 24 hours
  });

  const connections: Connection[] = (query.data ?? []).map((conn) => ({
    provider: conn.provider,
    status: conn.status,
    connectedAt: new Date(conn.connectedAt),
    providerUserId: conn.providerUserId,
  }));

  return {
    connections,
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
    getConnection: (provider: 'YOUTUBE' | 'SPOTIFY') =>
      connections.find((c) => c.provider === provider),
    isConnected: (provider: 'YOUTUBE' | 'SPOTIFY') =>
      connections.some((c) => c.provider === provider && c.status === 'ACTIVE'),
  };
}

export function useConnection(provider: 'YOUTUBE' | 'SPOTIFY') {
  const { connections, isLoading, error } = useConnections();

  return {
    connection: connections.find((c) => c.provider === provider),
    isConnected: connections.some((c) => c.provider === provider && c.status === 'ACTIVE'),
    isLoading,
    error,
  };
}
```

### Subscriptions Hook with Offline Support

**File:** `apps/mobile/hooks/use-subscriptions.ts:1-411`

```typescript
import { trpc } from '@/lib/trpc';
import { useQueryClient } from '@tanstack/react-query';

export function useSubscriptions(provider?: 'YOUTUBE' | 'SPOTIFY') {
  const queryClient = useQueryClient();
  const utils = trpc.useUtils();

  // Query subscriptions with pagination
  const query = trpc.subscriptions.list.useInfiniteQuery(
    { provider, limit: 20 },
    {
      getNextPageParam: (lastPage) => lastPage.nextCursor,
      staleTime: 5 * 60 * 1000,
    }
  );

  // Subscribe mutation with optimistic updates
  const subscribeMutation = trpc.subscriptions.add.useMutation({
    onMutate: async (newSub) => {
      // Cancel outgoing refetches
      await utils.subscriptions.list.cancel();

      // Snapshot previous value
      const previousData = utils.subscriptions.list.getInfiniteData({ provider });

      // Optimistically add subscription
      utils.subscriptions.list.setInfiniteData({ provider }, (old) => {
        if (!old) return old;

        return {
          ...old,
          pages: old.pages.map((page, i) =>
            i === 0
              ? {
                  ...page,
                  items: [
                    {
                      id: `temp-${Date.now()}`,
                      ...newSub,
                      status: 'ACTIVE',
                      createdAt: Date.now(),
                    },
                    ...page.items,
                  ],
                }
              : page
          ),
        };
      });

      return { previousData };
    },
    onError: (err, newSub, context) => {
      // Rollback on error
      if (context?.previousData) {
        utils.subscriptions.list.setInfiniteData({ provider }, context.previousData);
      }
    },
    onSettled: () => {
      // Invalidate to sync with server
      utils.subscriptions.list.invalidate();
    },
  });

  // Unsubscribe mutation with optimistic updates
  const unsubscribeMutation = trpc.subscriptions.remove.useMutation({
    onMutate: async ({ subscriptionId }) => {
      await utils.subscriptions.list.cancel();

      const previousData = utils.subscriptions.list.getInfiniteData({ provider });

      // Optimistically remove subscription
      utils.subscriptions.list.setInfiniteData({ provider }, (old) => {
        if (!old) return old;

        return {
          ...old,
          pages: old.pages.map((page) => ({
            ...page,
            items: page.items.filter((s) => s.id !== subscriptionId),
          })),
        };
      });

      return { previousData };
    },
    onError: (err, vars, context) => {
      if (context?.previousData) {
        utils.subscriptions.list.setInfiniteData({ provider }, context.previousData);
      }
    },
    onSettled: () => {
      utils.subscriptions.list.invalidate();
    },
  });

  return {
    subscriptions: query.data?.pages.flatMap((p) => p.items) ?? [],
    isLoading: query.isLoading,
    error: query.error,
    hasNextPage: query.hasNextPage,
    fetchNextPage: query.fetchNextPage,
    subscribe: subscribeMutation.mutate,
    unsubscribe: unsubscribeMutation.mutate,
    isSubscribing: subscribeMutation.isPending,
    isUnsubscribing: unsubscribeMutation.isPending,
  };
}
```

### Connections Management Screen

**File:** `apps/mobile/app/settings/connections.tsx:1-462`

```typescript
import { View, Alert } from 'react-native';
import { useConnections } from '@/hooks/use-connections';
import { connectProvider, disconnectProvider } from '@/lib/oauth';
import { trpc } from '@/lib/trpc';

export default function ConnectionsScreen() {
  const { connections, isLoading, refetch } = useConnections();
  const utils = trpc.useUtils();

  const disconnectMutation = trpc.subscriptions.connections.disconnect.useMutation({
    onSuccess: () => {
      utils.subscriptions.connections.list.invalidate();
      utils.subscriptions.list.invalidate();
    },
  });

  const handleConnect = async (provider: 'YOUTUBE' | 'SPOTIFY') => {
    try {
      await connectProvider(provider, trpcClient);
      refetch();
    } catch (error) {
      Alert.alert('Connection Failed', error.message);
    }
  };

  const handleDisconnect = (provider: 'YOUTUBE' | 'SPOTIFY') => {
    Alert.alert(
      'Disconnect Account',
      `Are you sure you want to disconnect your ${provider === 'YOUTUBE' ? 'YouTube' : 'Spotify'} account? Your subscriptions will be paused.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Disconnect',
          style: 'destructive',
          onPress: () => {
            disconnectMutation.mutate({ provider });
          },
        },
      ]
    );
  };

  const youtubeConnection = connections.find(c => c.provider === 'YOUTUBE');
  const spotifyConnection = connections.find(c => c.provider === 'SPOTIFY');

  return (
    <View>
      <ConnectionCard
        provider="YOUTUBE"
        connection={youtubeConnection}
        onConnect={() => handleConnect('YOUTUBE')}
        onDisconnect={() => handleDisconnect('YOUTUBE')}
        isDisconnecting={disconnectMutation.isPending}
      />

      <ConnectionCard
        provider="SPOTIFY"
        connection={spotifyConnection}
        onConnect={() => handleConnect('SPOTIFY')}
        onDisconnect={() => handleDisconnect('SPOTIFY')}
        isDisconnecting={disconnectMutation.isPending}
      />
    </View>
  );
}
```

---

## Complete End-to-End Flow

This section traces the complete journey from a user connecting their YouTube account to new content appearing in their inbox.

### Phase 1: User Connects YouTube Account

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          USER INITIATES CONNECTION                          │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  1. User taps "Connect YouTube" in Settings → Connections                   │
│     📱 apps/mobile/app/settings/connections.tsx                             │
│                                                                             │
│  2. App navigates to /subscriptions/connect/youtube                         │
│                                                                             │
│  3. App calls connectProvider('YOUTUBE')                                    │
│     📱 apps/mobile/lib/oauth.ts:284                                         │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
                                     │
                                     ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                              OAUTH FLOW                                     │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  4. Generate PKCE verifier + challenge                                      │
│     📱 apps/mobile/lib/oauth.ts:212-228                                     │
│                                                                             │
│  5. Store verifier in SecureStore                                           │
│                                                                             │
│  6. Generate state ("YOUTUBE:uuid")                                         │
│                                                                             │
│  7. Register state with server via tRPC                                     │
│     🔗 connections.registerState.mutate({ state, provider })                │
│     📦 apps/worker/src/trpc/routers/connections.ts:61-75                    │
│                                                                             │
│  8. Open browser with Google OAuth URL                                      │
│     - client_id, redirect_uri, scope, state, code_challenge                 │
│                                                                             │
│  9. User authorizes access in Google account                                │
│                                                                             │
│  10. Google redirects to zine://oauth/callback with code + state            │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
                                     │
                                     ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                            TOKEN EXCHANGE                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  11. App extracts code + state from redirect URL                            │
│                                                                             │
│  12. Validate state matches stored value (CSRF protection)                  │
│                                                                             │
│  13. Send code + verifier to server                                         │
│      🔗 connections.callback.mutate({ provider, code, codeVerifier })       │
│      📦 apps/worker/src/trpc/routers/connections.ts:97-180                  │
│                                                                             │
│  14. Server exchanges code for tokens with Google                           │
│                                                                             │
│  15. Server encrypts tokens with AES-256-GCM                                │
│      📦 apps/worker/src/lib/crypto.ts:1-150                                 │
│                                                                             │
│  16. Server stores connection in database                                   │
│      📦 apps/worker/src/db/schema.ts:124-154                                │
│                                                                             │
│  17. Cleanup SecureStore keys                                               │
│                                                                             │
│  ✅ Connection established!                                                 │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Phase 2: User Subscribes to a Channel

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      USER BROWSES SUBSCRIPTIONS                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  1. User navigates to /subscriptions/discover/youtube                       │
│                                                                             │
│  2. App calls subscriptions.discover.available                              │
│     📦 apps/worker/src/trpc/routers/subscriptions.ts:516-575                │
│                                                                             │
│  3. Server fetches user's YouTube subscriptions not yet in Zine             │
│     📦 apps/worker/src/providers/youtube.ts:229-240                         │
│                                                                             │
│  4. User sees list of available channels to import                          │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
                                     │
                                     ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                          USER SUBSCRIBES                                    │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  5. User taps "Subscribe" on a channel                                      │
│     📱 apps/mobile/hooks/use-subscriptions.ts (subscribe mutation)          │
│                                                                             │
│  6. Optimistic update: Channel appears in subscriptions list immediately    │
│                                                                             │
│  7. Server receives subscriptions.add request                               │
│     📦 apps/worker/src/trpc/routers/subscriptions.ts:184-260                │
│                                                                             │
│  8. Server validates active YouTube connection exists                       │
│                                                                             │
│  9. Server creates/updates subscription record                              │
│     📦 apps/worker/src/db/schema.ts:156-199                                 │
│                                                                             │
│  10. Server triggers initial fetch (async, non-blocking)                    │
│      📦 apps/worker/src/subscriptions/initial-fetch.ts:1-385                │
│                                                                             │
│  ✅ Subscription created!                                                   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Phase 3: Initial Content Fetch

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        INITIAL FETCH TRIGGERED                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  1. triggerInitialFetch() called with subscription details                  │
│     📦 apps/worker/src/subscriptions/initial-fetch.ts:183-210               │
│                                                                             │
│  2. Get valid access token (refresh if needed)                              │
│     📦 apps/worker/src/lib/token-refresh.ts:132-146                         │
│                                                                             │
│  3. Create YouTube client                                                   │
│     📦 apps/worker/src/providers/youtube.ts:75-94                           │
│                                                                             │
│  4. Get uploads playlist ID for channel                                     │
│     📦 apps/worker/src/providers/youtube.ts:156-172                         │
│                                                                             │
│  5. Fetch 5 recent videos from playlist                                     │
│     📦 apps/worker/src/providers/youtube.ts:195-207                         │
│                                                                             │
│  6. Filter to public, already-published videos                              │
│                                                                             │
│  7. Ingest ONLY the first eligible video                                    │
│     📦 apps/worker/src/ingestion/processor.ts:105-182                       │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
                                     │
                                     ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                          ITEM INGESTION                                     │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  8. Transform YouTube video to canonical item format                        │
│     📦 apps/worker/src/ingestion/transformers.ts:89-112                     │
│                                                                             │
│  9. Check idempotency (provider_items_seen table)                           │
│                                                                             │
│  10. In transaction:                                                        │
│      a. Create canonical item (items table)                                 │
│      b. Create user_item with state='INBOX'                                 │
│      c. Create subscription_item tracking record                            │
│      d. Mark as seen in provider_items_seen                                 │
│                                                                             │
│  11. Update subscription's lastPolledAt                                     │
│                                                                             │
│  ✅ First item appears in inbox!                                            │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Phase 4: Ongoing Polling

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          HOURLY CRON TRIGGER                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  1. Cloudflare Worker cron triggers pollSubscriptions()                     │
│     📦 apps/worker/src/polling/scheduler.ts:105-171                         │
│                                                                             │
│  2. Acquire distributed lock (prevent concurrent polls)                     │
│                                                                             │
│  3. Find due subscriptions:                                                 │
│     WHERE status = 'ACTIVE'                                                 │
│       AND lastPolledAt + pollIntervalSeconds < now                          │
│                                                                             │
│  4. Group subscriptions by provider (YOUTUBE/SPOTIFY)                       │
│                                                                             │
│  5. Process providers in parallel                                           │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
                                     │
                                     ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                      YOUTUBE BATCH PROCESSING                               │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  6. Group subscriptions by user (share OAuth tokens)                        │
│     📦 apps/worker/src/polling/scheduler.ts:182-263                         │
│                                                                             │
│  7. For each user:                                                          │
│     a. Get active connection                                                │
│     b. Check YouTube quota availability                                     │
│        📦 apps/worker/src/providers/youtube-quota.ts:1-515                  │
│     c. Refresh access token if needed                                       │
│                                                                             │
│  8. For each subscription:                                                  │
│     a. Get uploads playlist                                                 │
│     b. Fetch recent videos                                                  │
│     c. Filter to videos newer than lastPolledAt                             │
│     d. Ingest new videos                                                    │
│     e. Update subscription timestamps                                       │
│                                                                             │
│  9. Track quota usage                                                       │
│                                                                             │
│  10. Maybe adjust poll interval based on activity                           │
│      📦 apps/worker/src/polling/adaptive.ts:1-266                           │
│                                                                             │
│  ✅ New content synced to user inboxes!                                     │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Phase 5: Content Appears in Inbox

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          USER OPENS INBOX                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  1. User opens the app and navigates to Inbox tab                           │
│     📱 apps/mobile/app/(tabs)/inbox.tsx                                     │
│                                                                             │
│  2. App queries inbox via tRPC                                              │
│     🔗 inbox.list.useInfiniteQuery()                                        │
│     📱 apps/mobile/hooks/use-items.ts                                       │
│                                                                             │
│  3. Server returns user_items with state='INBOX'                            │
│     📦 apps/worker/src/trpc/routers/inbox.ts                                │
│                                                                             │
│  4. Items displayed with:                                                   │
│     - Title, description, creator                                           │
│     - Thumbnail image                                                       │
│     - Publication date                                                      │
│     - Provider indicator (YouTube/Spotify)                                  │
│                                                                             │
│  5. User can:                                                               │
│     - Tap to open item externally                                           │
│     - Swipe to save for later                                               │
│     - Archive to remove from inbox                                          │
│                                                                             │
│  ✅ User sees their aggregated content feed!                                │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Database Schema Reference

### Tables Overview

| Table                  | Purpose                                         |
| ---------------------- | ----------------------------------------------- |
| `users`                | User accounts (linked to Clerk)                 |
| `provider_connections` | OAuth connections (encrypted tokens)            |
| `subscriptions`        | User's subscribed channels/shows                |
| `items`                | Canonical content items                         |
| `user_items`           | User-specific item state (INBOX/SAVED/ARCHIVED) |
| `subscription_items`   | Links subscriptions to items                    |
| `provider_items_seen`  | Idempotency tracking                            |

### Entity Relationship Diagram

```
┌─────────────────┐       ┌────────────────────────┐
│     users       │       │  provider_connections  │
├─────────────────┤       ├────────────────────────┤
│ id (PK)         │───┐   │ id (PK)                │
│ clerkId         │   │   │ userId (FK) ───────────┼───┐
│ email           │   │   │ provider               │   │
│ createdAt       │   │   │ providerUserId         │   │
└─────────────────┘   │   │ accessToken (encrypted)│   │
                      │   │ refreshToken (encrypted│   │
                      │   │ tokenExpiresAt         │   │
                      │   │ status                 │   │
                      │   └────────────────────────┘   │
                      │                               │
                      │   ┌────────────────────────┐   │
                      │   │    subscriptions       │   │
                      │   ├────────────────────────┤   │
                      │   │ id (PK)                │   │
                      └───┼─userId (FK)            │◄──┘
                          │ provider               │
                          │ providerChannelId      │
                          │ name                   │
                          │ lastPolledAt           │
                          │ pollIntervalSeconds    │
                          │ status                 │
                          └───────────┬────────────┘
                                      │
                                      │
┌─────────────────┐     ┌─────────────▼────────────┐
│     items       │     │   subscription_items     │
├─────────────────┤     ├──────────────────────────┤
│ id (PK)         │◄────┤ itemId (FK)              │
│ contentType     │     │ subscriptionId (FK)──────┼───┐
│ provider        │     │ fetchedAt                │   │
│ providerId      │     │ publishedAt              │   │
│ canonicalUrl    │     └──────────────────────────┘   │
│ title           │                                    │
│ description     │     ┌──────────────────────────┐   │
│ creator         │     │    provider_items_seen   │   │
│ imageUrl        │     ├──────────────────────────┤   │
│ publishedAt     │     │ id (PK)                  │   │
└────────┬────────┘     │ userId (FK)              │   │
         │              │ provider                 │   │
         │              │ providerItemId           │   │
         │              │ sourceId (FK) ───────────┼───┘
         │              │ firstSeenAt              │
         │              └──────────────────────────┘
         │
         │              ┌──────────────────────────┐
         │              │       user_items         │
         │              ├──────────────────────────┤
         └──────────────┤ itemId (FK)              │
                        │ userId (FK)              │
                        │ state (INBOX/SAVED/...)  │
                        │ addedAt                  │
                        │ savedAt                  │
                        │ archivedAt               │
                        └──────────────────────────┘
```

---

## Error Handling

### OAuth Errors

| Error                 | Cause                         | Recovery                     |
| --------------------- | ----------------------------- | ---------------------------- |
| State mismatch        | CSRF attempt or expired state | User must restart OAuth flow |
| Token exchange failed | Invalid code or PKCE mismatch | User must restart OAuth flow |
| User cancelled        | User closed browser           | Graceful return to settings  |

### Token Refresh Errors

| Error            | Cause                 | Recovery                                  |
| ---------------- | --------------------- | ----------------------------------------- |
| 401 Unauthorized | Refresh token revoked | Mark connection EXPIRED, prompt reconnect |
| 403 Forbidden    | Scopes changed        | Mark connection EXPIRED, prompt reconnect |
| Lock timeout     | Concurrent refresh    | Wait and retry                            |

### Provider API Errors

| Error             | Cause                   | Recovery                                  |
| ----------------- | ----------------------- | ----------------------------------------- |
| 403 quotaExceeded | YouTube daily quota hit | Wait for reset, skip expensive operations |
| 401 Unauthorized  | Token expired           | Auto-refresh and retry                    |
| 404 Not Found     | Channel/show deleted    | Mark subscription as DISCONNECTED         |

### Connection Status Transitions

```
    ┌────────────────────────────────────────────────┐
    │                                                │
    │                 ┌─────────┐                    │
    │    ┌───────────►│ ACTIVE  │◄──────────┐       │
    │    │            └────┬────┘           │       │
    │    │                 │                │       │
    │    │    Token expired│    Reconnect   │       │
    │    │                 │                │       │
    │    │                 ▼                │       │
    │    │           ┌─────────┐            │       │
    │    │           │ EXPIRED │────────────┘       │
    │    │           └────┬────┘                    │
    │    │                │                         │
    │    │   User revokes │                         │
    │    │                │                         │
    │    │                ▼                         │
    │    │           ┌─────────┐                    │
    │    └───────────│ REVOKED │                    │
    │                └─────────┘                    │
    │                                               │
    └───────────────────────────────────────────────┘
```

---

## Key Files Reference

### Mobile App

| File                                       | Purpose                       | Lines |
| ------------------------------------------ | ----------------------------- | ----- |
| `apps/mobile/lib/oauth.ts`                 | OAuth flow implementation     | 1-528 |
| `apps/mobile/lib/auth.ts`                  | Clerk authentication          | 1-88  |
| `apps/mobile/hooks/use-connections.ts`     | Connection state management   | 1-196 |
| `apps/mobile/hooks/use-subscriptions.ts`   | Subscription state management | 1-411 |
| `apps/mobile/app/settings/connections.tsx` | Connection management UI      | 1-462 |

### Backend Worker

| File                                             | Purpose                    | Lines |
| ------------------------------------------------ | -------------------------- | ----- |
| `apps/worker/src/trpc/routers/connections.ts`    | Connection tRPC router     | 1-330 |
| `apps/worker/src/trpc/routers/subscriptions.ts`  | Subscription tRPC router   | 1-649 |
| `apps/worker/src/lib/oauth-state.ts`             | OAuth state management     | 1-120 |
| `apps/worker/src/lib/token-refresh.ts`           | Token refresh with locking | 1-340 |
| `apps/worker/src/lib/crypto.ts`                  | AES-256-GCM encryption     | 1-512 |
| `apps/worker/src/providers/youtube.ts`           | YouTube API client         | 1-340 |
| `apps/worker/src/providers/youtube-quota.ts`     | YouTube quota management   | 1-515 |
| `apps/worker/src/providers/spotify.ts`           | Spotify API client         | 1-338 |
| `apps/worker/src/subscriptions/initial-fetch.ts` | Initial content fetch      | 1-385 |
| `apps/worker/src/polling/scheduler.ts`           | Polling scheduler          | 1-622 |
| `apps/worker/src/polling/adaptive.ts`            | Adaptive poll intervals    | 1-266 |
| `apps/worker/src/ingestion/processor.ts`         | Ingestion processor        | 1-340 |
| `apps/worker/src/ingestion/transformers.ts`      | Content transformers       | 1-205 |
| `apps/worker/src/db/schema.ts`                   | Database schema            | 1-254 |

---

## Environment Variables

### Mobile App (.env)

```bash
EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_live_...
EXPO_PUBLIC_YOUTUBE_CLIENT_ID=xxx.apps.googleusercontent.com
EXPO_PUBLIC_SPOTIFY_CLIENT_ID=xxx
EXPO_PUBLIC_API_URL=https://api.zine.app
```

### Worker (wrangler.toml / secrets)

```bash
# OAuth Secrets
YOUTUBE_CLIENT_ID=xxx.apps.googleusercontent.com
YOUTUBE_CLIENT_SECRET=xxx
SPOTIFY_CLIENT_ID=xxx
SPOTIFY_CLIENT_SECRET=xxx

# Encryption
ENCRYPTION_KEY=64_hex_characters_for_256_bit_key
ENCRYPTION_KEY_VERSION=1
ENCRYPTION_KEY_PREVIOUS=previous_key_for_rotation

# Auth
CLERK_SECRET_KEY=sk_live_...
```

---

## Summary

Zine's provider connection system implements a secure, scalable approach to OAuth and content aggregation:

1. **Security First**: PKCE for mobile OAuth, AES-256-GCM for token storage, distributed locking for concurrent safety
2. **User Experience**: Optimistic updates, offline support, graceful error handling
3. **Scalability**: Adaptive polling intervals, YouTube quota management, batch processing
4. **Idempotency**: Deduplication at ingestion time prevents duplicate content
5. **Maintainability**: Clear separation of concerns between providers, ingestion, and API layers

The architecture supports adding new providers by implementing the provider interface and adding transformers for content normalization.
