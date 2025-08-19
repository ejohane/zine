# Bookmark Saving UX Implementation Plan

## Overview
Implement a bottom sheet interface for adding bookmarks with automatic URL preview, clipboard integration, and seamless saving experience.

## Technical Requirements
- Use `BottomSheet` component from `@zine/design-system/silk`
- Integrate with existing `/api/v1/bookmarks/preview` endpoint
- Use TanStack Query for API calls and state management
- Support clipboard API for auto-paste functionality
- Implement proper loading states and error handling

## Design Requirements
- **Visual consistency**: Match the existing homepage design system and patterns
- **Color scheme**: Use the same color palette as the homepage (primary, neutral, and accent colors)
- **Typography**: Maintain consistent font sizes, weights, and spacing from the homepage
- **Component styling**: Mirror the card styles, button variants, and input designs used on the homepage
- **Spacing and layout**: Follow the same padding, margin, and grid patterns established on the homepage
- **Dark mode support**: Ensure the bottom sheet respects the current theme setting

## Implementation Phases

### Phase 1: Bottom Sheet Infrastructure
**Goal:** Set up the basic bottom sheet component and trigger mechanism

#### Tasks:
1. Create `AddBookmarkSheet` component in `apps/web/src/components/bookmarks/`
2. Import and configure `BottomSheet` from `@zine/design-system`
3. Connect to QuickActionButton "Add New" trigger
4. Implement open/close state management using React state
5. Add keyboard shortcut support (ESC to close)

#### Verification:
- [x] Clicking "Add New" opens the bottom sheet
- [x] ESC key closes the sheet
- [x] Clicking outside or on backdrop closes the sheet
- [x] Sheet animates smoothly from bottom

#### Files to Create/Modify:
- `apps/web/src/components/bookmarks/AddBookmarkSheet.tsx` (new)
- `apps/web/src/components/navigation/QuickActionButton.tsx` (modify to add handler)

---

### Phase 2: URL Input with Auto-Focus and Clipboard
**Goal:** Implement the URL input field with clipboard auto-paste

#### Tasks:
1. Add `Input` component from `@zine/design-system/ui`
2. Implement auto-focus on sheet open using `useEffect` and ref
3. Add clipboard read functionality using Clipboard API
4. Handle permission requests for clipboard access
5. Implement URL validation (basic regex check)
6. Add clear button for input field

#### Verification:
- [x] Input is focused when sheet opens
- [x] If clipboard contains a URL, it auto-pastes
- [x] User can manually type/paste URLs
- [x] Invalid URLs show error state
- [x] Clear button resets input

#### Files to Create/Modify:
- `apps/web/src/components/bookmarks/AddBookmarkSheet.tsx` (enhance)
- `apps/web/src/utils/clipboard.ts` (new - clipboard utilities)
- `apps/web/src/utils/validation.ts` (new - URL validation)

---

### Phase 3: Preview API Integration
**Goal:** Connect to preview endpoint and handle loading/error states

#### Tasks:
1. Create `useBookmarkPreview` hook using TanStack Query
2. Implement debounced URL input (500ms delay)
3. Add loading state with Spinner component
4. Handle API errors gracefully
5. Create preview data type definitions

#### Verification:
- [x] Preview API is called after URL input (with debounce)
- [x] Loading spinner shows during API call
- [x] Error messages display for failed previews
- [x] Preview data is correctly typed
- [x] Network tab shows proper API calls

#### Files to Create/Modify:
- `apps/web/src/hooks/useBookmarkPreview.ts` (new)
- `apps/web/src/lib/api.ts` (add preview function)
- `apps/web/src/types/bookmark.ts` (add preview types)

---

### Phase 4: Preview Content Display
**Goal:** Display extracted metadata in an attractive, informative layout that matches the homepage design

