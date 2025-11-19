# Architecture Document: Inbox with Swipeable List (zine-71m Integration)

## 1. Executive Summary

This document defines the architecture for replacing the current Inbox list implementation with the iOS-style swipeable list architecture from **epic zine-71m**. The goal is to maintain the existing Inbox design aesthetic while leveraging the superior gesture handling, performance optimizations, and user experience of the newly implemented SwipeableList system.

### Current State
- **Location**: `apps/mobile/app/(app)/(tabs)/inbox.tsx`
- **List Component**: Standard `FlatList` with `SwipeableBookmarkItem` using custom pan gesture handler
- **Swipe System**: Custom implementation in `components/bookmark-list/` with `useSwipeGesture` hook
- **Actions**: Archive action on right swipe (action buttons appear on right side)
- **Updates**: Standard async updates with toast notification and undo (unarchive)
- **UX Features**: Toast notifications with undo, category filtering, pull-to-refresh

### Target State
- **List Component**: `SwipeableList` from `components/swipeable-list/`
- **Row Component**: `SwipeableRow` with React Native Gesture Handler's Swipeable
- **Content Component**: Reuse existing `BookmarkListItem` for visual consistency
- **Action Design**: Single archive action (swipe left), circular button with scale/opacity animation
- **Optimistic Updates**: Immediate item removal from list on archive with toast confirmation
- **Enhanced UX**: Better haptics, full-swipe-to-archive, single-row-open state, close-on-scroll

---

## 2. Architectural Principles

### 2.1 Separation of Concerns

```
┌─────────────────────────────────────────────────────────┐
│ Screen Layer (inbox.tsx)                                 │
│ - Data fetching (useInboxBookmarks)                      │
│ - Business logic (archive, undo, toast)                  │
│ - Optimistic updates (React Query)                       │
│ - Category filtering                                     │
│ - Action configuration (archive only)                    │
└────────────────┬────────────────────────────────────────┘
                 │
┌────────────────▼────────────────────────────────────────┐
│ List Orchestration (SwipeableList)                       │
│ - Row management (single-open state)                     │
│ - Scroll integration (close-on-scroll)                   │
│ - FlatList performance optimizations                     │
└────────────────┬────────────────────────────────────────┘
                 │
┌────────────────▼────────────────────────────────────────┐
│ Row Interaction (SwipeableRow)                           │
│ - Gesture handling (Swipeable - left swipe only)         │
│ - Action rendering (right-side archive button)           │
│ - Circular button with scale/opacity animation           │
│ - Haptic feedback                                        │
│ - Full-swipe-to-archive                                  │
└────────────────┬────────────────────────────────────────┘
                 │
┌────────────────▼────────────────────────────────────────┐
│ Content Display (BookmarkListItem)                       │
│ - Bookmark rendering (title, thumbnail, metadata)        │
│ - Variant styling (compact/comfortable/media-rich)       │
│ - Press animations                                       │
└─────────────────────────────────────────────────────────┘
```

### 2.2 Design Continuity

**Keep**: 
- Existing `BookmarkListItem` component (compact variant)
- Header with title and item count
- CategoryTabs for filtering
- Toast notification system with undo
- Empty state screens
- Color scheme and spacing from theme

**Replace**:
- Custom swipe gesture implementation → React Native Gesture Handler `Swipeable`
- Direct FlatList usage → `SwipeableList` wrapper
- Manual row state management → Built-in single-open-row coordination

### 2.3 Performance Targets

- **60fps** scrolling with swipeable rows
- **UI thread gestures** via React Native Gesture Handler Swipeable
- **Minimal re-renders** through React.memo
- **Efficient list virtualization** with FlatList optimizations
- **Optimistic updates** for immediate delete feedback with React Query

### 2.4 Interaction Design

**Swipe Direction**: Left swipe (action buttons appear on right side of screen)

**Action Button**:
- Single circular archive button (same as demo implementation)
- 56px diameter circle with icon
- Animated scale (0 → 1) and opacity (0 → 1) on reveal
- Background color from theme (primary color)
- Archive icon (24px) centered in circle

**Archive Behavior**:
- **Partial swipe**: Reveals archive button, user can tap to archive
- **Full swipe**: Immediately triggers archive (no tap needed)
- **Optimistic update**: Item removed from list instantly
- **Toast feedback**: Bottom toast shows "Archived" with undo option
- **Undo**: Restores item to list, cancels archive mutation

