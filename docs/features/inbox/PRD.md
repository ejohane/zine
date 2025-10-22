# Inbox Feature - Product Requirements Document

**Version**: 1.0
**Last Updated**: 2025-10-21
**Status**: Draft
**Owner**: Product Team

---

## 1. Executive Summary

The Inbox feature will serve as the primary content consumption interface for Zine users, displaying all saved bookmarks in a filterable, actionable list view. This feature will enable users to quickly triage their saved content, filter by content type, and take immediate action through swipe gestures.

### Key Features
- Chronologically sorted list of all saved bookmarks (newest first)
- Content type filtering (All, Videos, Podcasts, Articles, Posts)
- Swipe-to-archive gesture interaction
- Direct navigation to bookmark detail view

---

## 2. Background & Context

### Current State
- **Homepage**: Displays recent bookmarks in horizontal scrollable cards with filter chips
- **Filter Chips**: CategoryTabs component allows filtering by content type (all, videos, podcasts, articles, posts)
- **Bookmark Display**: Uses MediaRichBookmarkCard (300x240px) for horizontal scrolling
- **Archive**: Exists in detail view with confirmation dialog
- **Swipe Gestures**: Fully implemented with SwipeableBookmarkItem, haptic feedback, and spring animations

### Problem Statement
Users currently lack a dedicated view for:
1. Viewing all saved bookmarks in a scannable list format
2. Quickly triaging content through swipe gestures
3. Filtering their entire bookmark collection by content type

The homepage focuses on recently opened/saved items, but there's no comprehensive inbox-style view for managing all bookmarks.

---

## 3. Goals & Success Metrics

### Goals
1. Create a dedicated inbox screen for bookmark management
2. Enable quick content triage through swipe-to-archive
3. Provide content-type filtering for focused browsing
4. Improve overall content consumption workflow

### Success Metrics
- **Engagement**: 40%+ of daily active users visit inbox screen
- **Triage Efficiency**: 30%+ of archive actions performed via swipe gesture
- **Filter Usage**: 25%+ of inbox sessions use content type filters
- **Navigation**: Inbox becomes top 3 most-visited screens

---

## 4. User Stories

### Core Stories

**US-1: View All Bookmarks**
```
As a user
I want to see all my saved bookmarks in chronological order
So that I can review recent additions and decide what to consume next
```

**US-2: Filter by Content Type**
```
As a user
I want to filter bookmarks by content type (Articles, Videos, Podcasts, Posts)
So that I can focus on specific types of content based on my current context
```

**US-3: Archive via Swipe**
```
As a user
I want to swipe left on a bookmark to archive it
So that I can quickly triage content without opening detail views
```

**US-4: Open Bookmark Details**
```
As a user
I want to tap on a bookmark to view its full details
So that I can read metadata, notes, and access additional actions
```

---

## 5. Functional Requirements

### 5.1 Navigation & Screen Structure

**REQ-NAV-1**: Inbox screen must be accessible from bottom tab navigation
- Add new tab icon and label "Inbox"
- Position: Between Home and Collections (recommended)
- Icon: `inbox` from Feather icons

**REQ-NAV-2**: Screen header must display "Inbox" title
- Use consistent header styling with other tab screens
- Include badge count of unarchived bookmarks (optional enhancement)

### 5.2 Filter Chips

**REQ-FILTER-1**: Move CategoryTabs component from homepage to inbox screen
- Component location: `apps/mobile/components/CategoryTabs.tsx`
- Maintains existing categories: All, Videos, Podcasts, Articles, Posts
- Preserves existing visual design (rounded pills, orange active state)

**REQ-FILTER-2**: Filter must apply to bookmark list in real-time
- Selecting "Articles" shows only bookmarks with `contentType: 'article'`
- Selecting "All" shows all bookmarks regardless of type
- Filter state persists during session (resets on app restart)

**REQ-FILTER-3**: Filter applies to bookmarks with status `active` only
- Archived bookmarks must not appear in any filter view
- Deleted bookmarks must not appear

### 5.3 Bookmark List Display

