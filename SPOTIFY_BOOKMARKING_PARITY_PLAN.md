# Spotify Bookmarking Parity Plan

## Overview
- Goal: Make Spotify bookmarking work as well as YouTube, using the same architecture, UX, and data quality. Keep the save/preview flows identical and lean on API enrichment when the user is connected; otherwise use robust fallbacks.
- Added scope: Cross-platform duplicate detection and merge. If a user saves the same podcast/video across YouTube and Spotify, merge into a single Content/Bookmark with alternate links (user can open in either platform).
- Scope: Analysis of current behavior + an incremental, verifiable plan to reach parity. No implementation in this document.

## How Bookmarking Works (General)
- Mobile preview/save
  - Preview: `apps/mobile/hooks/useSaveBookmark.ts:71` calls `bookmarksApi.preview(url)`, which posts to `/api/v1/bookmarks/preview` (`apps/mobile/lib/api.ts:243`).
  - Save: `apps/mobile/lib/api.ts:247` uses the enriched endpoint `/api/v1/enriched-bookmarks/save-enriched` to persist high‑quality metadata.
- API preview pipeline
  - Entry: `packages/api/src/index.ts:98` → POST `/api/v1/bookmarks/preview`.
  - Service: `packages/api/src/services/preview-service.ts:18` uses `MetadataRepository` (DB first) and `MetadataOrchestrator` (platform‑aware fallback chain: native API with OAuth → oEmbed → HTML scrape → minimal).
- API save pipeline
  - Entry: `packages/api/src/routes/enriched-bookmarks.ts:22` → POST `/api/v1/enriched-bookmarks/save-enriched`.
  - Flow: Try API enrichment via `ApiEnrichmentService` for supported platforms (`youtube|spotify`), else `ContentEnrichmentService` fallback; upsert Content, ensure Creator, then create Bookmark; see `packages/api/src/d1-repository.ts:454` for `createWithMetadata` mapping.
- Rendering
  - Cards and details display duration, creator and metadata consistently: `apps/mobile/components/CompactBookmarkCard.tsx:54`, `apps/mobile/app/(app)/bookmark/[id].tsx:460`.

## How YouTube Bookmarking Works
- OAuth + tokens
  - Endpoints: `/api/v1/auth/youtube/*` implemented in `packages/api/src/index.ts:338`, backed by `OAuthService` and `DualModeTokenService`.
- Preview
  - `MetadataOrchestrator` calls `YouTubeMetadataService` with user token when `userId` is provided; else falls back. See `packages/api/src/services/metadata-orchestrator.ts:113` and `packages/api/src/external/youtube-metadata-service.ts:49`.
- Save (enriched)
  - `ApiEnrichmentService.enrichYouTubeContent` fetches video + channel, transforms to Content (creator avatar, counts, duration), `packages/api/src/services/api-enrichment-service.ts:247` and transform at `packages/api/src/services/api-enrichment-service.ts:518`.
  - Route applies result: `packages/api/src/routes/enriched-bookmarks.ts:147` → sets `contentType = 'video'` and persists.
- Result
  - Rich title/description, thumbnail, duration, view counts, and channel avatar; creator page links to channel.

## Current Spotify Support (What Works Today)
- OAuth + tokens
  - Endpoints mirror YouTube (`/api/v1/auth/spotify/*`) in `packages/api/src/index.ts:338` using the same token infrastructure.
- Preview
  - `MetadataOrchestrator` calls `SpotifyMetadataService` with user token when available; otherwise uses oEmbed/HTML fallbacks. See `packages/api/src/services/metadata-orchestrator.ts:113` and `packages/api/src/external/spotify-metadata-service.ts:95`.
  - The enhanced extractor also supports Spotify oEmbed fallback: `packages/shared/src/enhanced-metadata-extractor.ts:918`.
- Save (enriched)
  - Enriched route supports Spotify API enrichment but currently only for episodes (`GET /v1/episodes/{id}`) via `ApiEnrichmentService.enrichSpotifyContent`, then `transformSpotifyApiResponse` maps show/episode fields to Content; see `packages/api/src/services/api-enrichment-service.ts:394` and `packages/api/src/services/api-enrichment-service.ts:568`.
