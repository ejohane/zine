# Content View Feature Documentation

## Overview

The Content View feature provides a preview-first workflow for content that hasn't been bookmarked yet. Users can see rich metadata, evaluate the content, and decide whether to save it to their bookmarks—all in one streamlined experience.

## Documents in This Folder

### ⚠️ [ARCHITECTURE_CORRECTION.md](./ARCHITECTURE_CORRECTION.md) - **START HERE**
**Read this first**: Explains the current bug, why the architecture was corrected, and the proper solution.

**Contents**:
- Current bug in FeedSection (routing to wrong screen)
- Content vs Bookmarks table separation
- Required backend API endpoints
- Data flow diagrams
- Migration path

**Audience**: Everyone - provides context for why this feature exists

---

### 📘 [DESIGN.md](./DESIGN.md) - Complete Technical Design
**Read this for**: Comprehensive technical specifications, architecture decisions, implementation details, and API contracts.

**Contents**:
- Architecture & component reusability strategy
- Data flow diagrams
- Detailed component specifications
- Backend API requirements (none needed!)
- Implementation phases (5 weeks)
- Testing strategy
- Performance considerations
- Error handling patterns
- Success metrics

**Audience**: Engineers implementing the feature, technical reviewers

---

### 📋 [SUMMARY.md](./SUMMARY.md) - Implementation Quick Reference
**Read this for**: High-level overview, file structure, and implementation checklist.

**Contents**:
- Quick architecture overview
- File structure and changes needed
- Phase-by-phase implementation guide
- Key risks and mitigations
- Success criteria
- Next steps

**Audience**: Project managers, engineers starting implementation, quick reference

---

### 🎨 [VISUAL_SPEC.md](./VISUAL_SPEC.md) - Visual Design Specification
**Read this for**: Exact visual specifications, component layouts, and UI differences.

**Contents**:
- Side-by-side layout comparison (bookmark vs content view)
- Detailed component specs (dimensions, typography, colors)
- Animation specifications
- Responsive behavior
- Accessibility requirements
- Loading and error states
- Platform-specific considerations

**Audience**: Designers, frontend engineers, QA testers

---

## Quick Start

### For Engineers

1. **Read [SUMMARY.md](./SUMMARY.md)** to understand the architecture
2. **Review [DESIGN.md](./DESIGN.md)** section 5 (Detailed Component Design)
3. **Reference [VISUAL_SPEC.md](./VISUAL_SPEC.md)** while building UI
4. **Follow implementation phases** in [DESIGN.md](./DESIGN.md) section 8

### For Designers

1. **Read [VISUAL_SPEC.md](./VISUAL_SPEC.md)** for complete visual specifications
2. **Review side-by-side comparison** to understand differences from bookmark view
3. **Reference color palette, typography, and spacing** sections
4. **Create mockups** based on specified dimensions and layouts

### For Product Managers

1. **Read [SUMMARY.md](./SUMMARY.md)** for overview and success criteria
2. **Review [DESIGN.md](./DESIGN.md)** sections 3 (Goals), 13 (Analytics), and 15 (Migration)
3. **Track implementation** using phases in [SUMMARY.md](./SUMMARY.md)
4. **Monitor metrics** listed in section 18 of [DESIGN.md](./DESIGN.md)

---

## Key Decisions

### ✅ What We're Building

- **Content view screen** for feed items that aren't bookmarked yet
- **Save-first workflow** with prominent "Save to Bookmarks" button
- **Shared presentation components** to maximize code reuse
- **Graceful duplicate handling** (navigate to existing bookmark)
- **Entry point**: "From Your Feed" cards on home screen

### ❌ What We're NOT Building (MVP)

- Edit metadata before saving (future enhancement)
- Batch preview (multiple URLs at once)
- Preview history (recently previewed content)
- Save to specific collection during preview
- Offline preview caching

### 🎯 Core Principles

1. **Maximize reusability**: Extract shared components, minimize duplication
2. **No backend changes**: Use existing preview and save APIs
3. **Visual consistency**: Content view should feel like bookmark view
4. **Progressive enhancement**: Show basic metadata immediately, enrich over time
5. **Graceful degradation**: Handle missing metadata, network errors, timeouts

---

## Implementation Timeline

| Phase | Duration | Description | Deliverables |
|-------|----------|-------------|--------------|
| **Phase 0** | Week 1 | Backend API development | `GET /api/v1/content/{id}`, `POST /api/v1/bookmarks/from-content` |
| **Phase 1** | Week 1-2 | Extract shared components | `BookmarkContentDisplay`, `HeroSection`, `ContentMetadata`, `MetadataCards` |
| **Phase 2** | Week 2 | Refactor bookmark detail | Updated `bookmark/[id].tsx` using shared components |
| **Phase 3** | Week 2 | Build content view components | `useContentDetail`, `useSaveBookmarkFromContent`, `SaveBookmarkButton` |
| **Phase 4** | Week 2-3 | Build content view screen | `content/[id].tsx`, update `FeedSection.tsx` routing |
| **Phase 5** | Week 3-4 | Testing & polish | E2E tests, accessibility, performance, analytics |