**REQ-LIST-1**: Display bookmarks in reverse chronological order
- Sort by `createdAt` timestamp (newest first)
- Use FlatList for performance optimization
- Implement pull-to-refresh

**REQ-LIST-2**: Use BookmarkListItem component in 'compact' variant
- Component: `apps/mobile/components/bookmark-list/BookmarkListItem.tsx`
- Variant: `compact`
- Height: 84px per item
- Display: Thumbnail (60x60), title (max 2 lines), creator name, platform icon, duration badge

**REQ-LIST-3**: Enable virtualization for performance
- Render only visible items + buffer
- Use FlatList `windowSize` optimization
- Implement `getItemLayout` for consistent heights

**REQ-LIST-4**: Show empty state when no bookmarks match filter
- Display illustration + message: "No [type] bookmarks yet"
- Include CTA: "Add your first [type]" with + button

### 5.4 Swipe Gesture Interaction

**REQ-SWIPE-1**: Wrap BookmarkListItem in SwipeableBookmarkItem
- Component: `apps/mobile/components/bookmark-list/SwipeableBookmarkItem.tsx`
- Enable swipe gestures using existing implementation

**REQ-SWIPE-2**: Configure swipe-to-archive action
- **Direction**: Swipe LEFT to archive
- **Action Button**: Archive icon (`archive` from Feather)
- **Background Color**: `#ef4444` (red) or `#f97316` (orange)
- **Threshold**: 40% reveal for preview, 70% for auto-trigger
- **Haptic**: Medium impact at threshold crossing

**REQ-SWIPE-3**: Archive behavior
- Use existing `useArchiveBookmark` hook
- NO confirmation dialog (immediate action)
- Show toast notification: "[Title] archived" with undo button (5s timeout)
- Animate item removal from list (fade + slide out)
- Invalidate bookmark queries to refresh list

**REQ-SWIPE-4**: Optional: Add swipe RIGHT action for quick read later
- Action: Add to "Read Later" collection (future enhancement)
- Icon: `bookmark` from Feather
- Background Color: `#3b82f6` (blue)

### 5.5 Bookmark Navigation

**REQ-NAV-3**: Tapping bookmark opens detail view
- Navigate to: `/bookmark/[id]` using Expo Router
- Use existing bookmark detail screen
- Enable back navigation to inbox

**REQ-NAV-4**: Tapping creator avatar/name opens creator page
- Navigate to: `/creator/[id]`
- Maintains existing creator navigation behavior

### 5.6 Data Fetching

**REQ-DATA-1**: Fetch all active bookmarks for current user
- Endpoint: `GET /api/v1/bookmarks?status=active&sort=createdAt:desc`
- Use TanStack Query with `useBookmarks` hook (may need modification)
- Enable automatic background refetch

**REQ-DATA-2**: Implement client-side filtering
- Filter by `contentType` field based on selected category
- Apply filter to query results before rendering

**REQ-DATA-3**: Cache management
- Invalidate cache after archive action
- Invalidate cache on pull-to-refresh
- Stale time: 5 minutes

---

## 6. Technical Specifications

### 6.1 Component Architecture

```
InboxScreen (new)
├── InboxHeader (new or reuse HomeHeader)
├── CategoryTabs (moved from homepage)
└── ScrollView / FlatList
    └── SwipeableBookmarkItem (existing)
        └── BookmarkListItem (existing, variant="compact")
```

### 6.2 File Structure

```
apps/mobile/
├── app/(app)/(tabs)/
│   └── inbox.tsx                          # NEW: Main inbox screen
├── components/
│   ├── CategoryTabs.tsx                   # MOVED from homepage
│   ├── InboxHeader.tsx                    # NEW: Optional custom header
│   └── bookmark-list/
│       ├── BookmarkListItem.tsx           # EXISTING
│       ├── SwipeableBookmarkItem.tsx      # EXISTING
│       └── swipe-actions/
│           ├── useSwipeGesture.ts         # EXISTING
│           └── SwipeActionView.tsx        # EXISTING
└── hooks/
    ├── useInboxBookmarks.ts               # NEW: Custom hook for inbox data
    └── useArchiveBookmark.ts              # EXISTING
```

