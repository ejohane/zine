# Native Home composition

Home Lab is one persisted page of custom collections, presented with the existing native Home components. These collections belong only to the current Home Lab arrangement; they are not permanent Library collections. An agent selects
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

- Up to 12 sections (custom collections), 20 items per section and 100 total placements. An empty `sections` array explicitly clears Home Lab without deleting saved items.
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
- Missing, unsupported, malformed or entirely unavailable arrangements show an intentional Home Lab empty state. Regular Home remains independent.
- Named collection headings open a native list of all currently visible items in that collection. The list resolves the current arrangement by stable section ID and reflects replacement and item visibility changes.

## Agent workflow

1. `get_home_components`: read the card/container catalog and constraints.
2. `get_home_candidates` or `search_saved`: get real account-owned item IDs.
3. `create_home_composition`: validate and inspect resolved real card content.
4. `publish_home_composition`: publish the reviewed arrangement when requested.
5. `get_home_composition`: read it back.

There is exactly one current composition, stored under an account-scoped R2 key (`home-compositions/<userId>/current.json`). There is no collection-history index or Library collection creation. Publication replaces
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

## REST interface

The existing Clerk-session/scoped-PAT authentication boundary also exposes:

| Method | Path                               | Permission        | Purpose                                       |
| ------ | ---------------------------------- | ----------------- | --------------------------------------------- |
| GET    | `/api/v1/home/components`          | `bookmarks:read`  | Native card/layout catalog and constraints    |
| GET    | `/api/v1/home/candidates`          | `bookmarks:read`  | Up to 100 recent eligible account-owned items |
| GET    | `/api/v1/home/composition`         | `bookmarks:read`  | Current arrangement and live item metadata    |
| POST   | `/api/v1/home/composition/preview` | `bookmarks:read`  | Validate/resolve without writing              |
| PUT    | `/api/v1/home/composition`         | `bookmarks:write` | Replace the complete current arrangement      |

Preview and publication accept `{ "composition": { "version": 1, "sections": [...] } }`.
Malformed bodies return 400. Unavailable/incompatible items return 422 and leave
the previous arrangement intact. Publication returns `published` and `verified`
separately; a completed write with failed readback must not be treated as rolled
back. Collection membership is an explicit list of saved item IDs; there is no
automatic generation schedule or dynamic membership rule.

## Complete-flow acceptance

1. Discover components and real account-owned candidates through MCP or REST.
2. Preview several named collections with different native presentations; confirm no write.
3. Publish and read the exact arrangement back through `/api/v1/home`.
4. In the authenticated local native app, open Home Lab, scroll its collections,
   open a collection heading and item detail/reader, and verify both appearances.
5. Relaunch and confirm the arrangement persists.
6. Publish a replacement with changed order, membership and presentation. Refresh
   the app and confirm old collections disappear and the replacement persists.
7. Complete/archive an item and observe its removal; clear the arrangement and
   observe the Home Lab empty state while Library and ordinary Home retain items.

Automated fixtures, an API readback, a native build, and observed authenticated UI
are separate evidence. Live MCP deployment and tool discovery must also be checked
against the hosted endpoint, independently of local test results.

For authenticated local acceptance, the opt-in Debug bridge can call the same
REST endpoints with the running app’s existing session: `home.get`,
`home.composition.preview`, and `home.composition.publish --composition <file>`.
See [native commands](native-agent-workflows.md#home-lab-arrangement-commands).
Credentials and session tokens remain inside the app; publication is still a
real authenticated write to the selected local Worker.