---

## 3. Component Architecture

### 3.1 Updated Inbox Screen Structure

```tsx
<SafeAreaView>
  {/* Header (unchanged) */}
  <View style={styles.header}>
    <Text>Inbox</Text>
    <Text>{count} items</Text>
  </View>

  {/* Category Tabs (unchanged) */}
  <CategoryTabs 
    selectedCategory={selectedCategory}
    onCategoryChange={setSelectedCategory}
  />

  {/* Swipeable List (new) */}
  <SwipeableList
    data={bookmarks}
    renderItem={renderBookmarkContent}
    keyExtractor={(item) => item.id}
    getRightActions={(item) => getSwipeActions(item)}
    enableHaptics={true}
    onRefresh={handleRefresh}
    refreshing={isLoading}
    ListEmptyComponent={renderEmpty}
  />

  {/* Toast (unchanged) */}
  {toastVisible && <AnimatedToast />}
</SafeAreaView>
```

### 3.2 Data Flow (Optimistic Archive)

```
User Action (swipe left / full-swipe)
  ↓
SwipeableRow (gesture detection)
  ↓
Archive action onPress callback
  ↓
Screen handler (handleArchive)
  ↓
React Query Optimistic Update
  ├─ Immediately update cache (remove item from inbox)
  ├─ Item disappears from list
  └─ Show toast ("Archived" + Undo button)
  ↓
Background mutation (archiveBookmark API call)
  ├─ Success: mutation complete, cache stays updated
  └─ Error: rollback cache, restore item, show error toast
  ↓
(If Undo pressed within 5s)
  ├─ Cancel mutation if pending
  ├─ Restore item to cache
  ├─ Item reappears in list
  └─ Hide toast
```

### 3.3 Type Alignment

**Current SwipeAction (bookmark-list/types.ts)**:
```ts
interface SwipeAction {
  id: string;
  icon: string;
  iconColor?: string;
  backgroundColor: string;
  onPress: (bookmarkId: string) => void;
  label?: string;
}
```

**Target SwipeAction (swipeable-list/types.ts)**:
```ts
interface SwipeAction {
  key: string;
  label: string;
  color: string;
  icon?: ReactNode;
  isPrimary?: boolean;
  onPress: () => void;
}
```

**Migration Strategy**: 
- Create adapter function in inbox.tsx to map to SwipeableList format
- Keep archive action (same semantics, different implementation)
- Keep archive icon (circular button with scale/opacity animation)
- Remove left actions entirely (only right-side archive)
- Implement optimistic updates with React Query's `useMutation` onMutate

---

## 4. Key Differences & Migrations

### 4.1 Gesture System

| Aspect | Current (bookmark-list) | New (swipeable-list) |
|--------|-------------------------|----------------------|
| **Library** | Custom PanResponder via Reanimated | React Native Gesture Handler `Swipeable` |
| **State** | Manual `useSwipeGesture` hook | Built-in Swipeable state machine |
| **Animations** | Custom worklets | Swipeable's interpolated animations |
| **Close Behavior** | Manual reset() | Swipeable ref.close() |
| **Full-swipe** | Not implemented | `onSwipeableLeftOpen` / `onSwipeableRightOpen` |

**Benefit**: More reliable gesture handling, better iOS parity, less custom code to maintain.

### 4.2 List Coordination

| Aspect | Current | New |
|--------|---------|-----|
| **Multiple Rows Open** | Possible (no coordination) | Prevented (single-open-row state) |
| **Close on Scroll** | Manual implementation needed | Built-in via `onScroll` in SwipeableList |
| **Close Signal** | Not implemented | `closeSignal` counter |

**Benefit**: Cleaner UX matching iOS Mail/Reminders behavior.

### 4.3 Action Rendering

| Aspect | Current | New |
|--------|---------|-----|
| **Background Layer** | `SwipeActionView` with absolute positioning | `renderRightActions` only |
| **Actions Supported** | Multiple actions (archive only in practice) | Single archive action |
| **Button Shape** | Variable (custom) | Circular (56px diameter) |
| **Icon Rendering** | Feather icon string lookup | ReactNode (archive icon) |
| **Action Reveal** | Linear translation | Animated scale (0→1) + opacity (0→1) |
| **Primary Action** | Not supported | `isPrimary: true` for full-swipe-to-archive |
| **Action Color** | `colors.primary` | `colors.primary` (same) |

