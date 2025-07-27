# Subscription Feature Implementation Plan

**Based on PRD:** Multi-Subscription Content Feeds (Phase 1: Spotify Podcasts & YouTube Channels)  
**Created:** July 27, 2025

---

## Phase 1: Database Schema & Backend Infrastructure

### 1.1 Database Schema Changes
**File:** `packages/api/src/schema.ts`

```sql
-- New tables required:
CREATE TABLE connected_accounts (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  service TEXT NOT NULL, -- 'spotify' | 'youtube'
  access_token TEXT NOT NULL,
  refresh_token TEXT,
  expires_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id),
  UNIQUE(user_id, service) -- Only one account per service per user
);

CREATE TABLE subscriptions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  connected_account_id TEXT NOT NULL,
  external_id TEXT NOT NULL, -- Spotify show ID or YouTube channel ID
  title TEXT NOT NULL,
  creator_name TEXT NOT NULL,
  thumbnail_url TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (connected_account_id) REFERENCES connected_accounts(id),
  UNIQUE(connected_account_id, external_id)
);

CREATE TABLE subscription_items (
  id TEXT PRIMARY KEY,
  subscription_id TEXT NOT NULL,
  external_id TEXT NOT NULL, -- Episode/video ID
  title TEXT NOT NULL,
  description TEXT,
  thumbnail_url TEXT,
  duration INTEGER, -- in seconds
  published_at INTEGER NOT NULL,
  status TEXT DEFAULT 'unread', -- 'unread' | 'read'
  bookmark_id TEXT, -- Reference to bookmark if saved
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (subscription_id) REFERENCES subscriptions(id),
  FOREIGN KEY (bookmark_id) REFERENCES bookmarks(id),
  UNIQUE(subscription_id, external_id)
);
```

### 1.2 API Endpoints
**File:** `packages/api/src/routes/subscriptions.ts`

```typescript
// OAuth & Account Management
POST /api/v1/auth/spotify/connect
POST /api/v1/auth/youtube/connect
DELETE /api/v1/auth/:service/disconnect
GET /api/v1/auth/connected-accounts

// Subscription Management
GET /api/v1/subscriptions/discover/:service  // Get available podcasts/channels
POST /api/v1/subscriptions                   // Subscribe to show/channel
DELETE /api/v1/subscriptions/:id             // Unsubscribe
GET /api/v1/subscriptions                    // Get user's subscriptions
PUT /api/v1/subscriptions/:id/toggle         // Enable/disable subscription

// Feed Items
GET /api/v1/feed                             // Get unread items across all subscriptions
GET /api/v1/feed/:subscriptionId             // Get items for specific subscription
PUT /api/v1/feed/items/:id/read              // Mark item as read
POST /api/v1/feed/items/:id/bookmark         // Save item as bookmark
```

### 1.3 Background Jobs
**File:** `packages/api/src/jobs/polling.ts`

```typescript
// Scheduled Worker for polling external APIs
- Spotify Web API integration for podcast episodes
- YouTube Data API v3 integration for channel videos
- Exponential backoff on failures
- Token refresh handling
- Rate limit management
```

---

## Phase 2: Frontend Components & User Experience

### 2.1 New Pages/Routes
**Files:** `apps/web/src/routes/`

```typescript
// Route structure
/feed                    // Main subscription feed (stories UI)
/feed/$subscriptionId    // Individual subscription items
/settings/subscriptions  // Manage subscriptions
/auth/connect/:service   // OAuth connection flow
```

### 2.2 Core Components
**Files:** `apps/web/src/components/`

```typescript
// Feed Components
<SubscriptionFeed />           // Main stories-style horizontal avatars
<SubscriptionAvatar />         // Individual subscription circle
<ItemsList />                  // Vertical list of unread items
<ItemPreview />               // Individual item preview card
<SaveToZineButton />          // Bookmark action button

// Setup Components  
<AccountConnector />          // OAuth connection UI
<SubscriptionSelector />      // Initial setup checklist
<ManageSubscriptions />       // Toggle subscriptions on/off

// Utility Components
<EmptyFeedState />           // "All caught up" message
<ConnectionStatus />         // Auth error banners
<LoadingStates />           // Loading skeletons
```

### 2.3 Custom Hooks
**Files:** `apps/web/src/hooks/`

```typescript
// Data fetching hooks using TanStack Query
useConnectedAccounts()       // Get user's connected accounts
useSubscriptions()           // Get user's subscriptions  
useFeedItems()              // Get unread feed items
useDiscoverContent()        // Get available podcasts/channels to subscribe
useMarkAsRead()             // Mark item as read mutation
useSaveBookmark()           // Save item as bookmark mutation
useToggleSubscription()     // Enable/disable subscription mutation
```

---

## Phase 3: OAuth Integration

