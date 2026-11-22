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
- **Heavy, tight titles.** Inter 700 with negative tracking for titles; 500 for text.
  No thin weights and no serif. (Space Grotesk was used through Round 19 of the mockups and
  then replaced.)

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

## Item cards (designed in mockups, not yet built)

An item card shows one saved thing. Cards are what agents compose replies from, so they matter
more than app chrome. Rounds 19 to 23 of the canvas settled the rules below using the real sample
saves in `apps/next-web/src/data/DevSamples.json`.

Rules for every card:

- **Three sizes with fixed outer dimensions**, whatever the content: Large 392 x 368, Compact
  392 x 84, Tile 188 x 258. Tiles in a row and large cards in a grid always line up.
- **The inside adapts to the content type.** Videos lead with the picture; articles and posts are
  text-heavy; podcasts show a square cover. Types should be recognisable without a label.
- **Pictures are never cropped** in a way that cuts their content. Video frames stay 16:9.
- **No rules or boxes** around cards; space separates them.
- **No format pill, no overlays on pictures, no open button.** The whole card is the link.
- **Creator line:** small avatar and name.
- **Title and description share a line budget.** The title takes the lines it needs, up to the
  budget; the description (smaller, muted) gets only the lines left over.
- **Footer row pinned to the bottom:** length and when it was saved on the left
  ("13 min · Saved 2d ago"), one three-dots action button on the right. More information and
  actions may be added here later.

Video card (locked):

| Size    | Picture                                                      | Text line budget                       |
| ------- | ------------------------------------------------------------ | -------------------------------------- |
| Large   | 392 x 220 frame on top                                       | 3 lines (title 21px, description 14px) |
| Compact | 149 x 84 frame on the left; text never taller than the frame | 2 lines (title 16px)                   |
| Tile    | 188 x 106 frame on top                                       | 4 lines (title 16px, description 13px) |

Podcast, article and post cards are still being designed.

Reply patterns explored in Round 14 (one large then a compact list; a pair of tiles then a list;
a rail of tiles; a wide grid) are examples, not a spec. How an agent chooses sizes is undecided.

## Open questions

- Reader body text has not been revisited since the move to Inter.
- The desktop web side panel did not feel right and needs another pass.
- Night values for reader highlights are not designed.
- Inter comes from Google Fonts in the mockups; iOS bundling is undecided.
- The type scale in `tokens.json` predates the card work and does not yet include card sizes.
- Save dates and the footer action are placeholders; the sample data has no save dates.
