# Native-first experiment baseline

Preserve the native NextTheme light/dark colors, system typography, 24px corners,
14px grid gap, neutral surfaces, blue selection, and quiet reading hierarchy.
Use one continuous vertical page. Float icon-and-word filters over scrolling
content using backdrop-filter; no opaque full-width navigation band. Only the
header accepts horizontal scrubbing. Native haptics are best-effort web vibration
where supported; do not pretend Safari provides native selection ticks.

At >=720px, mirror the native first-fit three-column grid: one-third-width tall
articles (3 half-square rows), square podcasts (2), cinematic two-column videos
(2), compact posts (1). Maintain row-major keyboard order. Stack at compact widths
and increased text sizes. Implement the native detail, collection, following,
search, lifecycle, notes, progress and save flows with semantic browser controls,
modal focus management, keyboard support and explicit local-preview labeling.

## Feed simplification — 2026-11-10

Erik removed the heading utility icons (Search/Collections/Following), the
All saves/Inbox scope row, and the resume banner. The heading now leads directly
into the bento feed with a 24px gap. Preserve the top content filters and Save.

## Home redesign — 2026-11-15

Erik redesigned Home from scratch; this supersedes the native three-column recipe and
system typography **for Home** (format filters keep the native bento in `BentoFeed`).

- Data: `GET /v1/home` (resume, recent, editorial collections) plus the loaded library page,
  which fills a final "Also in your queue" shelf. Cards: article **Plate**, video and podcast
  **Fade** (identical by design), post **Plate** (avatar, name, @handle, the post's own words).
  Missing or broken avatars render nothing.
- Layout (`src/homeLayout.ts`): each entry offers only the shapes its data supports; every shelf
  is packed row by row with no gaps. Three columns for tablets and laptops, five on large
  screens, never a column narrower than 252px (video titles need ~250px).
- Phone (<600px): full-width lead, "Pick up where you left off" as one list card, "Just saved"
  as the only sideways rail, then shelves of two picture tiles plus a list card. Small cards
  never put text over pictures.
- Type: DM Sans and Source Serif 4, self-hosted via Fontsource (offline in the PWA), as
  stand-ins for the Claude app's Anthropic Sans and Anthropic Serif.
- Visual check without the API: an ignored, machine-local harness can live in `output/` and is
  served by `bun run dev` (one existed on Erik's Mac at `output/home-preview/`; it is not in git).
  Prefer `local:pull` data or a branch preview for real checks.
