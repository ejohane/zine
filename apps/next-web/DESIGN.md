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
