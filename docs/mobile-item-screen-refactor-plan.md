# Plan: Mobile item screen refactor (zine-x5ut.2.4)

## Context

- Screen: `apps/mobile/app/item/[id].tsx` (~635 lines) mixes data fetching, derived view state, action handlers, and UI rendering.
- Existing shared modules: `apps/mobile/app/item/item-detail-components.tsx`, `apps/mobile/app/item/item-detail-helpers.ts`, `apps/mobile/app/item/item-detail-styles.ts`.

## Goals

- Split data logic and UI into clear boundaries.
- Preserve navigation, layout, and behavior (including haptics, parallax, and action flows).
- Make X post rendering and main detail rendering modular and testable.

## Proposed file layout

```
apps/mobile/app/item/
  [id].tsx
  item-detail-components.tsx
  item-detail-helpers.ts
  item-detail-styles.ts
  detail/
    components/
      ItemDetailHeader.tsx
      ItemDetailContent.tsx
      ItemDetailCreatorRow.tsx
      ItemDetailMetaRow.tsx
      ItemDetailActions.tsx
      ItemDetailDescription.tsx
      ItemDetailLayouts.tsx
      ItemDetailStates.tsx
      ItemDetailFloatingBack.tsx
    hooks/
      useItemDetailParams.ts
      useItemDetailData.ts
      useItemDetailActions.ts
      useItemDetailViewState.ts
    types.ts
```

## Component map (extractions)

### Screen shell

- `ItemDetailScreen` in `apps/mobile/app/item/[id].tsx`
  - Keeps routing params, orchestrates hooks, selects layouts.
  - Delegates rendering to `ItemDetailStates`, `ItemDetailLayouts`, and `XPostBookmarkView`.

### States

- `ItemDetailStates.tsx`
  - `InvalidParamState`, `LoadingState`, `ErrorState`, `NotFoundState` wrappers with shared container/safe area handling.
  - Keeps Stack options and background color consistent.

### Layouts

- `ItemDetailLayouts.tsx`
  - `ItemDetailParallaxLayout`: wraps `ParallaxScrollView` and floating back button.
  - `ItemDetailScrollLayout`: wraps `ScrollView` fallback.
  - Ensures shared padding and animated container behavior.

### Header + content sections

- `ItemDetailHeader.tsx`
  - Renders badges row + title (current “Badges Row” + “Title”).
- `ItemDetailCreatorRow.tsx`
  - Handles `creatorId` branch (creator row vs source row).
  - Accepts upgraded image URL and colors.
- `ItemDetailMetaRow.tsx`
  - Handles provider-specific metadata (Spotify hosts, YouTube/X handles, publishedAt, duration, reading time).
- `ItemDetailActions.tsx`
  - Icon row + FAB.
  - Accepts action handlers + computed icons and disabled flags.
- `ItemDetailDescription.tsx`
  - Label + `LinkedText` summary block.
- `ItemDetailContent.tsx`
  - Composes header, creator row, meta row, actions, description.

### X post view

- Keep `XPostBookmarkView` in `item-detail-components.tsx` initially.
- Optional: extract to `detail/components/ItemDetailXPost.tsx` once core refactor lands.

## Hooks and view state

### `useItemDetailParams.ts`

- Encapsulates param validation (`validateItemId`) and returns `{ id, isValid, message }`.

### `useItemDetailData.ts`

- Owns:
  - `useItem` (conditional on valid id)
  - `useCreator` (conditional on creatorId)
  - Loading/error states + `refetch`

### `useItemDetailActions.ts`

- Owns:
  - `useBookmarkItem`, `useUnbookmarkItem`, `useToggleFinished`, `useMarkItemOpened`
  - Action handlers: `handleOpenLink`, `handleShare`, `handleToggleBookmark`, `handleToggleFinished`
- Input: `item`, `colors`, `router` (for back), `logger`.
- Returns handlers and mutation flags.

### `useItemDetailViewState.ts`

- Derived values:
  - `isXPost`, `hasThumbnail`, `headerAspectRatio`, `descriptionLabel`
  - `bookmarkActionIcon`, `bookmarkActionColor`, `completeActionIcon`, `completeActionColor`
  - `isBookmarkActionDisabled`, `isCompleteActionDisabled`
- Input: `item`, `colors`, mutation states.

## Extraction order

1. Create `detail/components/ItemDetailStates.tsx` and replace inline early returns.
2. Extract `ItemDetailActions` and move FAB config usage into it.
3. Extract `ItemDetailHeader`, `ItemDetailCreatorRow`, `ItemDetailMetaRow`, `ItemDetailDescription`.
4. Create `ItemDetailContent` to compose sections.
5. Extract `ItemDetailLayouts` to remove layout duplication.
6. Introduce hooks (`useItemDetailParams`, `useItemDetailData`, `useItemDetailActions`, `useItemDetailViewState`).
7. Optional cleanup: move `XPostBookmarkView` into `detail/components/` if it simplifies dependencies.

## Risks and watch-outs

- Action handlers: ensure `handleOpenLink` still calls `markOpened` only for bookmarked items.
- Haptics: keep press feedback in `IconActionButton` and open-link haptic.
- Layout parity: parallax vs scroll layout should render identical section order.
- Provider-specific metadata formatting: keep `extractPodcastHosts` and `creatorData.handle` logic intact.
- X post layout: do not regress parallax vs fallback differences.

## Test and verification notes

- Manual checks:
  - Items with/without thumbnails render correct layout.
  - Providers: Spotify podcast, YouTube video, article, generic post, X post.
  - Actions: bookmark, complete, share, open link, creator row navigation.
  - Loading/error/invalid id/not found states still use same UI.
- Regression risk areas: metadata row separators, FAB icon colors, safe area inset padding.

## Acceptance criteria mapping

- Component map documented: see “Component map” and “Proposed file layout”.
- Extraction order documented: see “Extraction order”.
- Risk areas and test notes documented: see “Risks and watch-outs” and “Test and verification notes”.
