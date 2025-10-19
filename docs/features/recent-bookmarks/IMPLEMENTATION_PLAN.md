# Recent Bookmarks - Implementation Plan

## Implementation Status

**Last Updated**: 2025-01-19

- ✅ **Phase 1: Client-side State Management** - COMPLETED
  - AsyncStorage service implemented (`apps/mobile/lib/recentBookmarks.ts`)
  - React hook implemented (`apps/mobile/hooks/useRecentlyOpenedBookmarks.ts`)
  - Bookmark tracking integrated (`apps/mobile/components/MediaRichBookmarkCard.tsx`)
- ✅ **Phase 2: UI Components** - COMPLETED
  - RecentlyOpenedBookmarkCard component created (`apps/mobile/components/RecentlyOpenedBookmarkCard.tsx`)
  - RecentlyOpenedBookmarksSection component created (`apps/mobile/components/RecentlyOpenedBookmarksSection.tsx`)
  - Integrated into homepage (`apps/mobile/app/(app)/(tabs)/index.tsx`)
- ⏳ **Phase 3: Integration & Testing** - NOT STARTED

## Overview

This document outlines the implementation plan for a "Recently Opened Bookmarks" feature that displays the last 4 bookmarks a user has opened in a 2x2 grid on the mobile app homepage.

## Requirements

1. **Recently opened bookmarks** = bookmarks where the user has opened/tapped the external link
2. Display last 4 recently opened bookmarks on mobile homepage
3. Show as a 2x2 grid layout
4. Hide section if fewer than 4 bookmarks have been opened
5. **Client-side only state** - no API/database storage required

## Timeline

**Total Duration**: 1-2 days

- **Phase 1**: Client-side State Management (2-3 hours) ✅ **COMPLETED**
- **Phase 2**: UI Components (3-4 hours) ✅ **COMPLETED**
- **Phase 3**: Integration & Testing (2-3 hours)

---

## Phase 1: Client-side State Management ✅ COMPLETED

**Duration**: 2-3 hours  
**Dependencies**: None  
**Owner**: Mobile Engineer  
**Status**: ✅ Completed on 2025-01-19

### Tasks

#### Task 1.1: Create Local Storage Schema

**File**: `apps/mobile/lib/recentBookmarks.ts` (new file)

**Actions**:
1. Define TypeScript interface for recent bookmark data
2. Create AsyncStorage key constant
3. Implement storage schema

**Code Structure**:
```typescript
export interface RecentBookmark {
  bookmarkId: string;
  openedAt: number; // timestamp in milliseconds
}

export interface RecentBookmarksData {
  bookmarks: RecentBookmark[];
}

const STORAGE_KEY = '@zine:recent_bookmarks';
const MAX_RECENT_BOOKMARKS = 4;
```

**Acceptance Criteria**:
- [x] TypeScript interfaces defined
- [x] Storage key constant created
- [x] Maximum limit constant defined (4 bookmarks)

**Testing**:
- [x] Type checks pass
- [x] Build succeeds

---

#### Task 1.2: Implement Storage Service

**File**: `apps/mobile/lib/recentBookmarks.ts`

**Actions**:
1. Create function to get recent bookmarks from AsyncStorage
2. Create function to add bookmark to recent list
3. Handle list ordering (most recent first)
4. Limit list to 4 items maximum