**Benefit**: Polished animation matching demo, simplified action model, better gesture handling.

### 4.4 Optimistic Updates

| Aspect | Current | New |
|--------|---------|-----|
| **Update Strategy** | Standard async with manual optimistic UI | React Query optimistic update pattern |
| **Item Removal** | Waits for API response | Immediate (optimistic) |
| **Undo Mechanism** | Unarchive mutation | Cache rollback + mutation cancellation |
| **Error Handling** | Toast on error | Auto-rollback on error + error toast |
| **User Perception** | ~200-500ms delay | Instant feedback |

**Benefit**: Feels faster, more responsive, better UX.

---

## 5. Implementation Strategy

### 5.1 Phases

#### Phase 1: Implement Optimistic Archive Mutation
- Update existing `useArchiveBookmark` hook with optimistic updates
- Implement `onMutate` to immediately update cache (remove from inbox)
- Implement `onError` to rollback cache on failure
- Add mutation cancellation for undo

#### Phase 2: Update Action Configuration
- Create `createArchiveAction()` adapter in inbox.tsx
- Keep archive icon (maintain current semantics)
- Use primary color from theme (same as current)
- Set `isPrimary: true` for full-swipe-to-archive behavior
- Remove all left actions

#### Phase 3: Replace List Component
- Swap `FlatList` → `SwipeableList`
- Swap `renderItem` to use `children` pattern (no SwipeableBookmarkItem wrapper)
- Pass single archive action via `getRightActions`

#### Phase 4: Visual Refinement
- Ensure circular button (56px diameter) matches demo
- Verify scale/opacity animation on reveal
- Use primary color for archive button (consistent with current)
- Archive icon centered at 24px size
- Preserve haptic feedback

#### Phase 5: Toast Integration
- Update toast to show "Archived" message (same as current)
- Keep undo button in toast (same as current)
- Wire undo to cache restoration (optimistic rollback)
- Test error rollback scenarios

### 5.2 Rollout Plan

1. **Inbox first** (this document)
2. **Archive screen** (similar pattern)
3. **Feed screen** (may need infinite scroll handling)
4. **Recent Bookmarks** (evaluate if swipe actions needed)

---

## 6. Code Examples

### 6.1 Optimistic Archive Mutation

```tsx
// In hooks/useArchiveBookmark.ts (updated)
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { bookmarksApi } from '../lib/api';
import type { Bookmark } from '@zine/shared';

export function useArchiveBookmark() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (bookmarkId: string) => bookmarksApi.archive(bookmarkId),
    
    // Optimistic update
    onMutate: async (bookmarkId) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: ['bookmarks', 'inbox'] });

      // Snapshot previous value
      const previousBookmarks = queryClient.getQueryData<Bookmark[]>(['bookmarks', 'inbox']);

      // Optimistically remove from inbox (filter out archived item)
      queryClient.setQueryData<Bookmark[]>(['bookmarks', 'inbox'], (old) => 
        old?.filter((b) => b.id !== bookmarkId) ?? []
      );

      // Return context for rollback
      return { previousBookmarks, bookmarkId };
    },

    // Rollback on error
    onError: (err, bookmarkId, context) => {
      if (context?.previousBookmarks) {
        queryClient.setQueryData(['bookmarks', 'inbox'], context.previousBookmarks);
      }
    },

    // Refetch on success (optional, cache already updated)
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['bookmarks', 'inbox'] });
    },
  });
}
```

### 6.2 Action Adapter

```tsx
// In inbox.tsx
import { Feather } from '@expo/vector-icons';
import type { SwipeAction as SwipeableListAction } from '../../components/swipeable-list/types';

function createArchiveAction(
  bookmark: Bookmark,
  onArchive: (id: string) => void,
  colors: any
): SwipeableListAction[] {
  return [
    {
      key: 'archive',
      label: 'Archive',
      color: colors.primary, // Primary brand color (same as current)
      icon: <Feather name="archive" size={24} color="#ffffff" />,
      isPrimary: true, // Enable full-swipe-to-archive
      onPress: () => onArchive(bookmark.id),
    },
  ];
}
```

### 6.3 Archive Handler with Optimistic Update