### 6.3 Data Flow

```typescript
// New hook: useInboxBookmarks.ts
export function useInboxBookmarks(filter: CategoryType = 'all') {
  const { data: bookmarks, isLoading, refetch } = useQuery({
    queryKey: ['bookmarks', 'inbox', filter],
    queryFn: async () => {
      const allBookmarks = await bookmarksApi.getAll({
        status: 'active',
        sort: 'createdAt:desc'
      });

      // Client-side filtering
      if (filter === 'all') return allBookmarks;
      return allBookmarks.filter(b => b.contentType === filter);
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  return { bookmarks, isLoading, refetch };
}
```

### 6.4 Swipe Configuration

```typescript
// Inbox-specific swipe actions
const swipeActions = {
  right: [
    {
      id: 'archive',
      icon: 'archive',
      iconColor: '#ffffff',
      backgroundColor: '#f97316', // Orange to match brand
      onPress: (bookmarkId: string) => handleArchive(bookmarkId),
      label: 'Archive',
    },
  ],
  left: [], // Reserved for future "read later" feature
};
```

### 6.5 State Management

```typescript
// InboxScreen state
interface InboxScreenState {
  selectedCategory: CategoryType;        // Filter state
  refreshing: boolean;                   // Pull-to-refresh
  undoArchiveId: string | null;          // For undo toast
}
```

---

## 7. UI/UX Specifications

### 7.1 Screen Layout

```
┌─────────────────────────────┐
│  Inbox                    ⋮ │ ← Header (44px)
├─────────────────────────────┤
│ All Videos Podcasts Articles│ ← Filter Chips (52px)
│ Posts                        │
├─────────────────────────────┤
│ ┌──────────────────────────┐│
│ │ [Thumbnail] Title        ││ ← Bookmark Item (84px)
│ │             Creator •Time││
│ └──────────────────────────┘│
│ ┌──────────────────────────┐│
│ │ [Thumbnail] Title        ││
│ │             Creator •Time││
│ └──────────────────────────┘│
│ ┌──────────────────────────┐│
│ │ [Thumbnail] Title        ││
│ │             Creator •Time││
│ └──────────────────────────┘│
│                              │
│         ↓ Pull to refresh    │
└─────────────────────────────┘
```

### 7.2 Swipe Interaction States

**State 1: Rest (0% swipe)**
```
┌─────────────────────────────┐
│ [Thumbnail] Title            │
│             Creator • Time   │
└─────────────────────────────┘
```

**State 2: Reveal (40% swipe left)**
```
┌────────────────────────┬────┐
│ [Thumbnail] Title      │ 📦 │ ← Archive icon visible
│             Creator    │    │
└────────────────────────┴────┘
      Swipe ←
```

**State 3: Trigger (70% swipe left)**
```
┌──────────────────┬─────────┐
│ [Thumbnail] Title│  📦     │ ← Full archive action
│             Creat│ Archive │
└──────────────────┴─────────┘
      Swipe ←
```

**State 4: Archived (animates out)**
```
┌─────────────────────────────┐
│ [Fading/sliding out...]     │ ← Opacity: 1 → 0
└─────────────────────────────┘
           ↓
      [Removed]

Toast: "Bookmark archived" [Undo]
```

### 7.3 Visual Specifications

**Filter Chips**
- Font: SF Pro Text, 14px, weight 500
- Inactive: Background #f4f4f5, Text #525252
- Active: Background #f97316, Text #ffffff
- Border radius: 20px
- Padding: 8px 16px
- Gap: 8px

**Bookmark List Item (Compact)**
- Height: 84px
- Thumbnail: 60x60px, border radius 8px
- Title: Max 2 lines, 16px, weight 600
- Creator: 14px, weight 400, color #737373
- Duration badge: 12px, #525252 background, 4px radius
- Platform icon: 16x16px
- Separator: 1px, #e5e5e5

