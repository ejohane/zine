# Feed Feature - Current Implementation

## Architecture Overview

The feed is a **content aggregation system** that pulls from Spotify podcasts and YouTube channels, with a sophisticated multi-layer architecture.

## Database Schema

### Core Tables

Three core tables power the feed:

#### `content` Table
Universal content storage for all videos/podcasts with rich metadata:
- **Phase 1**: Basic metrics (viewCount, likeCount, commentCount, popularityScore)
- **Phase 2**: Creator enrichment (subscriber count, verification, series context)
- **Phase 3**: Technical details (captions, video quality, audio languages, transcripts)
- **Phase 4**: Cross-platform deduplication (content fingerprints, canonical publishers)

#### `feedItems` Table
Links subscriptions to content with position tracking:
```typescript
{
  id, subscriptionId, contentId, addedToFeedAt, positionInFeed
}
```

#### `userFeedItems` Table
Per-user state tracking:
```typescript
{
  id, userId, feedItemId, isRead, isSaved, isHidden,
  readAt, savedAt, engagementTime, bookmarkId
}
```

### Supporting Tables

- **`subscriptions`**: Available podcast/channel feed sources (Spotify, YouTube)
- **`userSubscriptions`**: User's active subscriptions with boolean `isActive` flag
- **`users`**: User profiles with Durable Object tracking
- **`userAccounts`**: OAuth connections to providers (Spotify, YouTube)
- **`creators`**: Creator metadata (name, avatar, verified status, subscriber counts)

### Database Relationships

```
User (1) ──→ (many) UserAccount (Spotify/YouTube connections)
User (1) ──→ (many) UserSubscription (active subscriptions)
           ↓
Subscription (many channels/podcasts)
           ↓
FeedItem (items from each subscription)
           ↓
Content (metadata, shared across subscriptions)
User (1) ──→ (many) UserFeedItem (read state tracking)
           ↓
FeedItem
```

## API Endpoints

Location: `packages/api/src/index.ts`

### Main Feed Endpoints

```
GET  /api/v1/feed                              - Get user's feed items with pagination
GET  /api/v1/feed?subscription=X&unread=true  - Get specific subscription feed, filter unread
PUT  /api/v1/feed/:itemId/read                - Mark item as read
PUT  /api/v1/feed/:itemId/unread              - Mark item as unread
GET  /api/v1/feed/subscriptions                - Get subscriptions with unread counts
```

### Subscription Management

```
GET  /api/v1/subscriptions                     - List user's subscriptions
GET  /api/v1/subscriptions/discover/:provider - Discover available subscriptions (Spotify/YouTube)
POST /api/v1/subscriptions/:provider/update   - Add/remove subscriptions
POST /api/v1/subscriptions/refresh             - Manually trigger feed refresh (rate-limited: 5 min)
```

### OAuth Integration

```
POST /api/v1/auth/:provider/connect           - Initiate OAuth flow
GET  /api/v1/auth/:provider/callback          - OAuth callback (stores tokens in D1 + Durable Objects)
DELETE /api/v1/auth/:provider/disconnect      - Disconnect provider account
GET  /api/v1/auth/health                      - Check token health/expiration
```

### Feed Polling (Scheduled)

```
GET  /api/v1/jobs/poll-feeds                  - Manual feed poll trigger
GET  /api/v1/health/feeds                     - Health check endpoint
```

## Repository Pattern

Location: `packages/shared/src/repositories/` and `packages/api/src/`

### D1FeedItemRepository

Implements `FeedItemRepository` interface with key methods:
- `createFeedItem()` / `createFeedItems()` - Create content + feed items
- `findOrCreateFeedItem()` - Deterministic ID handling
- `getUserFeedItems()` - Query with optional filtering (unread, subscriptions)
- `markAsRead()` / `markAsUnread()` - User interaction tracking
- `getSubscriptionsWithUnreadCounts()` - Aggregated stats

Features:
- Batch operations to avoid SQLite 999-variable limit
- Handles feed item CRUD operations
- Optimistic caching with TTL

### DualModeSubscriptionRepository

Handles both D1 database AND Durable Objects:
- OAuth token storage moved to Durable Objects for performance
- Methods include subscription CRUD, user account management, token operations

## Polling Services

Location: `packages/api/src/services/`

### OptimizedFeedPollingService

Batch processing for Spotify and YouTube with:
- Deduplication cache (20K items, 2-hour TTL)
- Smaller batch sizes (10 items) to avoid CPU timeout
- Low concurrency (2) for stability
- Uses `SpotifyBatchProcessor` and `YouTubeBatchProcessor`

**Scheduled Execution:**
- Cloudflare cron: `0 * * * *` (hourly)
- Queries all active users with Durable Objects
- Processes users in batches (5 per batch to prevent timeout)
- Each Durable Object polls user's subscriptions
- New items created in `feedItems` and `userFeedItems` tables
- Status tracked in `durableObjectStatus` for monitoring

### InitialFeedPopulationService

When user adds new subscriptions:
- Populates initial feed with last 7 days of content
- Batch creates feed items and user feed items

## Data Flow

### End-to-End Flow

```
User Connects Provider (OAuth)
    ↓
UserAccount created (tokens in D1 + Durable Objects)
    ↓
User Discovers & Subscribes to Channels
    ↓
UserSubscription created (isActive = true)
    ↓
Feed Polling (Scheduled/Manual)
    ↓
Batch Processor fetches from Provider API
    ↓
Content deduplicated + stored in content table
    ↓
FeedItem created linking Subscription → Content
    ↓
UserFeedItem created (isRead=false for each subscriber)
    ↓
Mobile App queries GET /api/v1/feed
    ↓
User marks as read/saved/hidden
    ↓
UserFeedItem updated
```

