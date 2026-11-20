# Zine Next design language ("Ember")

A fresh visual language for Zine Next across web, iOS and AI chat. It was chosen through seven
rounds of mockups in November 2026 and deliberately does not inherit from the legacy Zine palette,
`NextTheme`, or the `apps/next-web` Home redesign. Nothing consumes these tokens yet.

Mockup canvas (private to Erik): <https://claude.ai/artifact/PXyjQy6YbHiQ4vWRhafSib>. The
"Round 7" row is the reference: foundations, Home, Reader, Library, chat and desktop web.

## Principles

- **Day and night are one system.** Every color role has both values. Day is the base.
- **Flat.** No shadows or elevation. Structure comes from 1px rules and space, not cards.
- **Black, white and one orange.** Neutrals carry no hue. Orange marks the primary action
  (Save), progress, and the "Continue" label. Artwork supplies all other color.
- **Pills for controls, modest corners for content.** Buttons, filters and the nav bar are fully
  rounded. Artwork uses 10 to 14px corners. Content is not boxed.
- **Heavy, tight titles.** Space Grotesk 700 with negative tracking for titles; 500 for text.
  No thin weights and no serif.

## Tokens

`tokens.json` is the single source of truth. `bun run generate` writes:

- `generated/tokens.css`: CSS custom properties (`--zn-*`) using `light-dark()`; set
  `data-theme="light"` or `"dark"` on `:root` to force a mode.
- `generated/ZineNextTokens.swift`: adaptive SwiftUI colors and type, radius, size and space
  constants. It has not been compiled yet; verify it when `apps/next-ios` first adopts it.

`bun test` fails if the generated files are stale or a text/background pair drops below 4.5:1.

Day mode has two oranges on purpose: `accent` (`#FF6A1F`) for fills, and the darker `accentText`
(`#C8440A`) for small orange text, because the bright orange is too pale for text on a light
background. Night uses the bright orange for both.

## Component patterns (from the mockups, not yet built)

- **Nav bar:** floating pill pinned to the bottom, `raised` background, three text destinations
  and an orange Save pill. In the reader it becomes a reading bar (time left, Highlight, Note, Done).
- **Filter pills:** 40px high; selected is `ink` fill, others have an `outline` border.
- **Buttons:** 44px pills. Accent fill for the primary action, `ink` fill, `ink` outline, or text.
- **Lead item:** artwork, "Continue" label with source and time left, display title, progress bar.
- **List row:** numeral, title and meta, thumbnail on the right, divided by `line` rules under one
  `lineStrong` rule. In Library the numeral is dropped and the thumbnail moves left.
- **Type tag:** small outlined pill naming the format (Article, Podcast, Video, Post).
- **Chat result:** the same list row inside a chat reply, followed by action pills.

## Open questions

- Reader body text is set in Space Grotesk; a calmer face for long articles may be needed.
- The desktop web side panel did not feel right and needs another pass.
- Night values for reader highlights are not designed.
- Space Grotesk is a stand-in from Google Fonts; licensing and iOS bundling are undecided.