```tsx
// In inbox.tsx
const archiveMutation = useArchiveBookmark();
const [archivedBookmarkId, setArchivedBookmarkId] = useState<string | null>(null);
const [archivedBookmarkTitle, setArchivedBookmarkTitle] = useState<string>('');

const handleArchive = useCallback(async (bookmarkId: string) => {
  // Find bookmark for toast
  const bookmark = bookmarks?.find(b => b.id === bookmarkId);
  const title = bookmark?.title || 'Bookmark';
  
  // Store for undo
  setArchivedBookmarkId(bookmarkId);
  setArchivedBookmarkTitle(title);
  
  // Show toast immediately (before mutation)
  showToast(bookmarkId, title);
  
  // Execute optimistic mutation
  archiveMutation.mutate(bookmarkId);
}, [bookmarks, archiveMutation, showToast]);

const handleUndo = useCallback(() => {
  if (!archivedBookmarkId) return;
  
  // Restore item to cache (rollback optimistic update)
  const queryClient = useQueryClient();
  queryClient.invalidateQueries({ queryKey: ['bookmarks', 'inbox'] });
  
  // Hide toast
  hideToast();
  
  // Haptic feedback
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
}, [archivedBookmarkId, hideToast]);
```

### 6.4 List Integration

```tsx
// In inbox.tsx
import { SwipeableList } from '../../components/swipeable-list';

<SwipeableList
  data={bookmarks ?? []}
  renderItem={({ item }) => (
    <BookmarkListItem
      bookmark={item}
      variant="compact"
      onPress={handleBookmarkPress}
      showThumbnail={true}
      showMetadata={true}
      showPublishDate={true}
      showPlatformIcon={true}
      enableHaptics={true}
    />
  )}
  keyExtractor={(item) => item.id}
  getRightActions={(item) => createArchiveAction(item, handleArchive, colors)}
  enableHaptics={true}
  refreshing={isLoading && bookmarks !== undefined}
  onRefresh={handleRefresh}
  ListEmptyComponent={renderEmpty}
/>
```

---

## 7. Design Considerations

### 7.1 Visual Consistency

**Action Button Style** (Must match demo):
- **Container Width**: 88px (ACTION_WIDTH constant)
- **Circular Button**: 56px diameter circle
- **Background Color**: `colors.primary` (brand color, same as current)
- **Icon**: Feather "archive" at 24px, white color
- **Animation**: Scale (0 → 1) + Opacity (0 → 1) on reveal
- **Positioning**: Centered vertically in row, right-aligned in action area

**Row Height**:
- **Current**: 84px (getItemLayout in inbox.tsx)
- **New**: Must maintain 84px for smooth scrolling
- **BookmarkListItem** already handles this via variant height

**Swipe Direction**:
- **Direction**: Left swipe only (swipe from right to left)
- **Action Position**: Buttons appear on right side of screen
- **Visual**: Archive button slides in from right edge as row moves left

### 7.2 Theme Integration

```tsx
// SwipeableRow must respect theme
const styles = StyleSheet.create({
  foreground: {
    backgroundColor: colors.card, // Not hardcoded '#fff'
  },
  iconCircle: {
    backgroundColor: action.color, // From theme colors
  },
});
```

**Required Change**: Update `SwipeableRow.tsx` to accept theme colors or use `useTheme()` hook.

### 7.3 Accessibility

**Current State**: Not implemented in either system.

**Future Work** (defer to zine-6qw):
- `accessibilityActions` for swipe actions
- 48dp minimum touch targets
- VoiceOver announcements

---

## 8. Migration Checklist

### Pre-Migration
- [ ] Review SwipeableList implementation (zine-71m)
- [ ] Confirm all tests pass for swipeable-list components
- [ ] Document current Inbox behavior (screenshots/video)

### During Migration
- [ ] Update `useArchiveBookmark` hook with optimistic updates
- [ ] Create archive action adapter function
- [ ] Update inbox.tsx to use SwipeableList
- [ ] Configure right-side archive action only (no left actions)
- [ ] Verify circular button (56px) with scale/opacity animation
- [ ] Verify primary color for archive button
- [ ] Test archive with optimistic update (immediate removal)
- [ ] Test undo flow (cache restoration)
- [ ] Test error rollback (item reappears on API error)
- [ ] Test full-swipe-to-archive
- [ ] Test category filtering
- [ ] Test pull-to-refresh
- [ ] Test empty states
- [ ] Test auth prompt state