### Content Unification Model

The `content` table is the single source of truth for all content across providers:

1. Content fetched from provider API (Spotify/YouTube)
2. Stored once in `content` table (deduplicated by externalId + provider)
3. Feed items are lightweight - they just reference content by ID
4. Reduces data duplication and enables cross-platform content matching

## Mobile App Integration

Location: `apps/mobile/`

### API Client

File: `apps/mobile/lib/api.ts`

Features:
- Dynamic API URL selection (localhost for simulator, IP for device)
- Clerk authentication token handling
- Fallback token refresh mechanism

### Available Hooks

Though not heavily utilized in current mobile app:
- `useFeed()` - Infinite query for paginated feed
- `useSubscriptionsWithCounts()` - Subscription list with unread badges
- `useMarkFeedItemRead()` / `useMarkFeedItemUnread()` - Mutations with optimistic updates
- `useSaveFeedItemToBookmarks()` - Cross-feature integration

### Current Status

**Mobile app currently focuses on bookmarks, not feeds.** Feed functionality is primarily web-based. The API and hooks exist but no mobile UI implementation.

## Web App Implementation

Location: `apps/web/src/`

### Feed Routes

- `/feed` - Main feed view
- `/feed/$subscriptionId` - Subscription-specific feed

### Components

- `FeedPage.tsx` - Main container
- `FeedItemList.tsx` - Paginated list
- `FeedItemCard.tsx` - Individual item display
- `SubscriptionAvatars.tsx` - Visual subscription management

### Hooks

File: `apps/web/src/hooks/useFeed.ts`

- `useFeed()` - Infinite query with pagination
- `useSubscriptionsWithCounts()` - Auto-refetch every 5 minutes
- `useFeedManager()` - Combined hook for all operations

## Key Architectural Decisions

1. **Content Deduplication**: Unified `content` table avoids storing duplicate articles/videos
2. **Batch Processing**: Large subscriptions processed in chunks to avoid timeout
3. **Durable Objects**: User polling lifecycle managed per-user in D1
4. **Token Caching**: OAuth tokens stored in Durable Objects, not just D1
5. **Read State Tracking**: `userFeedItems` table tracks individual read status per user
6. **Subscription Caching**: 2-minute TTL on feed queries, 1-minute on subscription counts
7. **Rate Limiting**: Manual refresh limited to 1 per 5 minutes per user

## Performance Optimizations

### Batch Processing

- **Batch Size**: 10 items (small to avoid CPU timeout)
- **Concurrency**: 2 concurrent operations
- **User Batching**: 5 users per batch during polling

### Caching Strategy

- **Deduplication Cache**: 20K items, 2-hour TTL
- **Feed Query Cache**: 2-minute TTL
- **Subscription Counts Cache**: 1-minute TTL
- **Auto-refetch**: Subscriptions refetch every 5 minutes in web app

### Database Optimizations

- Batch operations to avoid SQLite 999-variable limit
- Indexes on frequently queried fields
- Joins optimized for common query patterns

## Key Features

### ✅ Implemented

- Cross-platform content unification (same podcast on Spotify & YouTube = one content record)
- Per-user read state tracking
- Subscription-level filtering
- Unread count badges
- Save to bookmarks integration
- Rich metadata (Phase 1-4: metrics, creators, technical details, cross-platform matching)
- Batch processing with deduplication
- OAuth integration for Spotify and YouTube
- Scheduled hourly polling
- Manual refresh with rate limiting

### ❌ Not Implemented

- Mobile UI for feed (API exists, no UI)
- Push notifications for new content
- Content recommendations
- Advanced filtering/sorting options

## Current Status

- **Backend**: ✅ Fully functional, running hourly polls
- **Web App**: ✅ Working feed UI (though marked as dev tool only)
- **Mobile App**: ❌ No feed UI yet - only bookmarks feature implemented
- **Database**: ✅ Production-ready with comprehensive schema
- **API**: ✅ All endpoints functional with proper authentication

## File Locations

### Backend

- Schema: `packages/api/src/schema.ts:142-296`
- API Routes: `packages/api/src/index.ts:120-180`
- Feed Repository: `packages/api/src/d1-feed-item-repository.ts`
- Polling Service: `packages/api/src/services/optimized-feed-polling-service.ts`
- Initial Population: `packages/api/src/services/initial-feed-population-service.ts`

### Frontend

- Web Hooks: `apps/web/src/hooks/useFeed.ts`
- Feed Page: `apps/web/src/routes/feed/index.tsx`
- Feed Item Card: `apps/web/src/components/FeedItemCard.tsx`
- Feed Item List: `apps/web/src/components/FeedItemList.tsx`

### Shared

- Repository Interface: `packages/shared/src/repositories/feed-item-repository.ts`
- Feed Card Component: `packages/design-system/src/components/patterns/FeedCard.tsx`

## Current Limitations

1. **Mobile**: No feed UI implementation - focuses on bookmarks only
2. **Web**: Actively maintained but tagged as "development tool only"
3. **Rate Limiting**: Manual refresh limited to prevent abuse (5 min)
4. **Batch Size**: Intentionally small (10 items) to avoid Workers CPU timeout
5. **TTL**: Feed data cached 2 minutes, subscriptions 1 minute to balance freshness with performance
6. **Providers**: Currently supports Spotify and YouTube only

## Next Steps

Potential areas for enhancement:

1. **Mobile Feed UI**: Build React Native feed screens using existing API
2. **Performance**: Optimize polling for larger user bases
3. **Features**: Add content recommendations, advanced filtering
4. **Providers**: Add support for additional content sources (RSS, etc.)
5. **Notifications**: Push notifications for new content from subscriptions
