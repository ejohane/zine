# Native Home composition

Home Lab is another arrangement of the existing native Home. An agent selects
real Zine user-item IDs, card types and layout containers. It does not author
editorial stories or fill the page with generated prose. The regular Home tab
remains the control.

## Building blocks

| Card        | Existing native implementation                                                 |
| ----------- | ------------------------------------------------------------------------------ |
| `featured`  | `HomeFeaturedArticleSection`: creator, source title and actual article excerpt |
| `landscape` | `HomeCompactLandscapeCard`: wide cover with title and metadata                 |
| `cover`     | `HomeCompactCoverCard`: portrait artwork with title and metadata               |
| `compact`   | `HomeCompactHorizontalCard`: small horizontal artwork and text                 |
| `tile`      | `HomeCompactItemTile`: Home's compact square-artwork tile                      |
| `row`       | `HomeItemRow`: native thumbnail row                                            |
| `grid`      | `HomeCompactGridCard`: flexible-width artwork card                             |

Containers are `single`, `horizontal`, `two_column` and `vertical`. A section
selects one card type and one container. Home's page title, section headings,
spacing, colors, artwork handling, accessibility and navigation stay native.
Two-column layouts become one column at accessibility text sizes.

```json
{
  "version": 1,
  "sections": [
    { "id": "lead", "layout": "single", "card": "featured", "itemIds": ["user-item-1"] },
    {
      "id": "listen",
      "title": "Listen Next",
      "layout": "horizontal",
      "card": "cover",
      "itemIds": ["user-item-2", "user-item-3"]
    },
    {
      "id": "pick-up",
      "title": "Jump Back In",
      "layout": "two_column",
      "card": "tile",
      "itemIds": ["user-item-4", "user-item-5"]
    }
  ]
}
```

Use real user-item IDs returned by the tools. Card titles, artwork URLs, creator
metadata, source summaries and reading state are resolved by the server from
current account-owned items. The manifest cannot override them. Only short,
single-line section headings are authored.

## Validation and behavior

- At most 12 sections, 20 items per section and 100 total placements.
- Unique section IDs and no duplicate item IDs within a section. Cross-section
  overlap is allowed, matching Home.
- Landscape and cover cards use horizontal rails; grid cards use two columns.
- Featured article cards use `single`; rows use `vertical`; tiles use `two_column` or
  `vertical`; compact cards use `horizontal` or `vertical`.
- No paragraphs, editorial content, markup, custom styles or executable actions.
- Prepare and publication reject missing, inaccessible, completed and archived
  items. Every read resolves current metadata and removes newly unavailable items.
- The native Home store applies the same pending completion/archive visibility
  and rollback state to composed cards as to ordinary Home.
- Missing, unsupported, malformed or entirely unavailable arrangements fall back
  to normal Home. Existing editions never supply a fallback editorial page.

## Agent workflow

1. `get_home_components`: read the card/container catalog and constraints.
2. `get_home_candidates` or `search_saved`: get real account-owned item IDs.
3. `create_home_composition`: validate and inspect resolved real card content.
4. `publish_home_composition`: publish the reviewed arrangement when requested.
5. `get_home_composition`: read it back.

The composition is stored under an account-scoped R2 key. Publication replaces
the current experimental arrangement and revalidates ownership and eligibility.
`bookmarks:read` is required for reads/previews and `bookmarks:write` for publishing.
A completed write with uncertain readback reports `published: true, verified: false`.
There is no SQL migration. Deployment of the Worker and MCP is required for live
composition tools; the native app then receives optional `composition` and
`compositionItems` fields on the existing Clerk-authenticated `/api/v1/home`.
The regular Home renderer ignores these fields.

Daily editorial editions are a separate feature. `create_home_edition` and `publish_home_edition` do not control Home Lab.

## Local preview

The Debug-only `-home-components-preview` entry point compares normal Home,
mixed cards and rails-first arrangements using the same Home item fixtures and
real shared components. It includes light/dark appearance switching. This is
component evidence, not authenticated account or production-data evidence.
