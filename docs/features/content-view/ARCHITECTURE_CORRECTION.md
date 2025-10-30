# Content View - Architecture Correction

## The Problem

### Current Bug (FeedSection.tsx:236)
```typescript
// INCORRECT: Routing feed items to bookmark detail screen
router.push(`/bookmark/${item.feedItem.id}`);
```

**Why this is broken**:
- `item.feedItem.id` is a **content ID** from the `content` table
- `/bookmark/[id]` expects a **bookmark ID** from the `bookmarks` table
- Feed items are content that exists in the database but user hasn't bookmarked
- No bookmark record exists yet, so route fails or shows wrong data

### Root Cause: Misunderstanding Data Architecture

The database has **two separate tables**:

```sql
-- Content table: Shared content from feed imports
CREATE TABLE content (
  id TEXT PRIMARY KEY,           -- Content ID (what feed items reference)
  title TEXT,
  creator_id TEXT,
  thumbnail_url TEXT,
  ...
);

-- Bookmarks table: User-specific saved items
CREATE TABLE bookmarks (
  id INTEGER PRIMARY KEY,         -- Bookmark ID (what bookmark screen expects)
  user_id TEXT NOT NULL,
  content_id TEXT NOT NULL,       -- FK to content.id
  notes TEXT,                     -- User-specific
  tags TEXT,                      -- User-specific
  ...
);
```

**Key Insight**: Content can exist without bookmarks! Feed imports create content records. Users create bookmark records (linking themselves to content).

---

## The Solution

### New Content View Screen

Create `/content/[id]` route that:
1. Accepts **content ID** (not bookmark ID)
2. Fetches from `content` table (not `bookmarks` table)
3. Shows "Save to Bookmarks" as primary action
4. Creates bookmark record when user saves

### Data Flow

```
Feed Item Tap
      ↓
  content_id: "spotify-episode-123"
      ↓
  router.push(`/content/${contentId}`)  ← NEW ROUTE
      ↓
  GET /api/v1/content/spotify-episode-123  ← NEW ENDPOINT
      ↓
  Returns: Content (no user-specific data)
      ↓
  Display: Content View Screen
      ↓
  User taps "Save to Bookmarks"
      ↓
  POST /api/v1/bookmarks/from-content  ← NEW ENDPOINT
  Body: { contentId: "spotify-episode-123" }
      ↓
  Creates: Bookmark record
  INSERT INTO bookmarks (user_id, content_id, ...) VALUES (...)
      ↓
  Returns: { bookmarkId: 456, contentId: "spotify-episode-123" }
      ↓
  Navigate: /bookmark/456  ← EXISTING ROUTE
```

---

## Required Changes

### Backend (2 New Endpoints)

#### 1. GET /api/v1/content/{contentId}
**Purpose**: Fetch content metadata from database (feed imports).

**Query**:
```sql
SELECT c.*, cr.name as creator_name, cr.avatar_url
FROM content c
LEFT JOIN creators cr ON c.creator_id = cr.id
WHERE c.id = ?
```

**Response**:
```typescript
{
  id: string,              // Content ID
  title: string,
  description?: string,
  url: string,
  thumbnailUrl?: string,
  contentType: 'video' | 'podcast' | 'article',
  creator?: {
    id: string,
    name: string,
    avatarUrl?: string
  },
  // ... metadata (duration, views, etc.)
}
```

#### 2. POST /api/v1/bookmarks/from-content
**Purpose**: Create bookmark from existing content.

**Body**:
```typescript
{
  contentId: string,
  notes?: string,
  tags?: string[]
}
```

**Logic**:
```sql
-- Check for duplicate
SELECT id FROM bookmarks
WHERE user_id = ? AND content_id = ?

-- If exists: return existing
-- If not: create new
INSERT INTO bookmarks (user_id, content_id, notes, tags, status, created_at)
VALUES (?, ?, ?, ?, 'active', CURRENT_TIMESTAMP)
RETURNING *
```

**Response**:
```typescript
{
  data: Bookmark,           // Full bookmark object
  duplicate: boolean,
  existingBookmarkId?: string  // If duplicate
}
```

### Frontend (1 New Screen, 1 Route Change)

#### 1. Create /app/(app)/content/[id].tsx
```typescript
export default function ContentViewScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();  // Content ID
  
  // Fetch content from database
  const { data: content } = useContentDetail(id);
  
  // Save bookmark from content
  const saveMutation = useSaveBookmarkFromContent({
    onSuccess: (bookmark) => {
      router.replace(`/bookmark/${bookmark.id}`);
    }
  });
  
  return (
    <BookmarkContentDisplay data={content} showNotes={false} showTags={false}>
      <SaveBookmarkButton onPress={() => saveMutation.mutate({ contentId: id })} />
      <OpenLinkButton url={content.url} secondary />
    </BookmarkContentDisplay>
  );
}
```

