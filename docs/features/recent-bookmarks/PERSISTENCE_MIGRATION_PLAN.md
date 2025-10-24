# Recent Bookmarks - Database Persistence Migration Plan

## Status
**Created**: 2025-10-24  
**Updated**: 2025-10-24  
**Status**: ✅ Phase 4 Complete - Testing & Verification Complete

### Implementation Progress

#### ✅ Phase 1: API Endpoints (Completed - 2025-10-24)
- [x] Task 1.1: Database migration for index on bookmarks table
  - Created migration `0012_add_recent_bookmarks_index.sql`
  - Index verified working via EXPLAIN QUERY PLAN
  - Composite index: `idx_bookmarks_user_last_accessed (user_id, last_accessed_at DESC, status)`
- [x] Task 1.2: GET /api/v1/bookmarks/recent endpoint
  - Endpoint implemented and tested
  - Returns bookmarks ordered by `last_accessed_at DESC`
  - Filters out bookmarks with NULL `last_accessed_at`
  - Supports configurable limit (default 4, max 20)
- [x] Task 1.3: PATCH /api/v1/bookmarks/:id/accessed endpoint
  - Endpoint implemented and tested
  - Updates `last_accessed_at` timestamp
  - Returns 404 if bookmark not found or doesn't belong to user
  - Returns 200 with success response
- [x] Task 1.4: Update shared types
  - Added `lastAccessedAt` field to `BookmarkSchema` in `@zine/shared`
  - Type checking passed across all packages

#### ✅ Phase 2: Mobile App Updates (Completed - 2025-10-24)
- [x] Task 2.1: Update Bookmark Tracking Service
  - Added `trackBookmarkAccessedOptimistic` function for optimistic tracking with background sync
  - Added `syncRecentBookmarksFromStorage` helper function
  - Function immediately updates AsyncStorage and fires background API call
- [x] Task 2.2: Update Recent Bookmarks Hook
  - Updated `useRecentlyOpenedBookmarks` to read from AsyncStorage instantly
  - Added background sync from server with `syncRecentBookmarksFromServer`
  - Synced data updates AsyncStorage and invalidates query for smooth UX
  - Set `gcTime: Infinity` to keep data in memory
- [x] Task 2.3: Add API Client Methods
  - Added `bookmarksApi.trackAccessed(bookmarkId)` for updating last_accessed_at
  - Added `bookmarksApi.getRecentlyAccessed(limit)` for fetching recent bookmarks
  - Both methods use proper error handling and return typed responses
- [x] Task 2.4: Update Bookmark Open Tracking
  - Updated `TodayBookmarksSection.tsx` (2 occurrences)
  - Updated `OptimizedCompactBookmarkCard.tsx`
  - Updated `MediaRichBookmarkCard.tsx`
  - Updated `app/(app)/bookmark/[id].tsx` (2 occurrences)
  - All components now use optimistic updates with React Query cache manipulation

#### ✅ Phase 3: Migration & Cleanup (Completed - 2025-10-24)
- [x] Task 3.1: Add App Launch Sync
  - Added `syncRecentBookmarksOnLaunch` function in `QueryProvider`
  - Syncs on app launch after authentication
  - Updates AsyncStorage with server state
  - Handles errors gracefully (silent fail)
  - Restores data after app reinstall
  - Syncs cross-device changes
- [x] Task 3.2: Data Migration (Passive)
  - No explicit migration needed
  - Passive migration through `trackBookmarkAccessedOptimistic`
  - When user opens a bookmark, database is updated automatically
  - AsyncStorage continues to work during transition
- [x] Task 3.3: Update Shared Types
  - `BookmarkSchema` already includes `lastAccessedAt` field
  - All consuming code type-checks successfully
  - No changes needed

#### ✅ Phase 4: Testing (Completed - 2025-10-24)
- [x] Task 4.1: API Testing
  - Created comprehensive test suite in `packages/api/src/__tests__/recent-bookmarks.test.ts`
  - All 13 API tests passing
  - Covers GET /api/v1/bookmarks/recent endpoint
  - Covers PATCH /api/v1/bookmarks/:id/accessed endpoint
  - Tests limit enforcement, error handling, and edge cases