**Swipe Action**
- Width: 80px
- Icon size: 24x24px
- Background: #f97316 (archive), #3b82f6 (read later)
- Animation: Spring config (damping: 30, stiffness: 300)

**Empty State**
- Icon: 64x64px, color #d4d4d8
- Title: 18px, weight 600, #171717
- Description: 14px, weight 400, #737373
- Button: Primary style, 44px height

---

## 8. API Requirements

### 8.1 Existing Endpoints (No Changes Needed)

**Get All Bookmarks**
```
GET /api/v1/bookmarks?status=active&sort=createdAt:desc
Response: Bookmark[]
```

**Archive Bookmark**
```
PUT /api/v1/bookmarks/:id/archive
Response: Bookmark (with status: 'archived', archivedAt: timestamp)
```

**Unarchive Bookmark** (for undo functionality)
```
PUT /api/v1/bookmarks/:id/unarchive
Response: Bookmark (with status: 'active', archivedAt: null)
```

### 8.2 Potential Optimization (Future)

**Server-Side Filtering**
```
GET /api/v1/bookmarks?status=active&contentType=article&sort=createdAt:desc
```

**Pagination**
```
GET /api/v1/bookmarks?status=active&page=1&limit=20
Response: { bookmarks: Bookmark[], pagination: { total, page, limit } }
```

---

## 9. Non-Functional Requirements

### 9.1 Performance

- **List Rendering**: 60fps scroll performance for lists up to 1000 items
- **Swipe Response**: Gesture latency < 16ms
- **Filter Switch**: Category change applies < 100ms
- **Archive Action**: Completes and updates UI < 300ms

### 9.2 Accessibility

- VoiceOver support for all interactive elements
- Swipe actions accessible via VoiceOver custom actions
- Filter chips readable with proper labels
- Dynamic font size support

### 9.3 Error Handling

- Network failure: Show error toast, enable retry
- Archive failure: Revert optimistic update, show error message
- Empty state: Clear messaging for "no bookmarks" vs "no filtered results"

### 9.4 Analytics

Track the following events:
- `inbox_viewed`: User opens inbox screen
- `inbox_filter_changed`: User changes content type filter
- `inbox_bookmark_swiped`: User performs swipe gesture
- `inbox_bookmark_archived`: Archive action completed
- `inbox_archive_undone`: User taps undo on archive toast
- `inbox_bookmark_opened`: User taps bookmark to view details

---

## 10. User Experience Flow

### 10.1 Primary Flow: Archive Content

1. User navigates to Inbox tab
2. User sees list of all active bookmarks (newest first)
3. User swipes left on a bookmark
4. Archive icon reveals with haptic feedback at 40% swipe
5. User completes swipe (70%+ threshold)
6. Bookmark animates out of list (300ms)
7. Toast appears: "[Title] archived" with Undo button (5s)
8. User can tap Undo to restore bookmark (optional)

### 10.2 Secondary Flow: Filter by Type

1. User is on Inbox screen with "All" filter active
2. User taps "Articles" filter chip
3. List immediately filters to show only articles
4. Chip visual state updates (orange background)
5. User can tap "All" to return to full list

### 10.3 Tertiary Flow: View Bookmark

1. User taps on bookmark list item
2. Screen navigates to `/bookmark/[id]` with slide transition
3. User views full bookmark details
4. User can archive from detail view (existing functionality)
5. User navigates back to inbox

---

## 11. Migration & Rollout

### 11.1 Phase 1: Core Implementation (Week 1)
- Create InboxScreen component
- Move CategoryTabs to inbox
- Implement bookmark list with BookmarkListItem
- Add basic filtering logic
- Update tab navigation

### 11.2 Phase 2: Swipe Gestures (Week 2)
- Integrate SwipeableBookmarkItem
- Configure archive swipe action
- Implement undo toast functionality
- Add haptic feedback

### 11.3 Phase 3: Polish & Testing (Week 3)
- Empty states for all filter types
- Error handling and retry logic
- Performance optimization (virtualization)
- Accessibility improvements
- Analytics integration

