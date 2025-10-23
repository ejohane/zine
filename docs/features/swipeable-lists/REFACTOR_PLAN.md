# Swipeable Lists Refactoring Plan

## Overview
Refactor the current custom swipeable list implementation to use `react-native-swipeable-item`, a battle-tested library that provides better performance and more reliable gesture handling through integration with Reanimated and React Native Gesture Handler.

## Current Implementation Analysis

### Current Architecture
The swipeable functionality is currently implemented with a custom solution across several components:

**Core Components:**
- `SwipeableBookmarkItem.tsx` - Main wrapper component that renders swipeable bookmark items
- `useSwipeGesture.ts` - Custom hook using PanResponder for gesture handling
- `SwipeActionView.tsx` - Component that renders action buttons in the underlay
- `swipeAnimations.ts` - Animation configs and utility functions using Reanimated

**Usage Locations:**
1. **Inbox Page** (`apps/mobile/app/(app)/(tabs)/inbox.tsx`)
   - Archive action on right swipe
   - Toast notification with undo functionality
   - Category filtering tabs
   
2. **Recent Bookmarks Page** (`apps/mobile/app/(app)/recent-bookmarks.tsx`)
   - Archive action on right swipe
   - See all page with up to 25 items

3. **BookmarkList Component** (`apps/mobile/components/bookmark-list/BookmarkList.tsx`)
   - Reusable list component with optional swipe actions
   - Supports left and right swipe actions via props

### Current Limitations
1. **Custom PanResponder Implementation** - Uses PanResponder instead of the more powerful React Native Gesture Handler
2. **Custom Animation Logic** - Reinvents animation handling that `react-native-swipeable-item` provides out of the box
3. **Limited Snap Points** - Current implementation has basic snap functionality
4. **Maintenance Burden** - Custom gesture/animation code requires ongoing maintenance and bug fixes

## Target Library: react-native-swipeable-item

### Key Features
- **Native Gestures** - Powered by React Native Gesture Handler for better performance
- **Reanimated Integration** - Uses Reanimated 2+ for smooth 60fps animations
- **Flexible Snap Points** - Supports multiple snap points in each direction
- **Programmatic Control** - Imperative API to open/close items
- **TypeScript Support** - Full type safety
- **FlatList Compatible** - Works seamlessly with FlatList and other list components

### Dependencies Check
Current mobile app already has:
- ✅ `react-native-reanimated: ~4.1.0`
- ❓ Need to verify `react-native-gesture-handler` version

### API Overview

**Core Props:**
```typescript
<SwipeableItem
  item={data}
  renderUnderlayLeft={() => <LeftActions />}
  renderUnderlayRight={() => <RightActions />}
  snapPointsLeft={[80]}
  snapPointsRight={[80]}
  onChange={({ openDirection, snapPoint }) => {}}
  swipeEnabled={true}
  activationThreshold={20}
  swipeDamping={10}
>
  {children}
</SwipeableItem>
```

**Utility Hook:**
```typescript
const { open, close, percentOpen, isGestureActive } = useSwipeableItemParams()
```

**Imperative API:**
```typescript
const itemRef = useRef<SwipeableItemImperativeRef>(null)
itemRef.current?.open(OpenDirection.LEFT)
itemRef.current?.close()
```

## Migration Strategy

### Phase 1: Setup & Dependencies ✅ COMPLETED
**Goal:** Install and configure the library

**Tasks:**
1. ✅ Install `react-native-swipeable-item` via bun
2. ✅ Verify `react-native-gesture-handler` is installed and configured
3. ✅ Test basic swipeable item in isolation to confirm setup
4. ✅ Create example/prototype component to validate behavior

**Files Created:**
- `apps/mobile/components/bookmark-list/__examples__/SwipeableItemExample.tsx` - Example test component for validation
- `apps/mobile/components/bookmark-list/__examples__/index.ts` - Barrel export
- `apps/mobile/components/bookmark-list/__examples__/README.md` - Documentation for validation

**Dependencies Installed:**
- `react-native-swipeable-item@2.0.9` - Main swipeable library
- `react-native-gesture-handler@2.29.0` - Gesture handling (required peer dependency)
- `react-native-reanimated@~4.1.0` - Already installed ✓

**Validation:**
- ✅ Lint checks passing
- ✅ Type checks passing
- ✅ Existing tests passing
- ✅ Example component demonstrates left/right swipe with animated underlays
- ✅ Snap points working at 80px
- ✅ Gesture handling functional

**Actual Time:** ~1 hour

**Status:** Phase 1 is complete and ready for Phase 2 implementation.

### Phase 2: Create New Swipeable Component ✅ COMPLETED
**Goal:** Build new SwipeableBookmarkItem wrapper around the library

**Tasks:**
1. ✅ Create `SwipeableBookmarkItemV2.tsx` (or similar name)
2. ✅ Map current `SwipeAction` type to new library's underlay pattern
3. ✅ Implement underlay components for left/right actions
4. ✅ Add support for haptic feedback on swipe
5. ✅ Maintain backward compatibility with current props API where possible
6. ✅ Add TypeScript types