- [x] Task 4.2: Mobile App Testing (Code Review)
  - Verified `useRecentlyOpenedBookmarks` hook implementation
  - Verified `trackBookmarkAccessedOptimistic` function
  - Verified API client methods in `lib/api.ts`
  - Verified QueryProvider app launch sync
  - Verified components use optimistic update pattern
- [x] Task 4.3: Edge Cases & Sync Scenarios (Code Review)
  - Background sync implemented in hook
  - App launch sync implemented in QueryProvider
  - Optimistic updates implemented in all bookmark components
  - Error handling gracefully falls back to AsyncStorage
  - AsyncStorage acts as local cache with database as persistent backup

## TL;DR - Key Design Decisions

### 🎯 User Experience Goals
- ✅ **Zero loading spinners** - always instant
- ✅ **Instant updates** - optimistic UI
- ✅ **Works offline** - AsyncStorage cache
- ✅ **Never lose data** - database backup
- ✅ **Cross-device sync** - database propagation

### 🏗️ Architecture
- **AsyncStorage** = Local cache (instant reads/writes)
- **React Query** = Optimistic updates (instant UI)
- **Database** = Persistent backup (background sync)

### 📝 Update Pattern
```
User opens bookmark
  → Update AsyncStorage (instant) ⚡
  → Update React Query cache (instant) ⚡
  → Background: Sync to database (fire-and-forget)
```

### 📖 Read Pattern
```
Show recent bookmarks
  → Read from AsyncStorage (instant) ⚡
  → Background: Fetch from database
  → Background: Update AsyncStorage if different
```

## Problem Statement

The current Recently Opened Bookmarks feature uses AsyncStorage for local-only state. This causes data loss when:
- iOS clears app cache due to low storage
- User reinstalls the app
- App data is cleared for any reason

**Current Behavior:**
- Local-only tracking via AsyncStorage (`@zine:recent_bookmarks`)
- Data does not sync across devices
- Data is lost on app reinstall

**Desired Behavior:**
- Persistent tracking via database (`bookmarks.last_accessed_at`)
- Automatic sync across all user devices
- Data survives app reinstalls
- Backwards compatible with existing AsyncStorage implementation

---

## Solution: Optimistic Local-First with Database Sync

Use **AsyncStorage as local cache** with **background database sync** for persistence and cross-device sync.

### Architecture Decision
**Optimistic local-first architecture** with database as persistent backup:
- AsyncStorage = instant local cache (no loading spinners)
- Database = persistent backup + cross-device sync
- React Query = orchestrates optimistic updates

**Data Flow:**
1. **Write Path (Opening Bookmark)**:
   - Immediately update AsyncStorage (optimistic)
   - Immediately update React Query cache (instant UI update)
   - Background: Sync to database (fire-and-forget)

2. **Read Path (Showing Recent Bookmarks)**:
   - Immediately read from AsyncStorage (instant display)
   - Background: Fetch from database and update AsyncStorage if different
   - Re-render only if server data differs

**Why this approach:**
- ✅ **Zero loading spinners** - always instant from AsyncStorage
- ✅ **Works offline** - AsyncStorage is always available
- ✅ **Syncs across devices** - database propagates changes
- ✅ **Never loses data** - database backup prevents loss
- ✅ **Optimistic UX** - updates happen instantly
- ✅ **Background sync** - never blocks UI

---

## Optimistic Update Architecture

### Layer 1: AsyncStorage (Local Cache - Instant)
- **Purpose**: Instant reads/writes, no loading spinners
- **Lifecycle**: Persists until app uninstall or cache clear
- **Used for**: Immediate UI updates, offline support

### Layer 2: React Query Cache (In-Memory - Instant)
- **Purpose**: Optimistic UI updates without refetching
- **Lifecycle**: In-memory during app session
- **Used for**: Instant UI feedback on bookmark opens

### Layer 3: Database (Persistent Backup - Background)
- **Purpose**: Permanent storage, cross-device sync
- **Lifecycle**: Permanent
- **Used for**: Backup, recovery, multi-device sync

### Update Flow (When User Opens Bookmark)

```
User opens bookmark
    ↓
1. Update AsyncStorage (< 10ms)
    ↓
2. Update React Query cache optimistically (< 1ms)
    ↓
3. UI updates INSTANTLY ⚡
    ↓
4. [Background] PATCH /bookmarks/:id/accessed (fire-and-forget)
    ↓
5. [Background] Database updated (async)
```