- UI
  - ContentType `podcast` displays duration badge and platform coloring; creator page shows platform icon. `apps/mobile/components/CompactBookmarkCard.tsx:28`, `apps/mobile/lib/platformIcons.tsx:16`.

## New Scope — Cross‑Platform Duplicate Detection & Merge
- Objective: When the same episode/podcast is saved from YouTube and Spotify, detect they represent the same content and merge into a single Content/Bookmark. Expose all platform links (YouTube/Spotify) for that unified item.
- Data model supports this already:
  - Content cross‑platform fields: `contentFingerprint`, `publisherCanonicalId`, `normalizedTitle`, `episodeIdentifier`, `crossPlatformMatches` in `packages/api/src/schema.ts:241`.
  - Matching helpers exist: `packages/api/src/services/content-matching-service.ts` (normalize titles, generate fingerprints, compute confidence), publisher mappings, and ContentRepository methods for duplicates/merge (`findDuplicates`, `mergeDuplicates`).
- UX:
  - Bookmark detail view shows an “Open” primary button and a secondary “Open in…” platform switcher if multiple platform links exist.
  - A single bookmark per user for a given content; subsequent saves on another platform link to the existing content without creating a duplicate bookmark.

### Matching Strategy
- Generate candidate attributes on enrichment (both preview/save paths):
  - `normalizedTitle` (title normalization), `durationSeconds`, `publishedAt`, series/episode hints (episode number/season if available), `publisherCanonicalId` when resolvable, and `contentFingerprint` from those inputs.
- Match order and thresholds:
  1) Exact `contentFingerprint` match → confidence 1.0 (merge).
  2) Same platform + `externalId` → 1.0 (same content).
  3) Same `normalizedTitle` + same `creatorName` (or mapped publisher) → ~0.8 (candidate merge when dates/duration align).
  4) URL equality/normalization equality → ~0.9.
- Store linkage:
  - Persist `crossPlatformMatches` JSON on Content: array of `{ platform, id, url, confidence, addedAt }`.
  - Optionally record a row in `content_matches` with `matchConfidence` and `verified` for audit/debug.

### Save Flow Changes (Enriched Route)
- Where: `packages/api/src/routes/enriched-bookmarks.ts:22` after constructing `enrichedContent` and before upsert+bookmark creation.
- Steps:
  - Compute `normalizedTitle`, `episodeIdentifier`, `publisherCanonicalId` (when resolvable) and `contentFingerprint` (via `ContentMatchingService.generateContentFingerprint`).
  - Use `ContentRepository.findDuplicates(enrichedContent)` to fetch candidates and score; pick primary (existing) if any candidate ≥ threshold (e.g., 0.8).
  - If duplicate found:
    - Upsert `crossPlatformMatches` on the primary to include the new platform variant (id/url).
    - Create the user’s Bookmark pointing to the primary content (not a new Content row).
    - If both a new temp content row and a primary row were created, call `ContentRepository.mergeDuplicates(primaryId, [duplicateId])` to unify and update references.
  - If no duplicate: proceed with normal upsert and then generate `contentFingerprint` asynchronously if missing (optional CHRON job).

### Preview Flow Changes
- To support confident matches at preview time (optional but helpful for UI), carry the same normalization and fingerprint generation in the orchestrator result where possible. Do not merge at preview time; only surface dedup hints (e.g., show “Already saved” banner if a match exists).

### UI Changes (Mobile)
- Bookmark Detail (`apps/mobile/app/(app)/bookmark/[id].tsx`):
  - If `crossPlatformMatches` present, add an overflow action “Open in…” with options for each platform link in the Content record.
  - For compact cards, optionally display a dual‑platform indicator when content has >1 platform link (non-blocking enhancement).
- Save Flow:
  - When duplicate detected on save, return existing bookmark in API response (`duplicate: true` + existing bookmark data) and ensure Content now includes both links.

