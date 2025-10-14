# Mobile Search Rewrite — Plan and Spec

This plan reimplements the search functionality and search UI for the mobile app using Expo Router’s native tabs and iOS-native search UI (iOS 26 features per Expo docs). It also tightens the API behavior for accurate, performant bookmark search of bookmarks only.

## Objectives

- Use Expo’s Native Tabs “separate search tab” pattern for iOS 26, with a native search field integrated into the header (no Android scope).
- Search by bookmark title or creator name; partial matches; case-insensitive.
- Include both active and archived bookmarks; exclude deleted.
- Show a simple list of bookmark results beneath a “Search” header; tap navigates to the bookmark detail screen.
- Fully restyle search UI to match the home screen look and feel; keep UI minimal and support light/dark.
- Keep API logic largely as-is, fixing gaps (status and case-insensitivity) and adding targeted improvements where needed.

## References Considered

- Expo Router Native Tabs — Separate search tab (iOS 26): review and follow the “role=search” pattern via `expo-router/unstable-native-tabs`.
- Expo Router Stack — Header configuration: use `headerSearchBarOptions` and `headerLargeTitle` for iOS-native search UI and a “Search” title.

Notes: We’ll wire the iOS header search bar to state with `useNavigationSearch` (Expo Router). Android is out of scope.

## Scope

- Mobile app UI and navigation in `apps/mobile` (iOS only).
- Search API behavior in `packages/api` (no breaking structural changes).
- Styling aligns with existing design system usage and the Home page visual language.

## Progress

- [done] Phase 1 (Mobile Implementation Plan): Native iOS search bar and bookmark-only results shipped in the Search tab with recent-search history, themed state handling, and legacy Inbox search removed. Sanity check: `bun type-check`.
- [done] Phase 2 (API Implementation Plan): Added `searchByUserId` with status filtering/case-insensitive matching and reworked `/api/v1/search` to use repository paging, facets, and bookmark-first composition. Sanity check: `cd packages/api && bunx vitest src/__tests__/d1-repository.search.test.ts src/__tests__/search-route.test.ts`.

Non-goals

- No web app changes (keep parity concepts but do not implement web-only UI here).
- No new backend storage beyond lightweight indexes or query improvements.

## Current State (Audit)

- Native Tabs already enabled with a Search trigger: `apps/mobile/app/(app)/(tabs)/_layout.tsx:1` (uses `expo-router/unstable-native-tabs` with a `Trigger name="search" role="search"`).
- Search tab route group exists but is mostly a placeholder:
  - `apps/mobile/app/(app)/(tabs)/search/_layout.tsx:1` sets the title to “Search”.
  - `apps/mobile/app/(app)/(tabs)/search/index.tsx:1` has TODOs and currently renders Home-like scaffolding (no results).
- An older search experience lives in `apps/mobile/app/(app)/(tabs)/inbox.tsx:1` that renders its own search bar and results with `useSearch`.
- Bookmark detail screen exists at `apps/mobile/app/(app)/bookmark/[id].tsx:1`.
- Mobile search hook and API client:
  - `apps/mobile/hooks/useSearch.ts:1` provides debounced search with filters.
  - `apps/mobile/lib/api.ts:348` exposes `searchApi.search('/api/v1/search')`.
- API search endpoint in Worker:
  - `packages/api/src/index.ts:229` serves `GET /api/v1/search`, aggregating bookmark results (from D1) and content results (from feeds). For this scope we will return bookmarks only for mobile.
  - Bookmark fetch is user-scoped via `getByUserId` and then filtered in JS for matches; this implicitly includes archived and excludes deleted because delete is physical.
- Data model and deletion behavior:
  - `packages/shared/src/types.ts:1` defines `BookmarkStatusEnum: 'active'|'archived'|'deleted'`.
  - `packages/api/src/d1-repository.ts:1` implements `delete(id)` with a hard delete, so deleted bookmarks do not appear in search.
  - Content search uses `packages/api/src/repositories/content-repository.ts:1` with `like(...)` across fields; case sensitivity depends on SQLite/Lite collation; we will normalize for safer case-insensitive behavior.

## UX & Navigation Spec

- Tab placement
  - Keep the Search tab in Native Tabs using `role="search"` so iOS shows the native search affordance.
  - File: `apps/mobile/app/(app)/(tabs)/_layout.tsx:1` (already present).

- Screen header
  - “Search” title via Stack options and large titles on iOS.
  - iOS native search field integrated into the header using `headerSearchBarOptions` (placeholder: “Search bookmarks”).
  - File: `apps/mobile/app/(app)/(tabs)/search/_layout.tsx:1`.

- Input handling
  - On iOS, wire the header search bar to state with `useNavigationSearch` (Expo Router). Debounce at ~300ms (consistent with current hook).

- Results list
  - Bookmarks only. Default the filter/type to `bookmarks` in mobile.
  - Use a vertical `FlatList` with an item that matches home cards visually (reuse `OptimizedCompactBookmarkCard`, minimal) and adjusts to light/dark via theme.
  - Tap behavior: navigate to `apps/mobile/app/(app)/bookmark/[id].tsx:1` via `router.push('/bookmark/${id}')`.
  - Infinite scroll: use `onEndReached` to fetch more.
  - Empty state: “Type to search” (no query) and “No results” when query returns zero.
  - Loading state: centered spinner; Error state: retry affordance.

- Visual language & theming
  - Remove the ad-hoc `HomeHeader` bar in search; rely on the Stack header + native search. Keep the rest minimal and consistent with Home (spacing, typographic scale), using `useTheme` colors.
  - Support light/dark via existing theme tokens; avoid hard-coded colors.

## API Behavior Spec