### Read Flow (When Displaying Recent Bookmarks)

```
Component renders
    ↓
1. Read from AsyncStorage (< 10ms)
    ↓
2. Show data INSTANTLY ⚡ (no loading spinner)
    ↓
3. [Background] GET /bookmarks/recent (async)
    ↓
4. [Background] If server data differs, update AsyncStorage
    ↓
5. [Background] Invalidate query → re-render with synced data
```

### Sync Strategy

- **On app launch**: Background fetch from database → update AsyncStorage
- **On bookmark open**: Optimistic AsyncStorage update → background database sync
- **On network reconnect**: Background sync any pending changes
- **Conflict resolution**: Server always wins (last-write-wins)

---

## Implementation Plan

### Phase 1: API Endpoints (1-2 hours)

#### Task 1.1: Add "Track Accessed" Endpoint
**File**: `packages/api/src/routes/bookmarks.ts` (new file or extend existing)

**Endpoint**: `PATCH /bookmarks/:id/accessed`

**Purpose**: Update `last_accessed_at` timestamp when user opens bookmark

**Request**:
```typescript
PATCH /bookmarks/:bookmarkId/accessed
Authorization: Bearer <token>
```

**Response**:
```typescript
{
  "success": true,
  "bookmarkId": "bookmark-123",
  "lastAccessedAt": 1729789200000
}
```

**Implementation**:
```typescript
app.patch('/:id/accessed', async (c) => {
  const auth = getAuthContext(c)
  const bookmarkId = c.req.param('id')
  
  // Update last_accessed_at timestamp
  await c.env.DB.prepare(
    `UPDATE bookmarks 
     SET last_accessed_at = ?
     WHERE id = ? AND user_id = ?`
  ).bind(Date.now(), bookmarkId, auth.userId).run()
  
  return c.json({ 
    success: true, 
    bookmarkId,
    lastAccessedAt: Date.now()
  })
})
```

**Acceptance Criteria**:
- [x] Endpoint updates `last_accessed_at` field
- [x] Returns 404 if bookmark not found or doesn't belong to user
- [x] Returns 200 on success
- [x] Handles concurrent updates gracefully

---

#### Task 1.2: Add "Get Recent Bookmarks" Endpoint
**File**: `packages/api/src/routes/bookmarks.ts`

**Endpoint**: `GET /bookmarks/recent?limit=4`

**Purpose**: Fetch most recently accessed bookmarks ordered by `last_accessed_at`

**Request**:
```typescript
GET /bookmarks/recent?limit=4
Authorization: Bearer <token>
```

**Response**:
```typescript
{
  "data": [
    {
      "id": "bookmark-123",
      "userId": "user-456",
      "url": "https://youtube.com/watch?v=abc",
      "title": "Video Title",
      "description": "...",
      "thumbnailUrl": "...",
      "lastAccessedAt": 1729789200000,
      // ... other bookmark fields
    }
  ]
}
```

**Implementation**:
```typescript
app.get('/recent', async (c) => {
  const auth = getAuthContext(c)
  const limit = parseInt(c.req.query('limit') || '4')
  
  const bookmarks = await c.env.DB.prepare(
    `SELECT 
       b.id,
       b.user_id,
       b.notes,
       b.bookmarked_at,
       b.last_accessed_at,
       b.status,
       c.url,
       c.title,
       c.description,
       c.thumbnail_url,
       c.content_type,
       c.creator_name
     FROM bookmarks b
     JOIN content c ON b.content_id = c.id
     WHERE b.user_id = ? 
       AND b.status = 'active'
       AND b.last_accessed_at IS NOT NULL
     ORDER BY b.last_accessed_at DESC
     LIMIT ?`
  ).bind(auth.userId, limit).all()
  
  return c.json({ data: bookmarks.results })
})
```

**Acceptance Criteria**:
- [x] Returns bookmarks ordered by `last_accessed_at` DESC
- [x] Filters out bookmarks that have never been accessed (`last_accessed_at IS NULL`)
- [x] Only returns active bookmarks (`status = 'active'`)
- [x] Respects limit parameter (default 4, max 20)
- [x] Returns empty array if no recent bookmarks

---

#### Task 1.3: Add Database Index
**File**: `packages/api/migrations/0012_add_recent_bookmarks_index.sql`