**Files Created:**
- `apps/mobile/components/bookmark-list/SwipeableBookmarkItemV2.tsx` - New swipeable component using react-native-swipeable-item
- `apps/mobile/components/bookmark-list/swipe-actions-v2/SwipeUnderlay.tsx` - Underlay component for rendering swipe actions

**Files Updated:**
- `apps/mobile/components/bookmark-list/types.ts` - Added SwipeChangeParams and SwipeableBookmarkItemV2Props interfaces
- `apps/mobile/components/bookmark-list/index.ts` - Exported new component and types

**Implementation Details:**
- Implemented using `react-native-swipeable-item` library with full gesture handler support
- Haptic feedback triggers on iOS when swipe reaches threshold (50% open)
- Action handling through callback props with automatic item close after action execution
- Snap points calculated based on ACTION_WIDTH (80px) matching current implementation
- Falls back to non-swipeable BookmarkListItem when no actions provided
- Fully type-safe with TypeScript interfaces
- Supports left and right swipe actions with configurable activation threshold and swipe damping

**API Implementation:**
```typescript
interface SwipeableBookmarkItemV2Props extends BookmarkListItemProps {
  leftActions?: SwipeAction[];
  rightActions?: SwipeAction[];
  onSwipeChange?: (params: SwipeChangeParams) => void;
  swipeEnabled?: boolean;
  activationThreshold?: number;
  swipeDamping?: number;
  enableHapticFeedback?: boolean;
}

interface SwipeChangeParams {
  openDirection: OpenDirection;
  snapPoint: number;
}
```

**Validation:**
- ✅ Lint checks passing
- ✅ Type checks passing  
- ✅ Component compiles without errors
- ✅ Maintains backward compatibility with SwipeAction interface
- ✅ Haptic feedback integrated from existing implementation

**Actual Time:** ~2 hours

**Status:** Phase 2 is complete and ready for Phase 3 implementation (Inbox page migration).

### Phase 3: Update Inbox Page
**Goal:** Migrate inbox page to use new swipeable implementation

**Tasks:**
1. Replace `SwipeableBookmarkItem` with `SwipeableBookmarkItemV2` in inbox
2. Verify archive action works correctly
3. Test toast notification and undo functionality
4. Verify haptic feedback works as expected
5. Test with category filtering
6. Validate performance with large lists

**Files to Update:**
- `apps/mobile/app/(app)/(tabs)/inbox.tsx`

**Testing Checklist:**
- [ ] Swipe right reveals archive action
- [ ] Archive action triggers mutation
- [ ] Toast notification appears with correct bookmark title
- [ ] Undo functionality restores bookmark
- [ ] Haptic feedback fires at correct threshold
- [ ] List scrolling still works smoothly
- [ ] Category tab switching preserves swipe state (or resets appropriately)
- [ ] Pull to refresh works
- [ ] Empty states render correctly

**Estimated Time:** 2-3 hours

### Phase 4: Update Recent Bookmarks Page
**Goal:** Migrate recent bookmarks page to new implementation

**Tasks:**
1. Update `recent-bookmarks.tsx` to use new component
2. Verify archive action
3. Test with up to 25 items
4. Validate navigation back/forward

**Files to Update:**
- `apps/mobile/app/(app)/recent-bookmarks.tsx`

**Testing Checklist:**
- [ ] Swipe actions work correctly
- [ ] Archive mutation triggers
- [ ] List performance is good with 25 items
- [ ] Navigation maintains state

**Estimated Time:** 1-2 hours

### Phase 5: Update BookmarkList Component
**Goal:** Update the generic BookmarkList component

**Tasks:**
1. Update `BookmarkList.tsx` to use new swipeable component conditionally
2. Update props interface
3. Ensure backward compatibility during migration
4. Add feature flag if needed for gradual rollout

**Files to Update:**
- `apps/mobile/components/bookmark-list/BookmarkList.tsx`
- `apps/mobile/components/bookmark-list/types.ts`

**Estimated Time:** 2 hours

### Phase 6: Testing & Validation
**Goal:** Comprehensive testing across all use cases

**Tasks:**
1. Test on iOS physical device
2. Test on Android physical device
3. Test edge cases (rapid swipes, interrupted gestures, etc.)
4. Performance profiling with large lists (100+ items)
5. Accessibility testing
6. Test with VoiceOver/TalkBack

**Testing Scenarios:**
- [ ] Swipe and hold mid-gesture
- [ ] Rapid swipes in succession
- [ ] Swipe during list scroll
- [ ] Simultaneous touches
- [ ] Swipe with one item open already
- [ ] Memory usage with many list items
- [ ] Frame rate during swipe gestures

**Estimated Time:** 3-4 hours

### Phase 7: Cleanup & Documentation
**Goal:** Remove old implementation and document changes

**Tasks:**
1. Remove old swipeable implementation files:
   - `SwipeableBookmarkItem.tsx` (old version)
   - `useSwipeGesture.ts`
   - `SwipeActionView.tsx`
   - `swipeAnimations.ts`
2. Rename `SwipeableBookmarkItemV2` to `SwipeableBookmarkItem`
3. Update any remaining imports
4. Update component documentation
5. Add migration notes to changelog

