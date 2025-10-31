# Hide Feed Item Implementation Plan

## Overview
Enable users to hide individual feed items from their feed view. When a user hides a feed item from the content view, it will be removed from their feed and they will be redirected back to the home page where the item will no longer appear in the "from your feed" section.

## Current State Analysis

### Existing Infrastructure
- **Database Schema**: `userFeedItems` table already has `isHidden` boolean field (defaults to `false`)
- **Similar Patterns**: `markAsRead`/`markAsUnread` endpoints provide a reference implementation
- **User Flow**: Content view → Action → Redirect to home

### What's Missing
1. Repository methods for hiding/unhiding feed items
2. API endpoints to expose hide functionality
3. Mobile UI components for hide action
4. Feed query filtering to exclude hidden items
5. Optional: UI to view/manage hidden items

## Implementation Plan

### Phase 1: Backend API Implementation

#### 1.1 Update Shared Package Interface
**File**: `packages/shared/src/repositories/feed-item-repository.ts`

Add methods to `FeedItemRepository` interface:
```typescript
hideItem(userId: string, feedItemId: string): Promise<UserFeedItem>
unhideItem(userId: string, feedItemId: string): Promise<UserFeedItem>
```

#### 1.2 Implement Repository Methods
**File**: `packages/api/src/d1-feed-item-repository.ts`

Add two methods following the pattern of `markAsRead`/`markAsUnread`:

```typescript
async hideItem(userId: string, feedItemId: string): Promise<UserFeedItem> {
  // Check if user feed item exists
  // If exists, update isHidden = true
  // If not exists, create new user feed item with isHidden = true
  // Return updated/created UserFeedItem
}

async unhideItem(userId: string, feedItemId: string): Promise<UserFeedItem> {
  // Check if user feed item exists
  // If exists, update isHidden = false
  // If not exists, create new user feed item with isHidden = false
  // Return updated/created UserFeedItem
}
```

**Implementation Notes**:
- Follow the exact pattern used in `markAsRead` (lines 665-704)
- Ensure user exists before creating/updating
- Handle both existing and non-existing userFeedItem cases
- Use deterministic ID generation: `${userId}-${feedItemId}-${Date.now()}`

#### 1.3 Update Feed Query Logic
**File**: `packages/api/src/d1-feed-item-repository.ts`

Modify `getUserFeedItems` method (lines 273-349) to filter out hidden items by default:

```typescript
// Add to conditions array (around line 299)
if (!options?.includeHidden) {
  conditions.push(
    or(
      eq(schema.userFeedItems.isHidden, false),
      isNull(schema.userFeedItems.isHidden)
    )
  )
}
```

Update method signature to accept `includeHidden` option:
```typescript
getUserFeedItems(
  userId: string,
  options?: {
    isRead?: boolean
    subscriptionIds?: string[]
    limit?: number
    offset?: number
    includeHidden?: boolean  // NEW
  }
): Promise<FeedItemWithReadState[]>
```

#### 1.4 Add API Endpoints
**File**: `packages/api/src/index.ts`

Add two new endpoints following the pattern of read/unread endpoints (lines 1110-1186):

```typescript
// Hide feed item
app.put('/api/v1/feed/:itemId/hide', authMiddleware, async (c) => {
  // Extract auth context and itemId
  // Ensure user exists
  // Extract feedItemId from userFeedItemId if needed
  // Call feedItemRepository.hideItem()
  // Return success response
})

// Unhide feed item (optional, for future "manage hidden items" feature)
app.put('/api/v1/feed/:itemId/unhide', authMiddleware, async (c) => {
  // Same pattern as hide
  // Call feedItemRepository.unhideItem()
  // Return success response
})
```

**Implementation Notes**:
- Place endpoints near the existing read/unread endpoints (around line 1110)
- Handle userFeedItemId to feedItemId extraction (see lines 1127-1138)
- Return appropriate error responses (404, 500)
- Log actions for debugging

### Phase 2: Mobile Client Implementation

#### 2.1 Add API Client Method
**File**: `apps/mobile/lib/api.ts`

Add method to API client:
```typescript
async hideFeedItem(itemId: string): Promise<void> {
  await this.client.put(`/feed/${itemId}/hide`)
}
```

#### 2.2 Add React Query Mutation Hook
**File**: `apps/mobile/hooks/useHideFeedItem.ts` (new file)

Create custom hook for hiding feed items:
```typescript
export function useHideFeedItem() {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: (itemId: string) => api.hideFeedItem(itemId),
    onSuccess: () => {
      // Invalidate feed queries to refetch without hidden item
      queryClient.invalidateQueries({ queryKey: ['feed'] })
      queryClient.invalidateQueries({ queryKey: ['feedItems'] })
    }
  })
}
```

**Dependencies**:
- Uses React Query's `useMutation`
- Invalidates feed queries on success
- Follows pattern from `useArchiveBookmark.ts`

#### 2.3 Update Content View UI
**File**: `apps/mobile/app/(app)/content/[id].tsx`

Add hide action button to the content view:

**Location**: Add to action buttons section (alongside bookmark/share actions)

**UI Components**:
- Use existing `ActionButton` pattern from bookmark actions
- Icon: Use "eye-off" or "x-circle" icon from Lucide
- Label: "Hide from Feed"
- Show only for feed items (not for bookmarks)

**Implementation**:
```typescript
const { mutate: hideItem } = useHideFeedItem()

const handleHide = () => {
  // Show confirmation dialog (optional)
  // Call hideItem mutation
  // On success, router.back() to return to home
}

// In JSX:
{isFeedItem && (
  <ActionButton
    icon="EyeOff"
    label="Hide from Feed"
    onPress={handleHide}
  />
)}
```