### Post-Migration
- [ ] Compare performance metrics (fps during scroll)
- [ ] Verify haptic feedback matches or exceeds current
- [ ] Test on iOS and Android
- [ ] Update tests if needed
- [ ] Remove unused SwipeableBookmarkItem from inbox imports
- [ ] Document any deviations from original design

---

## 9. Risk Assessment

### Low Risk
- **Theme Integration**: Easily resolved by passing colors to SwipeableRow
- **Visual Parity**: BookmarkListItem unchanged, just composition layer changed

### Medium Risk
- **Action Callback Signatures**: Adapter function adds slight complexity but isolates the difference
- **Performance Regression**: Unlikely given Swipeable is more optimized, but needs verification

### High Risk (Mitigations)
- **Breaking Other Screens**: Only Inbox is changed initially; bookmark-list components remain for other screens until migrated
- **User Confusion**: If gesture behavior changes significantly, users may need to relearn. Mitigation: Keep archive action on right swipe (same direction).

---

## 10. Success Criteria

### Functional
- ✅ Archive action works on left swipe (buttons appear on right)
- ✅ Full-swipe-to-archive triggers without tapping button
- ✅ Optimistic update: item disappears immediately
- ✅ Toast shows "Archived" with undo button
- ✅ Undo restores item to list (cache rollback)
- ✅ API error auto-restores item with error toast
- ✅ Only one row open at a time
- ✅ Rows close on scroll
- ✅ Category filtering works
- ✅ Pull-to-refresh works

### Performance
- ✅ 60fps during scroll with rows open
- ✅ No jank during swipe gestures
- ✅ Fast list rendering (< 100ms for 100 items)

### UX
- ✅ Haptic feedback on threshold cross
- ✅ Haptic feedback on full-swipe archive
- ✅ Haptic feedback on undo
- ✅ Smooth scale/opacity animation for archive button
- ✅ Circular archive button (56px) matches demo
- ✅ Primary color consistent with current design
- ✅ Instant feedback (optimistic update)
- ✅ Visual design matches current Inbox aesthetic (list items)

---

## 11. Future Enhancements

### Immediate (Post-Migration)
- Evaluate if additional actions are needed (current design: archive only)
- Consider adding secondary actions (e.g., mark as read, favorite)
- Monitor undo usage to validate optimistic update pattern

### Medium-Term
- Accessibility improvements (zine-6qw)
- Elastic overscroll for actions (zine-12v)
- Color interpolation for action backgrounds (zine-12v)

### Long-Term
- Migrate all list screens to SwipeableList
- Deprecate bookmark-list swipe system entirely
- Create universal swipe action configuration system

---

## 12. Design Decisions & Rationale

### 12.1 Why Archive (Not Delete)?

**Decision**: Keep archive semantics (same as current implementation).

**Rationale**:
- Maintains existing user mental model
- Archive is reversible (status='archived'), delete implies permanent
- Users expect to find archived items in Archive screen
- Backend already implements archive endpoint
- Undo flow matches current behavior

### 12.2 Why Single Action Only?

**Decision**: Only support archive action on left swipe (right-side button).

**Rationale**:
- Matches iOS Mail pattern (primary action)
- Reduces decision paralysis (one clear action)
- Cleaner visual design (single circular button)
- Easier to implement optimistic updates
- Future: can add secondary actions if needed

### 12.3 Why Optimistic Updates?

**Decision**: Remove item immediately before API confirmation.

**Rationale**:
- Perceived performance improvement (~200-500ms faster)
- Modern UX expectation (Gmail, iOS Mail, etc.)
- React Query makes rollback reliable
- Toast + undo provides error recovery
- Better engagement (responsive feel)

### 12.4 Why Left Swipe (Buttons on Right)?

**Decision**: Swipe left to reveal archive button on right side.

**Rationale**:
- iOS convention for primary actions (Mail, Messages, Reminders)
- Right thumb accessibility (most users are right-handed)
- Visual association: right side = actions, left side = content
- Matches demo implementation

## 13. Open Questions

1. **Should we add a confirmation dialog for archive?**
   - Recommendation: No, rely on undo toast. Current implementation doesn't have confirmation.
   
2. **Should we enhance haptics beyond current implementation?**
   - Recommendation: Match demo haptics (light on threshold, heavy on full-swipe).
   
3. **How do we handle Android where gestures feel different?**
   - Recommendation: SwipeableList already handles platform differences; test on both, adjust friction if needed.

