# @zine/next-ui

React components for the Zine Next design language. The design rules live in
[`packages/next-design/DESIGN.md`](../next-design/DESIGN.md); the tokens come from
`@zine/next-design`.

So far this package has one component, `ItemCard`, which shows one saved item (video, podcast,
article or post) at one of four fixed sizes. Nothing in the apps uses it yet.

## Use

```tsx
import '@zine/next-design/tokens.css';
import '@zine/next-ui/cards.css';
import { ItemCard } from '@zine/next-ui';

<ItemCard item={item} size="large" onAction={(item) => openMenu(item)} />;
```

- `size`: `large` (392 x 368), `compact` (392 x 84), `tile` (188 x 258) or `tall` (392 x 752, or
  188 x 532 with `tallWidth="narrow"`).
- `item`: see `CardItem` in `src/types.ts`. `description` is a short summary; `body` is the item's
  own words (a post, or the text of an article).
- The whole card links to `item.url`. `onAction` is the three-dots button.
- The page must load Inter, or the cards fall back to the system font.

The card measures how many whole lines of content fit under the title and shows exactly that many.
Before it has been measured (server render, tests) it shows a fixed first guess per size.

## Commands

- `bun test`: structure and formatting tests, rendered on the server.
- `bun run gallery`: builds `.gallery/index.html`, a page of every card in day and night, from the
  sample saves in `apps/next-web/src/data/DevSamples.json`. Open it over a local web server.
- `bun run typecheck`, `bun run lint`.

The tests do not cover layout. Check the gallery in a browser after changing `cards.css`.