### Retroactive Merge (Optional)
- Add a one‑time script/endpoint to scan existing content, compute `normalizedTitle`/`contentFingerprint` where missing, and run `findDuplicates`/`mergeDuplicates` to unify historical items.

### Verification
- Save a YouTube episode → Save the same episode’s Spotify link:
  - Only one Bookmark exists for the user; the Content shows both platform links.
  - Detail view allows opening either platform.
- Save in reverse order (Spotify first, then YouTube) and observe same behavior.
- Confirm no unintended merges with similar but distinct episodes.

### Risks/Considerations
- Confidence threshold tuning to avoid false positives — start conservative (≥ 0.85 for auto‑merge), log candidates between 0.7–0.85 for metrics, optionally surface a UI nudge later.
- Publisher canonicalization: where possible, map YouTube channels to Spotify shows using `KNOWN_PUBLISHER_MAPPINGS`; keep it best‑effort.
- Keep existing fallback chain; never block saves on merge uncertainty.

## Mobile App: UX, Data, and Phased Work

### UX Goals (Mobile)
- One bookmark per piece of content, even if saved from multiple platforms.
- In the Bookmark Detail view, show an “Open in…” control when multiple platform links exist (YouTube/Spotify), alongside the primary “Open Link” action.
- During Save flow, if the URL matches an existing Content, show a non‑disruptive success state (“Linked to existing bookmark”) and route to the existing detail screen.
- In Preview, if a duplicate is detected, surface a light “Already saved” hint with a quick action to open the existing bookmark.

### API → Mobile Data Shape
- Keep server‑authoritative dedup/merge. Mobile consumes a unified shape and renders alternate links when present.
- Proposed response field added to bookmark payloads (joined from Content):
  - `alternateLinks: Array<{ provider: 'youtube' | 'spotify', url: string, externalId?: string, confidence?: number }>` derived from `content.crossPlatformMatches` and the canonical content itself.
  - Backward‑compatible: if absent, UI simply renders “Open Link” as today.

### Mobile Touch Points
- Preview call: `apps/mobile/lib/api.ts:243` and hook `apps/mobile/hooks/useSaveBookmark.ts:71`.
- Save flow: `apps/mobile/lib/api.ts:247` returns bookmark/duplicate; hook `apps/mobile/hooks/useSaveBookmark.ts:125` handles response.
- Detail UI: `apps/mobile/app/(app)/bookmark/[id].tsx` shows actions; add “Open in…” when `alternateLinks` exist.
- Card UI (optional pill): `apps/mobile/components/CompactBookmarkCard.tsx:28` shows contentType; consider showing a multi‑platform indicator.

### Phased Mobile Work

Phase M1 — Data plumbing (no visual changes)
- Status: Completed — Mobile bookmark typings now layer optional `alternateLinks`/`existingBookmarkId`, and API helpers pass them through with dev logging.
- Add optional `alternateLinks` to the mobile Bookmark type so the UI can render multi-platform choices when available.
  - Types: extend `@zine/shared` Bookmark or map in the mobile layer; start with a mobile-layer map to avoid ripple changes.
  - API client: pass through any `alternateLinks` from server in `apps/mobile/lib/api.ts`.
- Verification: Log the presence of `alternateLinks` in dev builds; ensure no crashes when absent.

Phase M2 — Save flow duplicate UX
- Status: Completed — Duplicate saves now surface a success toast and deep link to the existing bookmark instead of throwing an error.
- Hook: In `useSaveBookmark` (`apps/mobile/hooks/useSaveBookmark.ts:125`), if API indicates duplicate (or returns an existing bookmark), show a success toast like “Linked to existing bookmark” and navigate to the existing bookmark detail.
- Behavior: No duplicate bookmark card appears; the existing bookmark updates in place once the API merges links.
- Verification: Save YouTube first, then Spotify; confirm only one bookmark exists and navigation goes to the existing item.