#### 2.4 Handle Navigation After Hide
**File**: `apps/mobile/app/(app)/content/[id].tsx`

Update mutation success handler:
```typescript
const { mutate: hideItem } = useHideFeedItem({
  onSuccess: () => {
    // Navigate back to home
    router.push('/(app)/(tabs)')
    // Or: router.back() if coming from feed
  }
})
```

### Phase 3: Testing & Validation

#### 3.1 Backend Tests
**File**: `packages/api/src/__tests__/d1-feed-item-repository.test.ts` (new)

Test cases:
- Hide item creates userFeedItem if not exists
- Hide item updates existing userFeedItem
- Hidden items don't appear in getUserFeedItems
- Unhide item makes item visible again
- Hide preserves read/bookmark state

#### 3.2 Manual Testing Checklist
- [ ] Hide action appears on feed items in content view
- [ ] Hide action does not appear on bookmarks
- [ ] Clicking hide removes item from feed
- [ ] User is redirected to home page
- [ ] Hidden item no longer appears in "from your feed"
- [ ] Hidden item stays hidden after app restart
- [ ] Hiding preserves read/unread state
- [ ] Hiding preserves bookmark if item was bookmarked

#### 3.3 Edge Cases to Test
- Hide item that's already read
- Hide item that's bookmarked
- Hide last item in feed
- Hide while offline (should queue)
- Hide then unhide (if unhide UI exists)

### Phase 4: Optional Enhancements

#### 4.1 Manage Hidden Items (Future)
- Add "View Hidden Items" screen
- Allow users to unhide items
- Show count of hidden items

#### 4.2 Undo Functionality (Future)
- Show toast with "Undo" button after hiding
- Implement undo within 5-second window
- Auto-hide toast after timeout

#### 4.3 Analytics (Future)
- Track hide action events
- Monitor hide patterns per user
- Identify frequently hidden content types/creators

## Implementation Status

### ✅ Phase 1: Backend API Implementation - COMPLETED

**Completed on:** 2025-10-31

**Changes Made:**
1. ✅ Updated `FeedItemRepository` interface with `hideItem` and `unhideItem` methods
2. ✅ Added `includeHidden` option to `getUserFeedItems` method signature
3. ✅ Implemented `hideItem` and `unhideItem` in `D1FeedItemRepository`
4. ✅ Updated `getUserFeedItems` to filter out hidden items by default
5. ✅ Added API endpoints: `PUT /api/v1/feed/:itemId/hide` and `PUT /api/v1/feed/:itemId/unhide`
6. ✅ Updated `UserFeedItem` interface to include `isHidden?: boolean` field
7. ✅ Updated repository methods to handle `isHidden` field

**Code Review:** ✅ APPROVED
- No critical bugs or logic errors
- Proper error handling
- Full consistency with existing codebase patterns
- No data integrity issues
- Clean, maintainable code

**Quality Checks:**
- ✅ Lint: Passed
- ✅ Type-check: Passed
- ✅ Build: Passed

**Next Steps:**
- Phase 2: Mobile Client Implementation (pending)

---

## Implementation Order

### Day 1: Backend Foundation ✅ COMPLETED
1. ✅ Update shared interface (`FeedItemRepository`)
2. ✅ Implement `hideItem` and `unhideItem` in repository
3. ✅ Update feed query to filter hidden items
4. ✅ Add API endpoints for hide/unhide
5. ⏸️ Test API endpoints with curl/Postman (optional)

### Day 2: Mobile Integration
1. Add API client method
2. Create `useHideFeedItem` hook
3. Add hide button to content view
4. Implement navigation after hide
5. Test end-to-end flow

### Day 3: Polish & Testing
1. Add confirmation dialog (optional)
2. Add loading states
3. Manual testing
4. Bug fixes
5. Documentation updates

## Success Criteria

### Phase 1: Backend API (Completed)
- [x] Backend API methods for hiding/unhiding items implemented
- [x] Hidden items filtered from feed queries by default
- [x] API endpoints exposed and functional
- [x] Code follows existing patterns
- [x] No errors in lint/type-check/build

### Phase 2: Mobile Client (Pending)
- [ ] Users can hide feed items from content view
- [ ] User is redirected to home after hiding
- [ ] Hidden state persists across sessions
- [ ] No errors in console/logs
- [ ] Performance is not impacted

## Rollback Plan

If issues arise:
1. Remove hide button from mobile UI
2. Comment out API endpoints
3. Remove query filtering (items become visible again)
4. Database field remains for future use

## Files to Modify

### Backend (API Package)
- `packages/shared/src/repositories/feed-item-repository.ts` - Add interface methods
- `packages/api/src/d1-feed-item-repository.ts` - Implement hide/unhide methods
- `packages/api/src/index.ts` - Add API endpoints

### Frontend (Mobile App)
- `apps/mobile/lib/api.ts` - Add API client method
- `apps/mobile/hooks/useHideFeedItem.ts` - New hook file
- `apps/mobile/app/(app)/content/[id].tsx` - Add hide button and logic

### Documentation
- `docs/features/remove-feed-item/IMPLEMENTATION_PLAN.md` - This file
- Update API documentation with new endpoints

## Notes

- The `isHidden` field already exists in the database schema, no migration needed
- Follow existing patterns for `markAsRead`/`markAsUnread` for consistency
- Hidden items are soft-deleted (can be unhidden in future)
- Consider showing hidden count in settings for transparency