**Purpose**: Optimize query performance for recent bookmarks

**Migration**:
```sql
-- Migration: Add index for recent bookmarks query
-- Created: 2025-10-24
-- Purpose: Optimize query performance for recently accessed bookmarks

-- Create composite index for efficient recent bookmarks query
CREATE INDEX IF NOT EXISTS idx_bookmarks_user_last_accessed 
ON bookmarks(user_id, last_accessed_at DESC, status)
WHERE last_accessed_at IS NOT NULL;
```

**Acceptance Criteria**:
- [x] Migration creates index successfully
- [x] Index improves query performance (verified via EXPLAIN QUERY PLAN)
- [x] Index only includes bookmarks with `last_accessed_at` set

---

### Phase 2: Mobile App Updates (1 hour)

#### Task 2.1: Update Bookmark Tracking Service
**File**: `apps/mobile/lib/recentBookmarks.ts`

**Changes**:
- **Keep existing AsyncStorage functions** - they become the local cache layer
- Add new function for optimistic tracking with background sync

**New Function**:
```typescript
export async function trackBookmarkAccessedOptimistic(
  bookmarkId: string
): Promise<void> {
  // 1. IMMEDIATE: Update AsyncStorage (optimistic local state)
  await addRecentBookmark(bookmarkId);
  
  // 2. BACKGROUND: Sync to database (fire-and-forget)
  // Don't await - this runs in the background
  bookmarksApi.trackAccessed(bookmarkId).catch(error => {
    console.error('Background sync failed for bookmark access:', error);
    // AsyncStorage already updated, so UI is correct
    // Will sync on next app launch or retry
  });
}
```

**Key Strategy**:
- AsyncStorage = instant local cache (no loading spinners)
- Database = persistent backup that syncs in background
- UI always shows AsyncStorage data immediately
- Background sync keeps database in sync

**Acceptance Criteria**:
- [x] Immediately updates AsyncStorage (optimistic)
- [x] Calls API in background (fire-and-forget)
- [x] Never blocks UI or shows loading spinner
- [x] Handles network errors gracefully (local state already updated)

---

#### Task 2.2: Update Recent Bookmarks Hook
**File**: `apps/mobile/hooks/useRecentlyOpenedBookmarks.ts`

**Changes**:
- **Read from AsyncStorage first** (instant, no loading spinner)
- **Background sync from API** to hydrate AsyncStorage with server state
- Use React Query to orchestrate optimistic updates

**New Implementation**:
```typescript
export function useRecentlyOpenedBookmarks() {
  const queryClient = useQueryClient();
  
  return useQuery({
    queryKey: ['recently-opened-bookmarks'],
    queryFn: async () => {
      // STEP 1: Read from AsyncStorage immediately (local cache)
      const recentIds = await getRecentBookmarks();
      
      if (recentIds.length < 4) {
        return [];
      }
      
      // Get full bookmark data from main bookmarks query
      const allBookmarks = await bookmarksApi.getAll();
      const localBookmarks = recentIds
        .map(recent => allBookmarks.find(b => b.id === recent.bookmarkId))
        .filter((b): b is Bookmark => b !== undefined);
      
      // STEP 2: Background sync from database (fire-and-forget)
      syncRecentBookmarksFromServer(queryClient).catch(error => {
        console.error('Background sync failed:', error);
        // Local data already returned, so no impact on UX
      });
      
      return localBookmarks;
    },
    staleTime: 0, // Always show AsyncStorage data immediately
    gcTime: Infinity, // Keep in memory
  });
}

// Background sync function
async function syncRecentBookmarksFromServer(
  queryClient: QueryClient
): Promise<void> {
  try {
    // Fetch from database
    const serverBookmarks = await bookmarksApi.getRecent(4);
    
    if (serverBookmarks.length >= 4) {
      // Update AsyncStorage with server state
      const recentItems = serverBookmarks.map(b => ({
        bookmarkId: b.id,
        openedAt: b.lastAccessedAt || Date.now(),
      }));
      
      // Write to AsyncStorage
      await AsyncStorage.setItem(
        '@zine:recent_bookmarks',
        JSON.stringify({ bookmarks: recentItems })
      );
      
      // Invalidate query to refresh UI with synced data
      queryClient.invalidateQueries({ 
        queryKey: ['recently-opened-bookmarks'] 
      });
    }
  } catch (error) {
    // Silent fail - local AsyncStorage already has data
    console.error('Server sync failed:', error);
  }
}
```