- Endpoint
  - Continue using `GET /api/v1/search` with query params: `q`, `type`, `limit`, `offset`.
  - For mobile Search tab, use `type=bookmarks` and return only bookmark results.

- Matching rules
  - Fields: bookmark title OR creator name only. Remove description/notes/url from the match for bookmark results to reduce noise and improve relevance.
  - Partial matching, case-insensitive.
  - Status filter: include `status in ('active','archived')`; exclude deleted (defense-in-depth even though deletes are physical today).

  - Add repository method: `searchByUserId(userId, query, { includeArchived: true, limit, offset })` that performs filtering in SQL instead of fetching all and filtering in JS. This improves performance.
    - WHERE: `b.user_id = ? AND b.status IN ('active','archived')` AND `(
      LOWER(c.title) LIKE '%' || LOWER(?) || '%' OR LOWER(cr.name) LIKE '%' || LOWER(?) || '%'
    )`
    - LEFT JOIN `content` and `creators` as in existing queries to return all fields needed for mapping.
  - Update `packages/api/src/index.ts:1` search handler to call the new method when `type=bookmarks` (or when omitted for mobile), and to compute counts/pagination accordingly.
  - Defer feed/content results; don’t include them in this iteration.
  - Add small indexes if needed for performance (optional): `content(title)`, `creators(name)`, or precomputed lower/normalized columns. Consider D1 index limits.

- Response shape
  - Keep the current object (`results`, `totalCount`, `facets`, `pagination`) for compatibility with `apps/mobile/hooks/useSearch.ts:1`.
  - For this iteration, set `facets.content` to 0 (bookmarks only).

## Mobile Implementation Plan *(Phase 1 — Completed)*

1) Adopt native search header in Search tab (iOS-only) — done
   - Update `apps/mobile/app/(app)/(tabs)/search/_layout.tsx:1` to set:
     - `headerLargeTitle: true`, `title: 'Search'`.
     - `headerSearchBarOptions` with placeholder, auto-capitalize none, hideWhenScrolling false.
   - Use `useNavigationSearch` in `apps/mobile/app/(app)/(tabs)/search/index.tsx:1` to receive input changes and update `useSearch`’s query.

2) Render results list (bookmarks only) — done
   - In `apps/mobile/app/(app)/(tabs)/search/index.tsx:1`, use `useSearch` with default `type='bookmarks'` and infinite scroll.
   - Show a vertical `FlatList` of `OptimizedCompactBookmarkCard` items; onPress navigates to `/bookmark/[id]`.
   - Add empty, loading, and error states consistent with Home.
   - Ensure full light/dark support with `useTheme`.

3) Recent searches (local-only) — done
   - Reuse `SearchHistory` to store and render recent searches (AsyncStorage). Keep on-device only, de-duplicate, and cap at 20. Show when no active query.

4) Remove legacy search UI from Inbox — done
   - Update `apps/mobile/app/(app)/(tabs)/inbox.tsx:1` to remove the search bar/results (or repurpose Inbox entirely), avoiding two separate search experiences.
   - Ensure no navigation routes still point to Inbox as “search”.

5) Polish and accessibility — done
   - Respect dynamic type sizes, sufficient contrast, hit slop, focus order, and VoiceOver accessibility labels.
   - Add haptics on item press consistent with Home.

## API Implementation Plan *(Phase 2 — Pending)*

1) Add repository search for bookmarks — pending
   - Add `searchByUserId` in `packages/api/src/d1-repository.ts:1` with SQL WHERE for user, status in (active, archived), and case-insensitive partial match on title/creator name.
   - Reuse existing mapping function; return paginated rows.

2) Update search route — pending
   - In `packages/api/src/index.ts:1`, in `/api/v1/search`:
     - When `type=bookmarks` or omitted, use `searchByUserId` with limit/offset.
     - Compute `facets.bookmarks` from the full count (or estimate by requery without limit, or add a count query); keep `facets.content` as today if `type=all`.
     - Enforce `status in ('active','archived')` for bookmarks; ensure deleted are excluded.
     - Ensure case-insensitive behavior for both bookmarks and content segments.

3) Optional performance tweaks — pending
   - Consider small indexes (if not present) in migrations for `content.title` and `creators.name` used in LIKE queries.
   - If needed, add a `content.normalized_title` (already present) and/or `creators.normalized_name` to speed up lookups.

## Testing & QA

- API
  - Add unit tests for `searchByUserId` (active vs archived vs deleted) and for `/api/v1/search` behavior with `type=bookmarks`.
  - Validate case-insensitive partial matching and pagination.

- Mobile
  - Manual QA on iOS 26 features: header search shows “Search”, native field appears, typing updates results; tapping opens detail (`apps/mobile/app/(app)/bookmark/[id].tsx:1`).
  - Verify empty/loading/error states, dark mode, and infinite scroll.

## Open Questions

- Any additional fields to match beyond title/creator (e.g., tags)? Requirement states only title or creator; we’ll keep it tight for now.
 - Do we want to include feed items in a later phase? Deferred for now.
 - Recent searches: implemented on-device only; no analytics.

## Deliverables

- Mobile
  - Updated Search tab using iOS-native search UI with header title “Search”.
  - New bookmark-only results list with consistent Home visual style and full theme support; recent searches stored on-device.
  - Legacy search UI removed from Inbox.

- API
  - `searchByUserId` repository method with SQL filtering and pagination.
  - `/api/v1/search` updated for precise fields, status filtering, and case-insensitivity.

## Migration & Rollout

- No data migration required; optional indexes can be added via normal migration flow if performance needs arise.
- Rollout behind an app version toggle if needed; otherwise ship as a cohesive change after QA.
