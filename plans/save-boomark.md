# Bookmark Saving UX Implementation Plan

## Overview
Implement a dedicated save bookmark page for adding bookmarks with automatic URL preview, clipboard integration, and seamless saving experience. The page will follow the same design patterns as the home and search pages.

## Technical Requirements
- Create a new route `/save` using TanStack Router
- Integrate with existing `/api/v1/bookmarks/preview` endpoint
- Use TanStack Query for API calls and state management
- Support clipboard API for auto-paste functionality
- Implement proper loading states and error handling
- Use existing layout components (Header, MainContent) for consistency

## Design Requirements
- **Visual consistency**: Match the existing home and search page design patterns
- **Color scheme**: Use the same color palette as other pages (primary, neutral, and accent colors)
- **Typography**: Maintain consistent font sizes, weights, and spacing from other pages
- **Component styling**: Mirror the card styles, button variants, and input designs used throughout the app
- **Spacing and layout**: Follow the same padding, margin, and grid patterns established on other pages
- **Dark mode support**: Ensure the page respects the current theme setting
- **Navigation**: Include back button in header to return to previous page

## Implementation Phases

### Phase 1: Save Bookmark Page Infrastructure
**Goal:** Set up the new save bookmark page with routing and basic layout

#### Tasks:
1. Create new route file `apps/web/src/routes/save.tsx`
2. Configure TanStack Router for `/save` path
3. Create `SaveBookmarkPage` component with Header and MainContent layout
4. Update QuickActionButton "Add New" to navigate to `/save` route
5. Add back navigation button in header
6. Implement page title and meta tags

#### Verification:
- [x] Clicking "Add New" navigates to `/save` page
- [x] Page uses consistent header and layout as other pages (using PageWrapper)
- [x] Back button returns to previous page (via cancel button)
- [x] Page is responsive and follows app design patterns

#### Files to Create/Modify:
- `apps/web/src/routes/save.tsx` (new)
- `apps/web/src/components/navigation/QuickActionButton.tsx` (modify to add navigation)
- `apps/web/src/router.tsx` (add new route)

---

### Phase 2: URL Input Section
**Goal:** Implement the URL input field with clipboard auto-paste

#### Tasks:
1. Add `Input` component from `@zine/design-system/ui` to the page
2. Style input section to match search page design
3. Implement auto-focus on page load using `useEffect` and ref
4. Add clipboard read functionality using Clipboard API
5. Handle permission requests for clipboard access
6. Implement URL validation (basic regex check)
7. Add clear button for input field
8. Create input container with proper spacing and padding

#### Verification:
- [x] Input is focused when page loads (autoFocus attribute set)
- [x] If clipboard contains a URL, it auto-pastes (implemented)
- [x] User can manually type/paste URLs
- [x] Invalid URLs show error state
- [x] Clear button resets input (implemented with X icon)
- [x] Input section matches search page styling

#### Files to Create/Modify:
- `apps/web/src/routes/save.tsx` (enhance with input section)
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
- [x] Preview API is called after URL input (with debounce - 1000ms)
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
**Goal:** Display extracted metadata in an attractive card layout that matches the homepage design

#### Tasks:
1. Create `BookmarkPreview` component using homepage card patterns
2. Display content type badge (Video, Article, Podcast, etc.) matching existing badge styles
3. Show thumbnail/image if available with same border radius and shadow as homepage cards
4. Display title, description, published date using homepage typography scale
5. Show favicon and source domain consistent with existing bookmark cards
6. Add platform-specific styling (YouTube red, Spotify green, etc.) from design tokens
7. Handle missing metadata gracefully
8. Ensure preview card matches the visual weight and style of homepage bookmark cards
9. Position preview card below the input section with appropriate spacing
10. Add smooth transition animation when preview appears

#### Verification:
- [x] All metadata fields display correctly
- [x] Images load with fallback states
- [x] Content type badges use correct colors
- [x] Long descriptions truncate appropriately (line-clamp)
- [x] Missing fields don't break layout
- [x] Preview card animates in smoothly
- [x] Layout maintains consistency with other pages

#### Files to Create/Modify:
- `apps/web/src/components/bookmarks/BookmarkPreview.tsx` (new)
- `apps/web/src/components/bookmarks/ContentTypeBadge.tsx` (new)
- `apps/web/src/routes/save.tsx` (add preview section)

---

### Phase 5: Save Functionality
**Goal:** Implement bookmark saving with proper state management

#### Tasks:
1. Create `useCreateBookmark` mutation hook
2. Add "Save Bookmark" button below preview card
3. Style button to match primary buttons used throughout the app
4. Implement loading state for save operation
5. Handle duplicate detection response
6. Show success/error toast notifications
7. Invalidate bookmarks query on success
8. Navigate back to previous page after successful save
9. Add cancel button to return without saving

#### Verification:
- [x] Save button is disabled without valid preview
- [x] Loading state shows during save
- [x] Success navigates back and shows toast
- [ ] Duplicate bookmarks show appropriate message (needs testing)
- [x] Bookmarks list updates after save
- [x] Error handling works for network failures
- [x] Cancel button returns to previous page

#### Files to Create/Modify:
- `apps/web/src/hooks/useCreateBookmark.ts` (new)
- `apps/web/src/routes/save.tsx` (add save/cancel buttons and logic)
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
- [x] Timeouts handled gracefully (10s timeout)
- [x] Long content doesn't break layout (truncation added)
- [x] Screen readers work correctly (ARIA labels added)
- [x] All URL types handled appropriately (PDF/image warnings)

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
- Responsive layout for small screens
- Handle virtual keyboard properly
- Ensure proper scroll behavior with keyboard open
- Optimize button placement for thumb reach

## Dependencies
- `@zine/design-system` - UI components
- `@tanstack/react-query` - Data fetching
- `zod` - Schema validation
- `clsx` - Conditional classes
- Browser Clipboard API
- Browser Focus Management API

## Timeline Estimate
- Phase 1: 2 hours (Page setup and routing)
- Phase 2: 3 hours (URL input section)
- Phase 3: 3 hours (Preview API integration)
- Phase 4: 4 hours (Preview display)
- Phase 5: 3 hours (Save functionality)
- Phase 6: 3 hours (Error handling)
- Unit Testing: 2 hours

**Total: ~20 hours of development time**

## Risk Mitigation
- **Clipboard API permissions**: Fallback to manual paste
- **Preview API failures**: Show manual entry form
- **Network issues**: Show clear error messages with retry option
- **Performance on slow devices**: Keep animations simple
- **Browser compatibility**: Test core functionality across browsers