### 3.1 Spotify Integration
**Files:** `packages/api/src/services/spotify.ts`

```typescript
// Spotify Web API integration
- OAuth 2.0 PKCE flow
- Scopes: user-read-playback-position, user-library-read
- Endpoints: /me/shows, /shows/{id}/episodes
- Podcast-only filtering (exclude music)
- Token refresh automation
```

### 3.2 YouTube Integration  
**Files:** `packages/api/src/services/youtube.ts`

```typescript
// YouTube Data API v3 integration
- OAuth 2.0 flow
- Scopes: youtube.readonly
- Endpoints: /subscriptions, /channels, /search
- Channel videos retrieval
- Quota management (10,000 units/day)
```

### 3.3 OAuth Security
**Files:** `packages/api/src/middleware/auth.ts`

```typescript
// Security considerations
- PKCE for mobile/SPA security
- Secure token storage in D1
- Token encryption at rest
- Automatic token refresh
- Scope validation
- Rate limiting per user
```

---

## Phase 4: Shared Services & Business Logic

### 4.1 Repository Pattern Extensions
**Files:** `packages/shared/src/`

```typescript
// New repository interfaces
interface SubscriptionRepository {
  getByUserId(userId: string): Promise<Subscription[]>
  create(subscription: CreateSubscription): Promise<Subscription>
  delete(id: string): Promise<void>
  toggleActive(id: string, active: boolean): Promise<void>
}

interface FeedRepository {
  getUnreadItems(userId: string): Promise<FeedItem[]>
  getItemsBySubscription(subscriptionId: string): Promise<FeedItem[]>
  markAsRead(itemId: string): Promise<void>
  createFromExternal(item: ExternalItem): Promise<FeedItem>
}
```

### 4.2 Service Layer
**Files:** `packages/shared/src/services/`

```typescript
// Business logic services
class SubscriptionService {
  async connectAccount(userId: string, service: string, tokens: OAuthTokens)
  async discoverContent(userId: string, service: string)
  async subscribe(userId: string, externalId: string)
  async getSubscriptions(userId: string)
  async syncNewContent(subscription: Subscription)
}

class FeedService {
  async getFeedItems(userId: string, filter?: 'unread' | 'all')
  async markItemAsRead(itemId: string)
  async saveItemAsBookmark(itemId: string, userId: string)
}
```

---

## Phase 5: UI/UX Implementation

### 5.1 Stories-Style Feed Design
```typescript
// Horizontal scrollable avatar bar
- Circular avatars with subscription thumbnails
- Ordered by most recent content (left to right)
- Unread indicator (badge/dot)
- Smooth horizontal scroll
- Loading states for each avatar
```

### 5.2 Item Preview Cards
```typescript
// Vertical swipeable item list
- Hero thumbnail
- Title, creator, publish date, duration
- Description preview (truncated)
- "Save to Zine" prominent button
- Visual "already bookmarked" state
- Swipe gestures for navigation
```

### 5.3 Onboarding Flow
```typescript
// Multi-step setup process
1. Service selection (Spotify/YouTube)
2. OAuth connection
3. Subscription selector with search/filter
4. Success confirmation
5. First feed view tutorial
```

---

## Phase 6: Performance & Monitoring

### 6.1 Performance Requirements
- Feed load ≤ 2s for 25 subscriptions / 200 items
- Optimistic UI updates for read/bookmark actions
- Infinite scroll for large subscription lists
- Image lazy loading and caching
- Background sync when app is closed

### 6.2 Error Handling
- OAuth token expiry recovery
- API rate limit handling
- Network connectivity issues
- Graceful degradation for missing data
- User-friendly error messages

### 6.3 Analytics & Monitoring
- Track subscription adoption rates
- Monitor feed engagement metrics
- API performance and error rates
- User flow completion rates
- Background job success rates

---

## Implementation Order

1. **Week 1-2:** Database schema, basic API endpoints, OAuth setup
2. **Week 3-4:** Spotify/YouTube service integration, polling jobs
3. **Week 5-6:** Frontend components, routing, basic UI
4. **Week 7-8:** Stories UI, item previews, save functionality  
5. **Week 9-10:** Onboarding flow, subscription management
6. **Week 11-12:** Polish, performance optimization, testing

---

## Success Criteria Checklist

- [ ] Users can connect Spotify and YouTube accounts
- [ ] Subscription selector shows available content
- [ ] Feed updates automatically via background polling
- [ ] Stories UI displays subscriptions by recent activity
- [ ] Items can be marked as read and saved as bookmarks
- [ ] Manage subscriptions allows enable/disable
- [ ] Performance meets 2s load time requirement
- [ ] Error handling for OAuth and API failures
- [ ] 20% of bookmarks come from feed within 30 days
- [ ] 10% increase in DAU within 30 days

---

_Implementation plan based on PRD requirements and Zine's existing architecture_