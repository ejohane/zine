# Zine saved library in ChatGPT

The optional MCP Apps component adds visual browsing to the existing MCP server.
It changes no native app, REST endpoint, database schema, OAuth client or scope.

## v0.1 deployment

Deployed on 2026-10-18 from `fa070ac8cb8f5d96fef665c0d5f32c2c3cd27fc8`
to the existing `zine-mcp-production` Worker at `https://mcp.myzine.app/mcp`.
Cloudflare version: `13d2ebb0-c215-44ce-bb0a-db69fd1a2b97` (100%).
Previous version for rollback: `c0e60f70-dc5a-42c4-b0d1-316d799c7a2c`.

The live deployment has existing Dashboard-managed authentication variables.
Preserve those with `wrangler deploy --config wrangler.production.toml
--env-file /dev/null --keep-vars`; do not replace variables using only the
checked-in manifest. The release changed no credentials, OAuth scopes or data
bindings. Never print remote variable values when checking deployment metadata.

Production readback confirmed seven tools, the v2 MCP Apps HTML resource/MIME/CSP,
anonymous linking challenges, and authenticated search with covers/creator/time
metadata through the existing ChatGPT connection. ChatGPT's Refresh tools action
was run after deployment.

Direct computer-use acceptance in an actual ChatGPT Chat conversation observed
the inline component with six owned saved items and real YouTube cover images.
Opening a saved article loaded stored text in the inline reader; searching from
the component returned 20 results for a query. This was the deployed Worker and
existing linked OAuth account, not the sample host. Collection writes were not
performed during this acceptance. The ChatGPT development surface displayed
“CSP off”; this trial establishes rendering and bridge behavior, not host CSP
enforcement. The resource still declares its explicit CSP.

## Tool flow

1. Call `search_saved` with a title/description/URL query (empty means browse).
2. Call `show_saved` with the selected `bookmarkIds`, the returned `query`, and
   `nextCursor` when preserving pagination. Only this tool declares a UI resource.
3. ChatGPT reads `ui://zine/saved-library-v2.html`, served as
   `text/html;profile=mcp-app`. The model still receives the structured results
   and text in clients without component support.
4. The component initializes the MCP Apps bridge and renders the tool result.
   Search and pagination call `search_saved`; Read calls `read_saved`; Collect
   calls `list_collections`, then `add_to_collection` after the user chooses.
   Calls go through the host with the existing OAuth authorization.

`show_saved` accepts only IDs and search context, then rechecks every ID against
the linked account and current bookmarked state. It uses the same Gmail/private
source provenance predicate as search/read. It does not trust model-supplied
titles, URLs, summaries, artwork or tags. Supplied cursors must match the account
and query. Tags are fetched only for the authorized rows and account.

## Component behavior

- Native Home-style cards: rounded landscape artwork, two-line semibold titles,
  creator and reading/listening time, and quiet actions underneath. Three columns
  in wider embeds, two at phone widths, and one in very narrow embeds. Light/dark
  follows host context, falling back to the operating-system preference.
- Existing shared Zine semantic color roles are injected at bundle time.
- Titles, creator names, tags and stored article content use DOM text nodes, never
  source HTML. Read supports stored-text pagination and unavailable-content copy.
- Original links require public-shaped HTTPS URLs without credentials or known
  secret-bearing query parameters. They open separately with `noopener noreferrer`.
- Existing artwork loads only from the explicit CDN origins in `src/ui.ts`, with
  no referrer. Missing or broken covers try the saved creator image, then the
  native-style neutral content icon. Podcast images fit without cropping. There is no
  image proxy, arbitrary fetch, provider ingestion, or new screenshot support.
- Resource CSP permits no direct fetch/XHR connections and only the declared
  static artwork origins. No credentials enter the component or its resources.
- Busy states, errors, empty results and missing permission responses are visible.
  Collection success appears only after the tool confirms `added: true`.
- The component retains only temporary view state. Collection writes remain in
  the server-owned account data. A timed-out write may have completed; collection
  addition is idempotent, so retrying is safe.

## Local evidence and live acceptance

Run the package's `typecheck`, `lint`, `test`, `build`, and `build:production`
commands. Both builds are dry runs. Worker tests use migrated isolated D1/R2,
synthetic signed OAuth tokens and the real MCP SDK transport. They check resource
discovery/MIME/CSP, render metadata, card metadata, ownership/private-source
exclusion, tag isolation, strict inputs and pagination context.

`bun run --cwd integrations/mcp preview:ui` starts a loopback-only, clearly labeled
simulated host at `http://127.0.0.1:8797`. This serves the actual component HTML
and simulates bridge results with sample content and the existing shared card
fixtures' illustrative photos. These are not real library items or their covers.
Use its light/dark and phone
width controls. Search `personal` for filtered results, a nonsense phrase for
empty results, `error` for a failure, and `permission` for a linking error. An
empty search plus Show more exposes unavailable-content and hostile-text fixtures.
Read, Continue reading and Collect exercise the bridge; all preview collection
writes remain in memory and reset on reload. Stop with Ctrl-C.

The preview is component interaction evidence, not authenticated production or
ChatGPT rendering evidence. To accept the live integration after deployment:

1. Refresh the existing Zine plugin connection so it discovers `show_saved`.
2. In ChatGPT, ask: “Show my saved articles about personal software as cards.”
3. Confirm the model searches and calls `show_saved`, and that the component
   renders real owned items. Exercise search/pagination, Read, and Open original.
4. Choose a private collection and add an item; independently list/read the
   account's collection to verify persistence. Verify read-only grants cannot add.
5. Check light/dark and a narrow ChatGPT client. Record those as live observations
   separately from the local fixture checks.

Publishing the code alone does not update the deployed MCP Worker. Deploy the
reviewed integration through the existing production configuration, preserve
its current secret bindings, and refresh the ChatGPT connection afterward.
No new OAuth grant or broader permissions are needed for the existing actions.

Implementation follows the [official MCP Apps UI guidance](https://developers.openai.com/plugins/build/chatgpt-ui)
and [host bridge quickstart](https://developers.openai.com/plugins/build/app-quickstart).