#### 2. Update FeedSection.tsx
```diff
// apps/mobile/components/FeedSection.tsx:236

- router.push(`/bookmark/${item.feedItem.id}`);  // BROKEN
+ router.push(`/content/${item.feedItem.id}`);   // FIXED
```

---

## Why This Architecture Makes Sense

### Content vs Bookmarks Separation

**Content Table** (Shared across users):
- Populated by feed polling (YouTube, Spotify, RSS)
- One record per unique piece of content
- No user-specific data
- Multiple users can reference same content

**Bookmarks Table** (User-specific):
- Created when user saves content
- Links user to content (FK relationship)
- Contains user-specific metadata (notes, tags, status)
- Each user has their own bookmark for same content

### Example Scenario

1. **Backend polls YouTube subscription**:
   ```sql
   INSERT INTO content (id, title, creator_id, url, ...)
   VALUES ('youtube-video-abc', 'How to Code', 'creator-123', 'https://...', ...);
   ```

2. **Feed shows to all subscribed users**:
   - User A sees it in "From Your Feed"
   - User B sees it in "From Your Feed"
   - Neither has bookmarked it yet

3. **User A taps feed item**:
   - Routes to `/content/youtube-video-abc`
   - Fetches from content table
   - Shows "Save to Bookmarks" button

4. **User A saves**:
   ```sql
   INSERT INTO bookmarks (user_id, content_id, ...)
   VALUES ('user-a', 'youtube-video-abc', ...);
   -- Returns bookmark_id: 101
   ```
   - Navigate to `/bookmark/101`

5. **User B taps same feed item**:
   - Routes to `/content/youtube-video-abc` (same content)
   - Shows "Save to Bookmarks" button

6. **User B saves**:
   ```sql
   INSERT INTO bookmarks (user_id, content_id, ...)
   VALUES ('user-b', 'youtube-video-abc', ...);
   -- Returns bookmark_id: 102
   ```
   - Navigate to `/bookmark/102`

**Result**: One content record, two bookmark records (one per user).

---

## Migration Path

### Step 1: Backend First (Week 1)
- Implement `GET /api/v1/content/{id}`
- Implement `POST /api/v1/bookmarks/from-content`
- Test with Postman/curl
- Deploy to staging

### Step 2: Frontend Parallel (Week 1-2)
- Extract shared components from bookmark detail
- Create content view screen
- Create hooks (useContentDetail, useSaveBookmarkFromContent)

### Step 3: Integration (Week 2)
- Wire up content view screen
- Update FeedSection routing
- Test full flow: feed → content → save → bookmark

### Step 4: Deploy (Week 3)
- QA testing
- Fix bugs
- Deploy to production
- Monitor analytics

---

## Success Criteria

### Functional
- [ ] Feed items route to content view (not bookmark view)
- [ ] Content view displays metadata correctly
- [ ] Save button creates bookmark record
- [ ] Duplicate detection works (already saved → navigate to bookmark)
- [ ] After save, navigates to bookmark detail view

### Technical
- [ ] Two new endpoints deployed and tested
- [ ] Content view screen implemented
- [ ] FeedSection routing updated
- [ ] No regressions in bookmark detail view

### User Experience
- [ ] Feed → content → save flow < 5 seconds total
- [ ] Clear visual distinction (no save button in bookmark view)
- [ ] "Already saved" toast when duplicate detected
- [ ] Smooth navigation between screens

---

## FAQ

### Q: Why not just use the preview endpoint?
**A**: The preview endpoint is for URLs that **don't exist in the database yet**. Feed items are already in the database (content table) from feed polling. We should read from the database, not re-fetch metadata.

### Q: Can we just check if bookmark exists first?
**A**: No, because:
1. Feed items reference content IDs, not bookmark IDs
2. Bookmark detail screen expects bookmark IDs
3. We need a view for "content that exists but user hasn't saved"

### Q: What if content doesn't have a URL?
**A**: All content from feeds has a URL (it's required). If somehow missing, show error state.

### Q: What happens if user already bookmarked from another device?
**A**: Duplicate detection handles this. API returns `{ duplicate: true, existingBookmarkId: "123" }` and we navigate to the existing bookmark.

### Q: Should we mark feed item as read after viewing?
**A**: Yes, after viewing content (regardless of save). Add:
```typescript
PATCH /api/v1/feed-items/{feedItemId}/read
```
Call this when content view mounts or when user navigates away.

---

## Summary

**The Fix**: Create a dedicated content view for feed items (content that exists in DB but user hasn't bookmarked).

**Why**: Feed items reference content IDs, not bookmark IDs. Need separate screen.

**Backend**: 2 new endpoints (get content, save bookmark from content).

**Frontend**: 1 new screen, 1 route change in FeedSection.

**Result**: Users can browse feed items, preview content, and save to bookmarks seamlessly.

---

**Last Updated**: 2025-10-29  
**Status**: Architecture Corrected, Ready for Implementation