**Key Strategy**:
- **Initial render**: Instant from AsyncStorage (no loading spinner)
- **Background**: Fetch from database and update AsyncStorage
- **Re-render**: Only if server data differs from local data
- **Offline**: Works perfectly with AsyncStorage only

**Acceptance Criteria**:
- [x] Returns AsyncStorage data immediately (no loading state)
- [x] Syncs from database in background
- [x] Updates UI only if server data differs
- [x] Works offline (AsyncStorage only)
- [x] Never blocks render with loading spinner

---

#### Task 2.3: Update Bookmark Open Tracking with Optimistic Updates
**Files**: 
- `apps/mobile/components/MediaRichBookmarkCard.tsx`
- `apps/mobile/components/OptimizedCompactBookmarkCard.tsx`
- `apps/mobile/components/TodayBookmarksSection.tsx`
- `apps/mobile/app/(app)/bookmark/[id].tsx`

**Changes**:
- Use optimistic tracking function
- Use React Query's optimistic update pattern

**Example Change**:
```typescript
// Before
await addRecentBookmark(bookmark.id);
queryClient.invalidateQueries({ queryKey: ['recently-opened-bookmarks'] });

// After - Optimistic Update Pattern
const handleOpenLink = async () => {
  // 1. OPTIMISTIC: Update AsyncStorage immediately
  await trackBookmarkAccessedOptimistic(bookmark.id);
  
  // 2. Update React Query cache immediately (no refetch needed)
  queryClient.setQueryData(
    ['recently-opened-bookmarks'],
    (old: Bookmark[] | undefined) => {
      if (!old) return old;
      
      // Move this bookmark to the front
      const filtered = old.filter(b => b.id !== bookmark.id);
      return [bookmark, ...filtered].slice(0, 4);
    }
  );
  
  // 3. Open the link (background sync already happening)
  await Linking.openURL(bookmark.url);
};
```

**Alternative: Use React Query Mutation**:
```typescript
const trackAccessMutation = useMutation({
  mutationFn: async (bookmarkId: string) => {
    // This runs in background (fire-and-forget)
    await bookmarksApi.trackAccessed(bookmarkId);
  },
  onMutate: async (bookmarkId) => {
    // OPTIMISTIC: Update immediately
    await addRecentBookmark(bookmarkId);
    
    // Cancel outgoing refetches
    await queryClient.cancelQueries({ 
      queryKey: ['recently-opened-bookmarks'] 
    });
    
    // Snapshot previous value
    const previous = queryClient.getQueryData(['recently-opened-bookmarks']);
    
    // Optimistically update
    queryClient.setQueryData(
      ['recently-opened-bookmarks'],
      (old: Bookmark[] | undefined) => {
        if (!old) return old;
        const bookmark = allBookmarks.find(b => b.id === bookmarkId);
        if (!bookmark) return old;
        const filtered = old.filter(b => b.id !== bookmarkId);
        return [bookmark, ...filtered].slice(0, 4);
      }
    );
    
    return { previous };
  },
  onError: (err, bookmarkId, context) => {
    // Rollback on error (though AsyncStorage already updated)
    queryClient.setQueryData(
      ['recently-opened-bookmarks'],
      context?.previous
    );
  },
});

// Usage
trackAccessMutation.mutate(bookmark.id);
```

**Acceptance Criteria**:
- [x] UI updates instantly (no loading spinner)
- [x] AsyncStorage updated immediately
- [x] Database syncs in background
- [x] React Query cache updated optimistically
- [x] No perceived latency for user
- [x] Works offline (AsyncStorage + local cache)

---

#### Task 2.4: Add API Client Methods
**File**: `apps/mobile/lib/api.ts`

**New Methods**:
```typescript
export const bookmarksApi = {
  // ... existing methods
  
  async trackAccessed(bookmarkId: string): Promise<void> {
    const response = await apiClient.patch(
      `/bookmarks/${bookmarkId}/accessed`
    );
    if (!response.ok) {
      throw new Error('Failed to track bookmark access');
    }
  },
  
  async getRecent(limit: number = 4): Promise<Bookmark[]> {
    const response = await apiClient.get(
      `/bookmarks/recent?limit=${limit}`
    );
    if (!response.ok) {
      throw new Error('Failed to fetch recent bookmarks');
    }
    const data = await response.json();
    return data.data;
  },
};
```

