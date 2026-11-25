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

## Item cards

An item card shows one saved thing. Cards are what agents compose replies from, so they matter
more than app chrome. Rounds 19 to 29 of the canvas settled the rules below against real data: the
sample saves in `apps/next-web/src/data/DevSamples.json` and six posts from Erik's feed.

They are built as React components in `packages/next-ui` (`ItemCard`). Run `bun run gallery` there
to see every card rendered from the sample saves.

### Rules for every card

- **Fixed outer sizes, whatever the content**, so cards line up in rows, lists and grids:

  | Size    | Width x height         | Use                                     |
  | ------- | ---------------------- | --------------------------------------- |
  | Large   | 392 x 368              | The lead of a reply                     |
  | Compact | 392 x 84               | Lists                                   |
  | Tile    | 188 x 258              | Pairs, rails and grids                  |
  | Tall    | 392 x 752 or 188 x 532 | Two cards high, for bento-style layouts |

- **One order on every card:** picture (when there is one), title, creator, content, footer.
- **The inside adapts to the content type**, so types are recognisable without a label.
- **Pictures are never cropped in a way that cuts their content.**
- **No rules or boxes** around cards; space separates them. The one exception is a quoted post.
- **No format pill, no overlays on pictures, no open button.** The whole card is the link.
- **Creator line:** small avatar and name, directly under the title. Posts add the handle.
- **Title and content share the space.** The title takes the lines it needs, up to a limit; the
  content gets only the whole lines that are left, and is hidden when none are.
- **Footer pinned to the bottom:** length and when it was saved on the left
  ("13 min · Saved 2d ago"), one three-dots action button on the right.

### By type

| Type    | Picture                                                            | Content                                |
| ------- | ------------------------------------------------------------------ | -------------------------------------- |
| Video   | 16:9 frame on top; on the left in Compact                          | Description, muted                     |
| Podcast | The whole square cover, centred on a blurred copy of itself        | Description, muted                     |
| Article | On top, where a video frame sits; a square on the right in Compact | Description, muted                     |
| Post    | None of its own; media is part of the content                      | The post's own words, at full strength |

- **Article with no picture:** Large and Tall cards become all text, with a larger headline and
  the article's own text filling the card. A Tile keeps its picture area (the source's initial on
  a tinted panel) so tiles still line up. This placeholder is provisional.
- **Compact pictures:** things you play (video, podcast) keep the picture on the left; things you
  read (article, post) keep it on the right.
- **Posts:** a post with no title starts with its creator line. Wide media goes under the words;
  tall media goes beside them at Large size and sits whole on a tinted panel elsewhere. A quoted
  post sits in a tinted panel, and shows its own picture only on the Tall card. A link gets a
  tinted bar with its domain. Posts under 90 characters with no media are set larger. Compact
  rows name what is attached in the footer ("Quoting @handle", the link's domain).
- **Tall** is the best size for posts with media or a quote, and for articles in a bento.

### Decisions made by Claude on Erik's behalf (25 Nov 2026)

Erik asked for the open choices to be closed. These are reversible:

- Podcasts use all four sizes in the shared layout, not an always-square card. The square idea
  conflicted with showing a creator line in a tile.
- Compact articles show their picture on the right when they have one.
- Posts keep fixed heights like every other type; rich posts should be given the Tall size.
- Both Tall widths stay.
- Videos moved to title-then-creator to match the other types, which changed the card locked in
  Round 23.

### Cards an agent composes (designed in Round 30, not built)

These wrap item cards and size to their content:

- **Answer with sources:** a "From your library" label, the answer with numbered references,
  then the sources as numbered Compact cards.
- **Highlight:** the passage on a highlight tint, then the item it came from as a Compact card.
- **Collection:** name, a one-line description, a strip of four pictures (the last a "+N"), and a
  footer with counts by type and total length.
- **Confirmation:** an orange tick, what happened ("Saved to Zine"), an Undo button, and the item
  as a Compact card.

Reply patterns explored in Round 14 (one large then a compact list; a pair of tiles then a list;
a rail of tiles; a wide grid) are examples, not a spec. How an agent chooses sizes is undecided.

## Open questions

- Cards are designed and built at one width per size. Narrow screens are not handled.
- States are not designed: in progress, finished, loading and failed.
- Posts with several photos, threads and replies are untested.
- The article placeholder tile and the composed cards need another design pass before building.
- The desktop web side panel from Round 7 did not feel right and needs another pass.
- Reader body text has not been revisited since the move to Inter.
- Inter comes from Google Fonts in the mockups and gallery; bundling for web and iOS is undecided.
- Save dates in the mockups are invented; the sample data has none. The footer action does nothing yet.
- `ZineNextTokens.swift` has never been compiled, and there is no SwiftUI version of the cards.