Phase M3 — Detail screen alternate links
- Status: Completed — Bookmark detail now renders an “Open in…” selector that lists each provider from the merged content.
- UI: In `apps/mobile/app/(app)/bookmark/[id].tsx`, when `alternateLinks` has > 1 entries (including the primary), render:
  - Primary button: still “Open Link” (uses the bookmark’s `url`).
  - Secondary action: “Open in…” which lists each provider and opens via `Linking.openURL()`.
- Data: Prefer provider-specific icons/colors (already present via `PlatformIcon`), label items “Open in YouTube/Spotify”.
- Verification: With merged content, ensure both links launch and return correctly.

Phase M4 — Preview duplicate hint
- Status: Completed — Preview cards show an inline “Already saved” pill with a jump-to-detail action when the API flags an existing bookmark.
- If preview API includes an `existingBookmarkId` (or the app can call a lightweight check), show a subtle inline hint: “Already saved — open existing.”
- Hook: `useSaveBookmark` preview state; add an action to open the existing bookmark.
- Verification: Paste a URL that’s already merged; hint appears and action navigates to the existing detail.

Phase M5 — Visual polish
- Status: Completed — Compact cards display a dual-platform chip when multiple providers are linked, and optimized cards surface a matching badge.
- Cards: Add a tiny dual-platform chip when `alternateLinks` length > 1. Keep minimal and unobtrusive.
- Settings/Help: A brief explainer on multi-platform linking if needed.

### Mobile Edge Cases
- If API returns no `alternateLinks`, preserve existing UI behavior.
- If an alternate link fails to open (app missing), gracefully fall back to the canonical link.
- When offline, saving still creates a basic bookmark; merging happens server‑side when connectivity resumes (no blocking on the client).

## Gaps To Close (Parity Targets)
- Preview should use native API for richer Spotify data (when connected)
  - Today preview endpoint is unauthenticated and expects `x-user-id`; mobile sends Authorization but not `x-user-id`. Result: preview usually falls back to oEmbed/HTML, missing rich creator/duration for connected users.
- Save enrichment limited to Spotify episodes
  - Tracks, albums, playlists and artists are not API‑enriched despite being detected by URL parsing elsewhere. Current enriched route always treats Spotify as `podcast` (`packages/api/src/routes/enriched-bookmarks.ts:156`).
- Creator modeling consistency
  - For episodes, `transformSpotifyApiResponse` sets `creatorName` to `show.publisher`; users likely expect the show name as the “creator” they browse. Thumbnail and IDs are based on show already.
- Refresh parity
  - Mobile refresh uses `/api/v1/bookmarks/:id/refresh` (title/description refresh only). The enriched refresh (`/api/v1/enriched-bookmarks/:id/refresh-enriched`) uses APIs and should be used for parity.
- Minor normalizations
  - URL/contentType mapping for non‑episode Spotify types; ensure consistent `creatorId/creatorName/seriesName` population.
  
  - Cross‑platform dedup/merge
    - Implement fingerprint/normalized fields population during enrichment.
    - Add duplicate detection and merging at save time; unify bookmarks to primary content and store alternate links.

## Phased Plan (Incremental, Verifiable)

### Phase 0 — Baseline Verification (No code changes)
- Verify Spotify OAuth connect/disconnect works in Settings, and accounts show status from `/api/v1/accounts`.
- Save a Spotify episode URL; confirm enriched save route is used and bookmark renders creator + duration.
- Note preview behavior for Spotify URLs while connected; expect fallback metadata currently.
- Deliverable: A short test log captured against a dev build (mobile + worker), including 1 YouTube and 1 Spotify URL.

### Phase 1 — Preview Uses Native API When Connected
- Goal: Rich preview for Spotify/YouTube when user is connected.
- Status: Completed — Preview route now derives the user ID from Authorization bearer tokens so MetadataOrchestrator can call native APIs without requiring custom headers.
- Options (choose one):
  - Client: Send `x-user-id` header on preview requests so orchestrator can call native APIs: `apps/mobile/lib/api.ts:243` and `apps/mobile/hooks/useSaveBookmark.ts:71`.
  - Server: In preview route, when Authorization is present, parse user and pass to orchestrator (keeps API ergonomic on mobile). Entry at `packages/api/src/index.ts:64` and `packages/api/src/services/preview-service.ts:108`.
