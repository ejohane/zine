# Inbox Feature - Implementation Guide

Quick reference guide for implementing the inbox feature.

---

## Overview

The inbox feature creates a dedicated screen for viewing and managing all saved bookmarks with filtering and swipe-to-archive functionality.

---

## Key Components to Use (All Existing)

### 1. CategoryTabs Component
- **Location**: `apps/mobile/components/CategoryTabs.tsx`
- **Action**: Move from homepage to inbox screen
- **No modifications needed** - works as-is

### 2. SwipeableBookmarkItem Component
- **Location**: `apps/mobile/components/bookmark-list/SwipeableBookmarkItem.tsx`
- **Usage**: Wrap each bookmark in the list
- **Configuration**:
```typescript
const swipeActions = {
  right: [
    {
      id: 'archive',
      icon: 'archive',
      iconColor: '#ffffff',
      backgroundColor: '#f97316',
      onPress: (bookmarkId: string) => handleArchive(bookmarkId),
    },
  ],
};
```

### 3. BookmarkListItem Component
- **Location**: `apps/mobile/components/bookmark-list/BookmarkListItem.tsx`
- **Variant**: Use `variant="compact"`
- **Props**: `showThumbnail={true}`, `showMetadata={true}`

### 4. useArchiveBookmark Hook
- **Location**: `apps/mobile/hooks/useArchiveBookmark.ts`
- **Usage**: Call `archiveMutation.mutateAsync(bookmarkId)`
- **No confirmation needed** (unlike detail view)

---

## Files to Create

### 1. InboxScreen
**Path**: `apps/mobile/app/(app)/(tabs)/inbox.tsx`

**Structure**:
```typescript
export default function InboxScreen() {
  // State
  const [selectedCategory, setSelectedCategory] = useState<CategoryType>('all');

  // Data fetching
  const { bookmarks, isLoading, refetch } = useInboxBookmarks(selectedCategory);

  // Mutations
  const archiveMutation = useArchiveBookmark();

  // Render
  return (
    <View>
      <CategoryTabs
        selectedCategory={selectedCategory}
        onCategoryChange={setSelectedCategory}
      />
      <FlatList
        data={bookmarks}
        renderItem={({ item }) => (
          <SwipeableBookmarkItem
            bookmark={item}
            variant="compact"
            rightActions={swipeActions}
            onPress={() => router.push(`/bookmark/${item.id}`)}
          />
        )}
      />
    </View>
  );
}
```

### 2. useInboxBookmarks Hook
**Path**: `apps/mobile/hooks/useInboxBookmarks.ts`

**Purpose**: Fetch and filter bookmarks for inbox

**Logic**:
```typescript
export function useInboxBookmarks(filter: CategoryType = 'all') {
  return useQuery({
    queryKey: ['bookmarks', 'inbox', filter],
    queryFn: async () => {
      // Get all active bookmarks sorted by createdAt desc
      const allBookmarks = await bookmarksApi.getAll({
        status: 'active',
        sort: 'createdAt:desc'
      });

      // Client-side filter by content type
      if (filter === 'all') return allBookmarks;
      return allBookmarks.filter(b => b.contentType === filter);
    },
    staleTime: 5 * 60 * 1000,
  });
}
```

### 3. useUnarchiveBookmark Hook (for Undo)
**Path**: `apps/mobile/hooks/useUnarchiveBookmark.ts`

**Purpose**: Undo archive action

**Logic**: Mirror `useArchiveBookmark` but call `bookmarksApi.unarchive(id)`

---

## Navigation Setup

### Update Tab Navigation
**File**: `apps/mobile/app/(app)/(tabs)/_layout.tsx`

Add inbox tab:
```typescript
<Tabs>
  <Tabs.Screen name="index" options={{ title: "Home" }} />
  <Tabs.Screen
    name="inbox"
    options={{
      title: "Inbox",
      tabBarIcon: ({ color }) => <Feather name="inbox" size={24} color={color} />
    }}
  />
  <Tabs.Screen name="collections" options={{ title: "Collections" }} />
  {/* ... other tabs */}
</Tabs>
```

---

## API Integration

### Existing Endpoints (No Backend Changes)

**Get Bookmarks**
```typescript
GET /api/v1/bookmarks?status=active&sort=createdAt:desc
```

**Archive**
```typescript
PUT /api/v1/bookmarks/:id/archive
```

**Unarchive**
```typescript
PUT /api/v1/bookmarks/:id/unarchive
```

### Update bookmarksApi Client
**File**: `apps/mobile/lib/api.ts`

Ensure `getAll` method supports query parameters:
```typescript
export const bookmarksApi = {
  getAll: async (params?: { status?: string; sort?: string }): Promise<Bookmark[]> => {
    const queryString = new URLSearchParams(params).toString();
    return apiClient.get<Bookmark[]>(`/api/v1/bookmarks?${queryString}`);
  },
  // ... existing methods
};
```

---

## Swipe Behavior Specification

### Gesture Configuration
- **Direction**: Swipe LEFT to reveal archive
- **Thresholds**:
  - 40% swipe: Reveal icon + haptic feedback
  - 70% swipe: Auto-trigger archive action
- **Animation**: Spring-based snap-back (damping: 30, stiffness: 300)
- **Haptic**: Medium impact at threshold crossing

### Archive Flow
1. User swipes left on bookmark
2. Archive icon reveals (orange background)
3. At 70% threshold, archive triggers automatically
4. Item animates out (300ms fade + slide)
5. Toast appears: "[Title] archived" with Undo (5s)
6. Query cache invalidated, list refreshes