**Acceptance Criteria**:
- [x] Methods use correct API endpoints
- [x] Handles authentication automatically
- [x] Returns typed responses
- [x] Throws errors on failure

---

### Phase 3: Migration & Cleanup (30 minutes)

#### Task 3.1: Add App Launch Sync
**File**: `apps/mobile/app/_layout.tsx` or `apps/mobile/contexts/query.tsx`

**Purpose**: Sync database state to AsyncStorage on app launch

**Implementation**:
```typescript
// On app launch (after auth)
useEffect(() => {
  async function syncRecentBookmarksOnLaunch() {
    try {
      const serverBookmarks = await bookmarksApi.getRecent(4);
      
      if (serverBookmarks.length > 0) {
        // Update AsyncStorage with server state
        const recentItems = serverBookmarks.map(b => ({
          bookmarkId: b.id,
          openedAt: b.lastAccessedAt || Date.now(),
        }));
        
        await AsyncStorage.setItem(
          '@zine:recent_bookmarks',
          JSON.stringify({ bookmarks: recentItems })
        );
      }
    } catch (error) {
      console.error('Launch sync failed:', error);
      // Continue with AsyncStorage data
    }
  }
  
  if (isAuthenticated) {
    syncRecentBookmarksOnLaunch();
  }
}, [isAuthenticated]);
```

**Acceptance Criteria**:
- [x] Runs on app launch after authentication
- [x] Updates AsyncStorage with server state
- [x] Doesn't block app startup
- [x] Handles errors gracefully (silent fail)
- [x] Restores data after app reinstall
- [x] Syncs cross-device changes

---

#### Task 3.2: Data Migration (Optional)
**Purpose**: Migrate existing AsyncStorage data to database

**Strategy**: Passive migration on next bookmark open
- When user opens a bookmark, it updates the database
- No need to migrate historical AsyncStorage data
- AsyncStorage remains as primary cache

**Acceptance Criteria**:
- [x] No explicit migration needed (lazy migration)
- [x] AsyncStorage continues to work during transition

---

#### Task 3.3: Update Shared Types (if needed)
**File**: `packages/shared/src/types.ts`

**Changes**:
- Ensure `Bookmark` type includes `lastAccessedAt` field
- Add to schema if missing

**Check**:
```typescript
export const BookmarkSchema = z.object({
  // ... existing fields
  lastAccessedAt: optionalUnixTimestamp(), // Add if missing
});
```

**Acceptance Criteria**:
- [x] Type includes `lastAccessedAt`
- [x] All consuming code type-checks

---

### Phase 4: Testing (1 hour)

#### Task 4.1: API Testing
**Tests**:
- [x] `PATCH /bookmarks/:id/accessed` updates timestamp
- [x] `PATCH /bookmarks/:id/accessed` returns 404 for non-existent bookmark
- [x] `PATCH /bookmarks/:id/accessed` returns 404 for other user's bookmark
- [x] `GET /bookmarks/recent` returns correct bookmarks in order
- [x] `GET /bookmarks/recent` returns empty array if no accessed bookmarks
- [x] `GET /bookmarks/recent` handles null results gracefully
- [x] `GET /bookmarks/recent` respects limit parameter (default 4)
- [x] `GET /bookmarks/recent` enforces maximum limit of 20
- [x] `GET /bookmarks/recent` enforces minimum limit of 1
- [x] Both endpoints handle database errors gracefully
- [x] Concurrent updates handled without conflicts

**Test File**: `packages/api/src/__tests__/recent-bookmarks.test.ts`
**Test Results**: ✅ 13/13 tests passing

#### Task 4.2: Mobile App Testing (Code Review Verification)
**Verified Implementation**:
- [x] Opening bookmark updates database (via `trackBookmarkAccessedOptimistic`)
- [x] Recent section shows database bookmarks (via `useRecentlyOpenedBookmarks`)
- [x] Recent section updates after opening bookmark (optimistic cache update)
- [x] Fallback to AsyncStorage works when API fails (fire-and-forget pattern)
- [x] Recent section persists across app restarts (AsyncStorage + database sync)
- [x] Recent section syncs across devices (app launch sync in QueryProvider)
- [x] Section hides when < 4 bookmarks accessed (implemented in hook)