- Verify:
  - With Spotify connected, preview a Spotify episode URL. Response `source` should be `native_api` and include duration/creator.
  - With YouTube connected, preview a video URL, see `native_api` with channel avatar.

### Phase 2 — Expand Spotify API Enrichment Beyond Episodes
- Goal: Enrich tracks, playlists, albums, artists (in addition to episodes).
- Status: Completed — API enrichment now detects Spotify resource types, calls the correct endpoints, enriches metadata for tracks/playlists/albums/artists, and tags saved content with `podcast` or `video` accordingly.
- Work:
  - Extend `ApiEnrichmentService` with endpoints for `tracks`, `playlists`, `albums`, `artists` similar to episodes: see current pattern at `packages/api/src/services/api-enrichment-service.ts:394`.
  - Add transforms for these types (title, thumbnail, creator fields). Mirror `transformSpotifyApiResponse` structure (`packages/api/src/services/api-enrichment-service.ts:568`).
  - Update save route mapping to set `contentType` based on type:
    - `episode` → `podcast`
    - `track`/`album`/`playlist`/`artist` → choose best existing type; if audio-only content is common, keep `video` for now to avoid enum churn, or add a new `audio` type in a later phase.
- Verify:
  - Save a track URL and playlist URL while connected; confirm Content has reasonable title/thumbnail/creator and `contentType` is set per spec.
  - Still falls back cleanly when disconnected.

### Phase 2.5 — Cross‑Platform Duplicate Detection & Merge
- Goal: Prevent duplicate Bookmarks/Content across YouTube and Spotify, and expose alternate links.
- Status: Completed — Save route now computes normalized/fingerprint fields, reuses high-confidence matches via `ContentRepository.findDuplicates`, merges metadata into the primary Content row, and records alternate platform links in `crossPlatformMatches` while returning duplicate indicators when a bookmark already exists.
- Work:
  - Enrichment: populate `normalizedTitle`, `episodeIdentifier`, `publisherCanonicalId` (when resolvable), and `contentFingerprint`.
  - Save route: use `ContentRepository.findDuplicates` and merge logic (threshold ≥ 0.8). Add/update `crossPlatformMatches` on the surviving Content.
  - Response: if user already has a Bookmark for the surviving Content, return duplicate indicator and that Bookmark; otherwise create a new Bookmark pointing to the surviving Content.
  - Optional: record in `content_matches` for observability.
- Verify:
  - Save YouTube then Spotify (and vice versa) for the same episode; one Bookmark, unified Content with both links.
  - No merge for distinct episodes with similar titles.

### Phase 3 — Creator Modeling Consistency for Spotify
- Status: Completed — Episode/show enrichment now assigns creators using show IDs & names, stores publisher on seriesMetadata, and passes type-checks.
- Goal: Align creator fields with user expectations and Creator pages.
- Work:
  - For episodes/shows, set `creatorId = spotify:<showId>`, `creatorName = <show.name>`, `creatorThumbnail = show.images[0]`, keep publisher in a separate field if needed (e.g., `seriesMetadata.publisher`). Current uses `publisher` as `creatorName` (`packages/api/src/services/api-enrichment-service.ts:571`).
  - For tracks/albums, set creator to primary artist (name, images when possible via artist call), or leave `creator*` unset and rely on title unless/ until artist lookup is implemented.
- Verify:
  - Creator page (`apps/mobile/app/(app)/creator/[id].tsx`) shows expected name/avatar for a saved Spotify episode’s show.
  - ✅ `bun type-check`

