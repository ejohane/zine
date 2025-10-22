# Inbox Feature Documentation

Complete documentation for the Zine inbox feature.

---

## Overview

The Inbox feature provides a dedicated screen for users to view, filter, and manage their saved bookmarks. It enables quick content triage through swipe gestures and content-type filtering.

### Key Features
- **Chronological List**: All bookmarks sorted by most recently saved
- **Content Filtering**: Filter by Videos, Podcasts, Articles, Posts, or All
- **Swipe to Archive**: Quick triage with left swipe gesture
- **Direct Navigation**: Tap to open bookmark details

---

## Documentation Index

### 📋 [PRD.md](./PRD.md) - Product Requirements Document
**Audience**: Product managers, designers, stakeholders

Comprehensive product specification including:
- Executive summary and goals
- User stories and requirements
- UI/UX specifications
- Success metrics and rollout plan
- Future enhancements

**Start here** if you need to understand the business requirements and user experience.

### 🛠 [IMPLEMENTATION_GUIDE.md](./IMPLEMENTATION_GUIDE.md) - Implementation Guide
**Audience**: Frontend engineers, mobile developers

Quick reference for implementation including:
- Components to use (all existing)
- Files to create (3 new files)
- Configuration examples
- Common pitfalls and best practices
- Phase rollout plan

**Start here** if you're implementing the feature and need practical guidance.

### 🏗 [TECHNICAL_SPEC.md](./TECHNICAL_SPEC.md) - Technical Specification
**Audience**: Software engineers, architects

Detailed technical documentation including:
- Component hierarchy diagrams
- Data flow diagrams
- Type definitions and interfaces
- Hook specifications with full code
- Performance optimizations
- Testing strategy

**Start here** if you need deep technical details about implementation.

---

## Quick Start

### For Product/Design Review
1. Read [PRD.md](./PRD.md) sections 1-7 (Overview through UI/UX specs)
2. Review mockup requirements in section 16
3. Check success criteria in section 15

### For Development
1. Skim [PRD.md](./PRD.md) to understand requirements
2. Read [IMPLEMENTATION_GUIDE.md](./IMPLEMENTATION_GUIDE.md) for step-by-step plan
3. Reference [TECHNICAL_SPEC.md](./TECHNICAL_SPEC.md) for code details
4. Follow the implementation checklist

### For Code Review
1. Check [TECHNICAL_SPEC.md](./TECHNICAL_SPEC.md) for expected architecture
2. Verify performance optimizations are implemented
3. Confirm accessibility requirements from PRD section 9.2
4. Ensure analytics tracking from PRD section 9.4

---

## Implementation Summary

### What Needs to be Built

#### New Files (3)
1. **`apps/mobile/app/(app)/(tabs)/inbox.tsx`** (400 lines)
   - Main inbox screen component
   - Uses existing CategoryTabs, SwipeableBookmarkItem

2. **`apps/mobile/hooks/useInboxBookmarks.ts`** (60 lines)
   - Fetches all active bookmarks
   - Applies client-side content type filtering

3. **`apps/mobile/hooks/useUnarchiveBookmark.ts`** (30 lines)
   - Handles undo functionality
   - Mirrors useArchiveBookmark pattern

#### Files to Update (2)
1. **`apps/mobile/lib/api.ts`** (+20 lines)
   - Update `bookmarksApi.getAll()` to support query params
   - Ensure `unarchive()` method exists

2. **`apps/mobile/app/(app)/(tabs)/_layout.tsx`** (+10 lines)
   - Add inbox tab to navigation

#### Files to Move/Adjust (1)
1. **`apps/mobile/components/CategoryTabs.tsx`** (no changes)
   - Move or duplicate to inbox screen
   - Remove from homepage (or keep on both)

### What Already Exists

All core functionality is already built:
- ✅ SwipeableBookmarkItem with gesture support
- ✅ BookmarkListItem (compact variant)
- ✅ useArchiveBookmark hook
- ✅ Archive API endpoints
- ✅ CategoryTabs component
- ✅ Navigation infrastructure

---

## Development Phases

### Phase 1: Core (2-3 days)
- Create InboxScreen with bookmark list
- Add tab navigation
- Implement filtering with CategoryTabs
- Hook up bookmark detail navigation

### Phase 2: Swipe (2 days)
- Integrate SwipeableBookmarkItem
- Configure archive swipe action
- Add haptic feedback
- Implement list animations

### Phase 3: Undo (1 day)
- Create toast notification component
- Implement unarchive hook
- Add undo button + timeout logic

### Phase 4: Polish (1-2 days)
- Empty states for all filters
- Loading states
- Error handling
- Analytics tracking

**Total Estimated Effort**: 6-8 days

---

## Key Design Decisions

### 1. Filter Strategy: Client-Side
**Decision**: Filter bookmarks on client after fetching all active bookmarks

**Rationale**:
- Simpler implementation (no backend changes)
- Instant filter switching (no network delay)
- Server-side can be added later with pagination

### 2. No Archive Confirmation
**Decision**: Archive immediately on swipe without confirmation dialog

**Rationale**:
- Faster triage workflow
- Matches iOS Mail pattern
- Undo mechanism provides safety net
- Reduces friction for power users

### 3. Swipe Direction: Left for Archive
**Decision**: Swipe LEFT to reveal archive action

**Rationale**:
- Industry standard (iOS Mail, Gmail)
- Right swipe reserved for "read later" (future)
- Consistent with user expectations