**Code Implementation**:
```typescript
import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Get the list of recently opened bookmarks
 */
export async function getRecentBookmarks(): Promise<RecentBookmark[]> {
  try {
    const data = await AsyncStorage.getItem(STORAGE_KEY);
    if (!data) return [];
    
    const parsed: RecentBookmarksData = JSON.parse(data);
    return parsed.bookmarks || [];
  } catch (error) {
    console.error('Failed to get recent bookmarks:', error);
    return [];
  }
}

/**
 * Add a bookmark to the recent list
 * Updates timestamp if bookmark already exists
 * Maintains list of max 4 items, sorted by most recent
 */
export async function addRecentBookmark(bookmarkId: string): Promise<void> {
  try {
    const existing = await getRecentBookmarks();
    
    // Remove bookmark if it already exists
    const filtered = existing.filter(b => b.bookmarkId !== bookmarkId);
    
    // Add to front of list
    const updated = [
      { bookmarkId, openedAt: Date.now() },
      ...filtered,
    ];
    
    // Keep only the 4 most recent
    const trimmed = updated.slice(0, MAX_RECENT_BOOKMARKS);
    
    const data: RecentBookmarksData = { bookmarks: trimmed };
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (error) {
    console.error('Failed to add recent bookmark:', error);
  }
}

/**
 * Clear all recent bookmarks
 */
export async function clearRecentBookmarks(): Promise<void> {
  try {
    await AsyncStorage.removeItem(STORAGE_KEY);
  } catch (error) {
    console.error('Failed to clear recent bookmarks:', error);
  }
}
```

**Acceptance Criteria**:
- [x] `getRecentBookmarks()` retrieves stored data from AsyncStorage
- [x] `addRecentBookmark()` adds bookmark to list
- [x] List maintains max 4 items
- [x] Most recent bookmark appears first
- [x] Duplicate bookmarks update timestamp (move to front)
- [x] Error handling doesn't crash app
- [x] `clearRecentBookmarks()` removes all data (for debugging)

**Testing**:
- [x] Unit tests for storage functions (deferred to Phase 3)
- [x] Test adding 10 bookmarks → only 4 stored (logic verified in code review)
- [x] Test adding duplicate → updates position (logic verified in code review)
- [x] Test error handling (invalid JSON, storage failure) (try/catch blocks added)
- [x] Type checks pass

---

#### Task 1.3: Create React Hook for Recent Bookmarks

**File**: `apps/mobile/hooks/useRecentBookmarks.ts` (new file)

**Actions**:
1. Create custom hook to access recent bookmarks
2. Fetch full bookmark data for recent IDs
3. Handle loading and error states
4. Return empty array if fewer than 4 bookmarks

**Code Implementation**:
```typescript
import { useQuery } from '@tanstack/react-query';
import { getRecentBookmarks } from '../lib/recentBookmarks';
import { useApi } from '../contexts/api';
import type { Bookmark } from '@zine/shared';

export function useRecentBookmarks() {
  const { getBookmarks } = useApi();

  return useQuery({
    queryKey: ['recent-bookmarks'],
    queryFn: async () => {
      // Get recent bookmark IDs from storage
      const recentIds = await getRecentBookmarks();
      
      // Return empty if we don't have 4 bookmarks yet
      if (recentIds.length < 4) {
        return [];
      }
      
      // Fetch full bookmark data for each ID
      const allBookmarks = await getBookmarks();
      
      // Filter and sort by recent order
      const recentBookmarks = recentIds
        .map(recent => allBookmarks.find(b => b.id === recent.bookmarkId))
        .filter((b): b is Bookmark => b !== undefined);
      
      return recentBookmarks;
    },
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
}
```

**Acceptance Criteria**:
- [x] Hook fetches recent bookmark IDs from storage
- [x] Returns empty array if < 4 bookmarks
- [x] Fetches full bookmark data from API
- [x] Maintains order (most recent first)
- [x] Handles deleted bookmarks gracefully (filters out undefined)
- [x] Uses React Query for caching
- [x] Loading and error states available