### Phase 4 — Switch Mobile Refresh To Enriched Refresh
- Status: Completed — Mobile refresh requests now target the enriched route so YouTube/Spotify updates use API data when available.
- Goal: Refresh uses APIs when connected, not only metadata extractor.
- Work:
  - Change mobile to call `/api/v1/enriched-bookmarks/:id/refresh-enriched` instead of `/api/v1/bookmarks/:id/refresh` (`apps/mobile/lib/api.ts:265`).
- Verify:
  - Refresh a YouTube bookmark; channel avatar/view count update if changed.
  - Refresh a Spotify bookmark; show image/description update if changed.
  - ✅ `bun type-check`

### Phase 5 — URL Parsing/Normalization Hardening
- Status: Completed — Shared URL utilities now normalize locale/embed/URI Spotify forms and API save/refresh flows consume the parsed resource IDs.
- Goal: Ensure contentId extraction and normalization are robust for all Spotify URL shapes.
- Work:
  - Validate and extend regex in `packages/api/src/routes/enriched-bookmarks.ts:53` and `packages/shared/src/url-normalizer.ts:96` for `open.spotify.com` variants and `spotify:` URIs.
  - Keep dedup strong via normalized URLs; validate using `packages/api/src/repositories/__tests__/metadata-repository.test.ts:364` patterns.
- Verify:
  - Save using different Spotify URL forms for the same item results in single Content row and de‑duped Bookmark.
  - ✅ `cd packages/shared && bun run test:run`
  - ⚠️ `cd packages/api && bunx vitest run` (fails: test harness assumes legacy bookmark schema; needs fixture/content table updates)

### Phase 5.5 — Retroactive Merge (Optional)
- Run a batch process over existing Content rows to compute missing fingerprints/normalized fields, find duplicates, and merge. Validate with a dry‑run mode and thresholds.

### Phase 6 — Tests
- API unit tests (Vitest) covering:
  - `ApiEnrichmentService` Spotify branches (episodes + new types) with mocked HTTP.
  - `MetadataOrchestrator` native API path hit for preview when `userId` present.
- Mobile manual tests:
  - End-to-end: connect Spotify, preview/save/refresh for at least one episode and one non‑episode type.

### Phase 7 — Backfill and Performance (Optional)
- If desired, add a one‑time refresh task to backfill creator fields for existing Spotify bookmarks.
- Monitor rate‑limits via `/api/v1/enriched-bookmarks/api-status` and ensure graceful fallback remains intact.

## Acceptance Checklist
- Preview returns `native_api` for Spotify/YouTube when connected and includes richer metadata.
- Saving Spotify episodes and at least tracks/playlists produces high‑quality Content + Creator records.
- Mobile refresh uses enriched API route and updates metadata correctly.
- Creator pages render expected names/avatars for Spotify shows.
- Cross‑platform saves produce one Bookmark per user with alternate links available; duplicates are prevented and/or merged correctly.

## Notes and Pointers
- Preview route ergonomics: If you prefer keeping preview unauthenticated, pass `x-user-id` from mobile on preview; otherwise parse Authorization in the worker to infer the user.
- Keep fallback chain intact to avoid regressions for disconnected users or API rate limits (`packages/api/src/services/metadata-orchestrator.ts:139`).
- Avoid expanding `ContentType` enum until necessary; align with current UI expectations first.

## Key Files Touched (Expected)
- Mobile
  - `apps/mobile/lib/api.ts:243` (preview header), `apps/mobile/lib/api.ts:265` (refresh endpoint)
  - `apps/mobile/hooks/useSaveBookmark.ts:71` (preview invocation)
- API
  - `packages/api/src/services/api-enrichment-service.ts:394` (Spotify enrichment + new branches + transforms)
  - `packages/api/src/routes/enriched-bookmarks.ts:53` (Spotify ID extraction + contentType mapping)
  - `packages/api/src/services/preview-service.ts:108` (userId flow), `packages/api/src/index.ts:64` (preview route)
- Shared
  - `packages/shared/src/url-normalizer.ts:96` (Spotify normalization)

---

This plan is implementation‑ready but intentionally defers changes. Each phase is independently verifiable to keep risk low and feedback fast.