### 11.4 Phase 4: Beta Release (Week 4)
- Internal testing with team
- Gather feedback on swipe sensitivity
- A/B test swipe direction (left vs right for archive)
- Monitor performance metrics

---

## 12. Open Questions

1. **Filter Persistence**: Should filter selection persist across app restarts?
   - **Recommendation**: Reset to "All" on app restart for predictability

2. **Archive Confirmation**: Should archive via swipe require confirmation?
   - **Recommendation**: No confirmation, but provide 5s undo window

3. **Swipe Direction**: Left or right for archive?
   - **Recommendation**: Left (matches iOS Mail), right reserved for "read later"

4. **Undo Behavior**: How long should undo toast be visible?
   - **Recommendation**: 5 seconds (industry standard)

5. **Badge Count**: Show unread/total count in tab bar?
   - **Recommendation**: Optional enhancement, not required for MVP

6. **Sort Options**: Allow users to change sort order?
   - **Recommendation**: Not for MVP, add in v2 with user settings

7. **Search**: Should inbox include search functionality?
   - **Recommendation**: Not for MVP, plan for v2

---

## 13. Future Enhancements (Out of Scope)

### v1.1 Enhancements
- **Bulk Actions**: Multi-select mode for batch archive/tag/delete
- **Search**: Full-text search across titles, creators, notes
- **Sort Options**: Date added, date published, alphabetical
- **View Options**: Compact, comfortable, media-rich list variants

### v1.2 Enhancements
- **Smart Filters**: Unread, favorited, has notes, is paywall
- **Collections**: Quick filter by collection membership
- **Swipe Customization**: User-configurable swipe actions
- **Keyboard Shortcuts**: Archive (cmd+e), next/prev (j/k)

### v2.0 Enhancements
- **Read Later Queue**: Dedicated queue with swipe-to-complete
- **Reading Progress**: Track % read for articles
- **Smart Suggestions**: "You might like" based on reading history
- **Offline Mode**: Download bookmarks for offline reading

---

## 14. Dependencies & Risks

### Dependencies
- CategoryTabs component (exists)
- SwipeableBookmarkItem component (exists)
- BookmarkListItem component (exists)
- useArchiveBookmark hook (exists)
- Archive API endpoints (exist)

### Risks
| Risk | Impact | Mitigation |
|------|--------|------------|
| Swipe gesture conflicts with scroll | High | Use strict horizontal pan detection with 5px threshold |
| Performance with large lists (1000+ items) | Medium | Implement FlatList virtualization + pagination |
| Archive undo complexity | Medium | Keep simple with 5s timeout, avoid complex state tracking |
| Filter chip removal from homepage | Low | Homepage can show different UI (e.g., quick actions) |

---

## 15. Success Criteria

### MVP Launch Criteria
- [ ] Inbox screen accessible from tab navigation
- [ ] All active bookmarks display in reverse chronological order
- [ ] CategoryTabs filtering works for all 5 content types
- [ ] Swipe-left-to-archive works with haptic feedback
- [ ] Archive action updates list in < 300ms
- [ ] Undo toast restores archived bookmark
- [ ] Tapping bookmark navigates to detail view
- [ ] Empty states display for each filter type
- [ ] 60fps scroll performance on iPhone 12 Pro with 500 bookmarks
- [ ] VoiceOver support for all interactions

### Post-Launch Success (30 days)
- 40%+ DAU visit inbox screen
- 30%+ archive actions via swipe (vs detail view button)
- 25%+ inbox sessions use content type filters
- < 2% undo rate (indicates confidence in swipe action)
- 4.5+ star rating in user feedback

---

## 16. Design Mockups

### Required Design Assets
1. **Inbox Screen - Full View** (All filter active)
2. **Inbox Screen - Articles Filter** (Filtered state)
3. **Swipe Interaction States** (0%, 40%, 70%)
4. **Empty State - No Bookmarks**
5. **Empty State - No Articles** (filtered, empty)
6. **Undo Toast Notification**

### Design System Components to Use
- BookmarkListItem (variant: compact) ✅
- CategoryTabs ✅
- Toast (may need new component)
- Empty state illustration (may need design)