4. **Should archive be instant or show a loading state?**
   - Recommendation: Instant with optimistic update. Rollback on error.

---

## 14. References

- **Epic**: zine-71m - Swipeable List Architecture
- **Design Doc**: `docs/features/list/swipeable_list_design.md`
- **Current Inbox**: `apps/mobile/app/(app)/(tabs)/inbox.tsx`
- **SwipeableList**: `apps/mobile/components/swipeable-list/`
- **BookmarkListItem**: `apps/mobile/components/bookmark-list/BookmarkListItem.tsx`
- **Related Issues**: 
  - zine-6qw (Accessibility)
  - zine-12v (Future enhancements)

---

## 15. Appendix: API Comparison

### Current API (SwipeableBookmarkItem)

```tsx
<FlatList
  data={bookmarks}
  renderItem={({ item }) => (
    <SwipeableBookmarkItem
      bookmark={item}
      variant="compact"
      onPress={handleBookmarkPress}
      showThumbnail={true}
      showMetadata={true}
      showPublishDate={true}
      showPlatformIcon={true}
      enableHaptics={true}
      rightActions={[{
        id: 'archive',
        icon: 'archive',
        iconColor: '#ffffff',
        backgroundColor: colors.primary,
        onPress: (bookmarkId) => handleArchive(bookmarkId),
        label: 'Archive',
      }]}
      enableHapticFeedback={true}
    />
  )}
/>
```

### New API (SwipeableList + BookmarkListItem)

```tsx
<SwipeableList
  data={bookmarks}
  renderItem={({ item }) => (
    <BookmarkListItem
      bookmark={item}
      variant="compact"
      onPress={handleBookmarkPress}
      showThumbnail={true}
      showMetadata={true}
      showPublishDate={true}
      showPlatformIcon={true}
      enableHaptics={true}
    />
  )}
  keyExtractor={(item) => item.id}
  getRightActions={(item) => [{
    key: 'archive',
    label: 'Archive',
    color: colors.primary,
    icon: <Feather name="archive" size={24} color="#ffffff" />,
    isPrimary: true, // Enable full-swipe-to-archive
    onPress: () => handleArchive(item.id),
  }]}
  enableHaptics={true}
/>
```

**Key Differences**:
- `FlatList` → `SwipeableList` (built-in swipe coordination)
- `SwipeableBookmarkItem` → `BookmarkListItem` (pure content component)
- Actions defined at list level via `getRightActions` callback
- Icon is ReactNode instead of string
- Action callback has no parameters (item captured in closure)
- `isPrimary: true` enables full-swipe-to-archive behavior
- Single archive action (same semantics, better UX)
- Circular button with scale/opacity animation (matches demo)
- Optimistic update in mutation, not in component

---

---

## 16. Summary of Key Changes from Original Scope

This section highlights the specific requirements added to the original design:

### Interaction Model
- **✓ Single Action**: Archive only (no left-side actions)
- **✓ Swipe Direction**: Left swipe (buttons appear on right side)
- **✓ Full-swipe**: Enabled for instant archive without tapping

### Visual Design
- **✓ Circular Button**: 56px diameter circle (matches demo)
- **✓ Animation**: Scale (0→1) + Opacity (0→1) on reveal (matches demo)
- **✓ Color**: Primary color (same as current, maintains brand consistency)
- **✓ Icon**: Archive icon (Feather "archive" at 24px)

### Update Strategy
- **✓ Optimistic Updates**: Immediate item removal before API response
- **✓ React Query Pattern**: `onMutate` for cache update, `onError` for rollback
- **✓ Toast Feedback**: "Archived" message at bottom (same as current)
- **✓ Undo Mechanism**: Cache restoration (optimistic rollback)
- **✓ Error Handling**: Auto-rollback on API failure

### What Stays the Same
- **✓ List Items**: Existing `BookmarkListItem` design unchanged
- **✓ Header/Tabs**: Current header and CategoryTabs unchanged
- **✓ Empty States**: Current empty state designs unchanged
- **✓ Performance**: Same 60fps targets and optimizations
- **✓ Archive Semantics**: Archive (not delete), maintains existing user mental model

---

**Document Version**: 2.0  
**Created**: 2025-11-18  
**Updated**: 2025-11-18  
**Author**: Architecture extraction from zine-71m epic  
**Status**: Ready for Implementation