**Total**: 4-6 weeks depending on team capacity (includes backend work)

---

## Success Metrics

### Launch Criteria (Day 1)
- [ ] Content preview accessible from all entry points
- [ ] Preview loads metadata in < 3 seconds (p95)
- [ ] Save button creates bookmark successfully
- [ ] Duplicate detection navigates to existing bookmark
- [ ] < 5% error rate
- [ ] Visual consistency with bookmark view verified

### Post-Launch (30 Days)
- **Conversion**: 60%+ of previews result in saves
- **Adoption**: 30%+ of saves originate from preview flow
- **Performance**: < 2 seconds average save time
- **Quality**: < 5% error rate sustained
- **Satisfaction**: 4.5+ star user rating

---

## Architecture Highlights

### Component Reusability
```
BookmarkContentDisplay (NEW - SHARED)
├── Used by: BookmarkDetailScreen
└── Used by: ContentViewScreen
```

**98% code reuse** between bookmark and content views—only action buttons differ!

### Data Flow
```
User Shares URL
    ↓
ContentViewScreen (/content/preview?url={url})
    ↓
useContentPreview → POST /api/v1/bookmarks/preview
    ↓
Display with Save Button
    ↓
User Saves
    ↓
useSaveBookmark → POST /api/v1/enriched-bookmarks/save-enriched
    ↓
Navigate to /bookmark/[id]
```

### Backend API Requirements
Two new endpoints required:
- ⚠️ `GET /api/v1/content/{contentId}` - Fetch content from database
- ⚠️ `POST /api/v1/bookmarks/from-content` - Create bookmark from existing content
- ✅ Database schema already supports this architecture

---

## Files to Create/Modify

### New Files (14 files)
```
apps/mobile/
├── app/(app)/content/preview.tsx
├── components/
│   ├── content-display/
│   │   ├── BookmarkContentDisplay.tsx
│   │   ├── HeroSection.tsx
│   │   ├── ContentMetadata.tsx
│   │   ├── MetadataCards.tsx
│   │   ├── ContentSections.tsx
│   │   └── AlternateLinksList.tsx
│   └── action-buttons/
│       ├── SaveBookmarkButton.tsx
│       ├── OpenLinkButton.tsx
│       └── BookmarkActionIcons.tsx
└── hooks/
    ├── useContentPreview.ts
    └── useSaveBookmark.ts
```

### Modified Files (1 file)
```
apps/mobile/
└── app/(app)/bookmark/[id].tsx (refactored to use shared components)
```

---

## Testing Checklist

### Unit Tests
- [ ] All shared components render correctly
- [ ] `useContentPreview` hook (success, error, retry)
- [ ] `useSaveBookmark` hook (save, duplicate, error)
- [ ] Button components (all states)

### Integration Tests
- [ ] Bookmark detail works after refactor (no regressions)
- [ ] Content preview renders with shared components
- [ ] Save flow creates bookmark and navigates

### E2E Tests
- [ ] Share extension → Preview → Save → Bookmark Detail
- [ ] URL input → Preview → Open Link (no save)
- [ ] Deep link → Preview → Already Saved → Existing Bookmark
- [ ] Preview → Error → Retry

### Visual Tests
- [ ] Bookmark detail before/after refactor (pixel-perfect match)
- [ ] Content preview all states (loading, loaded, error)
- [ ] Dark mode vs light mode
- [ ] Small screens vs large screens

---

## Related Documentation

- **Inbox Feature**: [docs/features/inbox/PRD.md](../inbox/PRD.md)
- **Article Bookmarking**: [docs/features/articles/DESIGN.md](../articles/DESIGN.md)
- **API Client**: [apps/mobile/lib/api.ts](../../../apps/mobile/lib/api.ts)
- **Bookmark Schema**: [packages/shared/src/types.ts](../../../packages/shared/src/types.ts)

---

## Questions?

- **Architecture questions**: See [DESIGN.md](./DESIGN.md) section 4
- **Visual questions**: See [VISUAL_SPEC.md](./VISUAL_SPEC.md)
- **Implementation questions**: See [SUMMARY.md](./SUMMARY.md)
- **Open questions**: See [DESIGN.md](./DESIGN.md) section 16

---

## Next Steps

1. ✅ Review design documents with team
2. ⏭️ Confirm API contracts with backend team (2 new endpoints required)
3. ⏭️ Create implementation tickets for each phase
4. ⏭️ Assign engineers to phases (backend + frontend)
5. ⏭️ Set up analytics tracking
6. ⏭️ Start Phase 0: Backend API development
7. ⏭️ Start Phase 1: Extract shared components (parallel with backend)

---

**Last Updated**: 2025-10-29  
**Status**: Design Complete, Ready for Implementation  
**Owner**: Product & Engineering Team