### No Confirmation Dialog
- Immediate action (fast triage workflow)
- Undo mechanism provides safety net
- Matches iOS Mail pattern

---

## Filter Behavior

### Categories
- **All**: Show all bookmarks (no filter)
- **Videos**: `contentType === 'video'`
- **Podcasts**: `contentType === 'podcast'`
- **Articles**: `contentType === 'article'`
- **Posts**: `contentType === 'post'`

### Filter Logic
Apply filter to bookmarks with `status === 'active'` only. Archived and deleted bookmarks never appear.

### State Persistence
Filter state persists during session but resets on app restart (defaults to 'all').

---

## Empty States

### No Bookmarks at All
```
[Illustration]
No bookmarks yet
Start saving content to see it here
[+ Add Bookmark]
```

### No Filtered Results
```
[Illustration]
No articles saved yet
Tap + to add your first article
```

---

## Performance Optimizations

### FlatList Configuration
```typescript
<FlatList
  data={bookmarks}
  keyExtractor={(item) => item.id}
  renderItem={renderItem}
  getItemLayout={(data, index) => ({
    length: 84,
    offset: 84 * index,
    index,
  })}
  windowSize={10}
  maxToRenderPerBatch={10}
  updateCellsBatchingPeriod={50}
  removeClippedSubviews={true}
/>
```

### Query Optimization
- Stale time: 5 minutes
- Invalidate on: archive, unarchive, pull-to-refresh
- Enable background refetch

---

## Testing Checklist

### Unit Tests
- [ ] `useInboxBookmarks` returns correct filtered data
- [ ] Filter logic works for all 5 content types
- [ ] Archive mutation invalidates correct queries

### Integration Tests
- [ ] Swipe gesture triggers archive
- [ ] Undo restores bookmark to list
- [ ] Filter switching updates list
- [ ] Pull-to-refresh reloads data

### E2E Tests
- [ ] Navigate to inbox tab
- [ ] Tap filter chip, verify filtered list
- [ ] Swipe left, verify archive + toast
- [ ] Tap undo, verify bookmark restored
- [ ] Tap bookmark, navigate to detail view

### Performance Tests
- [ ] Scroll 60fps with 1000 items
- [ ] Filter switch < 100ms
- [ ] Archive animation smooth (300ms)

---

## Common Pitfalls

### ❌ Don't
- Don't add confirmation dialog for swipe archive (breaks flow)
- Don't filter on server if pagination not implemented (use client-side)
- Don't persist filter across app restarts (confusing UX)
- Don't remove CategoryTabs from homepage until inbox is ready

### ✅ Do
- Provide undo mechanism with 5s timeout
- Use FlatList virtualization for performance
- Show clear empty states for each filter type
- Invalidate all bookmark queries after archive
- Use optimistic updates for instant feedback

---

## Migration Notes

### Homepage Impact
After moving CategoryTabs to inbox:
- Homepage keeps recent bookmarks display (horizontal cards)
- Consider adding alternative quick action buttons to homepage
- Or keep CategoryTabs on both screens (duplicate is acceptable)

### Backwards Compatibility
- No breaking changes to existing screens
- Archive API unchanged
- Bookmark data model unchanged
- Existing detail view archive still works

---

## Phase Rollout

### Phase 1: Core (MVP)
- Create InboxScreen with basic list
- Add tab navigation
- Implement filtering with CategoryTabs
- Hook up bookmark navigation

### Phase 2: Swipe (MVP)
- Integrate SwipeableBookmarkItem
- Configure archive swipe action
- Add haptic feedback
- Implement list animations

### Phase 3: Undo (MVP)
- Create toast notification component
- Implement unarchive hook
- Add undo button + timeout logic

### Phase 4: Polish
- Empty states for all filters
- Loading states
- Error handling
- Analytics tracking

---

## Analytics Events

Track these events:
```typescript
analytics.track('inbox_viewed', { filter: selectedCategory });
analytics.track('inbox_filter_changed', { from: oldFilter, to: newFilter });
analytics.track('inbox_bookmark_swiped', { bookmarkId, direction: 'left' });
analytics.track('inbox_bookmark_archived', { bookmarkId, method: 'swipe' });
analytics.track('inbox_archive_undone', { bookmarkId });
analytics.track('inbox_bookmark_opened', { bookmarkId, contentType });
```

---

## Quick Reference: Key Files

| File | Purpose | Status |
|------|---------|--------|
| `apps/mobile/app/(app)/(tabs)/inbox.tsx` | Main screen | **Create** |
| `apps/mobile/hooks/useInboxBookmarks.ts` | Data hook | **Create** |
| `apps/mobile/hooks/useUnarchiveBookmark.ts` | Undo hook | **Create** |
| `apps/mobile/components/CategoryTabs.tsx` | Filter chips | **Move** |
| `apps/mobile/components/bookmark-list/SwipeableBookmarkItem.tsx` | Swipe wrapper | **Existing** |
| `apps/mobile/components/bookmark-list/BookmarkListItem.tsx` | List item | **Existing** |
| `apps/mobile/hooks/useArchiveBookmark.ts` | Archive hook | **Existing** |
| `apps/mobile/lib/api.ts` | API client | **Update** |

---

## Estimated Effort

- **Phase 1** (Core): 2-3 days
- **Phase 2** (Swipe): 2 days
- **Phase 3** (Undo): 1 day
- **Phase 4** (Polish): 1-2 days

**Total**: 6-8 days for complete MVP

---

**Next Steps**: Review PRD with stakeholders, get design mockups, then start Phase 1 implementation.
