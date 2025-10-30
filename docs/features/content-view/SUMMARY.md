# Content View - Implementation Summary

## Quick Overview

The Content View is a **preview-first, save-second** workflow that displays rich metadata for URLs before bookmarking them. It mirrors the bookmark detail view's design but replaces management actions (archive, delete, tags, collections) with a prominent "Save to Bookmarks" button.

## Key Architecture Decisions

### 1. Component Reusability Strategy

**Extract and share presentation logic** between bookmark detail and content view:

```
BookmarkContentDisplay (NEW - SHARED)
├── HeroSection
├── ContentMetadata
├── MetadataCards
└── ContentSections

BookmarkDetailScreen (REFACTORED)
└── BookmarkContentDisplay + BookmarkActionButtons

ContentViewScreen (NEW)
└── BookmarkContentDisplay + SaveBookmarkButton
```

### 2. Data Flow

```
Feed Item Tap ("From Your Feed")
        ↓
ContentViewScreen (/content/[contentId])
        ↓
useContentDetail Hook → GET /api/v1/content/{contentId}
        ↓
Display BookmarkContentDisplay with SaveBookmarkButton
        ↓
User taps Save
        ↓
useSaveBookmarkFromContent Hook → POST /api/v1/bookmarks/from-content
        ↓
Navigate to /bookmark/[bookmarkId] (saved bookmark)
```

### 3. What's Different

| Feature | Bookmark View | Content View |
|---------|--------------|--------------|
| **Primary Action** | Open Link | Save Bookmark |
| **Secondary Action** | Open in... | Open Link |
| **Management Actions** | Archive, Delete, Tags, Collections | None (not saved yet) |
| **User Data** | Tags, Notes | None (not saved yet) |
| **Data Source** | `/api/v1/bookmarks/{id}` | `/api/v1/bookmarks/preview` |

### 4. Backend Changes Required

Two new API endpoints needed:
- ⚠️ `GET /api/v1/content/{contentId}` - Get content from database (feed imports)
- ⚠️ `POST /api/v1/bookmarks/from-content` - Create bookmark from existing content
- ✅ Database schema already supports this (content + bookmarks tables exist)

## File Structure

```
apps/mobile/
├── app/(app)/
│   ├── bookmark/[id].tsx              # REFACTOR: Use shared components
│   └── content/
│       └── [id].tsx                   # NEW: Content view screen (content ID)
├── components/
│   ├── content-display/               # NEW: Shared components
│   │   ├── BookmarkContentDisplay.tsx # Main wrapper
│   │   ├── HeroSection.tsx
│   │   ├── ContentMetadata.tsx
│   │   ├── MetadataCards.tsx
│   │   ├── ContentSections.tsx
│   │   └── AlternateLinksList.tsx
│   ├── action-buttons/                # NEW: Action buttons
│   │   ├── SaveBookmarkButton.tsx     # Primary save CTA
│   │   ├── OpenLinkButton.tsx
│   │   └── BookmarkActionIcons.tsx
│   └── FeedSection.tsx                # MODIFY: Change navigation route
└── hooks/
    ├── useContentDetail.ts            # NEW: Fetch content by ID
    ├── useSaveBookmarkFromContent.ts  # NEW: Save bookmark from content
    └── useBookmarkDetail.ts           # EXISTING: Fetch bookmark
```

## Implementation Phases

### Phase 1: Extract Shared Components (Week 1)
- Create `content-display/` directory with shared components
- Extract HeroSection, ContentMetadata, MetadataCards, ContentSections
- Create BookmarkContentDisplay wrapper with children slot

### Phase 2: Refactor Bookmark Detail (Week 1)
- Update bookmark/[id].tsx to use BookmarkContentDisplay
- Move action buttons outside shared component
- Verify no regressions (visual + functional)

### Phase 3: Implement Content Preview (Week 2)
- Create SaveBookmarkButton component
- Create useContentPreview and useSaveBookmark hooks
- Build content/preview.tsx screen
- Wire up data fetching and save flow

### Phase 4: Integration & Entry Points (Week 3)
- Connect share extension to content preview
- Add URL input field handler
- Handle deep links
- Add toast notifications and analytics

### Phase 5: Testing & Polish (Week 3)
- E2E testing (all user journeys)
- Accessibility testing (VoiceOver, dynamic type)
- Performance optimization
- Analytics validation

## Critical Design Patterns

### 1. Shared Component Pattern
```typescript
// BookmarkContentDisplay acts as presentation layer
<BookmarkContentDisplay
  bookmark={bookmark}
  scrollY={scrollY}
  onCreatorPress={handleCreatorPress}
>
  {/* View-specific actions injected here */}
  {children}
</BookmarkContentDisplay>
```

### 2. Duplicate Detection Flow
```typescript
// useSaveBookmark handles duplicates gracefully
const saveMutation = useSaveBookmark({
  onSuccess: (bookmark) => {
    router.replace(`/bookmark/${bookmark.id}`);
  },
  onDuplicate: (existingId) => {
    router.replace(`/bookmark/${existingId}`);
    showToast("Already saved");
  }
});
```

### 3. Loading States
```typescript
// Progressive enhancement: show basic → enriched metadata
{isLoading && <LoadingSkeleton />}
{preview && (
  <BookmarkContentDisplay bookmark={preview}>
    <SaveBookmarkButton isLoading={isSaving} />
  </BookmarkContentDisplay>
)}
```

## Testing Strategy

### Unit Tests
- [ ] BookmarkContentDisplay renders correctly
- [ ] SaveBookmarkButton all states (default, loading, disabled)
- [ ] useContentPreview hook (success, error, retry)
- [ ] useSaveBookmark hook (save, duplicate, error)

### Integration Tests
- [ ] Bookmark detail works after refactor
- [ ] Content preview renders with shared components
- [ ] Save flow creates bookmark and navigates

### E2E Tests
- [ ] Share → Preview → Save → Bookmark Detail
- [ ] Paste URL → Preview → Open Link (no save)
- [ ] Deep Link → Preview → Already Saved → Existing Bookmark

## Performance Targets

- Preview Load Time: < 3 seconds (p95)
- Save Time: < 2 seconds (p95)
- Preview-to-Save Conversion: > 60%
- Error Rate: < 5%

## Key Risks & Mitigations

| Risk | Mitigation |
|------|-----------|
| Refactor breaks bookmark detail | Visual regression testing, feature parity checklist |
| Preview API slow | 10s timeout, fallback to basic metadata |
| High duplicate rate | Clear messaging, smooth navigation to existing |
| Shared components diverge | Code reviews, linting rules |

## Success Metrics

**Launch Criteria:**
- Content preview accessible from all entry points
- Save button creates bookmark successfully
- Duplicate detection works
- < 5% error rate
- Visual consistency with bookmark view

**30-Day Metrics:**
- 60%+ preview-to-save conversion
- 30%+ of saves from preview flow
- < 3s average save time
- 4.5+ star user rating

## Next Steps

1. Review this design document with team
2. Confirm API contracts with backend team
3. Create tickets for each phase
4. Start Phase 1: Extract shared components
5. Set up analytics tracking for preview events

---

For detailed technical specifications, see [DESIGN.md](./DESIGN.md)