#### Tasks:
1. Create `BookmarkPreview` component using homepage card patterns
2. Display content type badge (Video, Article, Podcast, etc.) matching existing badge styles
3. Show thumbnail/image if available with same border radius and shadow as homepage cards
4. Display title, description, published date using homepage typography scale
5. Show favicon and source domain consistent with existing bookmark cards
6. Add platform-specific styling (YouTube red, Spotify green, etc.) from design tokens
7. Handle missing metadata gracefully
8. Ensure preview card matches the visual weight and style of homepage bookmark cards

#### Verification:
- [x] All metadata fields display correctly
- [x] Images load with fallback states
- [x] Content type badges use correct colors
- [x] Long descriptions truncate appropriately
- [x] Missing fields don't break layout

#### Files to Create/Modify:
- `apps/web/src/components/bookmarks/BookmarkPreview.tsx` (new)
- `apps/web/src/components/bookmarks/ContentTypeBadge.tsx` (new)

---

### Phase 5: Save Functionality
**Goal:** Implement bookmark saving with proper state management

#### Tasks:
1. Create `useCreateBookmark` mutation hook
2. Add "Save Bookmark" button at bottom of sheet
3. Implement loading state for save operation
4. Handle duplicate detection response
5. Show success/error toast notifications
6. Invalidate bookmarks query on success
7. Close sheet after successful save

#### Verification:
- [x] Save button is disabled without valid preview
- [x] Loading state shows during save
- [x] Success closes sheet and shows toast
- [x] Duplicate bookmarks show appropriate message
- [x] Bookmarks list updates after save
- [x] Error handling works for network failures

#### Files to Create/Modify:
- `apps/web/src/hooks/useCreateBookmark.ts` (new)
- `apps/web/src/components/bookmarks/AddBookmarkSheet.tsx` (add save logic)
- `apps/web/src/hooks/useBookmarks.ts` (ensure proper invalidation)

---

### Phase 6: Error Handling & Edge Cases
**Goal:** Handle all edge cases and error scenarios

#### Tasks:
1. Handle malformed URLs gracefully
2. Implement retry logic for failed previews
3. Add timeout handling (10s max for preview)
4. Handle very long content gracefully
5. Support internationalized content
6. Add accessibility features (ARIA labels, focus management)
7. Test with various URL types (PDFs, images, etc.)

#### Verification:
- [x] Malformed URLs show helpful error messages
- [x] Retry button appears for failed previews
- [x] Timeouts handled gracefully
- [x] Long content doesn't break layout
- [x] Screen readers work correctly
- [x] All URL types handled appropriately

---

## Testing Strategy

### Unit Tests
- URL validation functions
- Clipboard utilities
- Preview data transformation
- Error handling logic

## Performance Considerations
- Debounce preview API calls (500ms)
- Lazy load images with intersection observer
- Cache preview results for session duration
- Optimize bottom sheet animations

## Accessibility Requirements
- Full keyboard navigation support
- ARIA labels for all interactive elements
- Focus trap within bottom sheet
- Announce state changes to screen readers
- Respect reduced motion preferences

## Mobile Considerations
- Touch-friendly tap targets (44px minimum)
- Swipe down to dismiss gesture
- Keyboard avoidance for input
- Responsive layout for small screens
- Handle virtual keyboard properly

## Dependencies
- `@zine/design-system` - UI components
- `@tanstack/react-query` - Data fetching
- `zod` - Schema validation
- `clsx` - Conditional classes
- Browser Clipboard API
- Browser Focus Management API

## Timeline Estimate
- Phase 1: 2 hours
- Phase 2: 3 hours
- Phase 3: 3 hours
- Phase 4: 4 hours
- Phase 5: 3 hours
- Phase 6: 3 hours
- Unit Testing: 2 hours

**Total: ~20 hours of development time**

## Risk Mitigation
- **Clipboard API permissions**: Fallback to manual paste
- **Preview API failures**: Show manual entry form
- **Network issues**: Show clear error messages with retry option
- **Performance on slow devices**: Keep animations simple
- **Browser compatibility**: Test core functionality across browsers