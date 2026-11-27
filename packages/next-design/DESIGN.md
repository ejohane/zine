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
- **Compact footer (27 Nov 2026):** the footer runs across the whole card, under the picture, so
  the three dots are always at the right edge. The card keeps its 84 height, so the picture is as
  tall as the text above the footer (58) rather than the whole card.
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

## Bento layout and Home (25 Nov 2026)

Built in `packages/next-ui` (`Bento`, `packBento`). It was the Home of `apps/next-web` until the
Spotlight Home below replaced it on 27 Nov 2026. It was fed by the
real `/v1/home`; the earlier Home (serif plates, phone edition) is removed. Erik asked for the
screen and left the decisions to Claude; none of the rules below have been reviewed yet.

- **Bands, not a free grid.** A section is a stack of bands. Each band is a full rectangle of one
  height: a row (368, one large card), a double (532, two tiles) or a tower (752, one tall card).
  So a section has no holes; only leftovers that cannot fill a band sit in a short last row.
- **Eight column fillings.** Row: one large, or four compact. Double: four tiles, two narrow tall
  cards, or one narrow tall card beside two tiles. Tower: one tall, two large, or one large over
  four compact.
- **Which band comes next.** Items keep the API's order. Each band is the best-scoring one the rest
  can still follow evenly: bigger cards score higher, a section opens with a big card, mixed
  fillings beat uniform ones, and repeating a filling or the previous band's height costs points.
- **Tall cards are for reading.** Only articles and posts with at least 240 characters of text go
  tall. A tall article shows its own text even when it has a picture.
- **Widths.** One wide column under 560, two under 848, three above; the bento stops at 1208. Cards
  keep their heights and stretch or shrink in width (about 270 to 415; designed at 392). A single
  column stops at 400. A card wider than 392 keeps the designed picture height.
- **In progress.** A started item replaces its length with what is left ("8 min left"), bold in the
  accent text colour, at the start of the footer. Nothing is drawn on the picture. Without a known
  length it says "In progress".
- **Sections.** The sections `/v1/home` composed, in its order, each under a title in the title
  size, 48 apart, 16 between cards. Loaded saves that Home did not use follow as "More from your
  library". Until Home has loaded, the library stands in as "Jump back in" and "Just saved".
- **Opening things.** A card opens the original in a new tab, as designed. The three dots open the
  item inside the app, where notes, progress and archiving live.
- **The rest of the app.** The app keeps its navigation, filters, sheets and other feeds, but its
  colour and font variables now point at the Zine Next tokens (`apps/next-web/src/bento-home.css`),
  so everything shares the palette and Inter. Those screens have not been redesigned.

Known gaps: `/v1/home` has no picture sizes (post pictures are measured after loading), no quoted
post or link fields, and at most 700 characters of text, so tall cards can end with empty space.
Home has only been seen with made-up data in a local browser, not with a real account.

## Spotlight Home (27 Nov 2026)

Erik found the bento Home too busy once it was live and chose this from a second round of
options (kept in `apps/next-web/design-lab`), after an Apple Health screenshot as inspiration:
much empty space, one big thing, a short list beside it. It replaces the bento as the Home of
`apps/next-web` (`SpotlightHome.tsx`); `Bento` stays in `packages/next-ui` but no app uses it.

- **Blocks of four.** Saves keep their order and are taken four at a time: one Large card beside
  three Compact rows, 1px rules between the rows, sides swapping from block to block. The first
  item with a picture in each four is the big one. Tablets keep the two columns upright as well
  as in landscape, at the cards' designed size; only a phone stacks the big card over its rows.
  (A version with the big card across the top of an upright tablet was built on 27 Nov 2026 and
  dropped the same day: it filled the screen with one item.)
- **Cards are magnified, not redesigned.** A card is laid out at its designed width and enlarged
  whole (up to 2.1x for the big card, 1.5x for rows), so every proportion holds. Never smaller
  than designed: a phone shows cards life-size at full width.
- **What leads.** Up to four things you have started, those with a picture first, then open saves.
- **The inbox is a sideways rail** of Tiles after the first block, under "Inbox" and its count.
- **Tabs carry numbers.** All, Articles, Videos, Podcasts, Posts and Inbox, each with how many it
  holds, the chosen one ink on canvas flipped. No page heading and no section titles.
- **Navigation is a left sidebar** that collapses to an icon rail, with the orange Save at its
  top; upright screens get a single menu button at the top of the page, which scrolls away,
  and a drawer that holds Save and the destinations. A floating pill was
  tried first and dropped the same day. The current place is orange.
- **Orange** marks Save, the current place, tab icons, what is left of something started, and the
  inbox count. Nothing else.

Not yet reviewed in the live app with a real account. Library, Inbox and Search still use the
older feeds and cards.

## Open questions

- States are not designed: finished, loading and failed.
- Posts with several photos, threads and replies are untested.
- The article placeholder tile and the composed cards need another design pass before building.
- The desktop web side panel from Round 7 did not feel right and needs another pass.
- Reader body text has not been revisited since the move to Inter.
- Inter comes from Google Fonts in the mockups and gallery; bundling for web and iOS is undecided.
- Save dates in the mockups are invented; the sample data has none. The footer action does nothing yet.
- `ZineNextTokens.swift` has never been compiled, and there is no SwiftUI version of the cards.
