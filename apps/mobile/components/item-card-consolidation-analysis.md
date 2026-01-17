# ItemCard Consolidation Analysis & Design

**Issue**: zine-o21 - Home Page Card Consolidation - Analysis & Design
**Parent Epic**: Component Reusability Consolidation (Issue #50)
**Date**: 2026-01-17
**Status**: Complete

## Executive Summary

This document analyzes the 4 inline card components in the Home page (`app/(tabs)/index.tsx`) and maps them against the existing `ItemCard` component to determine consolidation strategy.

**Recommendation**: Consolidate 3 of 4 components into ItemCard variants:

- `HorizontalCard` → New `horizontal` variant
- `LargeCard` → Enhanced `large` variant with overlay mode
- `CondensedListItem` → Existing `compact` variant (minor adjustments)
- `CategoryPill` → **Keep separate** (navigation element, not content card)

---

## 1. Detailed Comparison Table

### 1.1 HorizontalCard vs ItemCard

| Property             | HorizontalCard (Home)                  | ItemCard `large`                        | Gap                      |
| -------------------- | -------------------------------------- | --------------------------------------- | ------------------------ |
| **Width**            | 200px fixed                            | 280px fixed                             | Need narrower option     |
| **Layout**           | Vertical: image on top, content below  | Vertical: image on top, content below   | Similar                  |
| **Image Height**     | 112px fixed                            | Dynamic aspect ratio                    | Need fixed height option |
| **Image Aspect**     | ~16:9 (200x112)                        | Content-based (1:1 podcast, 16:9 video) | Different approach       |
| **Title Typography** | `bodyMedium` + fontWeight 500, 2 lines | `titleMedium`, 2 lines                  | Slightly different       |
| **Meta Display**     | Type dot + source                      | Provider dot + creator + provider label | Different meta content   |
| **Duration Badge**   | None                                   | Position: bottom-right on image         | Missing                  |
| **Shadow**           | None                                   | `Shadows.lg`                            | Different                |
| **Background**       | `colors.backgroundSecondary`           | `colors.card`                           | Different                |
| **Border Radius**    | `Radius.lg` (16px)                     | `Radius.xl` (20px)                      | Different                |
| **Content Padding**  | `Spacing.md` (12px)                    | `Spacing.md` (12px)                     | Same                     |

**Conclusion**: Need new `horizontal` variant with:

- 200px width
- 112px fixed image height
- Type color dot (not provider dot)
- No shadow
- `backgroundSecondary` background
- `Radius.lg` border radius

### 1.2 LargeCard vs ItemCard `large`

| Property                | LargeCard (Home)                | ItemCard `large`                  | Gap                          |
| ----------------------- | ------------------------------- | --------------------------------- | ---------------------------- |
| **Dimensions**          | 280x180px fixed                 | 280px width, dynamic aspect ratio | Need fixed height            |
| **Layout**              | Full-bleed image with overlay   | Image on top, content below       | **MAJOR**: Need overlay mode |
| **Image**               | 100% coverage                   | Container with aspect ratio       | Different                    |
| **Overlay**             | Dark gradient `rgba(0,0,0,0.5)` | None                              | **MAJOR**: Need overlay      |
| **Source Position**     | On overlay, top                 | Below image                       | Different                    |
| **Source Typography**   | `labelSmall`, white 70% opacity | `bodyMedium`, secondary color     | Different                    |
| **Title Position**      | On overlay, middle              | Below image                       | Different                    |
| **Title Typography**    | `titleMedium`, white            | `titleMedium`, text color         | Different                    |
| **Duration Position**   | On overlay, bottom              | Badge on image                    | Different                    |
| **Duration Typography** | `bodySmall`, white 80% opacity  | `labelSmall` badge                | Different                    |
| **Border Radius**       | `Radius.lg` (16px)              | `Radius.xl` (20px)                | Different                    |

**Conclusion**: Need `overlay` prop/mode for `large` variant:

- Full-bleed image with dark overlay
- Text positioned on overlay
- Fixed 180px height option
- White text styling for overlay mode

### 1.3 CondensedListItem vs ItemCard `compact`

| Property             | CondensedListItem (Home)             | ItemCard `compact`                   | Gap                   |
| -------------------- | ------------------------------------ | ------------------------------------ | --------------------- |
| **Layout**           | Row: thumbnail + content             | Row: thumbnail + content             | Same                  |
| **Thumbnail Size**   | 48x48px                              | 48x48px                              | Same                  |
| **Thumbnail Radius** | `Radius.sm` (8px)                    | `Radius.sm` (8px)                    | Same                  |
| **Title**            | `bodyMedium`, fontWeight 500, 1 line | `bodyMedium`, fontWeight 500, 1 line | Same                  |
| **Meta Content**     | `source · Type · duration`           | `creator · Type · duration`          | Equivalent            |
| **Meta Typography**  | `bodySmall`                          | `bodySmall`                          | Same                  |
| **Meta Separator**   | `·` string join                      | `·` string join                      | Same                  |
| **Dot Indicator**    | None                                 | Provider dot (6px)                   | Minor difference      |
| **Padding**          | `sm` vertical, `md` horizontal       | `sm` vertical, `md` horizontal       | Same                  |
| **Press Opacity**    | None                                 | 0.7                                  | Minor enhancement     |
| **Animation**        | External (from parent)               | `FadeInDown`                         | Animation in ItemCard |

**Conclusion**: Nearly identical. Can use `compact` variant directly with minor considerations:

- Both use same thumbnail size (48x48)
- Both use same typography
- ItemCard `compact` has provider dot (additional info, acceptable)
- May want option to hide provider dot

### 1.4 CategoryPill (Keep Separate)

| Property        | Value                                  | Rationale                        |
| --------------- | -------------------------------------- | -------------------------------- |
| **Purpose**     | Navigation filter, not content display | Fundamentally different use case |
| **Shape**       | Pill (full radius) vs Card (lg radius) | Visual distinction               |
| **Content**     | Label + count, no image                | Not a content card               |
| **Interaction** | Navigate to filtered view              | Not open item detail             |
| **Data Model**  | Category metadata, not ContentItem     | Different data shape             |

**Recommendation**: Keep `CategoryPill` as a separate component. It serves a different purpose (navigation/filtering) and has a completely different visual language and data model.

---

## 2. ItemCard Extension Specification

### 2.1 New Variant: `horizontal`

```typescript
// Add to ItemCardVariant type
export type ItemCardVariant = 'compact' | 'full' | 'large' | 'horizontal';

// Horizontal variant styles
horizontalCard: {
  width: 200,
  borderRadius: Radius.lg,  // 16px
  overflow: 'hidden',
  backgroundColor: colors.backgroundSecondary,
},
horizontalCardImage: {
  width: '100%',
  height: 112,
},
horizontalCardContent: {
  padding: Spacing.md,  // 12px
},
horizontalCardTitle: {
  ...Typography.bodyMedium,
  fontWeight: '500',
  marginBottom: Spacing.xs,
},
horizontalCardMeta: {
  flexDirection: 'row',
  alignItems: 'center',
  gap: Spacing.xs,
},
```

**Props needed**: None additional - uses existing `item` prop structure

### 2.2 Enhanced `large` Variant: Overlay Mode

```typescript
// Add new prop
interface ItemCardProps {
  // ... existing props

  /** Enable overlay mode for large variant (full-bleed image with text overlay) */
  overlay?: boolean;
}

// Conditional rendering in large variant
if (variant === 'large' && overlay) {
  return (
    <Pressable style={styles.largeOverlayCard}>
      <Image source={{ uri: item.thumbnailUrl }} style={styles.largeOverlayImage} />
      <View style={styles.largeOverlay}>
        <Text style={styles.largeOverlaySource}>{item.creator}</Text>
        <Text style={styles.largeOverlayTitle} numberOfLines={2}>{item.title}</Text>
        {durationText && <Text style={styles.largeOverlayDuration}>{durationText}</Text>}
      </View>
    </Pressable>
  );
}

// Overlay styles
largeOverlayCard: {
  width: 280,
  height: 180,
  borderRadius: Radius.lg,
  overflow: 'hidden',
},
largeOverlayImage: {
  width: '100%',
  height: '100%',
  position: 'absolute',
},
largeOverlay: {
  flex: 1,
  justifyContent: 'flex-end',
  padding: Spacing.lg,
  backgroundColor: 'rgba(0,0,0,0.5)',
},
largeOverlaySource: {
  ...Typography.labelSmall,
  color: 'rgba(255, 255, 255, 0.7)',
  marginBottom: Spacing.xs,
},
largeOverlayTitle: {
  ...Typography.titleMedium,
  color: '#FFFFFF',
  marginBottom: Spacing.xs,
},
largeOverlayDuration: {
  ...Typography.bodySmall,
  color: 'rgba(255, 255, 255, 0.8)',
},
```

### 2.3 Optional Enhancement: Hide Provider Dot

```typescript
interface ItemCardProps {
  // ... existing props

  /** Hide the provider indicator dot */
  hideProviderDot?: boolean;
}
```

---

## 3. Migration Checklist

### 3.1 Recently Bookmarked Section (HorizontalCard)

- [ ] Create `horizontal` variant in ItemCard
- [ ] Update data transformation to use `ItemCardData` interface
- [ ] Replace inline `HorizontalCard` with `<ItemCard variant="horizontal" />`
- [ ] Verify visual parity (200px width, 112px image, type dot)
- [ ] Test animation behavior (FadeInDown preserved)
- [ ] Verify navigation to item detail works

### 3.2 Inbox Section (CondensedListItem)

- [ ] Update data transformation to use `ItemCardData` interface
- [ ] Replace inline `CondensedListItem` with `<ItemCard variant="compact" />`
- [ ] Verify visual parity (48x48 thumbnail, single line title)
- [ ] Verify meta display (source, type, duration)
- [ ] Test animation behavior (delay stagger)

### 3.3 Podcasts Section (LargeCard)

- [ ] Add `overlay` prop support to ItemCard `large` variant
- [ ] Update data transformation to use `ItemCardData` interface
- [ ] Replace inline `LargeCard` with `<ItemCard variant="large" overlay />`
- [ ] Verify visual parity (280x180, overlay gradient, white text)
- [ ] Verify duration display on overlay
- [ ] Test animation behavior

### 3.4 Videos Section (HorizontalCard)

- [ ] Same as Recently Bookmarked (uses same component)
- [ ] Replace with `<ItemCard variant="horizontal" />`

### 3.5 Categories Section (CategoryPill)

- [ ] **NO MIGRATION** - Keep as separate component
- [ ] Consider extracting to `components/category-pill.tsx` for reuse

### 3.6 Cleanup

- [ ] Remove inline component definitions (lines 101-231)
- [ ] Remove unused styles from Home page
- [ ] Remove local `ContentItem` type (use `ItemCardData`)
- [ ] Update imports

---

## 4. Visual Test Plan

### 4.1 Before/After Screenshots Required

| Section             | Before Screenshot         | After Screenshot | Verification Points                                  |
| ------------------- | ------------------------- | ---------------- | ---------------------------------------------------- |
| Recently Bookmarked | Capture current rendering | After migration  | Card width, image height, type dot, title truncation |
| Inbox               | Capture current rendering | After migration  | Thumbnail size, title alignment, meta spacing        |
| Podcasts            | Capture current rendering | After migration  | Overlay gradient, text colors, duration position     |
| Videos              | Capture current rendering | After migration  | Same as Recently Bookmarked                          |
| Categories          | N/A (no change)           | N/A              | N/A                                                  |

### 4.2 Visual Regression Checklist

For each migrated section:

- [ ] Card dimensions match original
- [ ] Typography (font size, weight, color) matches
- [ ] Spacing (padding, margins, gaps) matches
- [ ] Border radius matches
- [ ] Image aspect ratio / sizing matches
- [ ] Animation timing and behavior matches
- [ ] Touch feedback (press states) present
- [ ] Dark mode rendering correct

### 4.3 Functional Testing

- [ ] Navigation: Pressing card navigates to `/item/[id]`
- [ ] Loading: Placeholder renders when `thumbnailUrl` is null
- [ ] Long content: Title truncation works correctly
- [ ] Empty states: Section doesn't render when data is empty
- [ ] Scroll performance: Horizontal FlatLists scroll smoothly

### 4.4 Automated Tests

```typescript
// Recommended test cases for ItemCard

describe('ItemCard', () => {
  describe('horizontal variant', () => {
    it('renders with 200px width', () => {});
    it('renders 112px height image', () => {});
    it('shows type color dot', () => {});
    it('truncates title to 2 lines', () => {});
  });

  describe('large variant with overlay', () => {
    it('renders full-bleed image', () => {});
    it('shows dark overlay gradient', () => {});
    it('displays source, title, duration on overlay', () => {});
    it('uses white text colors', () => {});
  });

  describe('compact variant', () => {
    it('renders 48x48 thumbnail', () => {});
    it('truncates title to 1 line', () => {});
    it('joins meta parts with dot separator', () => {});
  });
});
```

---

## 5. Implementation Order

Recommended implementation sequence:

1. **Phase 1**: Add `horizontal` variant to ItemCard (blocked by: none)
   - Issue: zine-svl - "Add 'horizontal' variant to ItemCard"

2. **Phase 2**: Add `overlay` mode to `large` variant (blocked by: none)
   - Issue: zine-ll3 - "Update ItemCard 'large' variant for overlay styling"

3. **Phase 3**: Migrate Home page sections (blocked by: Phase 1, Phase 2)
   - Migrate CondensedListItem → `compact` (can start immediately)
   - Migrate HorizontalCard → `horizontal` (after Phase 1)
   - Migrate LargeCard → `large` with `overlay` (after Phase 2)

4. **Phase 4**: Cleanup
   - Remove inline components
   - Extract CategoryPill if needed elsewhere

---

## 6. Risk Assessment

| Risk                         | Likelihood | Impact | Mitigation                                     |
| ---------------------------- | ---------- | ------ | ---------------------------------------------- |
| Visual regression            | Medium     | High   | Comprehensive before/after screenshots         |
| Animation timing differences | Low        | Medium | Match exact FadeInDown delay values            |
| Type conflicts               | Low        | Low    | Use proper TypeScript interfaces               |
| Performance regression       | Low        | Low    | ItemCard already optimized, FlatList unchanged |

---

## 7. Success Criteria (Completion Checklist)

- [x] Detailed comparison table documented
- [x] Gap analysis complete
- [x] ItemCard extension specification defined
- [x] Migration checklist per section created
- [x] Visual test plan documented
- [x] Implementation phases identified
- [x] Blocking dependencies noted (zine-svl, zine-ll3)

**Analysis Phase Complete** - Ready for implementation phases.
