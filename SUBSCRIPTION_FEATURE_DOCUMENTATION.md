# Subscription Feature Documentation

## Table of Contents
1. [Overview](#overview)
2. [Requirements](#requirements)
3. [Architecture & Design](#architecture--design)
4. [Implementation Details](#implementation-details)
   - [Database Schema](#database-schema)
   - [API Contract](#api-contract)
   - [OAuth Flow](#oauth-flow)
   - [Cron Job Processing](#cron-job-processing)
   - [Frontend Implementation](#frontend-implementation)

## Overview

The subscription feature is a multi-provider content aggregation system that allows users to:
- Connect their Spotify and YouTube accounts via OAuth
- Discover and manage their podcast/channel subscriptions
- View a unified feed of latest episodes/videos
- Track read/unread states across all content
- Save items to bookmarks for later reference

The system automatically polls for new content hourly and maintains OAuth tokens with automatic refresh capabilities.

## Requirements

### Functional Requirements

1. **OAuth Integration**
   - Support Spotify (podcasts) and YouTube (channels) OAuth flows
   - Secure token storage with encryption
   - Automatic token refresh before expiry
   - Manual token refresh capability
   - Health monitoring for OAuth connections

2. **Subscription Management**
   - Discover user's existing subscriptions from connected providers
   - Allow users to select which subscriptions to follow
   - Display subscription metadata (thumbnails, creator names, descriptions)
   - Track subscription state per user

3. **Feed Aggregation**
   - Fetch latest episodes/videos from all active subscriptions
   - Deduplicate content to prevent duplicates
   - Store feed items with metadata (duration, publish date, etc.)
   - Support pagination for large feeds

4. **User Experience**
   - Unified feed view across all providers
   - Per-subscription filtering
   - Read/unread state tracking
   - Unread count badges
   - Save to bookmarks functionality
   - Responsive design for all devices

5. **Background Processing**
   - Hourly cron job for content polling
   - Automatic token refresh for expiring tokens
   - Performance optimization for large-scale polling
   - Error handling and retry logic

### Non-Functional Requirements

1. **Performance**
   - Batch API calls (50 items per request)
   - Caching layer for deduplication
   - Query optimization with proper indexes
   - Infinite scroll with efficient pagination

2. **Security**
   - Encrypted token storage
   - State parameter validation for OAuth
   - User isolation (no cross-user data access)
   - Secure API endpoints with authentication

3. **Scalability**
   - Serverless architecture (Cloudflare Workers)
   - Globally distributed infrastructure
   - Efficient database queries
   - Batch processing capabilities

## Architecture & Design

### System Architecture

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│   Frontend      │     │   API Gateway    │     │  External APIs  │
│  (React SPA)    │────▶│  (Cloudflare     │────▶│   - Spotify     │
│                 │     │   Workers)       │     │   - YouTube     │
└─────────────────┘     └──────────────────┘     └─────────────────┘
                               │
                               ▼
                        ┌──────────────────┐
                        │   Database       │
                        │ (Cloudflare D1)  │
                        └──────────────────┘
                               ▲
                               │
                        ┌──────────────────┐
                        │   Cron Jobs      │
                        │  (Scheduled)     │
                        └──────────────────┘
```

### Key Design Patterns

1. **Repository Pattern**: Clean abstraction between business logic and data access
2. **Service Layer**: Business logic separated from controllers
3. **Batch Processing**: Efficient handling of multiple API calls
4. **Optimistic UI Updates**: Immediate feedback for user actions
5. **Infinite Scroll**: Progressive data loading for large datasets

### Technology Stack

- **Frontend**: React + Vite + TanStack Router/Query
- **Backend**: Cloudflare Workers + Hono
- **Database**: Cloudflare D1 (SQLite)
- **ORM**: Drizzle ORM
- **Authentication**: Clerk
- **OAuth**: Custom implementation with provider APIs

## Implementation Details

### Database Schema

#### Core Tables

```sql
-- Users table (from Clerk)
users (
  id TEXT PRIMARY KEY,              -- Clerk user ID
  email TEXT NOT NULL,
  firstName TEXT,
  lastName TEXT,
  imageUrl TEXT,
  createdAt TIMESTAMP NOT NULL,
  updatedAt TIMESTAMP NOT NULL
)

-- OAuth providers configuration
subscriptionProviders (
  id TEXT PRIMARY KEY,              -- 'spotify' or 'youtube'
  name TEXT NOT NULL,
  oauthConfig TEXT NOT NULL,        -- JSON config
  createdAt TIMESTAMP NOT NULL
)

-- User OAuth accounts
userAccounts (
  id TEXT PRIMARY KEY,
  userId TEXT NOT NULL REFERENCES users(id),
  providerId TEXT NOT NULL REFERENCES subscriptionProviders(id),
  externalAccountId TEXT NOT NULL,
  accessToken TEXT NOT NULL,
  refreshToken TEXT,
  expiresAt TIMESTAMP,
  createdAt TIMESTAMP NOT NULL,
  updatedAt TIMESTAMP NOT NULL
)

-- Available subscriptions from providers
subscriptions (
  id TEXT PRIMARY KEY,
  providerId TEXT NOT NULL REFERENCES subscriptionProviders(id),
  externalId TEXT NOT NULL,         -- Provider's ID
  title TEXT NOT NULL,
  creatorName TEXT NOT NULL,
  description TEXT,
  thumbnailUrl TEXT,
  subscriptionUrl TEXT,
  totalEpisodes INTEGER,
  createdAt TIMESTAMP NOT NULL
)

-- User's selected subscriptions
userSubscriptions (
  id TEXT PRIMARY KEY,
  userId TEXT NOT NULL REFERENCES users(id),
  subscriptionId TEXT NOT NULL REFERENCES subscriptions(id),
  isActive BOOLEAN NOT NULL DEFAULT true,
  createdAt TIMESTAMP NOT NULL,
  updatedAt TIMESTAMP NOT NULL
)

-- Feed items (episodes/videos)
feedItems (
  id TEXT PRIMARY KEY,
  subscriptionId TEXT NOT NULL REFERENCES subscriptions(id),
  externalId TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  thumbnailUrl TEXT,
  publishedAt TIMESTAMP NOT NULL,
  durationSeconds INTEGER,
  externalUrl TEXT NOT NULL,
  createdAt TIMESTAMP NOT NULL
)

-- User's read/unread state
userFeedItems (
  id TEXT PRIMARY KEY,
  userId TEXT NOT NULL REFERENCES users(id),
  feedItemId TEXT NOT NULL REFERENCES feedItems(id),
  isRead BOOLEAN NOT NULL DEFAULT false,
  bookmarkId INTEGER REFERENCES bookmarks(id),
  readAt TIMESTAMP,
  createdAt TIMESTAMP NOT NULL
)
```

### API Contract

#### OAuth Endpoints

**1. Initiate OAuth Connection**
```http
POST /api/v1/auth/:provider/connect
Authorization: Bearer {clerk_token}
Content-Type: application/json

{
  "redirectUrl": "https://app.example.com/feed" // optional
}

Response:
{
  "authUrl": "https://accounts.spotify.com/authorize?..."
}
```

**2. OAuth Callback**
```http
GET /api/v1/auth/:provider/callback?code={code}&state={state}

Response: Redirect to frontend with status
```

**3. Disconnect Account**
```http
DELETE /api/v1/auth/:provider/disconnect
Authorization: Bearer {clerk_token}

Response:
{
  "message": "Account disconnected successfully"
}
```

**4. Manual Token Refresh**
```http
POST /api/v1/auth/:provider/refresh
Authorization: Bearer {clerk_token}

Response:
{
  "success": true,
  "message": "Token refreshed successfully",
  "account": {
    "id": "...",
    "provider": "spotify",
    "expiresAt": "2024-01-01T00:00:00Z",
    "hasRefreshToken": true
  },
  "wasRefreshed": true
}
```

**5. OAuth Health Check**
```http
GET /api/v1/auth/health
Authorization: Bearer {clerk_token}

Response:
{
  "userId": "user_123",
  "timestamp": "2024-01-01T00:00:00Z",
  "providers": [
    {
      "provider": "spotify",
      "connected": true,
      "tokenStatus": "valid",
      "expiresAt": "2024-01-01T00:00:00Z",
      "timeUntilExpiry": "23 hours",
      "requiresAttention": false
    }
  ],
  "summary": {
    "totalProviders": 2,
    "connectedProviders": 1,
    "overallHealth": "healthy"
  }
}
```

#### Subscription Management Endpoints

**1. Discover Subscriptions**
```http
GET /api/v1/subscriptions/discover/:provider
Authorization: Bearer {clerk_token}

Response:
{
  "provider": "spotify",
  "totalFound": 25,
  "subscriptions": [
    {
      "id": "sub_123",
      "externalId": "show_abc",
      "title": "Podcast Name",
      "creatorName": "Creator Name",
      "description": "...",
      "thumbnailUrl": "https://...",
      "isAlreadySubscribed": false,
      "totalEpisodes": 150
    }
  ],
  "existingSubscriptions": ["sub_456"],
  "newSubscriptions": ["sub_123"]
}
```

**2. Get User Subscriptions**
```http
GET /api/v1/subscriptions
Authorization: Bearer {clerk_token}

Response:
{
  "subscriptions": [
    {
      "id": "sub_123",
      "providerId": "spotify",
      "title": "Podcast Name",
      "creatorName": "Creator Name",
      "thumbnailUrl": "https://...",
      "isActive": true
    }
  ]
}
```

**3. Update Subscriptions**
```http
POST /api/v1/subscriptions/:provider/update
Authorization: Bearer {clerk_token}
Content-Type: application/json

{
  "subscriptionIds": ["sub_123", "sub_456"]
}

Response:
{
  "message": "Subscriptions updated successfully",
  "added": 2,
  "removed": 1,
  "total": 5
}
```

#### Feed Endpoints

**1. Get Feed**
```http
GET /api/v1/feed?unread=true&subscription=sub_123&limit=20&offset=0
Authorization: Bearer {clerk_token}

Response:
{
  "feedItems": [
    {
      "id": "ufi_123",
      "feedItem": {
        "id": "fi_123",
        "title": "Episode Title",
        "description": "...",
        "thumbnailUrl": "https://...",
        "publishedAt": "2024-01-01T00:00:00Z",
        "durationSeconds": 1800,
        "externalUrl": "https://...",
        "subscription": {
          "id": "sub_123",
          "title": "Podcast Name",
          "creatorName": "Creator Name",
          "providerId": "spotify"
        }
      },
      "isRead": false,
      "readAt": null,
      "bookmarkId": null
    }
  ],
  "pagination": {
    "offset": 0,
    "limit": 20,
    "total": 150,
    "hasMore": true
  }
}
```

**2. Mark as Read**
```http
PUT /api/v1/feed/:itemId/read
Authorization: Bearer {clerk_token}

Response:
{
  "message": "Item marked as read"
}
```

**3. Get Subscriptions with Unread Counts**
```http
GET /api/v1/feed/subscriptions
Authorization: Bearer {clerk_token}

Response:
{
  "subscriptions": [
    {
      "id": "sub_123",
      "title": "Podcast Name",
      "creatorName": "Creator Name",
      "thumbnailUrl": "https://...",
      "providerId": "spotify",
      "unreadCount": 5,
      "lastUpdated": "2024-01-01T00:00:00Z"
    }
  ]
}
```

### OAuth Flow

#### Spotify OAuth Configuration
```javascript
{
  clientId: process.env.SPOTIFY_CLIENT_ID,
  clientSecret: process.env.SPOTIFY_CLIENT_SECRET,
  redirectUri: `${API_BASE_URL}/api/v1/auth/spotify/callback`,
  scopes: ['user-read-playback-position', 'user-library-read'],
  authUrl: 'https://accounts.spotify.com/authorize',
  tokenUrl: 'https://accounts.spotify.com/api/token'
}
```

#### YouTube OAuth Configuration
```javascript
{
  clientId: process.env.YOUTUBE_CLIENT_ID,
  clientSecret: process.env.YOUTUBE_CLIENT_SECRET,
  redirectUri: `${API_BASE_URL}/api/v1/auth/youtube/callback`,
  scopes: ['https://www.googleapis.com/auth/youtube.readonly'],
  authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
  tokenUrl: 'https://oauth2.googleapis.com/token'
}
```

#### OAuth Flow Steps
1. User initiates connection → Generate state token with 5-minute expiry
2. Redirect to provider's OAuth page
3. User authorizes → Provider redirects to callback
4. Validate state token and exchange code for tokens
5. Store tokens encrypted in database
6. Fetch user info from provider
7. Redirect user to frontend with success status

### Cron Job Processing

#### Schedule
```toml
[triggers]
crons = ["0 * * * *"]  # Every hour at minute 0
```

#### Feed Polling Service (OptimizedFeedPollingService)

**Execution Flow:**
1. Get all active subscriptions grouped by provider
2. Warm cache with recent items (deduplication)
3. For each provider:
   - Get valid access token (refresh if needed)
   - Batch process subscriptions (50 per batch)
   - Fetch latest episodes/videos
   - Deduplicate against cache
   - Store new items in `feedItems`
   - Create `userFeedItems` for all subscribed users
4. Return performance metrics

**Performance Optimizations:**
- Batch API calls (50 items per request)
- Deduplication cache (20,000 items, 2-hour TTL)
- Query optimization with proper indexes
- Concurrent processing for multiple providers
- Smart episode limit for Spotify (based on totalEpisodes)

#### Token Refresh Service

**Execution Flow:**
1. Find tokens expiring within 1 hour
2. Group by provider
3. For each expiring token:
   - Attempt refresh with exponential backoff
   - Update database with new tokens
   - Log failures for monitoring
4. Return refresh statistics

### Frontend Implementation

#### Key Components

**1. FeedPage Component**
```typescript
- Main container for feed display
- Handles subscription filtering
- Manages unread/all toggle
- Coordinates with child components
```

**2. FeedItemList Component**
```typescript
- Renders feed items with infinite scroll
- Handles read/unread actions
- Save to bookmarks functionality
- Empty states and loading states
```

**3. SubscriptionAvatars Component**
```typescript
- Visual subscription selector
- Shows unread counts
- Allows filtering by subscription
```

#### Data Management (useFeedManager Hook)

```typescript
const {
  feedItems,              // Flattened array of all feed items
  subscriptions,          // Array with unread counts
  isLoading,             // Initial load state
  isLoadingMore,         // Pagination load state
  error,                 // Error state
  hasMore,               // More items available
  loadMore,              // Function to load next page
  markAsRead,            // Mark item as read
  markAsUnread,          // Mark item as unread
  saveToBookmarks,       // Save to bookmarks
  refetch                // Refresh data
} = useFeedManager({
  unreadOnly: true,
  subscriptionId: 'sub_123',
  limit: 20
})
```

**Features:**
- TanStack Query for data fetching
- Optimistic updates for instant feedback
- Infinite scroll with `useInfiniteQuery`
- Real-time unread count updates
- Error handling and retry logic

#### State Management

1. **Server State**: TanStack Query
   - Caching and synchronization
   - Background refetching
   - Optimistic updates
   - Request deduplication

2. **URL State**: TanStack Router
   - Subscription filtering via URL params
   - Deep linking support
   - Browser history integration

3. **Local State**: React useState
   - UI toggles (unread/all)
   - Temporary UI states

This architecture provides a robust, scalable subscription aggregation system with excellent user experience and performance characteristics.