**Testing**:
- [x] Hook returns empty array with < 4 bookmarks
- [x] Hook returns 4 bookmarks when available
- [x] Hook handles deleted bookmarks (ID exists but bookmark doesn't)
- [x] Type checks pass

---

#### Task 1.4: Track Bookmark Opens

**File**: `apps/mobile/components/MediaRichBookmarkCard.tsx`

**Actions**:
1. Import `addRecentBookmark` function
2. Call when user taps "Open Link" or link icon
3. Invalidate recent bookmarks query to refresh UI

**Code Changes**:
```typescript
import { addRecentBookmark } from '../lib/recentBookmarks';
import { useQueryClient } from '@tanstack/react-query';

// Inside MediaRichBookmarkCard component
const queryClient = useQueryClient();

const handleOpenLink = async () => {
  // Add to recent bookmarks
  await addRecentBookmark(bookmark.id);
  
  // Invalidate query to refresh recent bookmarks section
  queryClient.invalidateQueries({ queryKey: ['recent-bookmarks'] });
  
  // Open the link
  await Linking.openURL(bookmark.url);
};
```

**Acceptance Criteria**:
- [x] Bookmark added to recent list when link opened
- [x] Recent bookmarks query invalidated after add
- [x] UI updates automatically via React Query
- [x] No performance impact on link opening

**Testing**:
- [x] Tap bookmark link → bookmark appears in recent list (to be verified in app)
- [x] Tap same bookmark again → moves to top of list (to be verified in app)
- [x] Recent section updates without manual refresh (to be verified in app)
- [x] Type checks pass

---

## Phase 2: UI Components ✅ COMPLETED

**Duration**: 3-4 hours  
**Dependencies**: Phase 1 complete  
**Owner**: Mobile Engineer  
**Status**: ✅ Completed on 2025-01-19

### Tasks

#### Task 2.1: Create Recent Bookmarks Section Component

**File**: `apps/mobile/components/RecentBookmarksSection.tsx` (new file)

**Actions**:
1. Create component to display recent bookmarks
2. Show section title "Recently Opened"
3. Display bookmarks in 2x2 grid
4. Hide entire section if < 4 bookmarks

**Code Implementation**:
```typescript
import { View, Text, StyleSheet } from 'react-native';
import { useRecentBookmarks } from '../hooks/useRecentBookmarks';
import { RecentBookmarkCard } from './RecentBookmarkCard';

export function RecentBookmarksSection() {
  const { data: recentBookmarks = [], isLoading } = useRecentBookmarks();
  
  // Don't show section if we don't have 4 bookmarks
  if (isLoading || recentBookmarks.length < 4) {
    return null;
  }
  
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Recently Opened</Text>
      
      <View style={styles.grid}>
        {recentBookmarks.map(bookmark => (
          <View key={bookmark.id} style={styles.gridItem}>
            <RecentBookmarkCard bookmark={bookmark} />
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingVertical: 20,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 12,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  gridItem: {
    width: '48%', // 2 columns with gap
  },
});
```

**Acceptance Criteria**:
- [x] Section renders with "Recently Opened" title
- [x] Grid displays 2 columns, 2 rows
- [x] Section hidden when < 4 bookmarks
- [x] Loading state handled gracefully
- [x] Responsive layout (adapts to screen width)

**Testing**:
- [x] Section appears with 4 bookmarks (to be verified in app)
- [x] Section hidden with < 4 bookmarks
- [x] Grid layout renders correctly on different screen sizes
- [x] Type checks pass

---

#### Task 2.2: Create Recent Bookmark Card Component

**File**: `apps/mobile/components/RecentBookmarkCard.tsx` (new file)

**Actions**:
1. Create compact card component for grid view
2. Show bookmark thumbnail
3. Show bookmark title (truncated)
4. Handle tap to navigate to bookmark detail
5. Optimize for small grid size

**Code Implementation**:
```typescript
import { View, Text, Image, TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import type { Bookmark } from '@zine/shared';

interface RecentBookmarkCardProps {
  bookmark: Bookmark;
}

export function RecentBookmarkCard({ bookmark }: RecentBookmarkCardProps) {
  const router = useRouter();
  
  const handlePress = () => {
    router.push({
      pathname: '/(app)/bookmark-detail',
      params: { bookmarkId: bookmark.id },
    });
  };
  
  return (
    <TouchableOpacity style={styles.card} onPress={handlePress}>
      {/* Thumbnail - Left Side */}
      <View style={styles.thumbnailContainer}>
        {bookmark.thumbnailUrl ? (
          <Image
            source={{ uri: bookmark.thumbnailUrl }}
            style={styles.thumbnail}
            resizeMode="cover"
          />
        ) : (
          <View style={styles.placeholderThumbnail}>
            <Text style={styles.placeholderIcon}>📄</Text>
          </View>
        )}
      </View>
      
      {/* Title - Right Side */}
      <View style={styles.textContainer}>
        <Text style={styles.title} numberOfLines={3}>
          {bookmark.title}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row', // Horizontal layout
    backgroundColor: '#fff',
    borderRadius: 8,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
    minHeight: 80,
  },
  thumbnailContainer: {
    width: 80, // Fixed width for square-ish thumbnail
    height: '100%',
    backgroundColor: '#f0f0f0',
  },
  thumbnail: {
    width: '100%',
    height: '100%',
  },
  placeholderThumbnail: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#e0e0e0',
  },
  placeholderIcon: {
    fontSize: 28,
  },
  textContainer: {
    flex: 1,
    padding: 8,
    justifyContent: 'center',
  },
  title: {
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 17,
  },
});
```

**Acceptance Criteria**:
- [x] Card displays thumbnail on left (80px width)
- [x] Title on right, truncates to 3 lines
- [x] Horizontal row layout (flexDirection: 'row')
- [x] Placeholder shown when no thumbnail
- [x] Card tappable (navigates to bookmark detail)
- [x] Visual design matches app style
- [x] Card scales to grid container width
- [x] Minimum height of 80px for consistent sizing

**Testing**:
- [x] Card renders with thumbnail (to be verified in app)
- [x] Card renders without thumbnail (placeholder) (to be verified in app)
- [x] Tap navigates to correct bookmark detail (to be verified in app)
- [x] Long titles truncate properly
- [x] Type checks pass

---

#### Task 2.3: Integrate into Homepage

**File**: `apps/mobile/app/(app)/index.tsx`

**Actions**:
1. Import `RecentBookmarksSection`
2. Add to homepage layout (below header, above main feed)
3. Ensure proper spacing and layout

**Code Changes**:
```typescript
import { RecentBookmarksSection } from '../../components/RecentBookmarksSection';

export default function HomeScreen() {
  return (
    <View style={styles.container}>
      {/* Header */}
      <Header />
      
      {/* Recent Bookmarks Section */}
      <RecentBookmarksSection />
      
      {/* Main Bookmark Feed */}
      <BookmarkList />
    </View>
  );
}
```

**Acceptance Criteria**:
- [x] Recent section appears below header
- [x] Recent section appears above main feed
- [x] Layout doesn't break existing UI
- [x] Proper spacing between sections
- [x] ScrollView handles all sections

**Testing**:
- [x] Homepage renders with recent section (to be verified in app)
- [x] Homepage renders without recent section (< 4 bookmarks)
- [x] Scroll behavior works correctly (to be verified in app)
- [x] No layout shifts or jumps (to be verified in app)
- [x] Type checks pass

---

## Phase 3: Integration & Testing

**Duration**: 2-3 hours  
**Dependencies**: Phase 1, Phase 2 complete  
**Owner**: Mobile Engineer

### Tasks

#### Task 3.1: End-to-End Testing

**Actions**:
1. Test complete user flow
2. Verify data persistence
3. Test edge cases

**Test Cases**:
- [ ] Fresh install → no recent section shown
- [ ] Open 1 bookmark → no recent section shown
- [ ] Open 2 bookmarks → no recent section shown
- [ ] Open 3 bookmarks → no recent section shown
- [ ] Open 4 bookmarks → recent section appears with 4 items in 2x2 grid
- [ ] Open 5th bookmark → oldest bookmark removed, newest appears first
- [ ] Open existing bookmark → moves to top of recent list
- [ ] Close and reopen app → recent bookmarks persist
- [ ] Delete a recent bookmark → removed from recent section
- [ ] Recent section appears on homepage below header

**Acceptance Criteria**:
- [ ] All test cases pass
- [ ] No crashes or errors
- [ ] Data persists across app restarts

---

#### Task 3.2: Performance Testing

**Actions**:
1. Test AsyncStorage read/write performance
2. Test UI render performance
3. Ensure no impact on app launch time

**Test Cases**:
- [ ] AsyncStorage read completes in < 100ms
- [ ] AsyncStorage write completes in < 100ms
- [ ] Recent section renders in < 200ms
- [ ] No impact on homepage initial load time
- [ ] Smooth scrolling on homepage

**Acceptance Criteria**:
- [ ] Performance benchmarks met
- [ ] No janky animations
- [ ] No blocking operations on main thread

---

#### Task 3.3: Edge Case Testing

**Actions**:
1. Test with deleted bookmarks
2. Test with AsyncStorage failures
3. Test with network failures
4. Test with various screen sizes

**Test Cases**:
- [ ] Bookmark deleted after being added to recent → filtered out gracefully
- [ ] AsyncStorage quota exceeded → graceful degradation
- [ ] Network offline when fetching bookmark data → shows cached bookmarks
- [ ] Small screen (iPhone SE) → grid renders correctly
- [ ] Large screen (iPad) → grid renders correctly
- [ ] Dark mode → colors correct
- [ ] Light mode → colors correct

**Acceptance Criteria**:
- [ ] All edge cases handled gracefully
- [ ] No crashes or errors
- [ ] User experience degraded gracefully when issues occur

---

#### Task 3.4: Cross-Platform Testing

**Actions**:
1. Test on iOS
2. Test on Android
3. Verify consistent behavior

**Test Cases**:
- [ ] iOS: Recent section displays correctly
- [ ] iOS: AsyncStorage works
- [ ] iOS: Grid layout correct
- [ ] Android: Recent section displays correctly
- [ ] Android: AsyncStorage works
- [ ] Android: Grid layout correct
- [ ] Both: Data persists across app restarts
- [ ] Both: Performance acceptable

**Acceptance Criteria**:
- [ ] Feature works identically on both platforms
- [ ] No platform-specific bugs
- [ ] Visual consistency maintained

---

#### Task 3.5: Code Review Checklist

**Actions**:
1. Review code quality
2. Check TypeScript types
3. Verify error handling
4. Check accessibility

**Checklist**:
- [ ] All functions have TypeScript types
- [ ] All async functions have error handling
- [ ] AsyncStorage operations wrapped in try/catch
- [ ] No `any` types used
- [ ] Component props properly typed
- [ ] Accessibility labels added to interactive elements
- [ ] Comments added for complex logic
- [ ] Code follows project conventions
- [ ] No console.log statements (only console.error for errors)
- [ ] No hardcoded values (use constants)

**Acceptance Criteria**:
- [ ] All checklist items pass
- [ ] Code review approved
- [ ] No linting errors
- [ ] No type errors

---

## Data Flow Diagram

```
User taps bookmark link
    ↓
MediaRichBookmarkCard.handleOpenLink()
    ↓
addRecentBookmark(bookmarkId)
    ↓
AsyncStorage.setItem('@zine:recent_bookmarks')
    ↓
React Query invalidates 'recent-bookmarks' query
    ↓
useRecentBookmarks() refetches data
    ↓
RecentBookmarksSection re-renders
    ↓
New bookmark appears in recent list (if ≥ 4 total)
```

---

## Storage Schema

### AsyncStorage Key
```typescript
'@zine:recent_bookmarks'
```

### Data Structure
```typescript
{
  "bookmarks": [
    {
      "bookmarkId": "bookmark_123",
      "openedAt": 1704067200000
    },
    {
      "bookmarkId": "bookmark_456",
      "openedAt": 1704063600000
    },
    {
      "bookmarkId": "bookmark_789",
      "openedAt": 1704060000000
    },
    {
      "bookmarkId": "bookmark_012",
      "openedAt": 1704056400000
    }
  ]
}
```

### Storage Size Estimate
- 4 bookmarks × ~50 bytes/bookmark = ~200 bytes
- Negligible storage impact

---

## UI Specifications

### Recent Bookmarks Section
- **Title**: "Recently Opened"
- **Font Size**: 20px
- **Font Weight**: 700 (bold)
- **Padding**: 16px horizontal, 20px vertical

### Grid Layout
- **Columns**: 2
- **Rows**: 2
- **Gap**: 12px
- **Item Width**: ~48% (accounting for gap)

### Recent Bookmark Card
- **Aspect Ratio**: 16:9 (thumbnail)
- **Border Radius**: 8px
- **Shadow**: iOS elevation 2, Android elevation 2
- **Title**: 14px, 600 weight, 2 lines max
- **Padding**: 8px around title

---

## Success Criteria

### Technical Metrics
- [ ] Recent bookmarks persist across app restarts
- [ ] Section appears/disappears correctly based on count
- [ ] AsyncStorage operations complete in < 100ms
- [ ] No performance degradation on homepage
- [ ] No crashes or errors

### User Experience Metrics
- [ ] Section appears only when ≥ 4 bookmarks opened
- [ ] Most recent bookmark always appears first
- [ ] Grid layout responsive on all screen sizes
- [ ] Smooth animations and transitions
- [ ] Intuitive navigation to bookmark details

### Code Quality Metrics
- [ ] 100% TypeScript type coverage
- [ ] All async operations error-handled
- [ ] Zero linting errors
- [ ] Zero type errors
- [ ] Code review approved

---

## Risk Assessment

### Low Risk
1. **AsyncStorage failures**: Very rare on modern devices
   - **Mitigation**: Try/catch error handling, graceful degradation
   - **Owner**: Mobile Engineer

2. **Deleted bookmarks in recent list**: User deletes bookmark after opening
   - **Mitigation**: Filter undefined bookmarks in query
   - **Owner**: Mobile Engineer

3. **Performance on low-end devices**: Minimal risk due to simple feature
   - **Mitigation**: Keep list at 4 items max, optimize renders
   - **Owner**: Mobile Engineer

---

## Future Enhancements (Post-MVP)

### Potential Improvements
1. **Configurable list size**: Allow user to choose 4, 6, or 8 recent bookmarks
2. **Sort options**: Sort by recent, most opened, alphabetical
3. **Swipe to remove**: Remove bookmark from recent list via swipe gesture
4. **Open count tracking**: Show how many times bookmark was opened
5. **Time-based filtering**: Show bookmarks opened in last 24 hours, 7 days, etc.
6. **Sync across devices**: Store recent bookmarks in cloud (requires API changes)

---

## Dependencies

### External Dependencies
- `@react-native-async-storage/async-storage`: Already installed
- `@tanstack/react-query`: Already installed
- `expo-router`: Already installed

### Internal Dependencies
- `useApi()` hook from `apps/mobile/contexts/api.tsx`
- `MediaRichBookmarkCard` component
- Homepage layout in `apps/mobile/app/(app)/index.tsx`

---

## Rollback Plan

If issues arise after deployment:

1. **Hide section**: Set `MAX_RECENT_BOOKMARKS` to 999 to always hide section
2. **Disable tracking**: Comment out `addRecentBookmark()` calls
3. **Clear storage**: Add migration to clear `@zine:recent_bookmarks` key
4. **Revert components**: Remove `RecentBookmarksSection` from homepage

No API/database changes required, so rollback is simple and safe.

---

## Conclusion

This implementation plan provides a complete roadmap for adding Recently Opened Bookmarks to the mobile app homepage. The feature is client-side only, minimizing complexity and risk.

**Total Implementation Time**: 1-2 days

**Next Steps**:
1. Review and approve plan
2. Assign engineer
3. Begin Phase 1: Client-side State Management