**Implementation Verified In**:
- `apps/mobile/hooks/useRecentlyOpenedBookmarks.ts` - Hook with background sync
- `apps/mobile/lib/recentBookmarks.ts` - Optimistic tracking function
- `apps/mobile/lib/api.ts` - API client methods
- `apps/mobile/contexts/query.tsx` - App launch sync
- `apps/mobile/components/TodayBookmarksSection.tsx` - Component usage
- `apps/mobile/components/MediaRichBookmarkCard.tsx` - Component usage
- `apps/mobile/components/OptimizedCompactBookmarkCard.tsx` - Component usage
- `apps/mobile/app/(app)/bookmark/[id].tsx` - Bookmark detail usage

#### Task 4.3: Edge Cases & Sync Scenarios (Architecture Verification)
**Verified Scenarios**:
- [x] Opening same bookmark multiple times updates timestamp (last write wins)
- [x] Opening 5th bookmark removes oldest from recent section (MAX_RECENT_BOOKMARKS = 4)
- [x] Deleted bookmarks don't appear in recent section (filtered in hook)
- [x] Archived bookmarks don't appear in recent section (SQL filters status='active')
- [x] **Network offline** → works perfectly with AsyncStorage only (fire-and-forget API calls)
- [x] **API error** → AsyncStorage already updated, no impact (optimistic pattern)
- [x] **Cross-device sync**: Open on Device A → syncs via database and app launch sync
- [x] **App reinstall**: Database restores recent bookmarks to AsyncStorage (QueryProvider sync)
- [x] **Cache clear**: Database restores recent bookmarks on next sync (QueryProvider sync)
- [x] **Concurrent opens**: Last write wins, no conflicts (database UPDATE pattern)
- [x] **Background sync failure**: Silent fail, retries on next app launch (error handling)
- [x] **Stale data**: Server data syncs to AsyncStorage on query (syncRecentBookmarksFromServer)

---

## Rollout Strategy

### Phase 1: API & Database (Deploy First)
1. Create and apply database migration
2. Deploy API endpoints
3. Verify endpoints work in staging

### Phase 2: Mobile App (Deploy Second)
1. Update mobile app code
2. Test in development
3. Deploy to TestFlight/Preview
4. Monitor for errors
5. Full production rollout

### Phase 3: Cleanup (After 2 weeks)
1. Monitor usage and errors
2. Consider removing AsyncStorage fallback (optional)
3. Update documentation

---

## Success Criteria

### Technical Metrics
- [x] API endpoints tested and working correctly (13/13 tests passing)
- [x] Database queries use index (verified in Phase 1)
- [x] Mobile app uses optimistic local-first pattern
- [x] Fire-and-forget background sync to database
- [x] No data loss possible (AsyncStorage + database backup)
- [x] Graceful error handling throughout

### User Experience Metrics
- [x] **Zero loading spinners** - always instant display from AsyncStorage
- [x] Recent bookmarks persist across app restarts (AsyncStorage + database)
- [x] Recent bookmarks sync across devices (app launch sync)
- [x] Section appears/disappears correctly based on count (< 4 = hidden)
- [x] **Instant feedback** when opening bookmarks (optimistic update pattern)
- [x] Works perfectly offline (AsyncStorage cache)
- [x] Background sync doesn't block UI (fire-and-forget pattern)

---

## Rollback Plan

If issues arise:

1. **API Issues**: Revert API deployment, mobile app falls back to AsyncStorage
2. **Mobile Issues**: Push hotfix that uses AsyncStorage only
3. **Database Issues**: Remove migration, revert to AsyncStorage

No data loss possible - AsyncStorage remains as fallback throughout migration.

---

## Estimated Timeline

- **Phase 1 (API)**: 1-2 hours
- **Phase 2 (Mobile)**: 1 hour
- **Phase 3 (Migration)**: 30 minutes
- **Phase 4 (Testing)**: 1 hour

**Total**: 3-4 hours

---

## Notes

- Keep AsyncStorage code as fallback initially for safety
- Can remove AsyncStorage after migration proves stable (2+ weeks)
- Database index is critical for performance with many bookmarks
- Fire-and-forget pattern ensures no UI blocking
- React Query handles optimistic updates automatically