### 4. Undo Duration: 5 Seconds
**Decision**: Show undo toast for 5 seconds after archive

**Rationale**:
- Industry standard (Google Inbox, Gmail)
- Long enough to notice
- Short enough to not be annoying

### 5. Filter Persistence: Session Only
**Decision**: Reset filter to "All" on app restart

**Rationale**:
- Predictable behavior (always start with full list)
- Avoids confusion if user forgets filter state
- Can be made configurable in settings later

---

## Success Metrics

### Launch Criteria (MVP)
- [ ] 60fps scroll with 500 bookmarks on iPhone 12 Pro
- [ ] Archive action completes in < 300ms
- [ ] Filter switch applies in < 100ms
- [ ] VoiceOver support for all interactions
- [ ] Zero crashes in beta testing

### Post-Launch (30 days)
- **Adoption**: 40%+ DAU visit inbox
- **Engagement**: 30%+ archives via swipe
- **Discovery**: 25%+ use content filters
- **Confidence**: < 2% undo rate
- **Satisfaction**: 4.5+ star rating

---

## Technical Highlights

### Performance Optimizations
- FlatList virtualization with `getItemLayout`
- TanStack Query caching (5 min stale time)
- Client-side filtering (zero network latency)
- Reanimated 2 for 60fps swipe animations

### User Experience
- Haptic feedback at swipe thresholds
- Spring-based snap-back animation
- Optimistic UI updates
- Pull-to-refresh support

### Accessibility
- VoiceOver labels and hints
- Custom accessibility actions
- Dynamic font size support
- High contrast color support

---

## Dependencies

### Required (All Existing)
- `@tanstack/react-query` - Data fetching & caching
- `react-native-reanimated` - Swipe animations
- `react-native-gesture-handler` - Gesture detection
- `expo-router` - Screen navigation
- `@expo/vector-icons` - UI icons
- `@clerk/clerk-expo` - Authentication

### No New Dependencies Required
All functionality uses existing libraries in the project.

---

## Testing Requirements

### Unit Tests
- [ ] `useInboxBookmarks` filtering logic
- [ ] `useUnarchiveBookmark` mutation
- [ ] Filter category mapping

### Integration Tests
- [ ] Swipe-to-archive flow
- [ ] Undo restores bookmark
- [ ] Filter switching updates list
- [ ] Pull-to-refresh reloads data

### E2E Tests
- [ ] Complete archive + undo workflow
- [ ] Filter all content types
- [ ] Navigate to bookmark detail
- [ ] Handle network errors gracefully

### Performance Tests
- [ ] Scroll 1000 items at 60fps
- [ ] Filter switch < 100ms
- [ ] Archive action < 300ms

---

## Known Limitations

### MVP Scope
- **No search**: Coming in v1.2
- **No sort options**: Coming in v1.1
- **No bulk actions**: Coming in v1.1
- **Client-side filtering only**: Server-side with pagination in v2.0

### Technical Constraints
- Filter resets on app restart (by design)
- No pagination (will add when > 500 bookmarks typical)
- Single undo (only most recent archive)

---

## Future Enhancements

### v1.1 (Next Release)
- Bulk selection mode
- Multiple sort options
- Search functionality
- View density options (compact/comfortable)

### v1.2 (Future)
- Smart filters (unread, favorited, has notes)
- Collection quick filters
- Customizable swipe actions
- Keyboard shortcuts

### v2.0 (Long-term)
- Read later queue
- Reading progress tracking
- Smart recommendations
- Offline mode

---

## Related Documentation

### Internal Docs
- [Mobile App Architecture](../../architecture/mobile-app.md)
- [Design System Guidelines](../../design-system/README.md)
- [Bookmark Schema](../../../packages/shared/src/types.ts)

### External References
- [React Query Documentation](https://tanstack.com/query/latest)
- [Reanimated 2 Docs](https://docs.swmansion.com/react-native-reanimated/)
- [Expo Router Docs](https://docs.expo.dev/router/introduction/)

---

## Support & Questions

### For Product Questions
- Review [PRD.md](./PRD.md) sections 12-13 (Open Questions)
- Check [User Stories](./PRD.md#4-user-stories)
- Contact: Product team

### For Technical Questions
- Review [TECHNICAL_SPEC.md](./TECHNICAL_SPEC.md)
- Check [Implementation Guide](./IMPLEMENTATION_GUIDE.md)
- Contact: Engineering team

### For Design Questions
- Review [UI/UX Specifications](./PRD.md#7-uiux-specifications)
- Check mockup requirements in PRD section 16
- Contact: Design team

---

## Change Log

### Version 1.0 (2025-10-21)
- Initial documentation created
- PRD, Implementation Guide, and Technical Spec published
- Ready for development

---

## Contributing

When implementing this feature:

1. **Follow the phase plan** in Implementation Guide
2. **Match the technical spec** exactly for consistency
3. **Test thoroughly** using the testing checklist
4. **Track analytics** as specified in PRD
5. **Update this documentation** if you make significant changes

---

## Document Structure

```
docs/features/inbox/
├── README.md                 # This file - Overview and index
├── PRD.md                    # Product Requirements Document
├── IMPLEMENTATION_GUIDE.md   # Quick implementation reference
└── TECHNICAL_SPEC.md         # Detailed technical specification
```

---

**Last Updated**: 2025-10-21
**Version**: 1.0
**Status**: Ready for Implementation