---

## 17. Implementation Checklist

### Backend (No Changes Required)
- [x] Archive endpoint exists (`PUT /api/v1/bookmarks/:id/archive`)
- [x] Unarchive endpoint exists (`PUT /api/v1/bookmarks/:id/unarchive`)
- [x] Get bookmarks endpoint supports status filtering

### Frontend - Components
- [ ] Create `InboxScreen` component (`apps/mobile/app/(app)/(tabs)/inbox.tsx`)
- [ ] Move `CategoryTabs` to inbox (update homepage to remove it)
- [ ] Create `useInboxBookmarks` hook with filtering logic
- [ ] Configure `SwipeableBookmarkItem` for archive action
- [ ] Create toast notification component (or use library)
- [ ] Create empty state components for each filter type

### Frontend - Navigation
- [ ] Add inbox tab to bottom navigation
- [ ] Add inbox icon (Feather: `inbox`)
- [ ] Update tab bar labels and order

### Frontend - Data Layer
- [ ] Update `useBookmarks` to support status filtering
- [ ] Add `useUnarchiveBookmark` hook (for undo)
- [ ] Configure query cache invalidation

### Testing
- [ ] Unit tests for `useInboxBookmarks` hook
- [ ] Integration tests for swipe-to-archive flow
- [ ] Integration tests for filter functionality
- [ ] E2E test: archive and undo
- [ ] E2E test: filter switching
- [ ] Performance test: 1000 item list scroll

### Analytics
- [ ] Add analytics tracking for all events listed in section 9.4

---

## Appendix A: Reference Implementation

### Component: InboxScreen (Skeleton)

```typescript
// apps/mobile/app/(app)/(tabs)/inbox.tsx
import React, { useState } from 'react';
import { View, FlatList, RefreshControl } from 'react-native';
import { CategoryTabs, CategoryType } from '@/components/CategoryTabs';
import { SwipeableBookmarkItem } from '@/components/bookmark-list/SwipeableBookmarkItem';
import { useInboxBookmarks } from '@/hooks/useInboxBookmarks';
import { useArchiveBookmark } from '@/hooks/useArchiveBookmark';
import { useUnarchiveBookmark } from '@/hooks/useUnarchiveBookmark';

export default function InboxScreen() {
  const [selectedCategory, setSelectedCategory] = useState<CategoryType>('all');
  const { bookmarks, isLoading, refetch } = useInboxBookmarks(selectedCategory);
  const archiveMutation = useArchiveBookmark();
  const unarchiveMutation = useUnarchiveBookmark();

  const handleArchive = async (bookmarkId: string) => {
    await archiveMutation.mutateAsync(bookmarkId);
    // Show undo toast
    showUndoToast(bookmarkId);
  };

  const handleUndo = async (bookmarkId: string) => {
    await unarchiveMutation.mutateAsync(bookmarkId);
  };

  const swipeActions = {
    right: [
      {
        id: 'archive',
        icon: 'archive',
        iconColor: '#ffffff',
        backgroundColor: '#f97316',
        onPress: handleArchive,
      },
    ],
  };

  return (
    <View>
      <CategoryTabs
        selectedCategory={selectedCategory}
        onCategoryChange={setSelectedCategory}
      />
      <FlatList
        data={bookmarks}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <SwipeableBookmarkItem
            bookmark={item}
            variant="compact"
            rightActions={swipeActions.right}
            onPress={() => router.push(`/bookmark/${item.id}`)}
          />
        )}
        refreshControl={
          <RefreshControl refreshing={isLoading} onRefresh={refetch} />
        }
      />
    </View>
  );
}
```

---

## Appendix B: Related Documentation

- [Mobile App Architecture](../../architecture/mobile-app.md)
- [Design System Guidelines](../../design-system/README.md)
- [Swipe Gesture Patterns](../../patterns/swipe-gestures.md)
- [API Documentation](../../../packages/api/README.md)
- [Bookmark Schema](../../../packages/shared/src/types.ts)

---

**Document History**
- 2025-10-21: Initial draft (v1.0)