**Files to Delete:**
- `apps/mobile/components/bookmark-list/SwipeableBookmarkItem.tsx`
- `apps/mobile/components/bookmark-list/swipe-actions/*`

**Files to Update:**
- Rename and update imports across codebase
- Update component documentation

**Estimated Time:** 1-2 hours

## Props Mapping Strategy

### Current Props → New Library

| Current Prop | New Approach | Notes |
|--------------|--------------|-------|
| `leftActions` | `renderUnderlayLeft` + `snapPointsLeft` | Convert to render function, calculate snap points |
| `rightActions` | `renderUnderlayRight` + `snapPointsRight` | Convert to render function, calculate snap points |
| `enableHapticFeedback` | Custom logic in underlay components | Trigger on `percentOpen` threshold |
| `swipeThreshold` | `activationThreshold` | Direct mapping |
| `overshootFriction` | `swipeDamping` | Inverse relationship |

### Action Rendering Pattern

**Current:**
```typescript
rightActions={[
  {
    id: 'archive',
    icon: 'archive',
    backgroundColor: '#6B7280',
    onPress: handleArchive,
  }
]}
```

**New:**
```typescript
renderUnderlayRight={() => (
  <SwipeActionUnderlay 
    actions={rightActions}
    side="right"
  />
)}
snapPointsRight={[80]}
```

## Type System Updates

### New Types to Add
```typescript
import { OpenDirection } from 'react-native-swipeable-item';

interface SwipeChangeParams {
  openDirection: OpenDirection;
  snapPoint: number;
}

interface SwipeableBookmarkItemV2Props extends BookmarkListItemProps {
  leftActions?: SwipeAction[];
  rightActions?: SwipeAction[];
  onSwipeChange?: (params: SwipeChangeParams) => void;
  swipeEnabled?: boolean;
  activationThreshold?: number;
  swipeDamping?: number;
  enableHapticFeedback?: boolean;
}
```

### Keep Existing Types
```typescript
// Keep the SwipeAction interface as-is for compatibility
interface SwipeAction {
  id: string;
  icon: string;
  iconColor?: string;
  backgroundColor: string;
  onPress: (bookmarkId: string) => void;
  label?: string;
}
```

## Performance Considerations

### Benefits of Migration
1. **Better Gesture Recognition** - Gesture Handler provides more responsive touch handling
2. **Native Thread Animation** - Reanimated runs animations on UI thread
3. **Reduced Re-renders** - Library handles animation state internally
4. **Optimized for Lists** - Designed specifically for FlatList usage

### Potential Challenges
1. **Bundle Size** - Adding new dependency (though dependencies already present)
2. **Learning Curve** - Team needs to understand new API
3. **Migration Risk** - Temporary regressions during transition

### Monitoring Metrics
- Swipe gesture response time
- Frame drops during swipe
- Memory usage in long lists
- Touch event handling accuracy

## Risk Mitigation

### Backward Compatibility
- Keep old implementation alongside new one during migration
- Use feature flags if needed for gradual rollout
- Create V2 suffix for new components initially

### Rollback Plan
1. All old code remains until Phase 7
2. Git branches for each phase
3. Can revert any individual phase if issues arise

### Testing Strategy
- Unit tests for SwipeAction conversion logic
- Integration tests for each screen
- E2E tests for critical flows (archive, undo)
- Manual testing on physical devices

## Success Criteria

### Functional Requirements
- ✅ All swipe actions work as before
- ✅ Haptic feedback maintains current behavior
- ✅ Toast notifications and undo work correctly
- ✅ No regressions in list scrolling performance

### Performance Requirements
- ✅ 60fps during swipe gestures
- ✅ No increase in memory usage
- ✅ Swipe response time ≤ current implementation

### Code Quality
- ✅ Type-safe implementation
- ✅ No ESLint errors
- ✅ Passing all existing tests
- ✅ Documented API changes

## Timeline Estimate

| Phase | Estimated Time | Dependencies |
|-------|---------------|--------------|
| Phase 1: Setup | 1-2 hours | None |
| Phase 2: New Component | 3-4 hours | Phase 1 |
| Phase 3: Inbox Migration | 2-3 hours | Phase 2 |
| Phase 4: Recent Bookmarks | 1-2 hours | Phase 2 |
| Phase 5: BookmarkList | 2 hours | Phases 3, 4 |
| Phase 6: Testing | 3-4 hours | Phase 5 |
| Phase 7: Cleanup | 1-2 hours | Phase 6 |
| **Total** | **13-19 hours** | |

## Open Questions

1. **Gesture Handler Version** - Need to verify current version installed
2. **Android Testing** - Current implementation tested on Android?
3. **Simultaneous Swipes** - Should multiple items be able to be open at once, or should opening one close others?
4. **Accessibility** - How should swipe actions be exposed to screen readers?
5. **Animation Customization** - Do we need to customize spring/timing configs?

## Next Steps

1. Review this plan with team
2. Answer open questions
3. Create GitHub issue/task breakdown
4. Begin Phase 1 implementation
5. Set up testing environment for validation
